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
roboRally.startGame(mySprite, assets.tile`start`)
// To robotter. Motoren kopierer din tegning og farver den om, en
// farve til hver spiller, og giver hver robot sin egen trappe.
// Du kan skrue op til 4 - så deles spiller 2, 3 og 4 om den anden
// skærm og vælger kort på skift.
roboRally.addRobots(2)
// Ét hjerte er to hits. Skru op hvis banen er for hård.
roboRally.startHealth(1)
// Den der åbner flest kister vinder. Er der flere om førstepladsen
// bliver det uafgjort.
roboRally.treasure(assets.tile`chest`, assets.tile`chestOpen`)

// ---------------------------------------------------------------
// Maskinerne på banen: de sover, indtil banen får sin tur
// ---------------------------------------------------------------
// Hvert felt her har to tegninger: en tændt og en slukket. De står
// slukkede hele tiden mens I vælger kort, og vågner kun når banen
// får sin tur. Trin-nummeret er rækkefølgen: FØRST kører båndene
// (trin 1), BAGEFTER skyder laserne (trin 2) - så du bliver flyttet
// først og skudt der, hvor du ender.
roboRally.blinkTiles(assets.tile`conveyorRight`, assets.tile`conveyorRightOff`, 1)
roboRally.blinkTiles(assets.tile`conveyorLeft`, assets.tile`conveyorLeftOff`, 1)
roboRally.blinkTiles(assets.tile`conveyorUp`, assets.tile`conveyorUpOff`, 1)
roboRally.blinkTiles(assets.tile`conveyorDown`, assets.tile`conveyorDownOff`, 1)
roboRally.blinkTiles(assets.tile`laserH`, assets.tile`laserHOff`, 2)
roboRally.blinkTiles(assets.tile`laserV`, assets.tile`laserVOff`, 2)

// ---------------------------------------------------------------
// Kortene: ét blok-hoved pr. kort. Navnet, hvor mange der er i
// bunken, og hvad kortet gør - det hele ét sted.
// ---------------------------------------------------------------
roboRally.card("+1", 3, function (robot) {
    roboRally.move(1)
})
roboRally.card("+2", 2, function (robot) {
    roboRally.move(2)
})
roboRally.card("+3", 1, function (robot) {
    roboRally.move(3)
})
roboRally.card("-1", 1, function (robot) {
    roboRally.move(-1)
})
roboRally.card("V", 2, function (robot) {
    roboRally.turnLeft()
})
roboRally.card("H", 2, function (robot) {
    roboRally.turnRight()
})
// U for U-vending: et kort lavet af to kort vi allerede har
roboRally.card("U", 1, function (robot) {
    roboRally.turnLeft()
    roboRally.turnLeft()
})
// S for skyd
roboRally.card("S", 1, function (robot) {
    roboRally.shoot()
})
// Jokeren. Du får også en gratis hver gang nogen skyder eller maser
// dig - og du bestemmer ikke selv hvad den gør.
roboRally.card("?", 1, function (robot) {
    roboRally.randomAction()
})
roboRally.card("P", 1, function (robot) {
    robot.sayText("PRUT!", 700)
    music.play(music.melodyPlayable(music.buzzer), music.PlaybackMode.InBackground)
})

// ---------------------------------------------------------------
// Felterne: ét blok-hoved for hvert felt du maler på banen
// ---------------------------------------------------------------
// Lava: to hits, og det er præcis nok til at slå dig ihjel
roboRally.onLand(assets.tile`lava`, function (robot) {
    roboRally.takeHits(2)
})
roboRally.onLand(assets.tile`hole`, function (robot) {
    roboRally.die()
})

// Transportbåndene kører på trin 1 af banens tur.
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
// Laserne skyder på trin 2, altså efter båndene har flyttet alle.
roboRally.onBetweenCards(assets.tile`laserH`, function (robot) {
    roboRally.takeHits(1)
})
roboRally.onBetweenCards(assets.tile`laserV`, function (robot) {
    roboRally.takeHits(1)
})
