// ---------------------------------------------------------------
// ROBO RALLY - lille udgave
//
// Spillet virker allerede: robotten kan koere frem og dreje til
// hoejre, lava slaar dig ihjel, og den der naar kisten i midten
// vinder. Men det er ogsaa ALT den kan.
//
// Banen er naesten tom, og der er en mur hele vejen rundt. I
// tilemap-editoren ligger der ogsaa transportbaand, lasere og
// huller - du skal bare male dem ind. Men de goer ingenting
// foer DU skriver reglen for dem. Det er hele opgaven.
//
// Flere af felterne findes to gange: en TAENDT og en SLUKKET
// udgave (laserH og laserHOff, conveyorRight og conveyorRightOff,
// og saa videre). Med blokken "... turns off to ..." sover feltet,
// indtil banen faar sin tur - og trin-nummeret bestemmer
// raekkefoelgen: trin 1 foer trin 2.
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
// To robotter. Del spillet og vaelg "host a multiplayer game",
// saa faar spiller 1 sin egen skaerm og spiller 2 sin egen.
roboRally.addRobots(2)
// Den der aabner flest kister vinder. Er der flere om
// foerstepladsen bliver det uafgjort.
roboRally.treasure(assets.tile`chest`, assets.tile`chestOpen`)

// ---------------------------------------------------------------
// Kortene: et blok-hoved pr. kort
// ---------------------------------------------------------------
// Der er kun to slags kort. Hvert kort-hoved siger tre ting: hvad
// kortet hedder, hvor mange der er af det i bunken, og hvad det
// goer. Vil du have et kort der drejer til venstre, saa lav et nyt
// hoved og kald det "V".
//
// +1 for et skridt frem. Proev ogsaa "+2" og "-1".
roboRally.card("+1", 5, function (robot) {
    roboRally.move(1)
})
// H for hoejre. Et "V" kort ville se helt magen til ud.
roboRally.card("H", 4, function (robot) {
    roboRally.turnRight()
})

// ---------------------------------------------------------------
// Felterne: et blok-hoved for hvert felt du vil have til at virke
// ---------------------------------------------------------------
// Lava slaar dig ihjel. Du mister resten af din tur og kommer
// igen paa den naermeste trappe.
//
// Naar du har malet et hul paa banen kan du give det den samme
// regel. Og et transportbaand faar sin egen slags blok:
// "naar robot staar paa ... mellem kort" + "skub robot".
//
// En laser er den samme slags blok: "naar robot staar paa laserH
// mellem kort" + "robot mister 1 hits". Vil du have den til at
// taende og slukke, saa saet ogsaa "laserH turns off to laserHOff
// on board step 2" op i starten - saa koerer baandene foerst og
// laserne bagefter.
roboRally.onLand(assets.tile`lava`, function (robot) {
    roboRally.die()
})
