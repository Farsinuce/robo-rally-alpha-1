namespace SpriteKind {
    // Kept so projects saved before the card UI became a renderable still
    // compile. Nothing in the engine creates sprites of this kind any more.
    export const Card = SpriteKind.create()
}

/**
 * Which way to shove a robot, for the "push robot" block. Used by board
 * elements (conveyor belts, pushers) that move a robot without turning it.
 */
enum RoboDirection {
    //% block="up"
    Up = 0,
    //% block="right"
    Right = 1,
    //% block="down"
    Down = 2,
    //% block="left"
    Left = 3
}

/**
 * Robo Rally engine.
 *
 * Kids only ever see the blocks in the "Robo Rally" toolbox category (the
 * exported functions carrying a //% block annotation) plus ordinary MakeCode
 * blocks. Everything else in here is engine code the adults maintain.
 *
 * Design rules, if you change this file:
 *  - The kids own the map (native tilemap editor) and the robot drawing (native
 *    sprite editor). The engine draws no level and invents no robot art; it
 *    only recolours copies of the one drawing for players 2-4.
 *  - Kid-facing verbs stay unqualified: "move 1" means "the robot whose card is
 *    being played". The engine always knows which robot that is, so the same
 *    kid program works unchanged for one robot or four.
 *  - The engine owns only the primitives a kid cannot build out of other
 *    blocks: move, turn, push, shoot, and the moment between two cards.
 *    Everything a kid invents on top of those is a card name plus a hat.
 *  - Never change a blockId. Renaming one silently breaks every saved project.
 *    The visible block text can change freely.
 *
 * The round is a state machine running in its own fiber (see gameLoop). Button
 * handlers only ever set a flag; nothing long-running happens inside one.
 */
//% color="#B4009E" icon="" block="Robo Rally" weight=100
//% groups='["Setup", "Cards", "Tiles", "Robot", "Advanced"]'
namespace roboRally {
    const HAND_SIZE = 6
    const PROGRAM_SIZE = 4
    const MAX_PLAYERS = 4
    const START_LIVES = 3

    // Pacing. One card reads as three beats: say it, do it, put it away.
    const STEP_PAUSE = 220      // between two tiles of the same move
    const BEAT = 220            // between the three parts of a card
    const SHOT_PAUSE = 60       // per tile of a shot
    // sayText leaves a stale deadline behind if the duration is ever omitted,
    // so every bubble gets an explicit, deliberately long one and the engine
    // takes it down itself with sayText("").
    const BUBBLE_MS = 60000
    // Nobody's turn may stall the table forever. A kid who has wandered off
    // gets their card played for them once this runs out.
    const TURN_TIMEOUT = 20000
    // How long "look at my robot" (down, while programming) holds the camera.
    const PEEK_MS = 2500
    // If nobody touches anything in the lobby, start anyway.
    const LOBBY_TIMEOUT = 90000
    // How long the lobby stays open before it will start a game by itself, so
    // a setup block that runs late still gets its robots on the roster.
    const LOBBY_SETTLE = 2000
    // How quiet the kid's setup blocks have to be before the round begins.
    const SETUP_QUIET = 400
    // A whole table must not be held hostage by one seat that never presses B.
    const PROGRAM_TIMEOUT = 120000
    // Button events queued during the previous phase are replayed into this
    // one; this window swallows them, so a turn-taking A press cannot commit
    // a card the moment programming opens.
    const PHASE_GRACE = 300

    // A tile rule that moves the robot re-triggers the rules on the new tile.
    // The budget is shared by every landing in one cascade, so two belts
    // shoving each other cannot multiply out. It is also spent by ordinary
    // movement (step lands the robot on every tile it crosses), so it has to
    // be comfortably larger than the longest move card.
    const MAX_TILE_CHAIN = 16

    // The four players' colours, matching the ones MakeCode's own multiplayer
    // HUD and join lobby use, so a kid's robot, card row and prompt all agree.
    const PLAYER_COLOR = [2, 8, 4, 7]   // red, blue, orange, green

    // ---- Card geometry -------------------------------------------------
    // font5 advances 6 px per character and is 5 px tall, so a two-character
    // label is 11 px of ink. A 14 px card is that plus a one-pixel frame and
    // is the width at which printCenter lands on x = 1 exactly; 13 would put
    // ink on the frame. Ten cards (4 program + 6 hand) then fit one row.
    const CARD_W = 14
    const CARD_H = 7
    const PITCH = 15
    const PROGRAM_X = 3
    const HAND_X = 68
    const ROW_PITCH = 8                 // card plus a one-pixel gap
    const BOTTOM_ROW_Y = 112            // top edge of player 1's row
    const BANNER_H = 8

    // Arcade images have no alpha channel, so a card cannot be drawn half
    // transparent. What it can do is leave its middle empty and darken the
    // board behind it: mapRect rewrites the pixels already on screen through
    // this 16 byte table, index -> darker index.
    //
    // The table may never produce a colour a card is drawn in, or that card
    // becomes invisible on its own dimmed background. It outputs only
    // {0, 6, 12, 13, 14, 15}; the card inks are 1, 11 and the player colours
    // 2, 4, 7 and 8.
    const DIM = hex`000d0e0e0e0e0c060c060c0c0f0c0c0f`

    const dx = [0, 1, 0, -1]
    const dy = [-1, 0, 1, 0]

    // Phases of the round. The whole engine is a loop over these.
    const PHASE_SETUP = 0
    const PHASE_LOBBY = 1
    const PHASE_PROGRAM = 2
    const PHASE_EXECUTE = 3
    const PHASE_OVER = 4

    const BULLET = img`
        . . . . . .
        . . 5 5 . .
        . 5 2 2 5 .
        . 5 2 2 5 .
        . . 5 5 . .
        . . . . . .
    `

    /**
     * All per-robot state. Nothing outside this class assumes how many robots
     * there are. Classes are invisible to the Blocks editor, so this costs the
     * kids nothing.
     */
    class Bot {
        sprite: Sprite
        player: number
        ctrl: controller.Controller
        inf: info.PlayerInfo
        color: number
        facing: number
        images: Image[]

        // Its own stair. Assigned once, so a robot always comes back to the
        // same corner rather than to whichever start tile happens to be free.
        startTile: Image
        startCol: number
        startRow: number

        hand: string[]
        program: number[]           // indices into hand
        selected: number
        drawPile: string[]
        discard: string[]

        joined: boolean             // pressed A in the lobby
        ready: boolean              // pressed B, program committed
        dead: boolean               // lost a life this round, sits the rest out
        out: boolean                // no lives left, out of the game
        chests: number

        aPressed: boolean           // set by the A handler while it is our turn
        retired: boolean            // taken off the board, so retire() is once only

        // The tile whose rules were last run for this robot, so a card that
        // moves it with a NATIVE block still lands properly.
        landedCol: number
        landedRow: number
        landing: number             // per-robot re-entrancy depth for fireLanded

        rowY: number                // top edge of this robot's card row, -1 hidden
        rowImage: Image

        constructor(sprite: Sprite, startTile: Image, player: number) {
            this.sprite = sprite
            this.startTile = startTile
            this.player = player
            this.color = PLAYER_COLOR[player - 1]
            this.facing = 0
            this.hand = []
            this.program = []
            this.selected = 0
            this.drawPile = []
            this.discard = []
            this.joined = false
            this.ready = false
            this.dead = false
            this.out = false
            this.chests = 0
            this.aPressed = false
            this.retired = false
            this.startCol = -1
            this.startRow = -1
            this.landedCol = -999
            this.landedRow = -999
            this.landing = 0
            this.rowY = -1
            this.rowImage = image.create(screen.width, CARD_H)
            this.ctrl = controllerForPlayer(player)
            this.inf = infoForPlayer(player)
            this.images = []
            this.setLook(sprite.image)
        }

        /** Derive the four facings from one drawing that points UP. */
        setLook(up: Image) {
            this.images = [up, up.rotated(90), up.rotated(180), up.rotated(270)]
            this.sprite.setImage(this.images[this.facing])
        }

        /** True when the kid changed the image with a native "set image" block. */
        lookChanged(): boolean {
            return this.sprite.image !== this.images[this.facing]
        }

        respawn() {
            this.facing = 0
            this.sprite.setImage(this.images[0])
            placeOnStart(this)
        }
    }

    let deck: string[] = []
    let bots: Bot[] = []
    let playing: Bot[] = []      // the robots that actually joined, in player order
    let current: Bot = null
    let activeBot: Bot = null    // whose card is running, during PHASE_EXECUTE
    let phase = PHASE_SETUP
    let started = false
    let loopStarted = false
    let loopForked = false
    // Stamped by every setup block, so the round can wait for the kid's
    // "on start" stack to go quiet before it opens the lobby.
    let setupAt = 0
    // When the current phase began, so a button event queued in the previous
    // phase does not act on this one.
    let phaseAt = 0

    let cardNames: string[] = []
    let cardHandlers: ((robot: Sprite) => void)[] = []
    let landTiles: Image[] = []
    let landHandlers: ((robot: Sprite) => void)[] = []
    let betweenTiles: Image[] = []
    let betweenHandlers: ((robot: Sprite) => void)[] = []
    // Kept for the old catch-all block; see onLanded below.
    let anyLandHandler: () => void = null

    // Treasure, and with it the second win condition.
    let chestTile: Image = null
    let chestOpenTile: Image = null
    let chestsLeft = -1
    let chestsTotal = 0

    // Set by win(); the round loop is what actually ends the game, because
    // game.gameOverPlayerWin never returns to its caller.
    let pendingWinner = -1

    // Banner state, read by the renderable every frame.
    let bannerText = ""
    let bannerColor = 1
    // A short-lived message on top of the standing one, so telling a kid
    // "four cards!" does not leave the banner stuck on it for the rest of the
    // phase. 
    let flashText = ""
    let flashColor = 1
    let flashUntil = 0
    let turnDeadline = 0

    // Camera. During a turn it sits on the robot playing; while programming it
    // sits between everybody, unless someone asked to look at their own robot.
    let peekBot: Bot = null
    let peekUntil = 0

    // ------------------------------------------------------------------
    // Setup
    // ------------------------------------------------------------------

    /**
     * Put cards into the draw pile. A card is just a text, so you can invent
     * your own: give it a name here and a "on card played" block to say what
     * it does. Every robot gets its own pile with the same cards in it.
     * @param count how many copies of the card
     * @param card the name of the card, eg: "+1"
     */
    //% blockId=roboRally_addCards
    //% block="add $count cards $card to the deck"
    //% count.defl=1 count.min=1 count.max=20
    //% card.defl="+1"
    //% group="Setup" weight=100
    export function addCards(count: number, card: string) {
        setupAt = control.millis()
        for (let i = 0; i < count; i++) deck.push(card)
    }

    /**
     * Start the game. Draw your robot with a "sprite" block first and paint your
     * level with "set tilemap to", then tell the engine which sprite is the
     * robot and which tile it starts and respawns on.
     * @param robot the sprite you drew, facing UP
     * @param startTile the tile the robot starts and respawns on
     */
    //% blockId=roboRally_startGame
    //% block="start Robo Rally with robot $robot starting on $startTile"
    //% robot.shadow=variables_get robot.defl=mySprite
    //% startTile.shadow=tileset_tile_picker
    //% startTile.decompileIndirectFixedInstances=true
    //% group="Setup" weight=90
    export function startGame(robot: Sprite, startTile: Image) {
        if (!robot || started) return
        setupAt = control.millis()
        addRobot(robot, startTile)
        started = true
        beginLoop()
    }

    /**
     * Play with more robots. The engine copies the robot you drew once per
     * player and recolours it, so player 1 is red, player 2 blue, player 3
     * orange and player 4 green. Every robot gets its own start tile.
     * @param count how many robots altogether, eg: 4
     */
    //% blockId=roboRally_addRobots
    //% block="play with $count robots"
    //% count.defl=4 count.min=1 count.max=4
    //% group="Setup" weight=85
    export function addRobots(count: number) {
        if (bots.length == 0) return
        setupAt = control.millis()
        const first = bots[0]
        const body = bodyColor(first.images[0])
        for (let p = bots.length + 1; p <= Math.min(count, MAX_PLAYERS); p++) {
            const up = tinted(first.images[0], body, PLAYER_COLOR[p - 1])
            const s = sprites.create(up, first.sprite.kind())
            addRobot(s, first.startTile)
        }
        // Player 1 is recoloured too, or the colour language breaks down: the
        // card row, the prompt and the robot have to agree on who is red.
        first.setLook(tinted(first.images[0], body, PLAYER_COLOR[0]))
    }

    /**
     * Add one more robot that you drew yourself. Use "play with N robots"
     * instead if you are happy for the engine to recolour your drawing.
     * @param robot the sprite for the next player, facing UP
     * @param startTile the tile this robot starts and respawns on
     */
    //% blockId=roboRally_addPlayer
    //% block="add robot $robot starting on $startTile"
    //% robot.shadow=variables_get robot.defl=mySprite2
    //% startTile.shadow=tileset_tile_picker
    //% startTile.decompileIndirectFixedInstances=true
    //% group="Setup" weight=80
    export function addPlayer(robot: Sprite, startTile: Image) {
        if (!robot) return
        setupAt = control.millis()
        addRobot(robot, startTile)
    }

    /**
     * Treasure hunt. Every robot that lands on a chest opens it and keeps it.
     * When the last chest on the board has been opened, whoever opened the most
     * wins - and if two robots opened the same number, it is a draw.
     * @param chest the closed chest tile you painted on the map
     * @param opened what the tile turns into once a robot has opened it
     */
    //% blockId=roboRally_treasure
    //% block="treasure is $chest, opened it looks like $opened"
    //% chest.shadow=tileset_tile_picker
    //% chest.decompileIndirectFixedInstances=true
    //% opened.shadow=tileset_tile_picker
    //% opened.decompileIndirectFixedInstances=true
    //% group="Setup" weight=75
    export function treasure(chest: Image, opened: Image) {
        setupAt = control.millis()
        chestTile = chest
        chestOpenTile = opened
    }

    // ------------------------------------------------------------------
    // Cards
    // ------------------------------------------------------------------

    /**
     * Say what one card does. Use one of these for every card in your deck.
     * Drag the "robot" bubble into any sprite block to act on the robot.
     * @param card the card name, exactly as you spelled it in the deck
     */
    //% blockId=roboRally_onCardPlayed
    //% block="on card $card played by $robot"
    //% card.defl="+1"
    //% draggableParameters="reporter"
    //% group="Cards" weight=100
    export function onCardPlayed(card: string, handler: (robot: Sprite) => void) {
        cardNames.push(card)
        cardHandlers.push(handler)
    }

    /**
     * Move the robot forwards. A negative number backs it up without turning.
     * The robot stops if it hits a wall, falls if it walks off the board, and
     * steps one tile at a time so tile rules fire on every tile it crosses.
     */
    //% blockId=roboRally_move
    //% block="move $n"
    //% n.defl=1 n.min=-3 n.max=3
    //% group="Cards" weight=90
    export function move(n: number) {
        const bot = active()
        if (!bot || bot.dead || bot.out || n == 0) return
        let dir = bot.facing
        if (n < 0) dir = (bot.facing + 2) % 4
        for (let i = 0; i < Math.abs(n); i++) {
            if (!step(bot, dir, MAX_PLAYERS)) return
        }
    }

    //% blockId=roboRally_turnLeft
    //% block="turn left"
    //% group="Cards" weight=80
    export function turnLeft() { turn(3) }

    //% blockId=roboRally_turnRight
    //% block="turn right"
    //% group="Cards" weight=70
    export function turnRight() { turn(1) }

    /**
     * Shoot straight ahead. The shot travels one tile at a time and stops at
     * the first wall, at the edge of the board, or at another robot. A robot
     * that is hit loses a life and goes back to its start tile.
     */
    //% blockId=roboRally_shoot
    //% block="shoot"
    //% group="Cards" weight=60
    export function shoot() {
        const shooter = active()
        if (!shooter || shooter.dead || shooter.out) return
        const tm = game.currentScene().tileMap
        if (!tm) return

        music.pewPew.play()
        const dir = shooter.facing
        const from = shooter.sprite.tilemapLocation()
        let col = from.column
        let row = from.row

        const bullet = sprites.create(BULLET, SpriteKind.Projectile)
        // The engine drives the shot itself, so keep physics out of it. A ghost
        // also cannot trip the kids' own tile rules as it flies past.
        bullet.setFlag(SpriteFlag.Ghost, true)
        bullet.z = 96
        tiles.placeOnTile(bullet, from)

        // Off-map already reads as a wall, so this is only a safety net - but
        // it has to be at least as long as the board or a shot along a big
        // map would stop in mid air.
        const range = tm.data.width + tm.data.height
        let victim: Bot = null
        for (let i = 0; i < range; i++) {
            col += dx[dir]
            row += dy[dir]
            const at = tiles.getTileLocation(col, row)
            // True off the map too, so the board needs no painted border.
            if (tiles.tileAtLocationIsWall(at)) break
            tiles.placeOnTile(bullet, at)
            pause(SHOT_PAUSE)
            victim = botAt(col, row, shooter)
            if (victim) break
        }
        bullet.destroy()
        if (victim) kill(victim)
    }

    /**
     * Shove the robot one tile in a fixed direction, whichever way it happens
     * to be facing. This is how a conveyor belt or a pusher moves a robot.
     * @param dir which way to shove it
     */
    //% blockId=roboRally_push
    //% block="push robot $dir"
    //% dir.defl=RoboDirection.Right
    //% group="Cards" weight=50
    export function push(dir: RoboDirection) {
        const bot = active()
        if (!bot || bot.dead || bot.out) return
        step(bot, dir, MAX_PLAYERS)
    }

    // ------------------------------------------------------------------
    // Tiles
    // ------------------------------------------------------------------

    /**
     * Say what one tile does. Paint the tile in the tilemap editor first, then
     * pick it here. Fires once, the moment the robot steps onto that tile.
     * @param tile the tile from your map
     */
    //% blockId=roboRally_onLand
    //% block="on $robot lands on $tile"
    //% tile.shadow=tileset_tile_picker
    //% tile.decompileIndirectFixedInstances=true
    //% draggableParameters="reporter"
    //% group="Tiles" weight=100
    export function onLand(tile: Image, handler: (robot: Sprite) => void) {
        landTiles.push(tile)
        landHandlers.push(handler)
    }

    /**
     * The board's own turn. After every card in the program, every robot that
     * is standing on this tile does this. That is how a conveyor belt carries a
     * robot along between two of its own cards, how a gear turns it, and how a
     * laser tile burns whoever is standing in the beam.
     * @param tile the tile from your map
     */
    //% blockId=roboRally_onBetweenCards
    //% block="on $robot is on $tile between cards"
    //% tile.shadow=tileset_tile_picker
    //% tile.decompileIndirectFixedInstances=true
    //% draggableParameters="reporter"
    //% group="Tiles" weight=95
    export function onBetweenCards(tile: Image, handler: (robot: Sprite) => void) {
        betweenTiles.push(tile)
        betweenHandlers.push(handler)
    }

    /**
     * Lose a life, respawn on the start tile and skip the rest of the program.
     */
    //% blockId=roboRally_die
    //% block="robot dies"
    //% group="Tiles" weight=90
    export function die() {
        kill(active())
    }

    /**
     * Give the robot lives, or take them away. A negative number costs lives
     * without sending the robot back to its start tile.
     * @param n how many lives to add
     */
    //% blockId=roboRally_changeLives
    //% block="change robot lives by $n"
    //% n.defl=1 n.min=-3 n.max=3
    //% group="Tiles" weight=85
    export function changeLives(n: number) {
        const bot = active()
        if (!bot || bot.out) return
        bot.inf.changeLifeBy(n)
        if (bot.inf.life() <= 0) retire(bot)
    }

    /**
     * End the game as a win for this robot.
     */
    //% blockId=roboRally_win
    //% block="robot wins"
    //% group="Tiles" weight=80
    export function win() {
        const bot = active()
        music.powerUp.play()
        // Not game.gameOverPlayerWin: that never returns to its caller, so
        // everything after this block would be dead code and the rest of the
        // round would run against a finished game. The round loop ends it.
        pendingWinner = bot ? bot.player : 1
    }

    // ------------------------------------------------------------------
    // Robot
    // ------------------------------------------------------------------

    /**
     * The robot sprite, so you can use it in ordinary sprite blocks:
     * say something, start an effect, place it on a random tile.
     */
    //% blockId=roboRally_theRobot
    //% block="the robot"
    //% group="Robot" weight=100
    export function theRobot(): Sprite {
        const bot = active()
        return bot ? bot.sprite : null
    }

    /**
     * Which way the robot is facing: 0 up, 1 right, 2 down, 3 left.
     */
    //% blockId=roboRally_facing
    //% block="robot facing"
    //% group="Robot" weight=90
    export function facing(): number {
        const bot = active()
        return bot ? bot.facing : 0
    }

    /**
     * Change the picture the robot is drawn with. Draw it facing UP; the engine
     * turns it for you.
     */
    //% blockId=roboRally_setLook
    //% block="robot looks like $up"
    //% up.shadow=screen_image_picker
    //% group="Robot" weight=80
    export function setLook(up: Image) {
        const bot = active()
        if (bot && up) bot.setLook(up)
    }

    // ------------------------------------------------------------------
    // Old blocks. Hidden from the toolbox, still compile, so projects made
    // before this version keep opening. Remove after the RFID session.
    // ------------------------------------------------------------------

    /**
     * Build a map from text. Superseded by the tilemap editor: use the native
     * "set tilemap to" block instead.
     */
    //% blockId=roboRally_mapFromText
    //% block="build map from $rows"
    //% rows.shadow="lists_create_with" rows.defl="text"
    //% deprecated=true
    //% group="Advanced" weight=10
    export function mapFromText(rows: string[]) {
        const w = rows[0].length
        const h = rows.length
        const data = control.createBuffer(4 + w * h)
        data.setNumber(NumberFormat.UInt16LE, 0, w)
        data.setNumber(NumberFormat.UInt16LE, 2, h)
        // Gallery tiles on purpose. A kid can delete a project tile in the
        // asset editor, and a dangling myTiles.* reference in here would fail
        // the whole compile and take the Blocks view down with it.
        tiles.setCurrentTilemap(tiles.createTilemap(data, image.create(w, h), [
            sprites.dungeon.floorLight0, sprites.dungeon.floorDark0, sprites.dungeon.hazardLava0,
            sprites.dungeon.chestClosed, sprites.dungeon.stairLarge], TileScale.Sixteen))
        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const ch = rows[row].charAt(col)
                const loc = tiles.getTileLocation(col, row)
                let tile = sprites.dungeon.floorLight0
                if (ch == "#") tile = sprites.dungeon.floorDark0
                if (ch == "L") tile = sprites.dungeon.hazardLava0
                if (ch == "G") tile = sprites.dungeon.chestClosed
                if (ch == "S") tile = sprites.dungeon.stairLarge
                tiles.setTileAt(loc, tile)
                if (ch == "#") tiles.setWallAt(loc, true)
            }
        }
    }

    /** Superseded by "on robot lands on [tile]". */
    //% blockId=roboRally_onLanded
    //% block="on robot landed on a tile"
    //% deprecated=true
    //% group="Advanced" weight=9
    export function onLanded(handler: () => void) {
        anyLandHandler = handler
    }

    /** Superseded by the tile hat; still useful inside a card. */
    //% blockId=roboRally_robotIsOn
    //% block="robot is on $tile"
    //% tile.shadow=tileset_tile_picker
    //% tile.decompileIndirectFixedInstances=true
    //% group="Advanced" weight=8
    export function robotIsOn(tile: Image): boolean {
        const bot = active()
        if (!bot) return false
        return tiles.tileAtLocationEquals(bot.sprite.tilemapLocation(), tile)
    }

    /** Superseded by the native "say" block on the robot. */
    //% blockId=roboRally_say
    //% block="robot says $text"
    //% deprecated=true
    //% group="Advanced" weight=7
    export function say(text: string) {
        const bot = active()
        if (bot) bot.sprite.sayText(text, 700)
    }

    /** The camera follows the robot whose turn it is on its own now. */
    //% blockId=roboRally_cameraFollowsRobot
    //% block="camera follows robot"
    //% deprecated=true
    //% group="Advanced" weight=6
    export function cameraFollowsRobot() {
    }

    // ------------------------------------------------------------------
    // Engine internals: robots
    // ------------------------------------------------------------------

    function active(): Bot {
        if (current) return current
        return bots.length > 0 ? bots[0] : null
    }

    function controllerForPlayer(player: number): controller.Controller {
        if (player == 2) return controller.player2
        if (player == 3) return controller.player3
        if (player == 4) return controller.player4
        return controller.player1
    }

    function infoForPlayer(player: number): info.PlayerInfo {
        if (player == 2) return info.player2
        if (player == 3) return info.player3
        if (player == 4) return info.player4
        return info.player1
    }

    /** The colour the robot is mostly drawn in, so it can be swapped per player. */
    function bodyColor(im: Image): number {
        const tally: number[] = []
        for (let i = 0; i < 16; i++) tally.push(0)
        for (let x = 0; x < im.width; x++) {
            for (let y = 0; y < im.height; y++) {
                const c = im.getPixel(x, y)
                if (c > 0) tally[c]++
            }
        }
        let best = 1
        for (let c = 1; c < 16; c++) if (tally[c] > tally[best]) best = c
        return best
    }

    function tinted(im: Image, from: number, to: number): Image {
        const c = im.clone()
        if (from != to) c.replace(from, to)
        return c
    }

    function addRobot(sprite: Sprite, startTile: Image) {
        for (let b of bots) if (b.sprite === sprite) return
        if (bots.length >= MAX_PLAYERS) return
        // The seat is always the next free one. Deriving it from the caller
        // let "add robot" placed ABOVE "start Robo Rally" hand two robots the
        // same controller and the same PlayerInfo.
        const player = bots.length + 1
        const bot = new Bot(sprite, startTile, player)
        bots.push(bot)
        // Above the cards (z 90) so the robot and its speech bubble are never
        // hidden behind one, and below the info HUD at z 100.
        sprite.z = 95
        bot.inf.setLife(START_LIVES)
        bot.inf.setScore(0)
        // The four corner banners land exactly where the card rows go, and the
        // HUD draws above them. The engine shows lives in its own banner
        // instead; the PlayerInfo is still the store of truth, so the game
        // over screen can rank everybody.
        bot.inf.showLife = false
        bot.inf.showScore = false
        bot.inf.showPlayer = false
        // Those three are read only by the MULTIPLAYER branch of the HUD. A
        // one-robot game never flips that switch, and its single-player branch
        // would paint big hearts and a score straight over the engine's own
        // banner - so turn the global flags off as well.
        info.showLife(false)
        info.showScore(false)
        // Touching a second player's info flips MakeCode's HUD to multiplayer
        // mode for good, and from then on nobody - not even player 1 - gets an
        // automatic game over at zero lives. This handler runs inside the HUD
        // render pass, so it must never block: raise a flag and let the round
        // loop end the game.
        bot.inf.onLifeZero(function () { bot.out = true })
        // The join lobby shows each kid which robot is theirs.
        mp.postPresenceIcon(player, sprite.image)
        sprite.setFlag(SpriteFlag.Invisible, true)
        setupControls(bot)
    }

    /** Take an eliminated robot off the board. */
    function retire(bot: Bot) {
        if (bot.retired) return
        bot.retired = true
        bot.out = true
        bot.ready = false
        bot.sprite.sayText("")
        bot.sprite.setFlag(SpriteFlag.Invisible, true)
    }

    function inPlay(bot: Bot): boolean {
        return bot.joined && !bot.out
    }

    /**
     * The robot standing on this tile, or null. No engine API does this.
     * A robot that lost a life this round has already respawned and is
     * physically on the board, so it counts as occupying its tile; one that is
     * out of the game has left the board and does not.
     */
    function botAt(col: number, row: number, except: Bot): Bot {
        for (let b of playing) {
            if (b === except || b.out) continue
            const loc = b.sprite.tilemapLocation()
            if (loc.column == col && loc.row == row) return b
        }
        return null
    }

    /**
     * True when (col,row) is off the edge of the board. This has to be asked
     * before the wall question, because tileAtLocationIsWall answers "yes" for
     * everything outside the map.
     */
    function offMap(col: number, row: number): boolean {
        const tm = game.currentScene().tileMap
        if (!tm || !tm.enabled) return false
        return tm.data.isOutsideMap(col, row)
    }

    /**
     * One tile in one direction, for the robot itself and for anything the
     * board shoves. Returns false when the robot did not end up on the next
     * tile: it hit a wall, it was blocked, or it fell off the board and died.
     *
     * Robots shove each other the way they do in the board game, and a shove
     * carries down a line of robots. `depth` bounds that line, so a ring of
     * robots cannot recurse forever.
     *
     * This is also mutually recursive with fireLanded(): landing runs the
     * tile's rules, and a rule may push the robot, which lands it again. That
     * loop is bounded by the shared landBudget, not by this depth.
     */
    function step(bot: Bot, dir: number, depth: number): boolean {
        // Only `out` stops a robot being moved. A robot that lost a life this
        // round has already respawned and is standing on the board, so it can
        // still be shoved; it just does not get to play any more cards.
        if (bot.out) return false
        // A kid who forgot "set tilemap to" would otherwise crash on the very
        // first move card.
        if (!game.currentScene().tileMap) return false
        const here = bot.sprite.tilemapLocation()
        const col = here.column + dx[dir]
        const row = here.row + dy[dir]

        // Off the edge is a hole, not a wall.
        if (offMap(col, row)) {
            tiles.placeOnTile(bot.sprite, tiles.getTileLocation(col, row))
            music.jumpDown.play()
            pause(BEAT)
            kill(bot)
            return false
        }
        const next = tiles.getTileLocation(col, row)
        if (tiles.tileAtLocationIsWall(next)) {
            music.knock.play()
            return false
        }
        const blocker = botAt(col, row, bot)
        if (blocker) {
            if (depth <= 0) {
                music.knock.play()
                return false
            }
            step(blocker, dir, depth - 1)
            // Ask the board, not the return value. step() also answers false
            // when the shoved robot fell off the edge and died - and in that
            // case the tile IS free, so the push should go through.
            if (botAt(col, row, bot)) {
                music.knock.play()
                return false
            }
        }
        tiles.placeOnTile(bot.sprite, next)
        fireLanded(bot)
        if (bot.dead || bot.out) return false
        pause(STEP_PAUSE)
        return true
    }

    function placeOnStart(bot: Bot) {
        if (!game.currentScene().tileMap) {
            bot.sprite.sayText("Hvor er banen?", 1500)
            return
        }
        if (bot.startCol >= 0) {
            // Somebody may be standing on my stair. Two robots on one tile
            // break botAt(), which returns only the first of them - the other
            // becomes unshootable and unpushable.
            let col = bot.startCol
            let row = bot.startRow
            if (botAt(col, row, bot)) {
                const free = freeTileNear(bot, col, row)
                col = free.column
                row = free.row
            }
            tiles.placeOnTile(bot.sprite, tiles.getTileLocation(col, row))
            bot.landedCol = col
            bot.landedRow = row
            aimInward(bot)
            return
        }
        if (!bot.startTile) return
        const spots = tiles.getTilesByType(bot.startTile)
        if (spots.length == 0) {
            bot.sprite.sayText("Hvor er startfeltet?", 1500)
            // It may have just fallen off the edge. Anywhere on the board
            // beats leaving it stranded outside, invisible, forever.
            const here = bot.sprite.tilemapLocation()
            if (offMap(here.column, here.row)) {
                const tm = game.currentScene().tileMap
                const mid = tiles.getTileLocation(tm.data.width >> 1, tm.data.height >> 1)
                tiles.placeOnTile(bot.sprite, mid)
                bot.landedCol = mid.column
                bot.landedRow = mid.row
            }
            return
        }
        // One stair each, claimed once and kept, so a robot always comes back
        // to the same corner. Falls back to sharing if the kid painted fewer
        // start tiles than there are players.
        let chosen = spots[0]
        for (let loc of spots) {
            if (!claimedStart(loc.column, loc.row)) { chosen = loc; break }
        }
        if (botAt(chosen.column, chosen.row, bot)) {
            const free = freeTileNear(bot, chosen.column, chosen.row)
            bot.startCol = free.column
            bot.startRow = free.row
            tiles.placeOnTile(bot.sprite, tiles.getTileLocation(free.column, free.row))
            bot.landedCol = free.column
            bot.landedRow = free.row
            aimInward(bot)
            return
        }
        bot.startCol = chosen.column
        bot.startRow = chosen.row
        tiles.placeOnTile(bot.sprite, chosen)
        bot.landedCol = chosen.column
        bot.landedRow = chosen.row
        aimInward(bot)
    }

    /**
     * The nearest tile to (col,row) nobody is standing on and that is on the
     * board. Used only when a robot has to respawn onto an occupied stair.
     */
    function freeTileNear(bot: Bot, col: number, row: number): tiles.Location {
        for (let r = 1; r <= 3; r++) {
            for (let d = 0; d < 4; d++) {
                const c = col + dx[d] * r
                const w = row + dy[d] * r
                if (offMap(c, w)) continue
                if (tiles.tileAtLocationIsWall(tiles.getTileLocation(c, w))) continue
                if (botAt(c, w, bot)) continue
                return tiles.getTileLocation(c, w)
            }
        }
        return tiles.getTileLocation(col, row)
    }

    function claimedStart(col: number, row: number): boolean {
        for (let b of bots) if (b.startCol == col && b.startRow == row) return true
        return false
    }

    /**
     * Face the middle of the board. Start tiles sit near an edge, and a robot
     * spawned facing UP in the top row walks off the board on its second card,
     * which is a miserable first thing to happen to a nine year old.
     */
    function aimInward(bot: Bot) {
        const tm = game.currentScene().tileMap
        if (!tm || !tm.enabled) return
        const loc = bot.sprite.tilemapLocation()
        const dc = (tm.data.width / 2) - loc.column
        const dr = (tm.data.height / 2) - loc.row
        let dir = 0
        if (Math.abs(dc) >= Math.abs(dr)) dir = dc > 0 ? 1 : 3
        else dir = dr > 0 ? 2 : 0
        bot.facing = dir
        bot.sprite.setImage(bot.images[dir])
    }

    function turn(quarterTurns: number) {
        const bot = active()
        if (!bot) return
        // If the kid swapped the image with a native block, re-derive the
        // facings from what is on screen now so rotation keeps working.
        if (bot.lookChanged()) {
            const back = (4 - bot.facing) % 4
            const up = back == 0
                ? bot.sprite.image
                : bot.sprite.image.rotated(back * 90)
            bot.setLook(up)
        }
        bot.facing = (bot.facing + quarterTurns) % 4
        bot.sprite.setImage(bot.images[bot.facing])
    }

    /** The one place a robot loses a life, so lava, holes and bullets agree. */
    function kill(bot: Bot) {
        if (!bot || bot.dead || bot.out) return
        bot.dead = true
        music.zapped.play()
        scene.cameraShake(4, 300)
        pause(400)
        bot.inf.changeLifeBy(-1)
        if (bot.inf.life() <= 0) retire(bot)
        else bot.respawn()
    }

    // ------------------------------------------------------------------
    // Engine internals: tile rules
    // ------------------------------------------------------------------

    /**
     * Run every tile rule for the tile the robot is standing on, exactly once
     * per landing, synchronously, so that a card like "+3" dies on the lava it
     * crosses instead of three tiles later. If a rule moved the robot (a
     * teleporter), the rules for the new tile run too.
     *
     * The depth counter is per robot, so a robot shoved by another one still
     * gets its own chain of rules; the budget is shared by the whole cascade,
     * so two belts shoving each other back and forth stop instead of
     * multiplying out.
     */
    let landBudget = 0
    // Counts every entry into fireLanded, so an outer pass can tell whether a
    // rule moved the robot through step() (which lands it itself) or with a
    // native block (which does not).
    let landings = 0
    function fireLanded(bot: Bot) {
        landings++
        const previous = current
        current = bot
        bot.landing++
        const passes = bot.landing > 1 ? 1 : MAX_TILE_CHAIN
        for (let chain = 0; chain < passes; chain++) {
            // Say so when the budget runs out, or it looks like a freeze.
            if (landBudget <= 0) {
                bot.sprite.sayText("loop?", 900)
                break
            }
            landBudget--
            const before = landings
            const loc = bot.sprite.tilemapLocation()
            bot.landedCol = loc.column
            bot.landedRow = loc.row
            for (let i = 0; i < landTiles.length; i++) {
                if (tiles.tileAtLocationEquals(loc, landTiles[i])) {
                    landHandlers[i](bot.sprite)
                }
                if (bot.dead || bot.out) { bot.landing--; current = previous; return }
            }
            if (anyLandHandler) anyLandHandler()
            if (bot.dead || bot.out) break
            // The engine's own rule, last, so a kid's "on lands on chest" hat
            // still sees the chest that is about to be opened.
            openChestUnder(bot)
            if (bot.dead || bot.out) break
            const after = bot.sprite.tilemapLocation()
            if (after.column == loc.column && after.row == loc.row) break
            // The robot moved. If it moved through step() then step() already
            // called us again for the new tile, so walking the chain here
            // would run that tile's rules a second time. Only a NATIVE move
            // (the documented way to build a teleport tile) leaves the
            // landing count untouched and still needs another pass.
            if (landings > before) break
        }
        bot.landing--
        current = previous
    }

    /**
     * The kids are encouraged to use native MakeCode blocks on the robot, and
     * "place on random tile" is how a teleport tile gets built. Nothing native
     * knows about tile rules, so after any handler runs, a robot that is
     * standing somewhere the engine has not run rules for is landed here.
     */
    function checkLanded(bot: Bot) {
        if (bot.dead || bot.out) return
        if (!game.currentScene().tileMap) return
        const loc = bot.sprite.tilemapLocation()
        if (loc.column != bot.landedCol || loc.row != bot.landedRow) fireLanded(bot)
    }

    function openChestUnder(bot: Bot) {
        if (!chestTile || !chestOpenTile) return
        const loc = bot.sprite.tilemapLocation()
        if (!tiles.tileAtLocationEquals(loc, chestTile)) return
        tiles.setTileAt(loc, chestOpenTile)
        bot.chests++
        bot.inf.setScore(bot.chests)
        if (chestsLeft > 0) chestsLeft--
        music.baDing.play()
        bot.sprite.sayText("KISTE!", 900)
    }

    /**
     * The board's turn, once after every card: conveyor belts, gears, lasers.
     * Runs for every robot still in play, on the tile it is standing on now.
     */
    function boardPhase() {
        if (betweenTiles.length == 0) return
        if (!game.currentScene().tileMap) return
        const previous = current
        // Snapshot first. The board acts on where everyone was standing when
        // the phase began; reading a robot's live tile when its own turn came
        // up gave a robot that had just been shoved onto a belt by another
        // robot's belt a second ride in the same phase.
        let actors: Bot[] = []
        let atCol: number[] = []
        let atRow: number[] = []
        for (let bot of playing) {
            if (bot.dead || bot.out) continue
            const at = bot.sprite.tilemapLocation()
            actors.push(bot); atCol.push(at.column); atRow.push(at.row)
        }
        for (let k = 0; k < actors.length; k++) {
            const bot = actors[k]
            if (bot.dead || bot.out) continue
            const loc = tiles.getTileLocation(atCol[k], atRow[k])
            landBudget = MAX_TILE_CHAIN
            for (let i = 0; i < betweenTiles.length; i++) {
                if (tiles.tileAtLocationEquals(loc, betweenTiles[i])) {
                    current = bot
                    betweenHandlers[i](bot.sprite)
                    checkLanded(bot)
                    current = previous
                }
                if (bot.dead || bot.out) break
            }
        }
        current = previous
    }

    // ------------------------------------------------------------------
    // Engine internals: the deck
    // ------------------------------------------------------------------

    /**
     * Every robot has its own pile of the same cards. Cards you played and
     * cards you never played both go on your discard, and when your pile runs
     * out the discard is shuffled back in - so over a game you see your whole
     * deck, and no two robots are drawing from the same pile.
     */
    /**
     * A deck for a kid who never wrote one. Called at the end of the lobby, not
     * from startGame: an "add cards" block placed BELOW "start Robo Rally" is a
     * perfectly ordinary thing for a nine year old to do, and injecting the
     * default first would silently give them twelve extra cards.
     */
    function defaultDeck() {
        if (deck.length > 0) return
        addCards(3, "+1"); addCards(2, "+2"); addCards(1, "+3")
        addCards(1, "-1"); addCards(2, "V"); addCards(2, "H"); addCards(1, "P")
    }

    function deal(bot: Bot) {
        if (bot.drawPile.length == 0 && bot.discard.length == 0 && bot.hand.length == 0) {
            for (let c of deck) bot.drawPile.push(c)
        }
        for (let c of bot.hand) bot.discard.push(c)
        bot.hand = []
        for (let i = 0; i < HAND_SIZE; i++) {
            if (bot.drawPile.length == 0) {
                while (bot.discard.length > 0) {
                    bot.drawPile.push(bot.discard.removeAt(randint(0, bot.discard.length - 1)))
                }
            }
            if (bot.drawPile.length == 0) break
            bot.hand.push(bot.drawPile.removeAt(randint(0, bot.drawPile.length - 1)))
        }
        bot.program = []
        bot.selected = 0
        bot.ready = false
        drawRow(bot, -1, 0)
    }

    /** How many cards this robot has to commit before it can press B. */
    function programSize(bot: Bot): number {
        return Math.min(PROGRAM_SIZE, bot.hand.length)
    }

    // ------------------------------------------------------------------
    // Engine internals: controls
    // ------------------------------------------------------------------

    function setupControls(bot: Bot) {
        // addEventListener, not onEvent: onEvent is last-one-wins per button,
        // so a kid who drops a native "on A button pressed" block into their
        // program would silently replace the engine's card handler.
        bot.ctrl.right.addEventListener(ControllerButtonEvent.Pressed, function () {
            if (phase != PHASE_PROGRAM || bot.ready || bot.hand.length == 0) return
            bot.selected = (bot.selected + 1) % bot.hand.length
            drawRow(bot, -1, 0)
        })
        bot.ctrl.left.addEventListener(ControllerButtonEvent.Pressed, function () {
            if (phase != PHASE_PROGRAM || bot.ready || bot.hand.length == 0) return
            bot.selected = (bot.selected + bot.hand.length - 1) % bot.hand.length
            drawRow(bot, -1, 0)
        })
        bot.ctrl.A.addEventListener(ControllerButtonEvent.Pressed, function () {
            if (phase == PHASE_LOBBY) {
                if (!bot.joined) {
                    bot.joined = true
                    music.baDing.play()
                }
                return
            }
            if (phase == PHASE_EXECUTE) {
                // Only the robot being prompted; everyone else's A does
                // nothing, so mashing it does not spend somebody's turn.
                if (bot === activeBot) bot.aPressed = true
                return
            }
            if (phase != PHASE_PROGRAM || bot.ready) return
            if (control.millis() - phaseAt < PHASE_GRACE) return
            if (bot.program.length >= programSize(bot)) return
            if (bot.program.indexOf(bot.selected) >= 0) return
            bot.program.push(bot.selected)
            drawRow(bot, -1, 0)
        })
        bot.ctrl.up.addEventListener(ControllerButtonEvent.Pressed, function () {
            if (phase != PHASE_PROGRAM || bot.ready || bot.program.length == 0) return
            bot.program.pop()
            drawRow(bot, -1, 0)
        })
        bot.ctrl.down.addEventListener(ControllerButtonEvent.Pressed, function () {
            // The one thing four kids on one screen really need: pull the
            // camera onto my own robot for a moment while I plan.
            if (phase != PHASE_PROGRAM || !inPlay(bot)) return
            peekBot = bot
            peekUntil = control.millis() + PEEK_MS
        })
        bot.ctrl.B.addEventListener(ControllerButtonEvent.Pressed, function () {
            if (phase == PHASE_LOBBY) {
                if (bot.player == 1 && anyJoined()) lobbyDone = true
                return
            }
            if (phase != PHASE_PROGRAM || bot.ready) return
            if (bot.program.length < programSize(bot)) {
                // The robot may be nowhere near the camera, so say it where
                // everyone is already looking as well as over its head.
                flash(programSize(bot) + " KORT!", bot.color)
                bot.sprite.sayText(programSize(bot) + " kort!", 800)
                music.knock.play()
                return
            }
            bot.ready = true
            drawRow(bot, -1, 0)
        })
    }

    function anyJoined(): boolean {
        for (let b of bots) if (b.joined) return true
        return false
    }

    function everyoneReady(): boolean {
        let any = false
        for (let bot of playing) {
            if (bot.out) continue
            if (!bot.ready) return false
            any = true
        }
        return any
    }

    // ------------------------------------------------------------------
    // Engine internals: the round
    // ------------------------------------------------------------------

    let lobbyDone = false

    function beginLoop() {
        if (loopStarted) return
        loopStarted = true
        makeUi()
        game.setGameOverScoringType(game.ScoringType.None)
        game.onUpdate(updateCamera)
        // NOT forked here. startGame is only the FIRST of the kid's setup
        // blocks - "play with 4 robots" and "treasure is ..." have not run yet
        // - and a kid may well have put a splash screen or a pause between
        // them. onUpdate is scene-scoped, so it does not tick at all while a
        // splash has a scene pushed, and the quiet window below covers an
        // ordinary pause. Whatever is left is caught by the lobby, which
        // re-reads the roster while it is open.
        game.onUpdate(function () {
            if (loopForked) return
            if (control.millis() - setupAt < SETUP_QUIET) return
            loopForked = true
            control.runInParallel(gameLoop)
        })
    }

    function gameLoop() {
        lobby()
        while (phase != PHASE_OVER) {
            // Phase before the deal, so the freshly dealt hand already shows
            // the cursor rather than waiting for the first left/right press.
            phase = PHASE_PROGRAM
            phaseAt = control.millis()
            for (let bot of playing) if (!bot.out) deal(bot)
            banner("VAELG KORT", 1)
            // Bounded, unlike every other wait in here. One kid who puts the
            // controller down without pressing B used to freeze the table for
            // good, with no way out but a power cycle.
            pauseUntil(everyoneReady, PROGRAM_TIMEOUT)
            for (let bot of playing) {
                if (bot.out || bot.ready) continue
                // Fill what they did not choose, so their robot still does
                // something and the round is not silently short.
                while (bot.program.length < programSize(bot)) {
                    let i = 0
                    while (bot.program.indexOf(i) >= 0) i++
                    bot.program.push(i)
                }
                bot.ready = true
                drawRow(bot, -1, 0)
            }
            phase = PHASE_EXECUTE
            phaseAt = control.millis()
            runRound()
            if (phase == PHASE_OVER) return
            pause(BEAT)
        }
    }

    /**
     * Nobody is on the board until they say so. Every kid presses A on their
     * own controller; player 1 presses B when the table is ready. Robots that
     * never joined stay off the board entirely.
     */
    function lobby() {
        phase = PHASE_LOBBY
        phaseAt = control.millis()
        lobbyDone = false
        const opened = control.millis()
        const deadline = opened + LOBBY_TIMEOUT
        while (!lobbyDone && control.millis() < deadline) {
            banner(((control.millis() >> 11) & 1) == 0 ? "TRYK A" : "P1: B=START", 1)
            // The roster is re-read every pass, so robots added by a setup
            // block that ran late are still picked up.
            const settled = control.millis() - opened > LOBBY_SETTLE
            let all = bots.length > 0
            for (let b of bots) if (!b.joined) all = false
            if (settled && all) break
            // One robot has nobody to wait for - but only once the roster has
            // had time to settle, or a slow setup would start a four player
            // game as a solo one.
            if (settled && bots.length == 1) {
                bots[0].joined = true
                break
            }
            pause(100)
        }
        if (!anyJoined()) bots[0].joined = true
        defaultDeck()

        playing = []
        for (let b of bots) {
            if (!b.joined) { b.out = true; continue }
            playing.push(b)
            b.sprite.setFlag(SpriteFlag.Invisible, false)
            placeOnStart(b)
        }
        layoutRows()
        countChests()
        banner("", 1)
    }

    /**
     * Register by register, robot by robot, then the board: the board game's
     * order of play, and the same order the Minecraft tick phases will use.
     * Each robot's turn waits for that kid to press A, so four nine year olds
     * can follow what is happening to whom.
     */
    function runRound() {
        for (let bot of playing) bot.dead = false
        for (let reg = 0; reg < PROGRAM_SIZE; reg++) {
            for (let bot of playing) {
                if (!inPlay(bot) || bot.dead) continue
                if (reg >= bot.program.length) continue
                activeBot = bot
                waitForTurn(bot)
                if (!inPlay(bot) || bot.dead) { activeBot = null; continue }

                const card = bot.hand[bot.program[reg]]
                // Say it, then do it, then put it away. Three separate beats,
                // so the kids can follow which card is running.
                banner("", bot.color)
                drawRow(bot, reg, 1)
                bot.sprite.sayText(card, BUBBLE_MS)
                pause(BEAT)
                // Down before the card runs, not after: a card is allowed to
                // say something of its own, and clearing afterwards would wipe
                // it - including the "<card> ?" warning for a misspelt card.
                bot.sprite.sayText("")
                current = bot
                landBudget = MAX_TILE_CHAIN
                playCard(card, bot)
                checkLanded(bot)
                current = null
                pause(BEAT)
                drawRow(bot, reg, 2)
                pause(BEAT)
                activeBot = null
                if (checkEnd()) return
            }
            banner("BANEN", 1)
            boardPhase()
            if (checkEnd()) return
        }
    }

    /** Hold the round until this robot's own player presses A. */
    function waitForTurn(bot: Bot) {
        focusCamera(bot)
        bot.aPressed = false
        turnDeadline = control.millis() + TURN_TIMEOUT
        banner("TRYK A", bot.color)
        pauseUntil(() => bot.aPressed || control.millis() > turnDeadline || bot.out)
        turnDeadline = 0
    }

    function playCard(card: string, bot: Bot) {
        let played = false
        for (let i = 0; i < cardNames.length; i++) {
            if (cardNames[i] == card) {
                cardHandlers[i](bot.sprite)
                played = true
            }
        }
        // A card with no rule is a spelling mistake, and an invisible one.
        if (!played) bot.sprite.sayText(card + " ?", BUBBLE_MS)
    }

    // ------------------------------------------------------------------
    // Engine internals: winning
    // ------------------------------------------------------------------

    function countChests() {
        if (!chestTile) { chestsLeft = -1; return }
        if (!game.currentScene().tileMap) { chestsLeft = -1; return }
        chestsTotal = tiles.getTilesByType(chestTile).length
        // A kid who picked the treasure tile but never painted one on the map
        // must not win the game before it has started.
        chestsLeft = chestsTotal > 0 ? chestsTotal : -1
    }

    /**
     * Every way the game can end, checked between cards. Nothing here may run
     * from a render pass or a button handler: game over blocks and never
     * returns to its caller.
     */
    function checkEnd(): boolean {
        // A robot may have hit zero lives inside the HUD render pass, where
        // the handler can only raise a flag - it must not block, so it cannot
        // take the robot off the board itself. Test `retired`, not `out`: the
        // handler sets `out` first, which used to make this sweep dead code.
        for (let b of playing) if (!b.retired && (b.out || b.inf.life() <= 0)) retire(b)

        if (pendingWinner > 0) return finish(pendingWinner)

        let alive: Bot[] = []
        for (let b of playing) if (!b.out) alive.push(b)
        if (alive.length == 0) {
            phase = PHASE_OVER
            game.gameOver(false)
            return true
        }
        // Last robot standing.
        if (playing.length > 1 && alive.length == 1) return finish(alive[0].player)
        // Every chest opened: most chests wins, and a tie is a draw.
        if (chestsTotal > 0 && chestsLeft == 0) {
            // Only robots still in the game can win it. A robot that ran out
            // of lives three rounds ago does not get to take the trophy on
            // the strength of the chests it opened before it died.
            let best = -1
            for (let b of alive) if (b.chests > best) best = b.chests
            let winners: Bot[] = []
            for (let b of alive) if (b.chests == best) winners.push(b)
            if (winners.length == 1) return finish(winners[0].player)
            phase = PHASE_OVER
            game.setGameOverMessage(true, "UAFGJORT!")
            game.gameOver(true)
            return true
        }
        return false
    }

    function finish(player: number): boolean {
        phase = PHASE_OVER
        game.gameOverPlayerWin(player)
        return true
    }

    // ------------------------------------------------------------------
    // Engine internals: camera
    // ------------------------------------------------------------------

    /**
     * The board is bigger than the screen, so the view has to choose. During a
     * turn it sits on the robot playing; while everybody is programming it
     * sits between them, and any kid can pull it onto their own robot with
     * down. The offset lifts the robot above the card rows.
     */
    function cameraLift(): number {
        let top = BOTTOM_ROW_Y
        for (let b of playing) if (b.rowY >= 0 && b.rowY < top) top = b.rowY
        const middle = (BANNER_H + top - 1) >> 1
        return (screen.height >> 1) - middle
    }

    function focusCamera(bot: Bot) {
        scene.centerCameraAt(bot.sprite.x, bot.sprite.y + cameraLift())
    }

    function updateCamera() {
        if (phase == PHASE_LOBBY || phase == PHASE_OVER) return
        if (phase == PHASE_EXECUTE) {
            if (activeBot) focusCamera(activeBot)
            return
        }
        if (peekBot && control.millis() < peekUntil) {
            focusCamera(peekBot)
            return
        }
        // Between everybody, so no kid is completely in the dark.
        let n = 0, sx = 0, sy = 0
        for (let b of playing) {
            if (!inPlay(b)) continue
            n++; sx += b.sprite.x; sy += b.sprite.y
        }
        if (n == 0) return
        scene.centerCameraAt(sx / n, sy / n + cameraLift())
    }

    // ------------------------------------------------------------------
    // Engine internals: drawing
    // ------------------------------------------------------------------

    function banner(text: string, color: number) {
        bannerText = text
        bannerColor = color
    }

    function flash(text: string, color: number) {
        flashText = text
        flashColor = color
        flashUntil = control.millis() + 1400
    }

    /** One card row per player, stacked up from the bottom of the screen. */
    function layoutRows() {
        let y = BOTTOM_ROW_Y
        for (let b of playing) {
            b.rowY = y
            y -= ROW_PITCH
            drawRow(b, -1, 0)
        }
    }

    let uiMade = false
    function makeUi() {
        if (uiMade) return
        uiMade = true
        // One renderable instead of forty card sprites. It draws after the
        // tilemap and before the robot (z 95), which is the only point where
        // "the tiles behind a card" still exist to be darkened - and unlike a
        // sprite it can simply not draw a row, which is how rows are hidden.
        // (Moving a card off screen is not an option: mapRect clamps rather
        // than no-ops in the simulator, and would smear a line down the edge.)
        scene.createRenderable(90, drawUi)
    }

    function drawUi(target: Image, camera: scene.Camera) {
        for (let b of playing) {
            if (b.rowY < 0 || b.out) continue
            // Darken the board only behind cards that are actually there.
            // Dimming an empty slot punches a dark rectangle into the board.
            for (let i = 0; i < b.program.length; i++) {
                target.mapRect(PROGRAM_X + i * PITCH, b.rowY, CARD_W, CARD_H, DIM)
            }
            for (let i = 0; i < b.hand.length; i++) {
                target.mapRect(HAND_X + i * PITCH, b.rowY, CARD_W, CARD_H, DIM)
            }
            target.drawTransparentImage(b.rowImage, 0, b.rowY)
        }
        drawBanner(target)
    }

    /**
     * The top line: who is playing, how many lives they have left, how many
     * chests are still out there, and whose turn it is. It replaces the native
     * four-corner HUD, which would sit exactly on top of the card rows.
     */
    function drawBanner(target: Image) {
        let x = 2
        // In the lobby nobody is in `playing` yet, but the whole point of the
        // lobby is to show who has pressed A, so show every seat there.
        const seats = phase == PHASE_LOBBY ? bots : playing
        for (let b of seats) {
            const lit = !b.out && (phase != PHASE_LOBBY || b.joined)
            target.fillRect(x, 0, 8, 7, lit ? b.color : 11)
            target.print("" + b.player, x + 1, 1, 1, image.font5)
            if (lit) {
                // One digit only: the seats sit on a 17 px pitch and a second
                // digit is painted over by the next badge.
                const lives = Math.min(9, Math.max(0, b.inf.life()))
                target.print("" + lives, x + 9, 1, 1, image.font5)
            }
            x += 17
        }
        if (chestsLeft >= 0) {
            target.print("K" + chestsLeft, 74, 1, 5, image.font5)
        }
        let text = bannerText
        let color = bannerColor
        if (control.millis() < flashUntil) {
            text = flashText
            color = flashColor
        }
        if (turnDeadline > 0) {
            const left = Math.idiv(turnDeadline - control.millis() + 999, 1000)
            if (left <= 5) text = "TRYK A " + Math.max(0, left)
        }
        if (text.length > 0) {
            target.print(text, screen.width - 2 - text.length * 6, 1, color, image.font5)
        }
    }

    /**
     * Rebuild one player's row. Called on every change rather than every
     * frame: the row is a cached image the renderable only has to blit.
     *
     * running/style let the executing card light up: slot `reg` is drawn
     * solid while its card runs and grey once it is spent.
     */
    function drawRow(bot: Bot, reg: number, regStyle: number) {
        const im = bot.rowImage
        im.fill(0)
        for (let i = 0; i < PROGRAM_SIZE; i++) {
            if (i >= bot.program.length) continue
            let style = 0
            if (i == reg) style = regStyle
            drawCard(im, PROGRAM_X + i * PITCH, bot.hand[bot.program[i]], style, bot.color)
        }
        for (let i = 0; i < bot.hand.length; i++) {
            let style = 0
            if (bot.program.indexOf(i) >= 0) style = 2
            if (i == bot.selected && !bot.ready && phase == PHASE_PROGRAM) {
                style = style == 2 ? 3 : 1
            }
            drawCard(im, HAND_X + i * PITCH, bot.hand[i], style, bot.color)
        }
    }

    /**
     * style: 0 normal, 1 under the cursor or running, 2 spent,
     *        3 spent AND under the cursor.
     *
     * A card is a frame around a hole. image.create() leaves every pixel
     * transparent, so the board shows through the middle; the renderable
     * darkens what is behind so the label still reads. The card under the
     * cursor is drawn solid, so it is the one thing on the row you cannot miss.
     *
     * font5 advances 6 px per character, so on a 14 px card a two-character
     * label lands at x = 1 exactly and a three-character one is clipped.
     */
    function drawCard(im: Image, x: number, card: string, style: number, color: number) {
        const label = fit(card)
        if (style == 1) {
            im.fillRect(x, 0, CARD_W, CARD_H, color)
            im.print(label, x + centerX(label), 1, 1, image.font5)
            return
        }
        // Spent cards go grey, but the cursor still has to be findable when it
        // is sitting on one, or A appears to do nothing for no visible reason.
        const ink = style >= 2 ? 11 : color
        im.drawRect(x, 0, CARD_W, CARD_H, style == 3 ? 1 : ink)
        im.print(label, x + centerX(label), 1, ink, image.font5)
    }

    /**
     * A card is 14 px wide and font5 advances 6 px per character, so only two
     * characters fit. Nothing stops a kid naming a card "PRUT": print it whole
     * and it runs straight across the next card in the row, because the row is
     * one image. Cut it instead - a clipped name is a visible reason to
     * shorten it, a smeared row is not.
     */
    function fit(card: string): string {
        const max = (CARD_W - 2) / image.font5.charWidth
        if (card.length <= max) return card
        return card.substr(0, max)
    }

    function centerX(card: string): number {
        const w = card.length * image.font5.charWidth
        let x = (CARD_W - w) >> 1
        if (x < 1) x = 1
        return x
    }
}
