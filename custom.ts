namespace SpriteKind {
    export const Card = SpriteKind.create()
}

//% color="#B4009E" icon="\uf11b" block="Robo Rally" weight=100
namespace roboRally {
    const HAND_SIZE = 6
    const PROGRAM_SIZE = 4

    let deck: string[] = []
    let hand: string[] = []
    let program: number[] = []
    let selected = 0
    let facing = 0          // 0 up, 1 right, 2 down, 3 left
    let running = false
    let dead = false
    let robot: Sprite = null
    let handSprites: Sprite[] = []
    let slots: Sprite[] = []
    let cardHandler: (card: string) => void = null
    let landedHandler: () => void = null

    const dx = [0, 1, 0, -1]
    const dy = [-1, 0, 1, 0]
    const robotImages = [img`
.......55.......
......5555......
.....555555.....
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
................
................
................
`, img`
................
................
................
...8888888888...
...8888888888...
...88888888885..
...888888888855.
...8888888888555
...8888888888555
...888888888855.
...88888888885..
...8888888888...
...8888888888...
................
................
................
`, img`
................
................
................
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
...8888888888...
.....555555.....
......5555......
.......55.......
`, img`
................
................
................
...8888888888...
...8888888888...
..58888888888...
.558888888888...
5558888888888...
5558888888888...
.558888888888...
..58888888888...
...8888888888...
...8888888888...
................
................
................
`]

    // ---------- blocks the kids use ----------

    //% block="add $count cards $card to the deck"
    //% count.defl=1 card.defl="+1"
    export function addCards(count: number, card: string) {
        for (let i = 0; i < count; i++) deck.push(card)
    }

    //% block="build map from $rows"
    //% rows.shadow="lists_create_with" rows.defl="text"
    export function mapFromText(rows: string[]) {
        let w = rows[0].length
        let h = rows.length
        let data = control.createBuffer(4 + w * h)
        data.setNumber(NumberFormat.UInt16LE, 0, w)
        data.setNumber(NumberFormat.UInt16LE, 2, h)
        tiles.setCurrentTilemap(tiles.createTilemap(data, image.create(w, h), [
            sprites.dungeon.floorLight0, sprites.dungeon.floorDark0, sprites.dungeon.hazardLava0,
            sprites.dungeon.chestClosed, sprites.dungeon.stairLarge], TileScale.Sixteen))
        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                let ch = rows[row].charAt(col)
                let loc = tiles.getTileLocation(col, row)
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

    //% block="start Robo Rally"
    export function startGame() {
        if (deck.length == 0) {
            addCards(3, "+1"); addCards(2, "+2"); addCards(1, "+3")
            addCards(1, "-1"); addCards(2, "V"); addCards(2, "H"); addCards(1, "P")
        }
        info.setLife(3)
        robot = sprites.create(robotImages[0], SpriteKind.Player)
        tiles.placeOnRandomTile(robot, sprites.dungeon.stairLarge)
        makeUi()
        setupControls()
        deal()
    }

    //% block="camera follows robot"
    export function cameraFollowsRobot() {
        scene.cameraFollowSprite(robot)
    }

    //% block="on card $card played"
    //% draggableParameters="reporter"
    export function onCard(handler: (card: string) => void) {
        cardHandler = handler
    }

    //% block="on robot landed on a tile"
    export function onLanded(handler: () => void) {
        landedHandler = handler
    }

    //% block="move $n"
    //% n.defl=1
    export function move(n: number) {
        let dir = facing
        if (n < 0) dir = (facing + 2) % 4
        for (let i = 0; i < Math.abs(n); i++) {
            if (dead) return
            let here = robot.tilemapLocation()
            let next = tiles.getTileLocation(here.column + dx[dir], here.row + dy[dir])
            if (tiles.tileAtLocationIsWall(next)) {
                music.knock.play()
                return
            }
            tiles.placeOnTile(robot, next)
            if (landedHandler) landedHandler()
            pause(250)
        }
    }

    //% block="turn left"
    export function turnLeft() { turn(3) }

    //% block="turn right"
    export function turnRight() { turn(1) }

    //% block="robot says $text"
    export function say(text: string) {
        robot.say(text, 700)
    }

    //% block="robot is on $tile"
    //% tile.shadow=tileset_tile_picker
    //% tile.decompileIndirectFixedInstances=true
    export function robotIsOn(tile: Image): boolean {
        return tiles.tileAtLocationEquals(robot.tilemapLocation(), tile)
    }

    //% block="robot dies"
    export function die() {
        if (dead) return
        dead = true
        info.changeLifeBy(-1)
        music.zapped.play()
        scene.cameraShake(4, 300)
        pause(400)
        facing = 0
        robot.setImage(robotImages[0])
        tiles.placeOnRandomTile(robot, sprites.dungeon.stairLarge)
    }

    //% block="robot wins"
    export function win() {
        music.powerUp.play()
        game.over(true, effects.confetti)
    }

    // ---------- engine internals ----------

    function turn(quarterTurns: number) {
        facing = (facing + quarterTurns) % 4
        robot.setImage(robotImages[facing])
    }

    function deal() {
        let pile: string[] = []
        hand = []
        for (let i = 0; i < HAND_SIZE; i++) {
            if (pile.length == 0) for (let c of deck) pile.push(c)
            let k = randint(0, pile.length - 1)
            hand.push(pile[k])
            pile.removeAt(k)
        }
        program = []
        selected = 0
        drawCards()
    }

    function run() {
        running = true
        dead = false
        for (let i = 0; i < program.length; i++) {
            let card = hand[program[i]]
            slots[i].setImage(cardImage(card, 1))
            robot.say(card, 700)
            if (cardHandler) cardHandler(card)
            slots[i].setImage(cardImage(card, 2))
            pause(500)
            if (dead) break
        }
        pause(500)
        deal()
        running = false
    }

    function setupControls() {
        controller.right.onEvent(ControllerButtonEvent.Pressed, function () {
            if (running) return
            selected = (selected + 1) % hand.length
            drawCards()
        })
        controller.left.onEvent(ControllerButtonEvent.Pressed, function () {
            if (running) return
            selected = (selected + hand.length - 1) % hand.length
            drawCards()
        })
        controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
            if (running || program.length >= PROGRAM_SIZE || program.indexOf(selected) >= 0) return
            program.push(selected)
            drawCards()
        })
        controller.up.onEvent(ControllerButtonEvent.Pressed, function () {
            if (running || program.length == 0) return
            program.pop()
            drawCards()
        })
        controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
            if (running) return
            if (program.length < PROGRAM_SIZE) {
                robot.say(PROGRAM_SIZE + " kort!", 800)
                return
            }
            run()
        })
    }

    function makeUi() {
        for (let i = 0; i < PROGRAM_SIZE; i++) slots.push(uiSprite(80 - (PROGRAM_SIZE - 1) * 9 + i * 18, 90))
        for (let i = 0; i < HAND_SIZE; i++) handSprites.push(uiSprite(80 - (HAND_SIZE - 1) * 9 + i * 18, 110))
    }

    function uiSprite(x: number, y: number) {
        let s = sprites.create(emptyImage(), SpriteKind.Card)
        s.setFlag(SpriteFlag.RelativeToCamera, true)
        s.setPosition(x, y)
        s.z = 100
        return s
    }

    function drawCards() {
        for (let i = 0; i < hand.length; i++) {
            let style = 0
            if (program.indexOf(i) >= 0) style = 2
            else if (i == selected) style = 1
            handSprites[i].setImage(cardImage(hand[i], style))
        }
        for (let i = 0; i < PROGRAM_SIZE; i++) {
            if (i < program.length) slots[i].setImage(cardImage(hand[program[i]], 0))
            else slots[i].setImage(emptyImage())
        }
    }

    // style: 0 normal, 1 selected/active, 2 used
    function cardImage(card: string, style: number) {
        let im = image.create(16, 16)
        im.fill(1)
        if (style == 1) im.fill(5)
        if (style == 2) im.fill(11)
        im.drawRect(0, 0, 16, 16, 15)
        im.printCenter(card, 5, 15, image.font5)
        return im
    }

    function emptyImage() {
        let im = image.create(16, 16)
        im.drawRect(0, 0, 16, 16, 11)
        return im
    }
}