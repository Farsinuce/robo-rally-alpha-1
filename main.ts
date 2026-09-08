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
roboRally.addCards(3, "+1")
roboRally.addCards(2, "+2")
roboRally.addCards(1, "+3")
roboRally.addCards(1, "-1")
roboRally.addCards(2, "V")
roboRally.addCards(2, "H")
roboRally.addCards(1, "U")
roboRally.addCards(1, "S")
roboRally.addCards(1, "P")
roboRally.startGame(mySprite, assets.tile`start`)

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
// S for skyd
roboRally.onCardPlayed("S", function (robot) {
    roboRally.shoot()
})
roboRally.onCardPlayed("P", function (robot) {
    robot.sayText("PRUT!", 700)
    music.play(music.melodyPlayable(music.buzzer), music.PlaybackMode.InBackground)
})

// ---------------------------------------------------------------
// Felterne: et blok-hoved for hvert felt du maler på banen
// ---------------------------------------------------------------
roboRally.onLand(assets.tile`lava`, function (robot) {
    roboRally.die()
})
roboRally.onLand(assets.tile`hole`, function (robot) {
    roboRally.die()
})
roboRally.onLand(assets.tile`goal`, function (robot) {
    roboRally.win()
})

// Transportbåndene: banen får sin egen tur efter hvert kort.
// To felter, samme blok, hver sin retning i rullelisten.
roboRally.onBetweenCards(assets.tile`conveyorRight`, function (robot) {
    roboRally.push(RoboDirection.Right)
})
roboRally.onBetweenCards(assets.tile`conveyorLeft`, function (robot) {
    roboRally.push(RoboDirection.Left)
})
