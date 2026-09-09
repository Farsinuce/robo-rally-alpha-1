// Auto-generated code. Do not edit.
namespace myTiles {
    //% fixedInstance jres blockIdentity=images._tile
    export const transparency16 = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const floor = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const wall = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const lava = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const goal = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const start = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const hole = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const conveyorRight = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const conveyorLeft = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const conveyorUp = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const conveyorDown = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const chest = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const chestOpen = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laser = image.ofBuffer(hex``);

    helpers._registerFactory("tilemap", function(name: string) {
        switch(helpers.stringTrim(name)) {
            case "level1":return tiles.createTilemap(hex`14000e000101010101010101010101010101010101010101010501010101010102020202010101010101050101010101010b01010201010201010b0101010101010102020101010101010101010101010202010101010201070707070103030108080808010201010101010a01010101010303010101010109010101010d010a01010b0101010101010b010109010d01010d010a01010101010101010101010109010d010101010a01010b0101010101010b01010901010101010101010101010106060101010101010101010101020107070707010606010808080801020101010102020101010101010101010101010202010101010101010b01010201010201010b01010101010105010101010101020202020101010101010501`, img`
. . . . . . . . . . . . . . . . . . . . 
. . . . . . . . 2 2 2 2 . . . . . . . . 
. . . . . . . . 2 . . 2 . . . . . . . . 
. . 2 2 . . . . . . . . . . . . 2 2 . . 
. . 2 . . . . . . . . . . . . . . 2 . . 
. . . . . . . . . . . . . . . . . . . . 
. . . . . . . . . . . . . . . . . . . . 
. . . . . . . . . . . . . . . . . . . . 
. . . . . . . . . . . . . . . . . . . . 
. . . . . . . . . . . . . . . . . . . . 
. . 2 . . . . . . . . . . . . . . 2 . . 
. . 2 2 . . . . . . . . . . . . 2 2 . . 
. . . . . . . . 2 . . 2 . . . . . . . . 
. . . . . . . . 2 2 2 2 . . . . . . . .
`, [myTiles.transparency16,myTiles.floor,myTiles.wall,myTiles.lava,myTiles.goal,myTiles.start,myTiles.hole,myTiles.conveyorRight,myTiles.conveyorLeft,myTiles.conveyorUp,myTiles.conveyorDown,myTiles.chest,myTiles.chestOpen,myTiles.laser], TileScale.Sixteen);
        }
        return null;
    })

    helpers._registerFactory("tile", function(name: string) {
        switch(helpers.stringTrim(name)) {
            case "transparency16":return transparency16;
            case "floor":return floor;
            case "wall":return wall;
            case "lava":return lava;
            case "goal":return goal;
            case "start":return start;
            case "hole":return hole;
            case "conveyorRight":return conveyorRight;
            case "conveyorLeft":return conveyorLeft;
            case "conveyorUp":return conveyorUp;
            case "conveyorDown":return conveyorDown;
            case "chest":return chest;
            case "chestOpen":return chestOpen;
            case "laser":return laser;
        }
        return null;
    })

}
// Auto-generated code. Do not edit.
