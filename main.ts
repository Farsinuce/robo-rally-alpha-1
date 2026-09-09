// ---------------------------------------------------------------
// ROBO RALLY - lille udgave
//
// Spillet virker allerede: robotten kan koere frem og dreje til
// hoejre, lava slaar dig ihjel, og den der aabner flest kister
// vinder. Men det er ogsaa ALT den kan.
//
// Kig paa banen. Der er transportbaand, lasere og huller - og de
// goer ingenting endnu. Det er din opgave.
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

// Bunken. Der er kun to slags kort. Vil du have et kort der
// drejer til venstre, saa skriv "V" her - og lav et blok-hoved
// til det laengere nede.
roboRally.addCards(5, "+1")
roboRally.addCards(4, "H")
roboRally.startGame(mySprite, assets.tile`start`)
// To robotter. Del spillet og vaelg "host a multiplayer game",
// saa faar spiller 1 sin egen skaerm og spiller 2 sin egen.
roboRally.addRobots(2)
// Den der aabner flest kister vinder. Er der flere om
// foerstepladsen bliver det uafgjort.
roboRally.treasure(assets.tile`chest`, assets.tile`chestOpen`)

// ---------------------------------------------------------------
// Kortene: et blok-hoved for hvert kort i bunken
// ---------------------------------------------------------------
// +1 for et skridt frem. Proev ogsaa "+2" og "-1".
roboRally.onCardPlayed("+1", function (robot) {
    roboRally.move(1)
})
// H for hoejre. Et "V" kort ville se helt magen til ud.
roboRally.onCardPlayed("H", function (robot) {
    roboRally.turnRight()
})

// ---------------------------------------------------------------
// Felterne: et blok-hoved for hvert felt du vil have til at virke
// ---------------------------------------------------------------
// Lava slaar dig ihjel. Du mister resten af din tur og kommer
// igen paa den naermeste trappe. Hullerne paa banen goer stadig
// ingenting - kan du give dem den samme regel?
roboRally.onLand(assets.tile`lava`, function (robot) {
    roboRally.die()
})
