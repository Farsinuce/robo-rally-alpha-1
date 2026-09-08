namespace SpriteKind {
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
 *  - The kids own the map (native tilemap editor) and the robot (native sprite
 *    editor). The engine must never create either one.
 *  - Kid-facing verbs stay unqualified: "move 1" means "the robot whose card is
 *    being played". The engine always knows which robot that is, so the same
 *    kid program works unchanged when the second robot is added.
 *  - The engine owns only the primitives a kid cannot build out of other
 *    blocks: move, turn, push, shoot, and the moment between two cards.
 *    Everything a kid invents on top of those is a card name plus a hat.
 *  - Never change a blockId. Renaming one silently breaks every saved project.
 *    The visible block text can change freely.
 */
//% color="#B4009E" icon="" block="Robo Rally" weight=100
//% groups='["Setup", "Cards", "Tiles", "Robot", "Advanced"]'
namespace roboRally {
    const HAND_SIZE = 6
    const PROGRAM_SIZE = 4
    const MAX_PLAYERS = 2
    const START_LIVES = 3

    // Pacing. One card reads as three beats: say it, do it, put it away.
    const STEP_PAUSE = 250      // between two tiles of the same move
    const BEAT = 250            // between the three parts of a card
    const SHOT_PAUSE = 60       // per tile of a shot
    // sayText leaves a stale deadline behind if the duration is ever omitted,
    // so every bubble gets an explicit, deliberately long one and the engine
    // takes it down itself with sayText("").
    const BUBBLE_MS = 60000

    // A tile rule that moves the robot re-triggers the rules on the new tile.
    // Cap the chain so two teleporters pointing at each other cannot hang.
    const MAX_TILE_CHAIN = 8
    // Off-map already counts as a wall, so this is only a safety net.
    const SHOT_RANGE = 20

    // Card sprites are 16 x 11 on an 18 px pitch.
    const CARD_W = 16
    const CARD_H = 11
    // Arcade images have no alpha channel, so a card cannot be drawn half
    // transparent. What it can do is leave its middle empty and darken the
    // board behind it: mapRect rewrites the pixels already on screen through
    // this 16 byte table, index -> darker index. Byte i is what colour i
    // becomes. That is the engine's only real blend.
    //
    // The table may never produce a colour a card is drawn in, or that card
    // becomes invisible on its own dimmed background. It outputs only
    // {0, 6, 12, 13, 14, 15}; the card inks below are 1, 5 and 11.
    const DIM = hex`000d0e0e0e0e0c060c060c0c0f0c0c0f`

    const dx = [0, 1, 0, -1]
    const dy = [-1, 0, 1, 0]

    const BULLET = img`
        . . . . . .
        . . 5 5 . .
        . 5 2 2 5 .
        . 5 2 2 5 .
        . . 5 5 . .
        . . . . . .
    `

    /**
     * All per-robot state. One instance in the single player game, two when a
     * kid adds the second robot: nothing outside this class assumes there is
     * only one. Classes are invisible to the Blocks editor, so this costs the
     * kids nothing.
     */
    class Bot {
        sprite: Sprite
        player: number
        ctrl: controller.Controller
        facing: number
        images: Image[]
        startTile: Image
        hand: string[]
        program: number[]
        selected: number
        dead: boolean
        out: boolean
        ready: boolean
        // The tile whose rules were last run for this robot, so a card that
        // moves it with a NATIVE block still lands properly.
        landedCol: number
        landedRow: number
        handSprites: Sprite[]
        slots: Sprite[]

        constructor(sprite: Sprite, startTile: Image, player: number) {
            this.sprite = sprite
            this.startTile = startTile
            this.player = player
            this.facing = 0
            this.hand = []
            this.program = []
            this.selected = 0
            this.dead = false
            this.out = false
            this.ready = false
            this.landedCol = -999
            this.landedRow = -999
            this.handSprites = []
            this.slots = []
            this.ctrl = controllerForPlayer(player)
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
    let current: Bot = null
    let running = false
    let started = false
    // Far in the past, so the very first B press is never mistaken for one
    // queued up during a program that has not run yet.
    let runEndedAt = -100000

    let cardNames: string[] = []
    let cardHandlers: ((robot: Sprite) => void)[] = []
    let landTiles: Image[] = []
    let landHandlers: ((robot: Sprite) => void)[] = []
    let betweenTiles: Image[] = []
    let betweenHandlers: ((robot: Sprite) => void)[] = []
    // Kept for the old catch-all block; see onLanded below.
    let anyLandHandler: () => void = null

    // ------------------------------------------------------------------
    // Setup
    // ------------------------------------------------------------------

    /**
     * Put cards into the draw pile. A card is just a text, so you can invent
     * your own: give it a name here and a "on card played" block to say what
     * it does.
     * @param count how many copies of the card
     * @param card the name of the card, eg: "+1"
     */
    //% blockId=roboRally_addCards
    //% block="add $count cards $card to the deck"
    //% count.defl=1 count.min=1 count.max=20
    //% card.defl="+1"
    //% group="Setup" weight=100
    export function addCards(count: number, card: string) {
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
        if (!robot) return
        if (deck.length == 0) {
            addCards(3, "+1"); addCards(2, "+2"); addCards(1, "+3")
            addCards(1, "-1"); addCards(2, "V"); addCards(2, "H"); addCards(1, "P")
        }
        addRobot(robot, startTile, 1)
        started = true
        for (let bot of bots) deal(bot)
    }

    /**
     * Add the second robot. Player 1 is the robot given to "start Robo Rally";
     * player 2 plays on the second controller and gets its own row of cards
     * along the top of the screen.
     * @param robot the sprite for player 2, facing UP
     * @param startTile the tile this robot starts and respawns on
     */
    //% blockId=roboRally_addPlayer
    //% block="add robot $robot starting on $startTile as player 2"
    //% robot.shadow=variables_get robot.defl=mySprite2
    //% startTile.shadow=tileset_tile_picker
    //% startTile.decompileIndirectFixedInstances=true
    //% group="Setup" weight=80
    export function addPlayer(robot: Sprite, startTile: Image) {
        if (!robot) return
        const before = bots.length
        addRobot(robot, startTile, 2)
        if (started && bots.length > before) deal(bots[bots.length - 1])
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
        if (!bot || bot.dead || n == 0) return
        let dir = bot.facing
        if (n < 0) dir = (bot.facing + 2) % 4
        for (let i = 0; i < Math.abs(n); i++) {
            if (!step(bot, dir, true)) return
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
     * the first wall, at the edge of the board, or at the other robot. A robot
     * that is hit loses a life and goes back to its start tile.
     */
    //% blockId=roboRally_shoot
    //% block="shoot"
    //% group="Cards" weight=60
    export function shoot() {
        const shooter = active()
        if (!shooter || shooter.dead) return
        if (!game.currentScene().tileMap) return

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

        let victim: Bot = null
        for (let i = 0; i < SHOT_RANGE; i++) {
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
        if (!bot || bot.dead) return
        step(bot, dir, true)
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
     * robot along between two of its own cards, and how a gear turns it.
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
        if (bot) infoForPlayer(bot.player).changeLifeBy(n)
    }

    /**
     * End the game as a win.
     */
    //% blockId=roboRally_win
    //% block="robot wins"
    //% group="Tiles" weight=80
    export function win() {
        const bot = active()
        music.powerUp.play()
        if (bot && bots.length > 1) {
            game.gameOverPlayerWin(bot.player)
        } else {
            game.over(true, effects.confetti)
        }
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
        tiles.setCurrentTilemap(tiles.createTilemap(data, image.create(w, h), [
            myTiles.floor, myTiles.wall, myTiles.lava,
            myTiles.goal, myTiles.start], TileScale.Sixteen))
        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const ch = rows[row].charAt(col)
                const loc = tiles.getTileLocation(col, row)
                let tile = myTiles.floor
                if (ch == "#") tile = myTiles.wall
                if (ch == "L") tile = myTiles.lava
                if (ch == "G") tile = myTiles.goal
                if (ch == "S") tile = myTiles.start
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

    /** Superseded by the native "camera follow sprite" block. */
    //% blockId=roboRally_cameraFollowsRobot
    //% block="camera follows robot"
    //% deprecated=true
    //% group="Advanced" weight=6
    export function cameraFollowsRobot() {
        const bot = active()
        if (bot) scene.cameraFollowSprite(bot.sprite)
    }

    // ------------------------------------------------------------------
    // Engine internals
    // ------------------------------------------------------------------

    function active(): Bot {
        if (current) return current
        return bots.length > 0 ? bots[0] : null
    }

    function controllerForPlayer(player: number): controller.Controller {
        return player == 2 ? controller.player2 : controller.player1
    }

    function infoForPlayer(player: number): info.PlayerInfo {
        return player == 2 ? info.player2 : info.player1
    }

    /**
     * The robot standing on this tile, or null. No engine API does this.
     * A robot that lost a life this round has already respawned and is
     * physically on the board, so it counts as occupying its tile.
     */
    function botAt(col: number, row: number, except: Bot): Bot {
        for (let b of bots) {
            if (b === except) continue
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
     * tile: it hit a wall, or it fell off the board and died.
     *
     * This is mutually recursive with fireLanded(): landing runs the tile's
     * rules, and a rule may push the robot, which lands it again. Two belts
     * pointing at each other would recurse until the stack gave out, so the
     * depth is capped here rather than inside either half.
     */
    let stepDepth = 0
    function step(bot: Bot, dir: number, shove: boolean): boolean {
        if (stepDepth >= MAX_TILE_CHAIN) return false
        stepDepth++
        const moved = stepOnce(bot, dir, shove)
        stepDepth--
        return moved
    }

    function stepOnce(bot: Bot, dir: number, shove: boolean): boolean {
        if (bot.dead) return false
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
        // Robots shove each other, the way they do in the board game. The
        // shoved robot does not shove on in turn, so this cannot recurse deep.
        if (shove) {
            const blocker = botAt(col, row, bot)
            if (blocker) {
                step(blocker, dir, false)
                if (botAt(col, row, bot)) {
                    music.knock.play()
                    return false
                }
            }
        }
        tiles.placeOnTile(bot.sprite, next)
        fireLanded(bot)
        if (bot.dead) return false
        pause(STEP_PAUSE)
        return true
    }

    function addRobot(sprite: Sprite, startTile: Image, player: number) {
        for (let b of bots) if (b.sprite === sprite) return
        if (bots.length >= MAX_PLAYERS) return
        const bot = new Bot(sprite, startTile, player)
        bots.push(bot)
        // Above the card sprites (z 90) so the robot and its speech bubble are
        // never hidden behind a card, but below the native info HUD (z 100).
        sprite.z = 95
        const inf = infoForPlayer(player)
        inf.setLife(START_LIVES)
        // This handler has to exist. The moment a second player's info is
        // touched, MakeCode's HUD switches to multiplayer mode and stops ending
        // the game by itself at zero lives - for either player. And it is
        // called from the HUD's render pass, so it must not block: raise a flag
        // and let runProgram finish the game.
        inf.onLifeZero(function () { bot.out = true })
        placeOnStart(bot)
        makeUi(bot)
        shadeCards()
        setupControls(bot)
    }

    /** True when the game is over and has been ended. */
    function gameEnded(): boolean {
        let alive: Bot[] = []
        for (let b of bots) if (!b.out) alive.push(b)
        if (alive.length == 0) {
            game.over(false)
            return true
        }
        if (bots.length > 1 && alive.length == 1) {
            game.gameOverPlayerWin(alive[0].player)
            return true
        }
        return false
    }

    function placeOnStart(bot: Bot) {
        if (!bot.startTile) return
        // "set tilemap to" has to run before "start Robo Rally".
        if (!game.currentScene().tileMap) {
            bot.sprite.sayText("Hvor er banen?", 1500)
            return
        }
        const spots = tiles.getTilesByType(bot.startTile)
        if (spots.length == 0) {
            bot.sprite.sayText("Hvor er startfeltet?", 1500)
            return
        }
        // Prefer a start tile the other robot is not already standing on.
        for (let loc of spots) {
            if (!botAt(loc.column, loc.row, bot)) {
                tiles.placeOnTile(bot.sprite, loc)
                bot.landedCol = loc.column
                bot.landedRow = loc.row
                aimInward(bot)
                return
            }
        }
        tiles.placeOnRandomTile(bot.sprite, bot.startTile)
        const at = bot.sprite.tilemapLocation()
        bot.landedCol = at.column
        bot.landedRow = at.row
        aimInward(bot)
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
        if (!bot || bot.dead) return
        bot.dead = true
        music.zapped.play()
        scene.cameraShake(4, 300)
        pause(400)
        bot.respawn()
        // Last, because at zero lives this ends the game.
        infoForPlayer(bot.player).changeLifeBy(-1)
    }

    /**
     * Run every tile rule for the tile the robot is standing on, exactly once
     * per landing, synchronously, so that a card like "+3" dies on the lava it
     * crosses instead of three tiles later. If a rule moved the robot (a
     * teleporter), the rules for the new tile run too.
     */
    let landing = 0
    function fireLanded(bot: Bot) {
        const previous = current
        current = bot
        landing++
        // A rule that moves the robot re-enters here through step(). Let only
        // the outermost call walk the chain; a nested one does a single pass
        // and lets its caller carry on, so no tile's rules run twice.
        const passes = landing > 1 ? 1 : MAX_TILE_CHAIN
        for (let chain = 0; chain < passes; chain++) {
            const loc = bot.sprite.tilemapLocation()
            bot.landedCol = loc.column
            bot.landedRow = loc.row
            for (let i = 0; i < landTiles.length; i++) {
                if (tiles.tileAtLocationEquals(loc, landTiles[i])) {
                    landHandlers[i](bot.sprite)
                }
                if (bot.dead) { landing--; current = previous; return }
            }
            if (anyLandHandler) anyLandHandler()
            if (bot.dead) break
            const after = bot.sprite.tilemapLocation()
            if (after.column == loc.column && after.row == loc.row) break
        }
        landing--
        current = previous
    }

    /**
     * The board's turn, once after every card: conveyor belts, gears, pushers.
     * Runs for every robot still alive, on the tile it is standing on now.
     */
    function boardPhase() {
        if (betweenTiles.length == 0) return
        if (!game.currentScene().tileMap) return
        const previous = current
        for (let bot of bots) {
            if (bot.dead) continue
            const loc = bot.sprite.tilemapLocation()
            for (let i = 0; i < betweenTiles.length; i++) {
                if (tiles.tileAtLocationEquals(loc, betweenTiles[i])) {
                    current = bot
                    betweenHandlers[i](bot.sprite)
                    checkLanded(bot)
                    current = previous
                }
                if (bot.dead) break
            }
        }
        current = previous
    }

    function deal(bot: Bot) {
        let pile: string[] = []
        bot.hand = []
        for (let i = 0; i < HAND_SIZE; i++) {
            if (pile.length == 0) for (let c of deck) pile.push(c)
            const k = randint(0, pile.length - 1)
            bot.hand.push(pile[k])
            pile.removeAt(k)
        }
        bot.program = []
        bot.selected = 0
        bot.ready = false
        drawCards(bot)
    }

    function everyoneReady(): boolean {
        for (let bot of bots) if (!bot.ready && !bot.out) return false
        return bots.length > 0
    }

    /**
     * Register by register, robot by robot, then the board: the board game's
     * order of play, and the same order the Minecraft tick phases will use.
     */
    function runProgram() {
        running = true
        for (let bot of bots) bot.dead = false
        for (let reg = 0; reg < PROGRAM_SIZE; reg++) {
            // A robot that just lost its last life ends the round for everyone.
            if (gameEnded()) return
            for (let bot of bots) {
                if (bot.dead || bot.out) continue
                if (reg >= bot.program.length) continue
                const card = bot.hand[bot.program[reg]]
                // Say it, then do it, then put it away. Three separate beats,
                // so the kids can follow which card is running.
                bot.slots[reg].setImage(cardImage(card, 1))
                bot.sprite.sayText(card, BUBBLE_MS)
                pause(BEAT)
                // Down before the card runs, not after: a card is allowed to
                // say something of its own, and clearing afterwards would wipe
                // it - including the "<card> ?" warning for a misspelt card.
                bot.sprite.sayText("")
                current = bot
                playCard(card, bot)
                checkLanded(bot)
                current = null
                pause(BEAT)
                bot.slots[reg].setImage(cardImage(card, 2))
                pause(BEAT)
            }
            boardPhase()
        }
        pause(BEAT)
        if (gameEnded()) return
        for (let bot of bots) deal(bot)
        running = false
        runEndedAt = control.millis()
    }

    /**
     * The kids are encouraged to use native MakeCode blocks on the robot, and
     * "place on random tile" is how a teleport tile gets built. Nothing native
     * knows about tile rules, so after any handler runs, a robot that is
     * standing somewhere the engine has not run rules for is landed here.
     * Without this a native teleport onto lava would do nothing at all.
     */
    function checkLanded(bot: Bot) {
        if (bot.dead) return
        if (!game.currentScene().tileMap) return
        const loc = bot.sprite.tilemapLocation()
        if (loc.column != bot.landedCol || loc.row != bot.landedRow) fireLanded(bot)
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

    function setupControls(bot: Bot) {
        bot.ctrl.onButtonEvent(ControllerButton.Right, ControllerButtonEvent.Pressed, function () {
            if (running || bot.ready || bot.hand.length == 0) return
            bot.selected = (bot.selected + 1) % bot.hand.length
            drawCards(bot)
        })
        bot.ctrl.onButtonEvent(ControllerButton.Left, ControllerButtonEvent.Pressed, function () {
            if (running || bot.ready || bot.hand.length == 0) return
            bot.selected = (bot.selected + bot.hand.length - 1) % bot.hand.length
            drawCards(bot)
        })
        bot.ctrl.onButtonEvent(ControllerButton.A, ControllerButtonEvent.Pressed, function () {
            if (running || bot.ready) return
            if (bot.program.length >= PROGRAM_SIZE) return
            if (bot.program.indexOf(bot.selected) >= 0) return
            bot.program.push(bot.selected)
            drawCards(bot)
        })
        bot.ctrl.onButtonEvent(ControllerButton.Up, ControllerButtonEvent.Pressed, function () {
            if (running || bot.ready || bot.program.length == 0) return
            bot.program.pop()
            drawCards(bot)
        })
        bot.ctrl.onButtonEvent(ControllerButton.B, ControllerButtonEvent.Pressed, function () {
            if (running || bot.ready) return
            // Presses made while the program was running are queued up and
            // replayed here; swallow them instead of nagging about the count.
            if (control.millis() - runEndedAt < 400) return
            if (bot.program.length < PROGRAM_SIZE) {
                bot.sprite.sayText(PROGRAM_SIZE + " kort!", 800)
                return
            }
            bot.ready = true
            drawCards(bot)
            if (everyoneReady()) runProgram()
        })
    }

    /**
     * Player 1 keeps the band under the map, player 2 gets the top. The card
     * images are half transparent, so the board reads through them either way.
     */
    function makeUi(bot: Bot) {
        const handY = bot.player == 2 ? 6 : 113
        const slotY = bot.player == 2 ? 18 : 101
        for (let i = 0; i < PROGRAM_SIZE; i++) {
            bot.slots.push(uiSprite(80 - (PROGRAM_SIZE - 1) * 9 + i * 18, slotY))
        }
        for (let i = 0; i < HAND_SIZE; i++) {
            bot.handSprites.push(uiSprite(80 - (HAND_SIZE - 1) * 9 + i * 18, handY))
        }
    }

    function uiSprite(x: number, y: number): Sprite {
        const s = sprites.create(emptyImage(), SpriteKind.Card)
        s.setFlag(SpriteFlag.RelativeToCamera, true)
        s.setFlag(SpriteFlag.Ghost, true)
        s.setPosition(x, y)
        // Above the board, below the robot (z 200). Not 100: that is the z the
        // native info HUD uses, and a tie there is broken by creation order.
        s.z = 90
        return s
    }

    /**
     * Darken the board behind every card, once per frame. onShade draws after
     * the tilemap and before the cards (z 80 < 90), which is the only slot
     * where "the tiles behind a card" still exist to be dimmed.
     */
    let shaded = false
    function shadeCards() {
        if (shaded) return
        shaded = true
        game.onShade(function () {
            for (let b of bots) {
                // Only behind a card that is actually there. Dimming an empty
                // slot would punch a dark rectangle in the middle of the board.
                for (let i = 0; i < b.handSprites.length; i++) {
                    if (i >= b.hand.length) continue
                    const s = b.handSprites[i]
                    screen.mapRect(s.left, s.top, CARD_W, CARD_H, DIM)
                }
                for (let i = 0; i < b.slots.length; i++) {
                    if (i >= b.program.length) continue
                    const s = b.slots[i]
                    screen.mapRect(s.left, s.top, CARD_W, CARD_H, DIM)
                }
            }
        })
    }

    function drawCards(bot: Bot) {
        for (let i = 0; i < bot.handSprites.length; i++) {
            if (i >= bot.hand.length) {
                bot.handSprites[i].setImage(emptyImage())
                continue
            }
            let style = 0
            if (bot.program.indexOf(i) >= 0) style = 2
            if (i == bot.selected && !bot.ready) style = style == 2 ? 3 : 1
            bot.handSprites[i].setImage(cardImage(bot.hand[i], style))
        }
        for (let i = 0; i < PROGRAM_SIZE; i++) {
            if (i < bot.program.length) {
                bot.slots[i].setImage(cardImage(bot.hand[bot.program[i]], 0))
            } else {
                bot.slots[i].setImage(emptyImage())
            }
        }
    }

    /**
     * style: 0 normal, 1 under the cursor or running, 2 spent,
     *        3 spent AND under the cursor.
     *
     * A card is a frame around a hole. image.create() leaves every pixel
     * transparent, so the board shows through the middle; shadeCards() darkens
     * what is behind so the label still reads. The card under the cursor is
     * drawn solid, so it is the one thing on the row you cannot miss.
     *
     * font5 advances 6 px per character, so a label of three or more
     * characters overflows a 16 px card and gets its first column clipped.
     */
    function cardImage(card: string, style: number): Image {
        const im = image.create(CARD_W, CARD_H)
        if (style == 1) {
            im.fillRect(1, 1, CARD_W - 2, CARD_H - 2, 5)
            im.drawRect(0, 0, CARD_W, CARD_H, 15)
            im.printCenter(card, 3, 15, image.font5)
            return im
        }
        // Spent cards go grey, but the cursor still has to be findable when it
        // is sitting on one, or A appears to do nothing for no visible reason.
        const ink = style >= 2 ? 11 : 1
        im.drawRect(0, 0, CARD_W, CARD_H, style == 3 ? 5 : ink)
        im.printCenter(card, 3, ink, image.font5)
        return im
    }

    function emptyImage(): Image {
        const im = image.create(CARD_W, CARD_H)
        im.drawRect(0, 0, CARD_W, CARD_H, 11)
        return im
    }
}
