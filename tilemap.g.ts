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
            case "level1":return tiles.createTilemap(hex`10000b0001010101010101010101010101010101010501010101020202020101010105010101010b01010201010201010b0101010102020101010101010101010102020101020107070707030308080808010201010d010a0b0101010101010b09010d0101020107070707060608080808010201010202010101010101010101010202010101010b01010201010201010b0101010105010101010202020201010101050101010101010101010101010101010101`, img`
. . . . . . . . . . . . . . . . 
. . . . . . 2 2 2 2 . . . . . . 
. . . . . . 2 . . 2 . . . . . . 
. 2 2 . . . . . . . . . . 2 2 . 
. 2 . . . . . . . . . . . . 2 . 
. . . . . . . . . . . . . . . . 
. 2 . . . . . . . . . . . . 2 . 
. 2 2 . . . . . . . . . . 2 2 . 
. . . . . . 2 . . 2 . . . . . . 
. . . . . . 2 2 2 2 . . . . . . 
. . . . . . . . . . . . . . . .
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
