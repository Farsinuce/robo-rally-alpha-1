// ---------------------------------------------------------------
// Sæt spillet op
// ---------------------------------------------------------------
let mySprite = sprites.create(img`
    . . . . . . f f f f . . . . . .
    . . . . . f f f f f f . . . . .
    . . . . f f f f f f f f . . . .
    . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
    . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
    . . 8 8 1 1 8 8 8 8 1 1 8 8 . .
    . . 8 8 1 1 8 8 8 8 1 1 8 8 . .
    . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
    . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
    . . 8 8 8 5 5 5 5 5 5 8 8 8 . .
    . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
    . . 8 8 8 8 8 8 8 8 8 8 8 8 . .
    . . . 8 8 8 8 8 8 8 8 8 8 . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    `, SpriteKind.Player)
tiles.setCurrentTilemap(tilemap`level1`)
scene.cameraFollowSprite(mySprite)
roboRally.addCards(3, "+1")
roboRally.addCards(2, "+2")
roboRally.addCards(1, "+3")
roboRally.addCards(1, "-1")
roboRally.addCards(2, "V")
roboRally.addCards(2, "H")
roboRally.addCards(1, "U")
roboRally.addCards(1, "P")
roboRally.startGame(mySprite, sprites.dungeon.stairLarge)

// ---------------------------------------------------------------
// Kortene: et blok-hoved for hvert kort i bunken
// ---------------------------------------------------------------
roboRally.onCardPlayed("+1", function (robot) {
    roboRally.move(1)
})
roboRally.onCardPlayed("+2", function (robot) {
    roboRally.move(2)
})
roboRally.onCardPlayed("+3", function (robot) {
    roboRally.move(3)
})
roboRally.onCardPlayed("-1", function (robot) {
    roboRally.move(-1)
})
roboRally.onCardPlayed("V", function (robot) {
    roboRally.turnLeft()
})
roboRally.onCardPlayed("H", function (robot) {
    roboRally.turnRight()
})
// U for U-vending: et kort lavet af to kort vi allerede har
roboRally.onCardPlayed("U", function (robot) {
    roboRally.turnLeft()
    roboRally.turnLeft()
})
roboRally.onCardPlayed("P", function (robot) {
    robot.sayText("PRUT!", 700)
    music.buzzer.play()
})

// ---------------------------------------------------------------
// Felterne: et blok-hoved for hvert felt du maler på banen
// ---------------------------------------------------------------
roboRally.onLand(sprites.dungeon.hazardLava0, function (robot) {
    roboRally.die()
})
roboRally.onLand(sprites.dungeon.chestClosed, function (robot) {
    roboRally.win()
})
