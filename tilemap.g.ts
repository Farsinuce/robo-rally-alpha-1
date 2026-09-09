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
    export const laserH = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laserV = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laserUp = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laserDown = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laserLeft = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laserRight = image.ofBuffer(hex``);

    helpers._registerFactory("tilemap", function(name: string) {
        switch(helpers.stringTrim(name)) {
            case "level1":return tiles.createTilemap(hex`10000b000101010101010101010101010101010101040101010f010101010f010101040101010101010d010a0a010d010101010101020101010d010303010d010101020101020606060606050507070707070201110a0c0c0c0c0c02020c0c0c0c0c0a100102060606060605050707070707020101020101010d010303010d010101020101010101010d010a0a010d010101010101040101010e010101010e010101040101010101010101010101010101010101`, img`
. . . . . . . . . . . . . . . . 
. . . . . 2 . . . . 2 . . . . . 
. . . . . . . . . . . . . . . . 
. 2 . . . . . . . . . . . . 2 . 
. 2 . . . . . . . . . . . . 2 . 
2 . . . . . . 2 2 . . . . . . 2 
. 2 . . . . . . . . . . . . 2 . 
. 2 . . . . . . . . . . . . 2 . 
. . . . . . . . . . . . . . . . 
. . . . . 2 . . . . 2 . . . . . 
. . . . . . . . . . . . . . . .
`, [myTiles.transparency16,myTiles.floor,myTiles.wall,myTiles.lava,myTiles.start,myTiles.hole,myTiles.conveyorRight,myTiles.conveyorLeft,myTiles.conveyorUp,myTiles.conveyorDown,myTiles.chest,myTiles.chestOpen,myTiles.laserH,myTiles.laserV,myTiles.laserUp,myTiles.laserDown,myTiles.laserLeft,myTiles.laserRight], TileScale.Sixteen);
        }
        return null;
    })

    helpers._registerFactory("tile", function(name: string) {
        switch(helpers.stringTrim(name)) {
            case "transparency16":return transparency16;
            case "floor":return floor;
            case "wall":return wall;
            case "lava":return lava;
            case "start":return start;
            case "hole":return hole;
            case "conveyorRight":return conveyorRight;
            case "conveyorLeft":return conveyorLeft;
            case "conveyorUp":return conveyorUp;
            case "conveyorDown":return conveyorDown;
            case "chest":return chest;
            case "chestOpen":return chestOpen;
            case "laserH":return laserH;
            case "laserV":return laserV;
            case "laserUp":return laserUp;
            case "laserDown":return laserDown;
            case "laserLeft":return laserLeft;
            case "laserRight":return laserRight;
        }
        return null;
    })

}
// Auto-generated code. Do not edit.
