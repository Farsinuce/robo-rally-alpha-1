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
 *    blocks: move, turn, push, shoot, a random action, and the moment between
 *    two cards. Everything a kid invents on top of those is a card name plus a
 *    hat.
 *  - Every block carries an explicit blockId. There are no saved kid projects
 *    to protect yet, so a block can still be removed outright - but once the
 *    club has work saved, renaming an id silently breaks it.
 *
 * The round is a state machine running in its own fiber (see gameLoop). Button
 * handlers only ever set a flag; nothing long-running happens inside one.
 */
//% color="#B4009E" icon="" block="Robo Rally" weight=100
//% groups='["Setup", "Cards", "Tiles", "Robot"]'
namespace roboRally {
    // The host of an online game is "server", everybody who joined is
    // "client", and a game merely running in the editor or on a handheld is
    // neither. Only a hosted game has two screens to split.
    //% shim=multiplayer::getOrigin
    declare function getOrigin(): string

    const HAND_SIZE = 6
    const PROGRAM_SIZE = 4
    const MAX_PLAYERS = 4
    // Health is counted in HITS and drawn in hearts, two hits to a heart, so
    // that half a heart means something. Two hits - one heart - is the
    // default; "everybody starts with N hearts" moves it. Nobody is ever
    // eliminated whatever it is set to.
    const MAX_HEARTS = 4
    let startHits = 2

    // ---- Pacing --------------------------------------------------------
    // A turn reads as five beats half a second apart: the camera arrives, the
    // robot says what it is about to do, it does it, the bubble comes down,
    // the next robot goes. Nine year olds cannot follow anything faster.
    const FOCUS_PAUSE = 500     // camera lands -> speech bubble appears
    const READ_PAUSE = 500      // bubble -> action, when nobody has to press A
    const ACT_PAUSE = 500       // action ends -> bubble comes down
    const GAP_PAUSE = 500       // bubble down -> next robot
    const BOARD_PAUSE = 500     // either side of the board's own turn
    const DEATH_PAUSE = 400
    const STEP_PAUSE = 220      // between two tiles of the same move
    const SHOT_PAUSE = 60       // per tile of a shot

    // sayText leaves a stale deadline behind if the duration is ever omitted,
    // so every bubble gets an explicit, deliberately long one and the engine
    // takes it down itself with sayText("").
    const BUBBLE_MS = 60000
    // A card with no rule is a spelling mistake. Its warning is NOT taken down
    // by the engine, so it needs a lifetime of its own.
    const MISSING_MS = 2000

    // Your turn starts the moment the camera reaches you. Three seconds is
    // long enough to press A and short enough that four kids keep moving.
    const TURN_TIMEOUT = 3000
    // The sand timer, and it is not running until somebody turns it. Fifteen
    // seconds from the moment the FIRST program card of the phase goes down -
    // the way a real Robo Rally table flips the hourglass - so nobody is under
    // pressure before they have even read their hand.
    const HOURGLASS = 15000
    // ...but a timer nobody ever starts is a frozen table. If not one card has
    // been committed in this long, the phase ends anyway.
    const PROGRAM_IDLE = 45000
    // There is deliberately no lobby timeout and no auto-start. See lobby().
    // How quiet the kid's setup blocks have to be before the round begins.
    const SETUP_QUIET = 400
    // Button events queued during the previous phase are replayed into this
    // one; this window swallows them, so the A press that took your turn
    // cannot commit a card the instant your programming window opens.
    const PHASE_GRACE = 300

    // A tile rule that moves the robot re-triggers the rules on the new tile.
    // The budget is shared by every landing in one cascade, so two belts
    // shoving each other cannot multiply out. It is also spent by ordinary
    // movement (step lands the robot on every tile it crosses), so it has to
    // be comfortably larger than the longest move card - which is now 5.
    const MAX_TILE_CHAIN = 24

    // The board's turn is a sequence of steps, and everything in one step
    // lights up together, acts together and goes dark together. Belts are
    // step 1 and lasers step 2 on the shipped board, which is the order the
    // real game uses: you are carried first and shot at where you end up.
    const MAX_BOARD_STEPS = 4

    // The joker. Getting shot or shoved earns you one of these in your next
    // hand: it does something out of the deck, but you do not get to say what.
    const JOKER = "?"
    // Never fill a hand so full of jokers that there is nothing left to choose
    // between.
    const MAX_JOKERS = 4

    // The four players' colours, matching the ones MakeCode's own multiplayer
    // HUD and join lobby use, so a kid's robot, card row and prompt all agree.
    const PLAYER_COLOR = [2, 8, 4, 7]   // red, blue, orange, green

    // ---- Card geometry -------------------------------------------------
    // font5 advances 6 px per character and is 5 px tall, so a two-character
    // label is 11 px of ink. A 14 px card is that plus a one-pixel frame and
    // is the width at which printCenter lands on x = 1 exactly; 13 would put
    // ink on the frame. Ten cards (4 program + 6 hand) then fit one row.
    const CARD_W = 14
    // Nine tall, not seven. At seven the frame sat directly on the five pixel
    // glyph and the two ran into each other, which on a 160x120 screen is the
    // difference between reading a card and guessing at it. The row now is:
    // 0 frame, 1 clear, 2-6 label, 7 clear, 8 frame.
    const CARD_H = 9
    const CARD_TEXT_Y = 2
    const PITCH = 15
    // Four committed cards are 59 px wide, so a stack fits in each bottom
    // corner: players 1 and 2 on the left with player 1 on top, players 3 and
    // 4 on the right the same way. Fixed by player number, not by join order,
    // so a kid always looks in the same place for their own.
    const REG_W = 4 * PITCH - 1         // 59
    const REG_LEFT_X = 3
    const REG_RIGHT_X = 160 - 3 - REG_W // 98
    const REG_TOP_Y = 99
    const REG_BOT_Y = 110
    // Only ONE hand is ever on a screen - whoever is choosing on it - so it
    // gets the middle of the row above, to itself.
    const HAND_W = 6 * PITCH - 1        // 89
    const HAND_X = (160 - HAND_W) >> 1  // 35
    const HAND_Y = 88
    const BANNER_H = 8
    const UI_Z = 90

    // The join overlay: a black card in the middle of a darkened board.
    const LOBBY_BOX_Y = 37
    const LOBBY_BOX_H = 46
    // Deliberately not Danish: font8 has all six of ae/oe/aa, but these two
    // lines name the two buttons on the controller, and the buttons say A
    // and B. Keep them short enough that the doubled font still fits 160 px.
    const LOBBY_JOIN = "A = Join"
    const LOBBY_START = "B = Start"
    // Only player 1 can start the game, so only player 1's screen is told
    // about B. font8 has all six Danish letters, so this line does not have to
    // be spelled the way the five pixel banner font forces everything else.
    const LOBBY_WAIT_BIG = "Venter"
    const LOBBY_WAIT_SMALL = "på at P1 starter"
    const LOBBY_WAIT_LINE = "Venter på P1"
    // Seat chips under the box, so "who is in" is readable across a table.
    const CHIP_W = 14
    const CHIP_H = 11
    const CHIP_PITCH = 18
    const CHIP_Y = 89

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

    // Health is one heart, not a row of them: full is two hits left, half is
    // one, and the next hit after that kills you. Half is drawn as a heart
    // whose right side is hollow, so the silhouette still reads as a heart
    // rather than as a smaller one.
    const HEART = img`
        . 2 2 . 2 2 .
        2 2 2 2 2 2 2
        2 2 2 2 2 2 2
        . 2 2 2 2 2 .
        . . 2 2 2 . .
        . . . 2 . . .
    `
    // One of these under a player's number for every chest they have opened.
    const GEM = img`
        . . 5 . .
        . 5 4 5 .
        5 4 5 4 5
        . 5 4 5 .
        . . 5 . .
    `
    const HALF_HEART = img`
        . 2 2 . 2 2 .
        2 2 2 2 . . 2
        2 2 2 2 . . 2
        . 2 2 2 . 2 .
        . . 2 2 2 . .
        . . . 2 . . .
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

        // Its own stair, claimed once at the start so every robot begins in a
        // different corner. Respawning goes to the NEAREST stair instead.
        startTile: Image
        startCol: number
        startRow: number

        hand: string[]
        program: number[]           // indices into hand
        selected: number
        drawPile: string[]
        discard: string[]
        // Jokers earned since the last deal, and how many of them are in the
        // hand right now. They are lent by the engine, so they must not end up
        // in the discard pile and become permanent members of the deck.
        jokers: number
        injected: number

        joined: boolean             // pressed A in the lobby
        ready: boolean              // four cards down, program committed
        open: boolean               // may edit its program right now
        deadline: number            // when the sand runs out, 0 = not turned yet
        openedAt: number            // when it opened, for the grace window
        dead: boolean               // died this round, sits out the rest of it
        out: boolean                // never joined, so never on the board
        chests: number

        aPressed: boolean           // set by the A handler while it is our turn
        retired: boolean            // taken off the board, so retire() is once only

        // The tile whose rules were last run for this robot, so a card that
        // moves it with a NATIVE block still lands properly.
        landedCol: number
        landedRow: number
        landing: number             // per-robot re-entrancy depth for fireLanded

        rowX: number                // left edge of this robot's register stack
        rowY: number                // top edge of it, -1 while hidden
        regImage: Image             // the four committed cards
        handImage: Image            // the six in hand, drawn only for the owner

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
            this.jokers = 0
            this.injected = 0
            this.joined = false
            this.ready = false
            this.open = false
            this.deadline = 0
            this.openedAt = 0
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
            this.rowX = player <= 2 ? REG_LEFT_X : REG_RIGHT_X
            this.rowY = -1
            this.regImage = image.create(REG_W, CARD_H)
            this.handImage = image.create(HAND_W, CARD_H)
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
    }

    /** What one screen's banner is saying, and in whose colour. */
    class BannerLine {
        text: string
        color: number
        constructor(text: string, color: number) {
            this.text = text
            this.color = color
        }
    }

    let deck: string[] = []
    let bots: Bot[] = []
    let playing: Bot[] = []      // the robots that actually joined, in player order
    let current: Bot = null
    let activeBot: Bot = null    // whose card is running, during PHASE_EXECUTE
    let programOwner: Bot = null // who has the client screen, during PHASE_PROGRAM
    let phase = PHASE_SETUP
    let started = false
    let loopStarted = false
    let loopForked = false
    // Stamped by every setup block, so the round can wait for the kid's
    // "on start" stack to go quiet before it opens the lobby.
    let setupAt = 0
    // True when the engine owns two screens rather than one. Settled once, at
    // the point the roster is final; whether they are actually SPLIT is asked
    // again every frame, because the same project is built in the editor on
    // one screen and played online on two.
    let twoScreens = false
    // Set when "play with N robots" ran before "start Robo Rally".
    let wantRobots = 0

    let cardNames: string[] = []
    let cardHandlers: ((robot: Sprite) => void)[] = []
    let landTiles: Image[] = []
    let landHandlers: ((robot: Sprite) => void)[] = []
    let betweenTiles: Image[] = []
    let betweenHandlers: ((robot: Sprite) => void)[] = []

    // Tiles that turn themselves on and off: two drawings of one thing, which
    // the board swaps over on its own turn. A laser that fires every other
    // card is this plus one "between cards" rule on the lit version.
    let blinkOn: Image[] = []
    let blinkOff: Image[] = []
    let blinkStep: number[] = []

    // Built once, not once a frame: the lobby overlay is drawn on every tick
    // of both screens and image.scaledFont allocates.
    let bigFont: image.Font = null

    // Treasure, and with it the win condition.
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
    // something does not leave the banner stuck on it for the rest of the
    // phase.
    let flashText = ""
    let flashColor = 1
    let flashUntil = 0
    let turnDeadline = 0

    // True while a robot is acting on one of its own cards, so that shoving
    // another robot out of the way earns that robot a joker. A conveyor belt
    // does not: the board is not charging anybody.
    let charging = false

    // ------------------------------------------------------------------
    // Setup
    // ------------------------------------------------------------------

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
        if (wantRobots > 1) {
            const n = wantRobots
            wantRobots = 0
            addRobots(n)
        }
        started = true
        beginLoop()
    }

    /**
     * Play with more robots. The engine copies the robot you drew once per
     * player and recolours it, so player 1 is red, player 2 blue, player 3
     * orange and player 4 green. Every robot gets its own start tile.
     *
     * With two or more robots the game is meant to be HOSTED: press Share and
     * pick "host a multiplayer game". Player 1 then gets a view of their own
     * and everybody else shares a second one, so nobody can read your cards.
     * @param count how many robots altogether, eg: 2
     */
    //% blockId=roboRally_addRobots
    //% block="play with $count robots"
    //% count.defl=2 count.min=1 count.max=4
    //% group="Setup" weight=85
    export function addRobots(count: number) {
        setupAt = control.millis()
        if (bots.length == 0) {
            // Dropped ABOVE "start Robo Rally". Block order is not obvious at
            // nine, and silently playing a one-robot game is a rotten way to
            // find out - so remember it and let startGame apply it.
            wantRobots = count
            return
        }
        const first = bots[0]
        const body = bodyColor(first.images[0])
        for (let p = bots.length + 1; p <= Math.min(count, MAX_PLAYERS); p++) {
            const up = tinted(first.images[0], body, PLAYER_COLOR[p - 1])
            const s = sprites.create(up, first.sprite.kind())
            addRobot(s, first.startTile)
        }
        // Player 1 is recoloured too, or the colour language breaks down: the
        // card row, the prompt and the robot have to agree on who is red. Only
        // when there IS somebody to tell them apart from, though - a solo kid
        // gets to keep the robot they drew.
        if (bots.length > 1) {
            first.setLook(tinted(first.images[0], body, PLAYER_COLOR[0]))
            // And re-post the lobby avatar, or player 1 keeps the icon posted
            // before the recolour - which is the ORIGINAL drawing, and if the
            // kid drew it blue that is player 2's colour. Two identical
            // avatars, on the one screen where you pick your seat.
            mp.postPresenceIcon(1, first.sprite.image)
        }
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
     * Treasure hunt. Every robot that lands on a chest opens it, keeps it and
     * is patched up to full health. When the last chest on the board has been
     * opened, whoever opened the most wins - and if two robots opened the same
     * number, it is a draw.
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

    /**
     * Two drawings of the same thing: switched on, and switched off. The tile
     * sits dark all the way through programming and only wakes up when the
     * board takes its turn - it lights up, everything standing on it happens,
     * and it goes dark again.
     *
     * The step number is what puts the machines in order. Everything on step 1
     * lights up and acts, then everything on step 2, and so on, so belts on
     * step 1 and lasers on step 2 means you are carried first and shot at
     * wherever you end up.
     * @param on what the tile looks like while it is working
     * @param off what the very same tile looks like while it is not
     * @param step which part of the board's turn it belongs to, eg: 1
     */
    //% blockId=roboRally_blinkTiles
    //% block="$on turns off to $off||on board step $step"
    //% expandableArgumentMode="toggle"
    //% on.shadow=tileset_tile_picker
    //% on.decompileIndirectFixedInstances=true
    //% off.shadow=tileset_tile_picker
    //% off.decompileIndirectFixedInstances=true
    //% step.defl=1 step.min=1 step.max=4
    //% group="Setup" weight=70
    export function blinkTiles(on: Image, off: Image, step: number = 1) {
        setupAt = control.millis()
        blinkOn.push(on)
        blinkOff.push(off)
        blinkStep.push(Math.max(1, Math.min(MAX_BOARD_STEPS, step)))
    }

    /**
     * How much health every robot starts with, and gets back when it respawns
     * or opens a chest. One heart is two hits: a full heart, then half a
     * heart, then down. Leave it out and everybody gets one heart.
     * @param hearts how many hearts, eg: 1
     */
    //% blockId=roboRally_startHealth
    //% block="everybody starts with $hearts hearts"
    //% hearts.defl=1 hearts.min=1 hearts.max=4
    //% group="Setup" weight=72
    export function startHealth(hearts: number) {
        setupAt = control.millis()
        if (hearts < 1) hearts = 1
        if (hearts > MAX_HEARTS) hearts = MAX_HEARTS
        startHits = hearts * 2
        // A kid who drops this block in after the robots are already on the
        // board should see it take effect, not next round.
        for (let b of bots) if (b.inf) b.inf.setLife(startHits)
    }

    // ------------------------------------------------------------------
    // Cards
    // ------------------------------------------------------------------

    /**
     * A card: what it is called, how many of them are in the deck, and what it
     * does. One of these for every kind of card you want, and that is the
     * whole of inventing a card.
     *
     * Keep the name to two letters - that is all a card has room to print.
     * Drag the "robot" bubble into any sprite block to act on the robot that
     * played it.
     * @param name what the card is called, eg: "+1"
     * @param count how many of it are in the deck, eg: 3
     */
    //% blockId=roboRally_card
    //% block="card $name ($count in the deck) played by $robot"
    //% name.defl="+1"
    //% count.defl=1 count.min=1 count.max=20
    //% draggableParameters="reporter"
    //% group="Cards" weight=100
    export function card(name: string, count: number, handler: (robot: Sprite) => void) {
        // The deck and the rule are registered together, so the two can no
        // longer disagree. They used to be separate blocks, and matching one
        // bit of text against another was the hardest thing this program asked
        // of a nine year old.
        setupAt = control.millis()
        for (let i = 0; i < count; i++) deck.push(name)
        cardNames.push(name)
        cardHandlers.push(handler)
    }

    /**
     * Move the robot forwards. A negative number backs it up without turning.
     * The robot stops if it hits a wall, falls if it walks off the board, and
     * steps one tile at a time so tile rules fire on every tile it crosses.
     * Anything in the way is shoved along in front of it.
     */
    //% blockId=roboRally_move
    //% block="move $n"
    //% n.defl=1 n.min=-5 n.max=5
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
     * that is hit takes damage AND finds a "?" joker in its next hand.
     * @param hits how much damage the shot does, eg: 1
     */
    //% blockId=roboRally_shoot
    //% block="shoot||for $hits hits"
    //% hits.defl=1 hits.min=1 hits.max=5
    //% expandableArgumentMode="toggle"
    //% group="Cards" weight=60
    export function shoot(hits = 1) {
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
        if (victim) {
            // Being shot rattles you: next round one of your six cards is a
            // joker you did not choose.
            earnJoker(victim)
            hit(victim, hits)
        }
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

    /**
     * Do something out of the deck, chosen at random. This is what the "?"
     * joker card is for: you get one every time somebody shoots you or shoves
     * you around, and you do not get to say what it does.
     */
    //% blockId=roboRally_randomAction
    //% block="do a random action"
    //% group="Cards" weight=45
    export function randomAction() {
        const bot = active()
        if (!bot || bot.dead || bot.out) return
        // A kid can point an ordinary card at this block, and that card could
        // be the one we pick. Two levels deep is plenty.
        if (jokerDepth >= 2) return
        let choices: string[] = []
        for (let c of deck) {
            if (c == JOKER) continue
            if (choices.indexOf(c) < 0) choices.push(c)
        }
        if (choices.length == 0) return
        const card = choices[randint(0, choices.length - 1)]
        // Say what the joker turned into, or the robot looks like it moved on
        // its own for no reason.
        bot.sprite.sayText(card + "!", BUBBLE_MS)
        jokerDepth++
        playCard(card, bot)
        jokerDepth--
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
     * Change every tile of the first kind, everywhere on the map, into a tile
     * of the second kind - right now. This is how a switch works: put it
     * inside "on robot lands on", paint the door as one tile shut and another
     * tile open, and standing on the switch opens every door at once.
     * @param from the tile to look for
     * @param to what to turn it into
     */
    //% blockId=roboRally_swapTiles
    //% block="change every $from tile into $to"
    //% from.shadow=tileset_tile_picker
    //% from.decompileIndirectFixedInstances=true
    //% to.shadow=tileset_tile_picker
    //% to.decompileIndirectFixedInstances=true
    //% group="Tiles" weight=60
    export function swapTiles(from: Image, to: Image) {
        if (!game.currentScene().tileMap) return
        const found = tiles.getTilesByType(from)
        for (let loc of found) tiles.setTileAt(loc, to)
    }

    /**
     * Take damage. Two hits kill a robot: it drops the rest of its program for
     * this round and comes back on the nearest stair with full health.
     * @param n how many hits, eg: 1
     */
    //% blockId=roboRally_takeHits
    //% block="robot takes $n hits"
    //% n.defl=1 n.min=1 n.max=5
    //% group="Tiles" weight=90
    export function takeHits(n: number) {
        hit(active(), n)
    }

    /**
     * Die outright, whatever health was left. The robot drops the rest of its
     * program for this round and comes back on the nearest stair.
     */
    //% blockId=roboRally_die
    //% block="robot dies"
    //% group="Tiles" weight=85
    export function die() {
        kill(active())
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
     * How much health the robot has left. Two is a full heart, one is half a
     * heart, and the next hit after that kills it.
     */
    //% blockId=roboRally_health
    //% block="robot health"
    //% group="Robot" weight=85
    export function health(): number {
        const bot = active()
        return bot ? bot.inf.life() : 0
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

    /**
     * True when the robot is standing on this tile right now. Use it inside a
     * card to make the card do something different depending on where you are.
     */
    //% blockId=roboRally_robotIsOn
    //% block="robot is on $tile"
    //% tile.shadow=tileset_tile_picker
    //% tile.decompileIndirectFixedInstances=true
    //% group="Robot" weight=70
    export function robotIsOn(tile: Image): boolean {
        const bot = active()
        if (!bot) return false
        return tiles.tileAtLocationEquals(bot.sprite.tilemapLocation(), tile)
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
        bot.inf.setLife(startHits)
        bot.inf.setScore(0)
        // The four corner banners land exactly where the card rows go, and the
        // HUD draws above them. The engine shows health in its own banner
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
        // There is deliberately no onLifeZero handler any more. Robots respawn
        // for ever, so nobody is ever eliminated, and hit() makes sure the
        // PlayerInfo never actually reaches zero - which is what would
        // otherwise hand a one-robot game an automatic game over, from inside
        // the HUD render pass, on its first trip into the lava.
        // The join lobby shows each kid which robot is theirs.
        mp.postPresenceIcon(player, sprite.image)
        sprite.setFlag(SpriteFlag.Invisible, true)
        setupControls(bot)
    }

    /** Take a robot that never joined off the board. */
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
     * A robot that died this round has already respawned and is physically on
     * the board, so it counts as occupying its tile; one that never joined has
     * no body at all and does not.
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
     * robots cannot recurse forever. Every tile a robot is shoved by ANOTHER
     * robot's card earns it a joker in its next hand.
     *
     * This is also mutually recursive with fireLanded(): landing runs the
     * tile's rules, and a rule may push the robot, which lands it again. That
     * loop is bounded by the shared landBudget, not by this depth.
     */
    function step(bot: Bot, dir: number, depth: number): boolean {
        // Only `out` stops a robot being moved. A robot that died this round
        // has already respawned and is standing on the board, so it can still
        // be shoved; it just does not get to play any more cards.
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
            pause(STEP_PAUSE)
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
            // Being barged one tile down the board earns one joker. The board
            // itself is not charging anybody, so a conveyor belt does not.
            if (charging) earnJoker(blocker)
        }
        tiles.placeOnTile(bot.sprite, next)
        fireLanded(bot)
        if (bot.dead || bot.out) return false
        pause(STEP_PAUSE)
        return true
    }

    function earnJoker(bot: Bot) {
        if (!bot || bot.out) return
        if (bot.jokers < MAX_JOKERS) bot.jokers++
    }

    /**
     * The first placement of the game: one stair each, claimed and kept, so
     * every robot starts in a different corner.
     */
    function placeOnStart(bot: Bot) {
        if (!game.currentScene().tileMap) {
            bot.sprite.sayText("Hvor er banen?", 1500)
            return
        }
        if (!bot.startTile) return
        const spots = tiles.getTilesByType(bot.startTile)
        if (spots.length == 0) {
            bot.sprite.sayText("Hvor er startfeltet?", 1500)
            return
        }
        // Falls back to sharing if the kid painted fewer start tiles than
        // there are players.
        let chosen = spots[0]
        for (let loc of spots) {
            if (!claimedStart(loc.column, loc.row)) { chosen = loc; break }
        }
        bot.startCol = chosen.column
        bot.startRow = chosen.row
        settle(bot, chosen.column, chosen.row)
    }

    /**
     * Respawning goes to the NEAREST stair, not the one you started on: dying
     * in the far corner and walking all the way back is nobody's idea of a
     * turn. A stair somebody is already standing on is skipped, because two
     * robots on one tile break botAt() - it returns only the first of them and
     * the other becomes unshootable and unpushable.
     */
    function respawnNearest(bot: Bot) {
        bot.facing = 0
        if (!game.currentScene().tileMap || !bot.startTile) return
        const spots = tiles.getTilesByType(bot.startTile)
        if (spots.length == 0) {
            // It may have just fallen off the edge. Anywhere on the board
            // beats leaving it stranded outside, invisible, forever.
            const here = bot.sprite.tilemapLocation()
            if (offMap(here.column, here.row)) {
                const tm = game.currentScene().tileMap
                settle(bot, tm.data.width >> 1, tm.data.height >> 1)
            }
            return
        }
        const here = bot.sprite.tilemapLocation()
        let best: tiles.Location = null
        let bestD = 99999
        let anywhere: tiles.Location = null
        let anywhereD = 99999
        for (let loc of spots) {
            const d = Math.abs(loc.column - here.column) + Math.abs(loc.row - here.row)
            if (d < anywhereD) { anywhereD = d; anywhere = loc }
            if (botAt(loc.column, loc.row, bot)) continue
            if (d < bestD) { bestD = d; best = loc }
        }
        const chosen = best ? best : anywhere
        settle(bot, chosen.column, chosen.row)
    }

    /** Put a robot down on a tile, stepping aside if it is taken. */
    function settle(bot: Bot, col: number, row: number) {
        let c = col
        let r = row
        if (botAt(c, r, bot)) {
            const free = freeTileNear(bot, c, r)
            c = free.column
            r = free.row
        }
        tiles.placeOnTile(bot.sprite, tiles.getTileLocation(c, r))
        bot.landedCol = c
        bot.landedRow = r
        aimInward(bot)
    }

    /**
     * The nearest tile to (col,row) nobody is standing on and that is on the
     * board. Used only when a robot has to come down onto an occupied stair.
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
        if (!tm || !tm.enabled) {
            bot.sprite.setImage(bot.images[bot.facing])
            return
        }
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

    /**
     * The one place a robot takes damage, so lava, lasers and bullets agree.
     * The PlayerInfo is never allowed to actually reach zero: MakeCode reads
     * that as "this player is finished" and, in a one-robot project, ends the
     * game outright from inside the HUD render pass.
     */
    function hit(bot: Bot, n: number) {
        if (!bot || bot.dead || bot.out || n <= 0) return
        const left = bot.inf.life() - n
        if (left > 0) {
            bot.inf.setLife(left)
            music.zapped.play()
            shakeCameras(2, 200)
            return
        }
        kill(bot)
    }

    /**
     * Death. You drop whatever is left of this round's program, and come back
     * on the nearest stair with a full heart, ready to program again when the
     * next round starts. There is no elimination and no life count to run out.
     */
    function kill(bot: Bot) {
        if (!bot || bot.dead || bot.out) return
        bot.dead = true
        bot.sprite.sayText("")
        music.zapped.play()
        shakeCameras(4, 300)
        pause(DEATH_PAUSE)
        // Straight from whatever was left to full, so info never sees zero.
        bot.inf.setLife(startHits)
        respawnNearest(bot)
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
    let jokerDepth = 0
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
        // What is in the chest is a repair kit as well as a point.
        bot.inf.setLife(startHits)
        if (chestsLeft > 0) chestsLeft--
        music.baDing.play()
        bot.sprite.sayText("KISTE!", 900)
    }

    /**
     * The board's turn, once after every card: conveyor belts, gears, lasers.
     * Runs for every robot still in play, on the tile it is standing on now.
     */
    function boardPhase() {
        if (betweenTiles.length == 0 && blinkOn.length == 0) return
        if (!game.currentScene().tileMap) return
        // One machine at a time, in step order: it lights up, everything
        // standing on it happens, and it goes dark again. Belts on step 1 and
        // lasers on step 2 is the board game's order - you are carried first
        // and shot at wherever you end up - and, just as importantly, it is
        // slow enough for a nine year old to see the two as separate events
        // rather than as one thing that happened to them.
        for (let s = 1; s <= MAX_BOARD_STEPS; s++) {
            const lit = pairsInStep(s)
            const rules = rulesInStep(s)
            if (lit.length == 0 && rules.length == 0) continue
            if (lit.length > 0) {
                for (let i of lit) recolourTiles(blinkOff[i], blinkOn[i])
                pause(BOARD_PAUSE)
            }
            runBetween(rules)
            if (lit.length > 0) {
                pause(BOARD_PAUSE)
                for (let i of lit) recolourTiles(blinkOn[i], blinkOff[i])
                pause(BOARD_PAUSE)
            }
        }
    }

    /** Indices of the blink pairs that belong to this step. */
    function pairsInStep(step: number): number[] {
        let out: number[] = []
        for (let i = 0; i < blinkOn.length; i++) if (blinkStep[i] == step) out.push(i)
        return out
    }

    /**
     * Indices of the between-cards rules that belong to this step. A rule
     * belongs to the step of the tile's blink pair, so the kid says "belts are
     * step 1" once, on the pair, and every belt rule follows it. A tile with
     * no pair has no animation and lands in step 1.
     */
    function rulesInStep(step: number): number[] {
        let out: number[] = []
        for (let i = 0; i < betweenTiles.length; i++) {
            if (stepOfTile(betweenTiles[i]) == step) out.push(i)
        }
        return out
    }

    function stepOfTile(tile: Image): number {
        for (let i = 0; i < blinkOn.length; i++) if (blinkOn[i] == tile) return blinkStep[i]
        return 1
    }

    /** Every tile of the first kind on the map becomes the second. */
    function recolourTiles(from: Image, to: Image) {
        const found = tiles.getTilesByType(from)
        for (let loc of found) tiles.setTileAt(loc, to)
    }

    /** Everything the board does to everybody, for one step's worth of rules. */
    function runBetween(rules: number[]) {
        if (rules.length == 0) return
        const previous = current
        // Snapshot first, and once per STEP rather than once per board turn:
        // the belts have already moved everybody by the time the lasers fire,
        // so the lasers must fire at where people are now - but within one
        // step, a robot shoved onto a belt by another robot's belt must not
        // get a second ride.
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
            for (let i of rules) {
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

    /**
     * Every machine on the board is dark until the board's own turn. Called
     * once, at the end of the lobby: the kid PAINTS the lit version, because
     * that is the one that says what the tile is for, and the engine puts it
     * to sleep before the first card is ever chosen.
     */
    function darkenBoard() {
        if (blinkOn.length == 0) return
        if (!game.currentScene().tileMap) return
        for (let i = 0; i < blinkOn.length; i++) recolourTiles(blinkOn[i], blinkOff[i])
    }

    // ------------------------------------------------------------------
    // Engine internals: the deck
    // ------------------------------------------------------------------

    /**
     * A deck for a kid who never wrote one. Called at the end of the lobby,
     * not from startGame: a "card" block placed BELOW "start Robo Rally" is a
     * perfectly ordinary thing for a nine year old to do, and injecting the
     * default first would silently give them twelve extra cards.
     *
     * These have no rules behind them and are not meant to: they exist so that
     * a half-built project still deals a hand instead of dealing nothing, and
     * playCard says "+1 ?" out loud, which is the hint.
     */
    function defaultDeck() {
        if (deck.length > 0) return
        const spare = ["+1", "+1", "+1", "+2", "+2", "+3", "-1", "V", "V", "H", "H", "P"]
        for (let c of spare) deck.push(c)
    }

    /**
     * Every robot has its own pile of the same cards. Cards you played and
     * cards you never played both go on your discard, and when your pile runs
     * out the discard is shuffled back in - so over a game you see your whole
     * deck, and no two robots are drawing from the same pile.
     *
     * Jokers earned by being shot or shoved REPLACE cards you would have drawn
     * rather than being added to the hand: six cards always fit the row, and
     * being knocked about should cost you choices, not hand you extra ones.
     */
    function deal(bot: Bot) {
        if (bot.drawPile.length == 0 && bot.discard.length == 0 && bot.hand.length == 0) {
            for (let c of deck) bot.drawPile.push(c)
        }
        // The jokers on the end of the last hand were lent by the engine, not
        // drawn from the pile, so they must not join the discard and become
        // permanent members of the deck.
        const owned = bot.hand.length - bot.injected
        for (let i = 0; i < owned; i++) bot.discard.push(bot.hand[i])
        bot.hand = []
        bot.injected = 0

        const jokers = Math.min(bot.jokers, MAX_JOKERS)
        bot.jokers = 0
        for (let i = 0; i < HAND_SIZE - jokers; i++) {
            if (bot.drawPile.length == 0) {
                while (bot.discard.length > 0) {
                    bot.drawPile.push(bot.discard.removeAt(randint(0, bot.discard.length - 1)))
                }
            }
            if (bot.drawPile.length == 0) break
            bot.hand.push(bot.drawPile.removeAt(randint(0, bot.drawPile.length - 1)))
        }
        // On the end of the row, always, so a kid can see at a glance how much
        // of their hand somebody else chose for them.
        for (let i = 0; i < jokers; i++) { bot.hand.push(JOKER); bot.injected++ }

        bot.program = []
        bot.selected = 0
        bot.ready = false
        bot.open = false
        bot.deadline = 0
        drawRow(bot, -1, 0)
    }

    /** How many cards this robot has to commit before its program is full. */
    function programSize(bot: Bot): number {
        return Math.min(PROGRAM_SIZE, bot.hand.length)
    }

    // ------------------------------------------------------------------
    // Engine internals: controls
    // ------------------------------------------------------------------

    /**
     * True while this robot's own fifteen seconds are still running. Note this
     * does NOT ask whether the program is full: committing the fourth card
     * ends your turn, but it must not take away your undo. A nine year old
     * mashing A puts a fourth card down by accident constantly, and with no
     * confirm button left there would otherwise be no way back at all.
     */
    function windowOpen(bot: Bot): boolean {
        if (phase != PHASE_PROGRAM || bot.out || !bot.open) return false
        // deadline 0 means nobody has turned the hourglass yet, so there is no
        // clock to be out of time against.
        return bot.deadline == 0 || control.millis() < bot.deadline
    }

    /** ...and it still has room for another card. */
    function programming(bot: Bot): boolean {
        return windowOpen(bot) && !bot.ready
    }

    /**
     * Take the last card back out of the program. The cursor goes with it, so
     * the kid can see which card they got back instead of hunting for it.
     */
    function undo(bot: Bot) {
        if (!windowOpen(bot) || bot.program.length == 0) return
        bot.selected = bot.program.pop()
        bot.ready = false
        drawRow(bot, -1, 0)
    }

    function setupControls(bot: Bot) {
        // addEventListener, not onEvent: onEvent is last-one-wins per button,
        // so a kid who drops a native "on A button pressed" block into their
        // program would silently replace the engine's card handler.
        bot.ctrl.right.addEventListener(ControllerButtonEvent.Pressed, function () {
            if (!programming(bot) || bot.hand.length == 0) return
            bot.selected = (bot.selected + 1) % bot.hand.length
            drawRow(bot, -1, 0)
        })
        bot.ctrl.left.addEventListener(ControllerButtonEvent.Pressed, function () {
            if (!programming(bot) || bot.hand.length == 0) return
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
            if (!programming(bot)) return
            // The A press that took your turn must not commit a card the
            // instant your programming window opens.
            if (control.millis() - bot.openedAt < PHASE_GRACE) return
            if (bot.program.length >= programSize(bot)) return
            if (bot.program.indexOf(bot.selected) >= 0) return
            bot.program.push(bot.selected)
            turnHourglass()
            // The fourth card ends your turn. There is no confirm button: at
            // this age "press B when you are done" is one more thing to forget,
            // and it made every round wait for the slowest kid to remember.
            if (bot.program.length >= programSize(bot)) {
                // Ready, but the window stays open: windowShut() already reads
                // `ready`, so the round moves on regardless, and leaving the
                // deadline alone is what keeps undo alive until time runs out.
                bot.ready = true
                music.baDing.play()
            } else {
                nextFreeCard(bot)
            }
            drawRow(bot, -1, 0)
        })
        bot.ctrl.up.addEventListener(ControllerButtonEvent.Pressed, function () {
            undo(bot)
        })
        bot.ctrl.B.addEventListener(ControllerButtonEvent.Pressed, function () {
            if (phase == PHASE_LOBBY) {
                if (bot.player == 1 && anyJoined()) lobbyDone = true
                return
            }
            // Same as up: take the last card back. B is the button a kid
            // reaches for to undo whatever we tell them, and it is free now
            // that it no longer confirms anything.
            undo(bot)
        })
    }

    /**
     * Somebody has put their first program card down, so the sand starts
     * running - for everybody whose window is open, not just for them. Until
     * this happens there is no clock at all: a countdown that is already
     * ticking while a nine year old is still reading their hand is not a
     * countdown they can think in.
     */
    function turnHourglass() {
        for (let b of playing) {
            if (b.open && !b.out && b.deadline == 0) {
                b.deadline = control.millis() + HOURGLASS
            }
        }
    }

    /** Move the cursor to the next card that is not already in the program. */
    function nextFreeCard(bot: Bot) {
        for (let i = 1; i <= bot.hand.length; i++) {
            const at = (bot.selected + i) % bot.hand.length
            if (bot.program.indexOf(at) < 0) { bot.selected = at; return }
        }
    }

    function anyJoined(): boolean {
        for (let b of bots) if (b.joined) return true
        return false
    }

    // ------------------------------------------------------------------
    // Engine internals: the round
    // ------------------------------------------------------------------

    let lobbyDone = false

    function beginLoop() {
        if (loopStarted) return
        loopStarted = true
        game.setGameOverScoringType(game.ScoringType.None)
        game.onUpdate(updateCamera)
        // NOT forked here. startGame is only the FIRST of the kid's setup
        // blocks - "play with 2 robots" and "treasure is ..." have not run yet
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
        // Here, not in beginLoop: by now the kid's whole "on start" stack has
        // run, so the roster is final and we know whether this game needs a
        // second screen at all.
        makeUi()
        lobby()
        while (phase != PHASE_OVER) {
            programPhase()
            phase = PHASE_EXECUTE
                runRound()
            if (phase == PHASE_OVER) return
            pause(GAP_PAUSE)
        }
    }

    /**
     * Nobody is on the board until they say so. Every kid presses A on their
     * own controller; player 1 presses B when the table is ready. Robots that
     * never joined stay off the board entirely.
     */
    function lobby() {
        phase = PHASE_LOBBY
        lobbyDone = false
        // The banner says nothing here: drawLobby owns this screen, and the
        // seat badges along the top already show who has pressed A.
        banner("", 1)
        // No timeout, and no game that starts itself. Every other wait in this
        // engine has a deadline, because one nine year old who puts a
        // controller down must not be able to freeze the table - but nothing
        // has started yet, the overlay names the button in letters you can
        // read across a room, and a game that begins while the class is still
        // working out who is sitting where is worse than one that waits.
        // Player 1 pressing B is the only way out, and it is refused until at
        // least one robot has joined.
        while (!lobbyDone) pause(50)
        if (!anyJoined()) bots[0].joined = true
        defaultDeck()

        playing = []
        for (let b of bots) {
            if (!b.joined) { retire(b); continue }
            playing.push(b)
            b.sprite.setFlag(SpriteFlag.Invisible, false)
            placeOnStart(b)
        }
        layoutRows()
        countChests()
        // Machines are painted lit, because lit is the drawing that says what
        // the tile is FOR. They sleep until the board's own turn.
        darkenBoard()
        checkDeck()
        banner("", 1)
    }

    /**
     * Said once, up front, before the first hand is dealt - the alternative is
     * a kid finding out mid-round, by which time nobody remembers what they
     * typed.
     *
     * This used to also catch a deck card with no rule behind it, which was
     * the commonest mistake in the whole project: the name was typed twice,
     * once in "add cards" and once in the "on card played" hat, and matching
     * two bits of text is the hardest thing this program asks of a nine year
     * old. One "card" block now carries both, so that mistake cannot be made
     * any more and the check is gone with it.
     */
    function checkDeck() {
        if (cardNames.length == 0) {
            // The engine dealt its fallback deck, so the game runs - but
            // nothing in it does anything, and that needs saying out loud.
            flash("LAV KORT!", 5, 4000)
            return
        }
        let seen: string[] = []
        for (let c of deck) {
            if (seen.indexOf(c) >= 0) continue
            seen.push(c)
            // A card is 14 px wide and font5 is 6 px per character, so a
            // longer name is CUT. Better to say so than to let a kid wonder
            // why their "PRUT" card is called "PR".
            if (ascii(c).length > 2) {
                flash("LANGT: " + fit(c), 5, 4000)
                return
            }
        }
    }

    /**
     * Everybody picks four cards, and a screen only ever shows ONE hand - the
     * hand of whoever is choosing on it. That is the same rule in all three
     * arrangements, which is why the camera always has exactly one robot to
     * follow:
     *
     *  - Hosted with two players: one screen each, so they pick at the same
     *    time and neither can read the other's hand.
     *  - Hosted with three or four: player 1 has a screen to themselves and
     *    starts immediately; the others take the second screen in turn,
     *    player 2 then 3 then 4.
     *  - One screen (a solo game, or a project running in the editor rather
     *    than hosted): everybody takes it in turn, player 1 first. Showing
     *    every hand at once was the old behaviour and it meant player 1 could
     *    read player 2's cards - and left the camera with four claimants and
     *    nothing to do but sit in the middle.
     *
     * The four committed stacks are a different matter and are always all on
     * screen, in the same corner every time: 1 and 2 down the left, 3 and 4
     * down the right.
     *
     * Nobody presses a confirm button - the fourth card ends your turn - and
     * nobody may hold up the table: fifteen seconds each, then the engine
     * fills whatever is missing at random out of the cards left in your hand.
     */
    function programPhase() {
        phase = PHASE_PROGRAM
        // A robot that died last round is whole again the moment the next one
        // is being programmed. Clearing this in runRound instead left its
        // heart missing from the banner for the entire fifteen seconds.
        for (let bot of playing) bot.dead = false
        for (let bot of playing) if (!bot.out) deal(bot)

        let host: Bot = null
        let clients: Bot[] = []
        for (let b of playing) {
            if (!inPlay(b)) continue
            if (b.player == 1) host = b
            else clients.push(b)
        }

        banner("PROGRAM", 1)
        if (splitScreens()) {
            // A screen each for player 1, and one shared by everybody else.
            // Player 1 has the whole phase; the second screen is handed along,
            // one kid at a time, and the camera goes with it.
            if (host) openProgram(host)
            if (clients.length == 0) {
                pauseUntil(function () { return windowShut(host) }, HOURGLASS + PROGRAM_IDLE)
            }
            for (let c of clients) {
                programOwner = c
                openProgram(c)
                pauseUntil(function () { return windowShut(c) }, HOURGLASS + PROGRAM_IDLE)
                forceReady(c)
                // Player 1's fifteen seconds ran alongside the first client's,
                // so close their window as soon as that one is done rather
                // than leaving a stale cursor blinking on the server screen.
                if (host) forceReady(host)
            }
        } else {
            // ONE screen, so one hand at a time - player 1 first, then the
            // rest in order. Showing everybody's hand at once was the old
            // behaviour and it meant player 1 could read player 2's cards; and
            // with no owner, the camera had nothing to follow but the middle
            // of the board. This is the same shape as the hosted game, which
            // also makes the editor an honest preview of it.
            for (let b of playing) {
                if (!inPlay(b)) continue
                programOwner = b
                openProgram(b)
                pauseUntil(function () { return windowShut(b) }, HOURGLASS + PROGRAM_IDLE)
                forceReady(b)
            }
        }
        for (let b of playing) forceReady(b)
        programOwner = null
    }

    function openProgram(bot: Bot) {
        if (!bot || bot.out || bot.ready) return
        bot.openedAt = control.millis()
        bot.open = true
        bot.deadline = 0
        // The row is a cached image, and the cursor is only drawn while the
        // window is open - so it has to be rebuilt HERE. Without this a kid
        // sees no cursor at all until they happen to press left or right.
        drawRow(bot, -1, 0)
    }

    function windowShut(bot: Bot): boolean {
        if (!bot) return true
        if (bot.out || bot.ready) return true
        // An unturned hourglass is not an expired one. Without this the phase
        // ended the instant it began, because millis() > 0 is always true.
        if (bot.deadline == 0) return false
        return control.millis() > bot.deadline
    }

    /**
     * Time is up. Fill whatever is missing at random out of the cards still in
     * the hand, so a kid who was staring out of the window still has a robot
     * that does something and the round is not silently short.
     */
    function forceReady(bot: Bot) {
        if (!bot || bot.out || bot.ready) return
        while (bot.program.length < programSize(bot)) {
            let free: number[] = []
            for (let i = 0; i < bot.hand.length; i++) {
                if (bot.program.indexOf(i) < 0) free.push(i)
            }
            if (free.length == 0) break
            bot.program.push(free[randint(0, free.length - 1)])
        }
        bot.ready = true
        bot.open = false
        bot.deadline = 0
        // Cards appearing out of nowhere is baffling unless you are told why -
        // and with three kids sharing the second screen it has to say WHOSE
        // time ran out, or the next one in the queue thinks it means them.
        flash("P" + bot.player + " TID UDE", bot.color, 1400)
        bot.sprite.sayText("Tiden er gaaet!", 1200)
        drawRow(bot, -1, 0)
    }

    /**
     * Register by register, robot by robot, then the board: the board game's
     * order of play, and the same order the Minecraft tick phases will use.
     *
     * One turn is five beats half a second apart, because four nine year olds
     * cannot follow anything faster: the camera arrives, the robot says what it
     * is about to do, it does it, the bubble comes down, and the next robot
     * goes. In between, the kid whose robot it is presses A - or three seconds
     * pass and it happens anyway. A solo player is never asked to press
     * anything: there is nobody else to keep up with.
     */
    function runRound() {
        const solo = playing.length <= 1
        // The register stacks are cached images and they all still carry last
        // round's greying, so rebuild every one of them before the first card
        // runs - otherwise the row opens with cards already spent.
        for (let b of playing) if (b.rowY >= 0 && !b.out) drawRow(b, -1, 0)
        for (let reg = 0; reg < PROGRAM_SIZE; reg++) {
            for (let bot of playing) {
                if (!inPlay(bot) || bot.dead) continue
                if (reg >= bot.program.length) continue
                const card = bot.hand[bot.program[reg]]

                // 1. the camera arrives
                activeBot = bot
                banner("", bot.color)
                drawRow(bot, reg, 1)
                pause(FOCUS_PAUSE)

                // 2. the robot says what it is about to do
                bot.sprite.sayText(card, BUBBLE_MS)
                if (solo) pause(READ_PAUSE)
                else waitForTurn(bot)
                if (!inPlay(bot) || bot.dead) {
                    bot.sprite.sayText("")
                    activeBot = null
                    continue
                }

                // 3. and does it, with the bubble still up
                current = bot
                landBudget = MAX_TILE_CHAIN
                charging = true
                const understood = playCard(card, bot)
                charging = false
                checkLanded(bot)
                current = null

                // 4. the bubble comes down half a second later - unless it is
                //    the "I do not know this card" warning, which is the whole
                //    point of that message and has a lifetime of its own.
                pause(ACT_PAUSE)
                if (understood) bot.sprite.sayText("")
                drawRow(bot, reg, 2)

                // 5. and half a second after that, the next robot goes
                pause(GAP_PAUSE)
                activeBot = null
                if (checkEnd()) return
            }
            // The board gets the same rhythm: say what is about to happen, let
            // it happen, then a beat before the next register. But only if the
            // kid has actually given the board something to do - in the
            // starting project there is not one between-cards rule, and a
            // silent BANEN pause on every register is a second of nothing,
            // four times a round, in the version aimed at beginners.
            if (betweenTiles.length > 0 || blinkOn.length > 0) {
                banner("BANEN", 1)
                pause(BOARD_PAUSE)
                boardPhase()
                pause(BOARD_PAUSE)
                banner("", 1)
            }
            if (checkEnd()) return
        }
    }

    /** Hold the round until this robot's own player presses A, or three seconds. */
    function waitForTurn(bot: Bot) {
        bot.aPressed = false
        turnDeadline = control.millis() + TURN_TIMEOUT
        banner("P" + bot.player, bot.color)
        pauseUntil(function () {
            return bot.aPressed || control.millis() > turnDeadline || bot.out || bot.dead
        })
        turnDeadline = 0
        banner("", bot.color)
    }

    /** Returns false only when nothing in the kid's program knows this card. */
    function playCard(card: string, bot: Bot): boolean {
        let played = false
        for (let i = 0; i < cardNames.length; i++) {
            if (cardNames[i] == card) {
                cardHandlers[i](bot.sprite)
                played = true
            }
        }
        // The engine hands out jokers whether or not the kid wrote a rule for
        // one, so it has to know what a joker does by itself.
        if (!played && card == JOKER) {
            randomAction()
            return true
        }
        // A card with no rule is a spelling mistake, and an invisible one.
        if (!played) bot.sprite.sayText(card + " ?", MISSING_MS)
        return played
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
     *
     * Note that "last robot standing" can no longer happen by itself now that
     * robots respawn for ever. It is kept for a kid who writes a rule that
     * takes somebody out of the game; the ending that actually fires is the
     * treasure one.
     */
    function checkEnd(): boolean {
        if (pendingWinner > 0) return finish(pendingWinner)

        let alive: Bot[] = []
        for (let b of playing) if (!b.out) alive.push(b)
        if (alive.length == 0) {
            phase = PHASE_OVER
            game.gameOver(false)
            return true
        }
        if (playing.length > 1 && alive.length == 1) return finish(alive[0].player)
        // Every chest opened: most chests wins, and a tie is a draw.
        if (chestsTotal > 0 && chestsLeft == 0) {
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
    // Engine internals: screens and camera
    // ------------------------------------------------------------------

    /**
     * True when this game really does have two views to fill. The roster
     * question is settled once, but the hosting question is asked every frame:
     * the same project is built in the editor on one screen and played online
     * on two, and the one-screen layout has to keep working or nobody can see
     * their cards while they are making the thing.
     */
    function splitScreens(): boolean {
        if (!twoScreens) return false
        // ONE signal, and it has to be this one. controller.playerN.connected
        // looks like a second opinion and is not: ControllerButton.setPressed
        // sets connected = true on the first press of any button, so in the
        // editor or on hardware - where there is exactly one screen - it turns
        // true the moment player 2 joins the lobby, and player 2's hand then
        // gets hidden with nowhere else to draw it. The two mistakes are not
        // the same size: answering true when there is one screen LOSES a
        // player's cards, answering false when there are two only shows player
        // 1 more than they should see, and the client image is drawn
        // unconditionally either way. So ask the strong question only.
        return getOrigin() == "server"
    }

    /**
     * The board is bigger than the screen, so the view has to choose. During a
     * turn both screens sit on the robot that is playing. While everybody is
     * programming, each screen sits on the robot belonging to whoever owns it -
     * which is the whole reason for having two, because there is no longer a
     * single camera for four kids to fight over.
     */
    function cameraLift(): number {
        // The hand takes a row of its own while anybody is choosing; once the
        // round runs, only the two register stacks are left.
        const top = phase == PHASE_PROGRAM ? HAND_Y : REG_TOP_Y
        const middle = (BANNER_H + top - 1) >> 1
        return (screen.height >> 1) - middle
    }

    function centerOn(server: boolean, bot: Bot) {
        if (!bot) return
        const x = bot.sprite.x
        const y = bot.sprite.y + cameraLift()
        if (!twoScreens) { scene.centerCameraAt(x, y); return }
        secondScreen.centerCameraAt(server
            ? secondScreen.DrawMode.JustServer
            : secondScreen.DrawMode.JustClients, x, y)
    }

    function centerBoth(x: number, y: number) {
        if (!twoScreens) { scene.centerCameraAt(x, y); return }
        secondScreen.centerCameraAt(secondScreen.DrawMode.AllPlayers, x, y)
    }

    function shakeCameras(amp: number, ms: number) {
        if (!twoScreens) { scene.cameraShake(amp, ms); return }
        secondScreen.cameraShake(secondScreen.DrawMode.AllPlayers, amp, ms)
    }

    /** Whose robot the given screen is watching while everybody programs. */
    function screenOwner(server: boolean): Bot {
        if (server && splitScreens()) {
            for (let b of playing) if (inPlay(b) && b.player == 1) return b
            // No player 1 at the table, so the server screen has nothing of
            // its own to watch and may as well follow the client screen.
        }
        // The client screen, and the single screen of an unhosted game, both
        // belong to whoever is choosing right now.
        return programOwner
    }

    function updateCamera() {
        if (phase == PHASE_LOBBY || phase == PHASE_OVER) return
        if (phase == PHASE_EXECUTE) {
            // Whoever is acting owns both screens: the point of a turn is that
            // everybody is watching the same robot.
            if (activeBot) {
                centerOn(true, activeBot)
                if (twoScreens) centerOn(false, activeBot)
            }
            return
        }
        // Every screen is somebody's while they are choosing, including the
        // single screen of an unhosted game - there is exactly one hand on it
        // at a time, so there is exactly one robot worth looking at.
        centerOn(true, screenOwner(true))
        if (twoScreens) centerOn(false, screenOwner(false))
    }

    // ------------------------------------------------------------------
    // Engine internals: drawing
    // ------------------------------------------------------------------

    function banner(text: string, color: number) {
        bannerText = text
        bannerColor = color
    }

    function flash(text: string, color: number, ms: number) {
        flashText = text
        flashColor = color
        flashUntil = control.millis() + ms
    }

    /** One card row per player, stacked up from the bottom of the screen. */
    function layoutRows() {
        // Players 1 and 2 down the left, 3 and 4 down the right, the odd one
        // on top of each pair. Fixed by player number so that a kid always
        // looks in the same corner for their own cards, whoever else turned up.
        for (let b of playing) {
            b.rowX = b.player <= 2 ? REG_LEFT_X : REG_RIGHT_X
            b.rowY = (b.player & 1) ? REG_TOP_Y : REG_BOT_Y
            drawRow(b, -1, 0)
        }
    }

    let uiMade = false
    function makeUi() {
        if (uiMade) return
        uiMade = true
        twoScreens = bots.length > 1
        if (twoScreens) {
            // Two renderables rather than one, because the two screens do not
            // show the same cards. Registering them is also what installs the
            // extension's dual render pass, so a solo game never pays for it.
            secondScreen.renderOnZIndex(UI_Z, secondScreen.DrawMode.JustServer,
                function (target: Image) { drawUi(target, true) })
            secondScreen.renderOnZIndex(UI_Z, secondScreen.DrawMode.JustClients,
                function (target: Image) { drawUi(target, false) })
        } else {
            // One renderable instead of forty card sprites. It draws after the
            // tilemap and before the robot (z 95), which is the only point
            // where "the tiles behind a card" still exist to be darkened - and
            // unlike a sprite it can simply not draw a row, which is how rows
            // are hidden. (Moving a card off screen is not an option: mapRect
            // clamps rather than no-ops in the simulator, and would smear a
            // dimmed line down the edge of the board.)
            scene.createRenderable(UI_Z, function (target: Image) { drawUi(target, true) })
        }
    }

    function drawUi(target: Image, isServer: boolean) {
        if (phase == PHASE_LOBBY) {
            drawLobby(target, isServer)
            drawBanner(target, isServer)
            return
        }
        if (phase == PHASE_PROGRAM || phase == PHASE_EXECUTE) {
            // Everybody's committed cards, always, in the same corner every
            // time: 1 and 2 down the left, 3 and 4 down the right.
            for (let b of playing) {
                if (b.rowY < 0 || b.out) continue
                paintRegisters(target, b)
            }
        }
        if (phase == PHASE_PROGRAM) {
            // ...but exactly ONE hand, and it is this screen's. The client
            // image is only ever seen by clients, so screenOwner(false) is
            // always right for it; the server image asks the same question and
            // gets player 1 when the screens are split, or whoever is choosing
            // when there is only one screen to choose on.
            const owner = screenOwner(isServer)
            if (owner) paintHand(target, owner)
        }
        drawBanner(target, isServer)
    }

    /**
     * The lobby is the one screen every kid has to read before anything can
     * happen, and five pixel text in a corner is not something four nine year
     * olds notice across a table. Darken the whole board and put the two
     * buttons in the middle, four times the size.
     *
     * Arcade images have no alpha channel, so "darken" is mapRect through DIM
     * - the same trick that lets a card be see-through.
     */
    function drawLobby(target: Image, isServer: boolean) {
        target.mapRect(0, 0, target.width, target.height, DIM)
        if (!bigFont) bigFont = image.scaledFont(image.font8, 2)
        // Only player 1 can start the game, so only player 1's screen is told
        // about B. Telling three kids to press a button that does nothing for
        // them is worse than telling them nothing.
        const mine = isServer || !splitScreens()
        let big = LOBBY_JOIN
        let small = mine ? LOBBY_START : LOBBY_WAIT_LINE
        if (!mine && seatsHere(false)) {
            // Everybody this screen speaks for is in. Nothing left to press.
            big = LOBBY_WAIT_BIG
            small = LOBBY_WAIT_SMALL
        }
        const bw = big.length * bigFont.charWidth
        const sw = small.length * image.font8.charWidth
        const w = (bw > sw ? bw : sw) + 16
        const x = (target.width - w) >> 1
        target.fillRect(x, LOBBY_BOX_Y, w, LOBBY_BOX_H, 15)
        target.drawRect(x, LOBBY_BOX_Y, w, LOBBY_BOX_H, 1)
        target.print(big, (target.width - bw) >> 1, LOBBY_BOX_Y + 8, 1, bigFont)
        target.print(small, (target.width - sw) >> 1, LOBBY_BOX_Y + 30, 5, image.font8)
        drawChips(target)
    }

    /** True once every seat this screen speaks for has pressed A. */
    function seatsHere(server: boolean): boolean {
        let any = false
        for (let b of bots) {
            const ours = server || !splitScreens() ? true : b.player > 1
            if (!ours) continue
            any = true
            if (!b.joined) return false
        }
        return any
    }

    /**
     * Who is in, big enough to read from the other side of a table. The eight
     * pixel seat badges along the top say the same thing, but they are sized
     * for a game in progress; in the lobby this is the only question on the
     * screen, so it gets the room.
     */
    function drawChips(target: Image) {
        const n = bots.length
        if (n == 0) return
        const total = n * CHIP_PITCH - (CHIP_PITCH - CHIP_W)
        let x = (target.width - total) >> 1
        for (let b of bots) {
            if (b.joined) {
                target.fillRect(x, CHIP_Y, CHIP_W, CHIP_H, b.color)
                target.drawRect(x, CHIP_Y, CHIP_W, CHIP_H, 1)
                target.print("" + b.player, x + 5, CHIP_Y + 3, 1, image.font5)
            } else {
                target.fillRect(x, CHIP_Y, CHIP_W, CHIP_H, 15)
                target.drawRect(x, CHIP_Y, CHIP_W, CHIP_H, 11)
                target.print("" + b.player, x + 5, CHIP_Y + 3, 11, image.font5)
            }
            x += CHIP_PITCH
        }
    }

    function paintRegisters(target: Image, b: Bot) {
        // Darken the board only behind cards that are actually there.
        // Dimming an empty slot punches a dark rectangle into the board.
        for (let i = 0; i < b.program.length; i++) {
            target.mapRect(b.rowX + i * PITCH, b.rowY, CARD_W, CARD_H, DIM)
        }
        target.drawTransparentImage(b.regImage, b.rowX, b.rowY)
    }

    function paintHand(target: Image, b: Bot) {
        for (let i = 0; i < b.hand.length; i++) {
            target.mapRect(HAND_X + i * PITCH, HAND_Y, CARD_W, CARD_H, DIM)
        }
        target.drawTransparentImage(b.handImage, HAND_X, HAND_Y)
    }

    /**
     * The top line: who is playing, how much health they have left, how many
     * chests are still out there, and what this screen is waiting for. It
     * replaces the native four-corner HUD, which would sit exactly on top of
     * the card rows.
     *
     * Health is one heart per robot: full for two hits left, half for one, and
     * nothing at all for the moment between dying and coming back.
     */
    function drawBanner(target: Image, isServer: boolean) {
        // The lobby has its own, much larger, answer to "who is in" - the
        // chips under the box - so the eight pixel badges stay out of its way.
        if (phase == PHASE_LOBBY) { drawMessage(target, isServer); return }
        const hearts = Math.idiv(startHits + 1, 2)
        // Four hearts each for four players is 164 px of a 160 px screen, so
        // past two the row collapses to one heart and a number.
        // Hearts side by side while they fit; past that it is one heart and a
        // number, which needs badge 8 + heart 7 + digit 6 + a gap.
        const wide = playing.length * (10 + hearts * 8) <= 96
        const pitch = wide ? 10 + hearts * 8 : 23
        let x = 2
        let anyChests = false
        for (let b of playing) {
            target.fillRect(x, 0, 8, 7, b.out ? 11 : b.color)
            target.print("" + b.player, x + 1, 1, 1, image.font5)
            if (!b.out && !b.dead) drawHealth(target, b, x + 9, hearts, wide)
            if (b.chests > 0) anyChests = true
            x += pitch
        }
        // A gem under each player for every chest they have opened, which is
        // the score - and the score is the whole point of the board, so it
        // should not be something you work out from a counter in the corner.
        if (anyChests) {
            x = 2
            for (let b of playing) {
                if (b.chests > 0) {
                    plateAt(target, x, 7, 2)
                    target.drawTransparentImage(GEM, x + 1, 8)
                    target.print("" + b.chests, x + 7, 8, 5, image.font5)
                }
                x += pitch
            }
        }
        if (chestsLeft >= 0) {
            // On the SECOND row, right hand end. The top row is seats on the
            // left and the message on the right, and with four players and
            // more than one heart each there is nothing left between them.
            const text = "K" + chestsLeft
            const cx = screen.width - 2 - text.length * 6
            plateAt(target, cx - 1, 7, text.length)
            target.print(text, cx, 8, 5, image.font5)
        }
        drawMessage(target, isServer)
    }

    /**
     * Hearts, two hits to each. Up to two are drawn side by side; beyond that
     * there is no room for four players, so it becomes one heart and a number.
     */
    function drawHealth(target: Image, b: Bot, x: number, hearts: number, wide: boolean) {
        const hp = b.inf.life()
        if (!wide) {
            if (hp <= 0) return
            target.drawTransparentImage(HEART, x, 1)
            // The number needs its own black backing or it is white text on a
            // tan floor, which is the same as no number at all.
            plateAt(target, x + 7, 0, 1)
            target.print("" + Math.idiv(hp + 1, 2), x + 8, 1, 1, image.font5)
            return
        }
        for (let i = 0; i < hearts; i++) {
            const left = hp - i * 2
            if (left >= 2) target.drawTransparentImage(HEART, x + i * 8, 1)
            else if (left == 1) target.drawTransparentImage(HALF_HEART, x + i * 8, 1)
        }
    }

    /** The right hand end of the banner: what this screen is waiting for. */
    function drawMessage(target: Image, isServer: boolean) {
        let text = bannerText
        let color = bannerColor
        if (phase == PHASE_PROGRAM) {
            const line = programLine(isServer)
            text = line.text
            color = line.color
        }
        if (control.millis() < flashUntil) {
            text = flashText
            color = flashColor
        }
        if (text.length > 0) {
            const tx = screen.width - 2 - text.length * 6
            plate(target, tx - 1, text.length)
            target.print(text, tx, 1, color, image.font5)
        }
    }

    /**
     * The banner is painted straight onto the board, and the board is not a
     * background colour - a yellow chest counter over a yellow conveyor belt
     * is simply not there. The seats have their own filled boxes; this gives
     * the text the same courtesy without blacking out the whole top row.
     */
    function plate(target: Image, x: number, chars: number) {
        plateAt(target, x, 0, chars)
    }

    function plateAt(target: Image, x: number, y: number, chars: number) {
        target.fillRect(x, y, chars * image.font5.charWidth + 1, 7, 15)
    }

    /**
     * What this particular screen is waiting for while everybody programs:
     * your own countdown if it is your turn, otherwise whose turn it is. The
     * two screens say different things, which is the point of having two.
     */
    function programLine(isServer: boolean): BannerLine {
        // Same rule as drawUi: the client image always speaks to the clients.
        if (isServer && !splitScreens()) {
            let any = false
            let latest = 0
            for (let b of playing) {
                if (!programming(b)) continue
                any = true
                if (b.deadline > latest) latest = b.deadline
            }
            if (!any) return new BannerLine("KLAR", 1)
            // No sand running yet: say what to do, not how long is left.
            if (latest == 0) return new BannerLine("PROGRAM", 1)
            return new BannerLine("PROGRAM " + secondsLeft(latest), 1)
        }
        const owner = isServer ? screenOwner(true) : programOwner
        if (owner && programming(owner)) {
            if (owner.deadline == 0) return new BannerLine("PROGRAM", owner.color)
            return new BannerLine("PROGRAM " + secondsLeft(owner.deadline), owner.color)
        }
        // Not your turn: name whose it is in their own colour, the same way
        // the execute phase does, so the kids sharing the second screen know
        // who they are waiting for.
        if (programOwner && programming(programOwner)) {
            return new BannerLine("P" + programOwner.player, programOwner.color)
        }
        return new BannerLine("KLAR", 1)
    }

    function secondsLeft(deadline: number): number {
        return Math.max(0, Math.idiv(deadline - control.millis() + 999, 1000))
    }

    /**
     * Rebuild one player's row. Called on every change rather than every
     * frame: the row is a cached image the renderable only has to blit.
     *
     * reg/regStyle let the executing card light up: slot `reg` is drawn solid
     * while its card runs and grey once it is spent.
     */
    function drawRow(bot: Bot, reg: number, regStyle: number) {
        const im = bot.regImage
        im.fill(0)
        for (let i = 0; i < PROGRAM_SIZE; i++) {
            if (i >= bot.program.length) continue
            let style = 0
            if (i == reg) style = regStyle
            // EVERY card already played stays grey, not only the one that has
            // just run. The row is the record of the turn so far, and a single
            // grey slot among three bright ones reads as "that one is broken"
            // rather than "we are three cards in".
            else if (reg >= 0 && i < reg) style = 2
            drawCard(im, i * PITCH, bot.hand[bot.program[i]], style, bot.color)
        }
        const hd = bot.handImage
        hd.fill(0)
        for (let i = 0; i < bot.hand.length; i++) {
            let style = 0
            if (bot.program.indexOf(i) >= 0) style = 2
            if (i == bot.selected && programming(bot)) {
                style = style == 2 ? 3 : 1
            }
            drawCard(hd, i * PITCH, bot.hand[i], style, bot.color)
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
     * The frame carries the player colour and the label is always WHITE.
     * Printing the label in the player colour too meant player 2 read their
     * own hand as dark blue on a dimmed board, which is very nearly the same
     * thing as not printing it at all. Only a spent card goes grey, label and
     * frame together, because that one is meant to recede.
     *
     * font5 advances 6 px per character, so on a 14 px card a two-character
     * label lands at x = 1 exactly and a three-character one is clipped.
     */
    function drawCard(im: Image, x: number, card: string, style: number, color: number) {
        const label = fit(card)
        if (style == 1) {
            im.fillRect(x, 0, CARD_W, CARD_H, color)
            im.print(label, x + centerX(label), CARD_TEXT_Y, 1, image.font5)
            return
        }
        // Spent cards go grey, but the cursor still has to be findable when it
        // is sitting on one, or A appears to do nothing for no visible reason.
        const spent = style >= 2
        im.drawRect(x, 0, CARD_W, CARD_H, style == 3 ? 1 : (spent ? 11 : color))
        im.print(label, x + centerX(label), CARD_TEXT_Y, spent ? 11 : 1, image.font5)
    }

    /**
     * A card is 14 px wide and font5 advances 6 px per character, so only two
     * characters fit. Nothing stops a kid naming a card "PRUT": print it whole
     * and it runs straight across the next card in the row, because the row is
     * one image. Cut it instead - a clipped name is a visible reason to
     * shorten it, a smeared row is not.
     */
    function fit(card: string): string {
        const label = ascii(card)
        const max = (CARD_W - 2) / image.font5.charWidth
        if (label.length <= max) return label
        return label.substr(0, max)
    }

    /**
     * font5 has 113 glyphs and not one Danish letter, so a card the kids
     * naturally call "OE" comes out as a hole in the card. Spell it the way
     * the engine's own text already does. (Speech bubbles do NOT need this:
     * sayText picks its font with image.getFontForText, which lands on font8,
     * and font8 has all six.)
     */
    function ascii(s: string): string {
        let out = ""
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i)
            if (c == 0xE6) out += "ae"
            else if (c == 0xC6) out += "AE"
            else if (c == 0xF8) out += "oe"
            else if (c == 0xD8) out += "OE"
            else if (c == 0xE5) out += "aa"
            else if (c == 0xC5) out += "AA"
            else out += s.charAt(i)
        }
        return out
    }

    function centerX(card: string): number {
        const w = card.length * image.font5.charWidth
        let x = (CARD_W - w) >> 1
        if (x < 1) x = 1
        return x
    }
}
