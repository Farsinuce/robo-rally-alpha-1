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
// Jokeren. Du faar ogsaa en gratis hver gang nogen skyder
// eller maser dig - og du bestemmer ikke selv hvad den goer.
roboRally.addCards(1, "?")
roboRally.startGame(mySprite, assets.tile`start`)
// To robotter. Motoren kopierer din tegning og farver den om, en
// farve til hver spiller, og giver hver robot sin egen trappe.
// Du kan skrue op til 4 - saa deles spiller 2, 3 og 4 om den anden
// skaerm og vaelger kort paa skift.
roboRally.addRobots(2)
// Den der åbner flest kister vinder. Er der flere om førstepladsen
// bliver det uafgjort.
roboRally.treasure(assets.tile`chest`, assets.tile`chestOpen`)
// Laserne tænder og slukker. Banen bytter de to felter hver gang den får sin
// tur - altså efter hvert kort - så det tændte felt bliver til det slukkede og
// omvendt. Det tændte har en regel længere nede, det slukkede har ingen, og så
// skyder laseren hvert andet kort. Tæl med, og gå forbi når den er mørk.
roboRally.blinkTiles(assets.tile`laserH`, assets.tile`laserHOff`)
roboRally.blinkTiles(assets.tile`laserV`, assets.tile`laserVOff`)

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
// ? for jokeren: et tilfaeldigt kort fra bunken
roboRally.onCardPlayed("?", function (robot) {
    roboRally.randomAction()
})
roboRally.onCardPlayed("P", function (robot) {
    robot.sayText("PRUT!", 700)
    music.play(music.melodyPlayable(music.buzzer), music.PlaybackMode.InBackground)
})

// ---------------------------------------------------------------
// Felterne: et blok-hoved for hvert felt du maler på banen
// ---------------------------------------------------------------
// Lava: to hits, og det er praecis nok til at slaa dig ihjel
roboRally.onLand(assets.tile`lava`, function (robot) {
    roboRally.takeHits(2)
})
roboRally.onLand(assets.tile`hole`, function (robot) {
    roboRally.die()
})

// Transportbåndene: banen får sin egen tur efter hvert kort.
// Fire felter, samme blok, hver sin retning i rullelisten.
roboRally.onBetweenCards(assets.tile`conveyorRight`, function (robot) {
    roboRally.push(RoboDirection.Right)
})
roboRally.onBetweenCards(assets.tile`conveyorLeft`, function (robot) {
    roboRally.push(RoboDirection.Left)
})
roboRally.onBetweenCards(assets.tile`conveyorUp`, function (robot) {
    roboRally.push(RoboDirection.Up)
})
roboRally.onBetweenCards(assets.tile`conveyorDown`, function (robot) {
    roboRally.push(RoboDirection.Down)
})
// Laserne fyrer mellem hvert kort: står du i strålen koster det et hit.
// Kun de TÆNDTE felter har en regel - de slukkede gør ingenting, og det er
// hele forskellen på de to tegninger.
roboRally.onBetweenCards(assets.tile`laserH`, function (robot) {
    roboRally.takeHits(1)
})
roboRally.onBetweenCards(assets.tile`laserV`, function (robot) {
    roboRally.takeHits(1)
})
