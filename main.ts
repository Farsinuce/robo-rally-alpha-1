roboRally.onCard(function (card) {
    if (card == "Yo") {
        roboRally.move(1)
    } else if (card == "+2") {
        roboRally.move(2)
    } else if (card == "+3") {
        roboRally.move(3)
    } else if (card == "-1") {
        roboRally.move(-1)
    } else if (card == "V") {
        roboRally.turnLeft()
    } else if (card == "H") {
        roboRally.turnRight()
    } else if (card == "P") {
        roboRally.say("PRUT!")
        music.buzzer.play()
        roboRally.move(0)
    }
})
roboRally.onLanded(function () {
    if (roboRally.robotIsOn(assets.tile`transparency16`)) {
        roboRally.die()
    }
    if (roboRally.robotIsOn(assets.tile`transparency16`)) {
        roboRally.win()
    }
})
let mySprite = sprites.create(img`
    . . . . . . . . . . . . . . . . 
    . . . . . . . 3 3 . . . . . . . 
    . . . . . 3 3 3 . . . . . . . . 
    . . . 3 3 3 3 3 3 3 3 3 3 . . . 
    . . 3 . 3 3 3 3 3 3 3 3 3 3 . . 
    . . . 3 3 3 3 3 3 3 3 . 3 3 3 . 
    . . 3 3 3 3 3 . 3 3 3 3 3 . 3 . 
    . 3 3 3 3 3 3 3 3 3 3 3 3 3 3 . 
    . . . 3 . 3 3 3 3 3 3 3 3 3 3 . 
    . . . 3 3 3 3 3 3 3 3 . 3 3 . . 
    . . 3 3 3 3 3 3 3 3 3 3 3 3 3 3 
    . . 3 3 3 3 3 3 3 3 . . . . 3 . 
    . 3 3 3 3 3 3 3 3 . . 3 3 3 . . 
    . 3 3 3 3 3 3 3 3 3 3 3 3 3 3 . 
    . 3 3 3 3 3 3 3 3 3 3 3 3 3 3 . 
    3 . . . . . . . . . . . . . . . 
    `, SpriteKind.Player)
roboRally.addCards(3, "Yo")
roboRally.addCards(2, "+2")
roboRally.addCards(1, "+3")
roboRally.addCards(1, "-1")
roboRally.addCards(2, "V")
roboRally.addCards(2, "H")
roboRally.addCards(1, "P")
roboRally.mapFromText([
"##########",
"#S....L..#",
"#..#..#..#",
"#.L.....G#",
"##########"
])
roboRally.startGame()
