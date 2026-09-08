namespace SpriteKind {
    export const Card = SpriteKind.create()
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
 *    kid program works unchanged when several robots are added.
 *  - Never change a blockId. Renaming one silently breaks every saved project.
 *    The visible block text can change freely.
 */
//% color="#B4009E" icon="" block="Robo Rally" weight=100
//% groups='["Setup", "Cards", "Tiles", "Robot", "Advanced"]'
namespace roboRally {
    const HAND_SIZE = 6
    const PROGRAM_SIZE = 4
    const STEP_PAUSE = 250
    const CARD_PAUSE = 500
    // A tile rule that moves the robot re-triggers the rules on the new tile.
    // Cap the chain so two teleporters pointing at each other cannot hang.
    const MAX_TILE_CHAIN = 8

    const dx = [0, 1, 0, -1]
    const dy = [-1, 0, 1, 0]

    /**
     * All per-robot state. One instance today, up to four when the multiplayer
     * session lands: nothing outside this class assumes there is only one.
     * Classes are invisible to the Blocks editor, so this costs the kids nothing.
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
        ready: boolean
        handSprites: Sprite[]
        slots: Sprite[]
        baseY: number

        constructor(sprite: Sprite, startTile: Image, player: number, baseY: number) {
            this.sprite = sprite
            this.startTile = startTile
            this.player = player
            this.baseY = baseY
            this.facing = 0
            this.hand = []
            this.program = []
            this.selected = 0
            this.dead = false
            this.ready = false
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

    let cardNames: string[] = []
    let cardHandlers: ((robot: Sprite) => void)[] = []
    let landTiles: Image[] = []
    let landHandlers: ((robot: Sprite) => void)[] = []
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
     * robot and which tile it starts on.
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
     * Add another robot, for the multiplayer session. Player 1 is the robot
     * given to "start Robo Rally".
     * @param robot the sprite for this player, facing UP
     * @param startTile the tile this robot starts and respawns on
     * @param player 1 to 4
     */
    //% blockId=roboRally_addPlayer
    //% block="add robot $robot starting on $startTile as player $player"
    //% robot.shadow=variables_get robot.defl=mySprite2
    //% startTile.shadow=tileset_tile_picker
    //% startTile.decompileIndirectFixedInstances=true
    //% player.defl=2 player.min=2 player.max=4
    //% group="Advanced" weight=20
    export function addPlayer(robot: Sprite, startTile: Image, player: number) {
        if (!robot) return
        addRobot(robot, startTile, player)
        if (started) deal(bots[bots.length - 1])
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
     * The robot stops if it hits a wall, and steps one tile at a time so tile
     * rules fire on every tile it crosses.
     */
    //% blockId=roboRally_move
    //% block="move $n"
    //% n.defl=1 n.min=-3 n.max=3
    //% group="Cards" weight=90
    export function move(n: number) {
        const bot = active()
        if (!bot || n == 0) return
        let dir = bot.facing
        if (n < 0) dir = (bot.facing + 2) % 4
        for (let i = 0; i < Math.abs(n); i++) {
            if (bot.dead) return
            const here = bot.sprite.tilemapLocation()
            const next = tiles.getTileLocation(here.column + dx[dir], here.row + dy[dir])
            if (tiles.tileAtLocationIsWall(next)) {
                music.knock.play()
                return
            }
            tiles.placeOnTile(bot.sprite, next)
            fireLanded(bot)
            if (bot.dead) return
            pause(STEP_PAUSE)
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
     * Lose a life, respawn on the start tile and skip the rest of the program.
     */
    //% blockId=roboRally_die
    //% block="robot dies"
    //% group="Tiles" weight=90
    export function die() {
        const bot = active()
        if (!bot || bot.dead) return
        bot.dead = true
        infoForPlayer(bot.player).changeLifeBy(-1)
        music.zapped.play()
        scene.cameraShake(4, 300)
        pause(400)
        bot.respawn()
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
            game.splash("Spiller " + bot.player + " vandt!")
        }
        game.over(true, effects.confetti)
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

    /** Superseded by "when the robot lands on [tile]". */
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

    function addRobot(sprite: Sprite, startTile: Image, player: number) {
        for (let b of bots) if (b.sprite === sprite) return
        // Player 1 keeps the bottom two rows; later players stack upwards.
        const baseY = 110 - (bots.length * 40)
        const bot = new Bot(sprite, startTile, player, baseY)
        bots.push(bot)
        infoForPlayer(player).setLife(3)
        placeOnStart(bot)
        makeUi(bot)
        setupControls(bot)
    }

    function placeOnStart(bot: Bot) {
        if (!bot.startTile) return
        // "set tilemap to" has to run before "start Robo Rally".
        if (!game.currentScene().tileMap) {
            bot.sprite.sayText("Hvor er banen?", 1500)
            return
        }
        if (tiles.getTilesByType(bot.startTile).length == 0) {
            bot.sprite.sayText("Hvor er startfeltet?", 1500)
            return
        }
        tiles.placeOnRandomTile(bot.sprite, bot.startTile)
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

    /**
     * Run every tile rule for the tile the robot is standing on, exactly once
     * per landing, synchronously, so that a card like "+3" dies on the lava it
     * crosses instead of three tiles later. If a rule moved the robot (a
     * teleporter), the rules for the new tile run too.
     */
    function fireLanded(bot: Bot) {
        const previous = current
        current = bot
        for (let chain = 0; chain < MAX_TILE_CHAIN; chain++) {
            const loc = bot.sprite.tilemapLocation()
            for (let i = 0; i < landTiles.length; i++) {
                if (tiles.tileAtLocationEquals(loc, landTiles[i])) {
                    landHandlers[i](bot.sprite)
                }
                if (bot.dead) { current = previous; return }
            }
            if (anyLandHandler) anyLandHandler()
            if (bot.dead) break
            const after = bot.sprite.tilemapLocation()
            if (after.column == loc.column && after.row == loc.row) break
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
        for (let bot of bots) if (!bot.ready) return false
        return bots.length > 0
    }

    /**
     * Register by register, robot by robot: the board game's simultaneous
     * execution, and the same order the Minecraft tick phases will use.
     */
    function runProgram() {
        running = true
        for (let bot of bots) bot.dead = false
        for (let reg = 0; reg < PROGRAM_SIZE; reg++) {
            for (let bot of bots) {
                if (bot.dead) continue
                if (reg >= bot.program.length) continue
                const card = bot.hand[bot.program[reg]]
                bot.slots[reg].setImage(cardImage(card, 1))
                bot.sprite.sayText(card, 700)
                current = bot
                playCard(card, bot)
                current = null
                bot.slots[reg].setImage(cardImage(card, 2))
                pause(CARD_PAUSE)
            }
        }
        pause(CARD_PAUSE)
        for (let bot of bots) deal(bot)
        running = false
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
        if (!played) bot.sprite.sayText(card + " ?", 700)
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
            if (bot.program.length < PROGRAM_SIZE) {
                bot.sprite.sayText(PROGRAM_SIZE + " kort!", 800)
                return
            }
            bot.ready = true
            drawCards(bot)
            if (everyoneReady()) runProgram()
        })
    }

    function makeUi(bot: Bot) {
        const slotY = bot.baseY - 20
        for (let i = 0; i < PROGRAM_SIZE; i++) {
            bot.slots.push(uiSprite(80 - (PROGRAM_SIZE - 1) * 9 + i * 18, slotY))
        }
        for (let i = 0; i < HAND_SIZE; i++) {
            bot.handSprites.push(uiSprite(80 - (HAND_SIZE - 1) * 9 + i * 18, bot.baseY))
        }
    }

    function uiSprite(x: number, y: number): Sprite {
        const s = sprites.create(emptyImage(), SpriteKind.Card)
        s.setFlag(SpriteFlag.RelativeToCamera, true)
        s.setFlag(SpriteFlag.Ghost, true)
        s.setPosition(x, y)
        s.z = 100
        return s
    }

    function drawCards(bot: Bot) {
        for (let i = 0; i < bot.handSprites.length; i++) {
            if (i >= bot.hand.length) {
                bot.handSprites[i].setImage(emptyImage())
                continue
            }
            let style = 0
            if (bot.program.indexOf(i) >= 0) style = 2
            else if (i == bot.selected && !bot.ready) style = 1
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

    // style: 0 normal, 1 selected/active, 2 used
    function cardImage(card: string, style: number): Image {
        const im = image.create(16, 16)
        im.fill(1)
        if (style == 1) im.fill(5)
        if (style == 2) im.fill(11)
        im.drawRect(0, 0, 16, 16, 15)
        im.printCenter(card, 5, 15, image.font5)
        return im
    }

    function emptyImage(): Image {
        const im = image.create(16, 16)
        im.drawRect(0, 0, 16, 16, 11)
        return im
    }
}
