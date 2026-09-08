# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A MakeCode Arcade project (PXT target `arcade`, editor 4.1.17) implementing a tiny single-player Robo Rally: the player is dealt a random hand of 6 cards, commits 4 of them to a program, and the robot executes the program on a tile grid with walls, lava and a goal.

It is teaching material for Coding Pirates (volunteer coding club, kids aged 9-11). The kids work in the Blocks view; the adults maintain the engine. The season plan (real RFID cards read by a micro:bit, then multiplayer, then a Minecraft port) and the reasoning behind the current design are in `historical-claude-correspondance.md`. Read it before proposing features so they fit the arc.

## Commands

No `pxt` CLI is installed locally and there is no package.json. Day-to-day editing happens in the browser at https://arcade.makecode.com (Import -> Import URL -> this repo, or open the project and use its GitHub sync). To work locally:

```
npm install -g pxt
pxt target arcade     # once, in repo root; downloads the target into pxt_modules/ (gitignored)
pxt install
pxt build             # = make build
pxt test              # = make test; compiles and runs test.ts
pxt deploy            # = make deploy (default make target); build + copy to a connected device
pxt serve             # local editor + simulator
```

`test.ts` is the only test file (listed under `testFiles` in pxt.json) and is currently empty. It is excluded when the repo is consumed as a MakeCode extension, so there is no finer granularity than "run pxt test".

Releases: creating a GitHub release triggers `.github/workflows/makecode-release.yml`, which runs `pxt build --cloud` for JS plus samd51 / stm32f401 / rpi hardware and uploads the resulting UF2s to the release.

## Architecture

Two hand-written source files with a deliberate split:

- `custom.ts` is the engine, namespace `roboRally`. Per-robot state (sprite, facing, the four facing images, hand, program, dead flag, card UI sprites, start tile, controller) lives in a private `Bot` class; `bots[]` holds them and `current` is the robot whose card is executing. Classes are invisible to Blocks, so this costs the kids nothing and makes the multiplayer session additive. Only exported functions carrying a `//% block` annotation appear in the Blocks toolbox (the "Robo Rally" category); everything else is private engine code. Controls are bound per robot through `controller.player1..4`: left/right cycle the hand, A commits the selected card to the next program slot, up pops the last slot, B marks that robot ready. When every robot is ready, `runProgram()` executes register by register, robot by robot. `move()` steps one tile at a time and calls `fireLanded()` after each step, so a `+3` is checked against lava/goal mid-move and stops at walls.
- `main.ts` is the kid-facing program: the drawn robot sprite, `set tilemap to`, deck composition, one `onCardPlayed` hat per card and one `onLand` hat per tile. This is the file the Blocks editor shows. It is regenerated from `main.blocks` whenever a kid edits blocks, so treat it as theirs, not ours.

Constraints that are not obvious from the code:

- **main.ts must stay decompilable to blocks.** MakeCode regenerates `main.blocks` from `main.ts`. If main.ts uses constructs Blocks cannot represent, the kids get stuck in JavaScript view. Anything non-trivial goes into custom.ts behind a `//% block`. Never hand-edit `main.blocks`; to force the blocks view to be rebuilt, delete it and let the editor decompile `main.ts`. In main.ts, image/tile/tilemap literals may only appear where a shadow expects them: `img`...`` behind `screen_image_picker`, `tilemap`...`` behind `tiles_tilemap_editor`, and `assets.tile`...`` or a `sprites.dungeon.*` reference behind `tileset_tile_picker`.
- **Keep the block surface small.** The live kid-facing API is: addCards, startGame, onCardPlayed, onLand, move, turnLeft/turnRight, die, win, theRobot, facing, setLook, plus addPlayer for the multiplayer session. A new engine feature should cost a kid one block, one `onCardPlayed` hat, or one `onLand` hat. Prefer a native MakeCode block over a new custom one whenever the native path is not harder for a kid: `say`, `camera follow sprite`, `place on random tile` and `start effect` all work on the robot now that `theRobot` returns the sprite.
- **Never change a `blockId`.** Every block carries an explicit `blockId=roboRally_*`. The id is what saved `.blocks` files reference, so renaming one silently breaks every kid project; the visible block text can change freely.
- **Card strings are free-form.** Cards are plain strings matched against the `onCardPlayed` hats; nothing enforces a fixed set, so a new card costs one `addCards` block and one hat. Conventions are Danish: `V` = venstre (left), `H` = hoejre (right), `U` = U-vending (U-turn, built from two `turn left` blocks), `P` = prut, `+n` / `-n` = forward/back n tiles. A card with no matching hat makes the robot say "<card> ?", which is how a spelling mistake becomes visible instead of silently doing nothing.
- **Maps are painted in the tilemap editor.** `tilemap.g.jres` holds the real level (`level1`, 10x5, walls in the packed layer bitmap) and `main.ts` sets it with the native `tiles.setCurrentTilemap(tilemap`level1`)`. Walls come from the editor's wall tool and `move()` reads them through `tiles.tileAtLocationIsWall`; off-map counts as a wall, so a level needs no drawn border. `mapFromText` survives as a `deprecated=true` fallback only.
- **The tile picker only lists project tiles.** `tileset_tile_picker` builds its dropdown from tiles referenced by tilemap assets/blocks in the workspace plus project tiles, never the gallery. This is why the pre-refactor program silently compared against `transparency16` and its lava and goal rules never fired. Any tile a kid paints, drawn or taken from the gallery, appears in the picker automatically; a tile that is in no tilemap cannot be picked.
- `pxt.json` `files` is the authoritative compile list. A new .ts file must be added there or MakeCode ignores it.

## Generated and scaffold files

Do not hand-edit: `main.blocks` and `tilemap.g.*` (editor output), `_history` (MakeCode edit history), `assets/` (compiled simulator build for GitHub Pages; `binary.js` is ~2 MB), and the Jekyll scaffold `index.html`, `_config.yml`, `Gemfile`. `.gitattributes` already marks these as linguist-generated. `assets/js/custom.js` is only honoured if `disableTargetTemplateFiles` is set in pxt.json.
