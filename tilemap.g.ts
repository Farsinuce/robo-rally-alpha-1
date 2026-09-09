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
    export const conveyorRightOff = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const conveyorLeftOff = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const conveyorUpOff = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const conveyorDownOff = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const chest = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const chestOpen = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laserH = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laserHOff = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laserV = image.ofBuffer(hex``);
    //% fixedInstance jres blockIdentity=images._tile
    export const laserVOff = image.ofBuffer(hex``);
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
            case "level1":return tiles.createTilemap(hex`10000b000101010101010101010101010101010101050101011601010101160101010501010101010113010f0f011301010101010102010101130103030113010101020101020707070707060608080808080201180f1111111111020211111111110f170102070707070706060808080808020101020101011301030301130101010201010101010113010f0f011301010101010105010101150101010115010101050101010101010101010101010101010101`, img`
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
`, [myTiles.transparency16,myTiles.floor,myTiles.wall,myTiles.lava,myTiles.goal,myTiles.start,myTiles.hole,myTiles.conveyorRight,myTiles.conveyorLeft,myTiles.conveyorUp,myTiles.conveyorDown,myTiles.conveyorRightOff,myTiles.conveyorLeftOff,myTiles.conveyorUpOff,myTiles.conveyorDownOff,myTiles.chest,myTiles.chestOpen,myTiles.laserH,myTiles.laserHOff,myTiles.laserV,myTiles.laserVOff,myTiles.laserUp,myTiles.laserDown,myTiles.laserLeft,myTiles.laserRight], TileScale.Sixteen);
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
            case "conveyorRightOff":return conveyorRightOff;
            case "conveyorLeftOff":return conveyorLeftOff;
            case "conveyorUpOff":return conveyorUpOff;
            case "conveyorDownOff":return conveyorDownOff;
            case "chest":return chest;
            case "chestOpen":return chestOpen;
            case "laserH":return laserH;
            case "laserHOff":return laserHOff;
            case "laserV":return laserV;
            case "laserVOff":return laserVOff;
            case "laserUp":return laserUp;
            case "laserDown":return laserDown;
            case "laserLeft":return laserLeft;
            case "laserRight":return laserRight;
        }
        return null;
    })

}
// Auto-generated code. Do not edit.
