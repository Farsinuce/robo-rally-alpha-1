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

    helpers._registerFactory("tilemap", function(name: string) {
        switch(helpers.stringTrim(name)) {
            case "level1":return tiles.createTilemap(hex`0a00070001010101010101010101050103010101010301010101010206060201010101010707040408080101010101020606020101010101030101010103010501010101010101010101`, img`
. . . . . . . . . . 
. . . . . . . . . . 
. . . 2 . . 2 . . . 
. . . . . . . . . . 
. . . 2 . . 2 . . . 
. . . . . . . . . . 
. . . . . . . . . . 
`, [myTiles.transparency16,myTiles.floor,myTiles.wall,myTiles.lava,myTiles.goal,myTiles.start,myTiles.hole,myTiles.conveyorRight,myTiles.conveyorLeft], TileScale.Sixteen);
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
        }
        return null;
    })

}
// Auto-generated code. Do not edit.
