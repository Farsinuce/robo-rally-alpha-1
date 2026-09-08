# Robo Rally: design record

Condensed record of the design conversation this project grew out of, between the maintainer and Claude before and during the first build. Decisions are recorded as made in that conversation; where it left something unresolved, this says so. CLAUDE.md describes the current code.

## Context and constraints

- Coding Pirates (volunteer coding club, Denmark), weekly Tuesday sessions, about six kids aged 9-11. Two volunteers: a developer and a creative generalist (game design, "does this feel fun").
- The kids asked for Scratch and for Minecraft command-block mini games. Both are honoured indirectly: MakeCode is the same kind of blocks as Scratch (say so to them), and command blocks arrive in the Minecraft phase.
- micro:bits (V2) and LED strips belong to the club and cannot go home, so the take-home is an Arcade share link and later the Minecraft server.
- The Minecraft server runs on the developer's home PC at another location and stays live for a couple of months. Kids log in with unmodified Java clients. Kids have Android phones, not iPhones.
- Danish naming: `V` = venstre, `H` = højre, `P` = prut, `+n` / `-n` = forward / back n tiles.
- An opening brainstorm (a 1:1 map of the town in Minecraft, a creeper lamp, a Scratch track, generic micro:bit sensor bridges) was dropped once Robo Rally emerged.

## Pedagogy

- Programming plus a little game design theory (Zimmerman, Rules of Play): play a game before building it.
- One test, said the same way every time: **what does it do, and what does it change about how you reach the goal?** ("Meaningful play" in kid language.) "Press A to spawn a pig" fails the second half. Rescue rather than dismiss: "what if the pig blocks a tile until it is pushed?" Now it is a rule, and their idea. Kids should be able to argue why lava (danger) or a timer (urgency) belongs.
- The adults fix the quantifiable outcome: first robot to touch the goal wins, in checkpoint order if checkpoints exist. Everything else the kids argue for.
- Every session opens with five minutes of pitching new tiles on paper; proposals go on cards and form the season backlog. Design talk becomes code at "you said conveyors, show me the block for it".
- Proposed kick-off (not confirmed in the final plan): present the idea in five minutes, then analogue Robo Rally on a floor grid. Seven cards each (move 1/2/3, back, left, right, U-turn), five laid face down, registers revealed and executed simultaneously; walls, one goal, one lava tile. Purpose: feel "program, then run", feel why simultaneous execution is fun (collisions, pushing), and hold the first design conversation ("which tile would you add, what does it do, why is the game better?").

## Session arc (the maintainer's last plan)

1. Each kid builds a local single-player Robo Rally in MakeCode Arcade with a tilemap and cards, inventing their own tiles and card types ("move 1 forward", "fart").
2. Real cards read by an RC522 RFID reader on a micro:bit; scans fed into the Arcade game.
3. Multiplayer.
4. If there is time, sessions 4-5 port it to Minecraft. The maintainer floated Lua for the hardcore kids; the advice was to park it (see Parked).

End state: a web-based home kit plus the Minecraft server, so kids play from home with Android phones replacing the micro:bits.

Reality check: five integrations in five sessions with two volunteers. Kids create in sessions 1 and 3; 2, 4 and 5 are mostly adult plumbing the kids plug into, and they should be told so. The fallback for each session is the previous session's version, still running.

## Arcade game and block API

- **MakeCode Arcade** over Scratch and the bare micro:bit. The tilemap editor is level design (painting lava there is the same act as placing red concrete in Minecraft later), the block editor is the micro:bit's, the share link is the take-home and parents can play it on a phone, local multiplayer is built in. Rejected: bare micro:bit (a 5x5 display cannot carry level design) and Scratch (hand-built grid logic with lists, heavy for 9-11).
- **The register engine is an adult-built starter** (about 40 blocks with arrays and a loop, too much for one afternoon), walked through once so it is not magic. Kids own tilemap, tile rules and card types: a new card is one string and one branch, a new tile one painted tile and one overlap handler; extensions are a timer, lives, sounds. An earlier variant had kids first build a direct-control dpad version (about eight blocks they own entirely) before receiving the starter. The original's engine sketch is superseded by `custom.ts`.
- **Engine in `custom.ts`, kids see only `main.ts`.** MakeCode compiles every `.ts` file but shows only `main.ts` as blocks. Blocks come from `//%` comments on exported functions in a namespace: the namespace annotation (color, icon, block) makes the toolbox category; `block="move $n"` labels a block with `$n` as an input slot and `n.defl` its default; a parameter that is itself a function makes a hat block (the engine stores the handler and calls it later); `draggableParameters="reporter"` gives the draggable `card` bubble; `tile.shadow=tileset_tile_picker` shows the tile picker; a boolean return makes a hexagonal condition block, no return makes a statement block. Everything else stays private. The design rule: expose only the handful of verbs (eight at the time) a kid needs to describe the game.
- **Corrections the maintainer asked for after the first playable build** (implemented in `custom.ts`): a random dealt hand, not free choice (Robo Rally rules); a program of 4 cards, not 5, because the game is small; card names `P`, `+n`, `-n`, `V`, `H`; the robot shouts its move in a speech bubble; used cards turn grey. How kids draw and edit their own tilemap levels was asked and never answered.

## Physical cards: RFID, micro:bit, injector

- **RC522 on micro:bit V2 over SPI** (both 3.3 V, extensions exist). Read UIDs only, with a UID-to-card table on the micro:bit; writing to tags buys nothing.
- **Buy NTAG213 or NTAG215 stickers, not MIFARE Classic, and decide before ordering.** RC522 reads both, but many Android phones cannot read MIFARE Classic and Web NFC needs NFC Forum tags, so the tag type decides whether the home kit works at all. iPhones are out (no Web NFC in Safari).
- **Scans reach the browser through a Python serial-to-keystroke injector** on each laptop: it reads `card:3` over serial and presses keys into the browser (right x3, then Z), because the simulator is keyboard-driven and the game code does not change; session 1's game just gets a new input. Rejected: micro:bit as Bluetooth keyboard (`blehid`), since pairing six school laptops on a Tuesday is where sessions die. Fallback: type the cards on the keyboard. Test the full chain at home first.
- **Unresolved:** the injector's key mapping assumes a fixed card list where index = card. The later random-hand rule breaks that mapping; the conversation never revisited it.
- **LED-strip kid:** a NeoPixel strip on their micro:bit shows the registers as colours while scanning, lights each as it executes, and later shows health, laser hits and checkpoint colours from the Minecraft bridge. Short strips work on micro:bit pins. A role nobody else has.

## Multiplayer

- **Arcade local multiplayer** (`controller.player2` etc., up to four on one device), two kids per laptop with two readers. The adults restructure the starter so each player has a program array and all programs execute register by register together; that is where pushing, blocking and "you ruined my plan" live. Rejected: Arcade online mode with join codes, a second shaky link and less fun than sharing a room.

## Minecraft engine and bridge

- **Server-side only.** A Fabric mod or Paper plugin needs nothing on the kids' side; vanilla clients connect as normal. Rejected: Fabric reading serial directly (jSerialComm), which forces every micro:bit onto the server machine; Node on the kids' laptops.
- **Start with RCON, no mod.** RCON bound to localhost on the server; a bridge beside it translates. Inbound values become `scoreboard players set <player> <objective> <n>`; outbound polls `scoreboard players list` a few times a second. Health, damage and deaths are vanilla criteria (`health`, `minecraft.custom:minecraft.damage_taken`, `deathCount`); anything custom is a repeating command block writing `mb_out`. Latency 100-200 ms is fine. Why: no plugin, no rebuild on Minecraft updates, one process to maintain.
- **Upgrade path:** a server-side Fabric mod that opens the WebSocket itself and reads and writes scoreboards in-process. Event-driven instead of polled, no RCON round trips, and it can add things vanilla scoreboards cannot express. Same page and protocol; build it once RCON proves the concept.
- **Unresolved bridge placement.** The conversation holds two club-side designs: a static Web Serial page on each laptop talking `wss` to a service next to the server (Web Serial pages must be HTTPS, so the socket must be `wss` behind Caddy or a Cloudflare tunnel; the kid enters a pairing code that maps to their username), and a Python bridge (pyserial + mcrcon, pairing table micro:bit to username) that implies RCON reachable from the laptops. They were never reconciled.
- **The scoreboard is the contract.** Kids' work stays in MakeCode and command blocks; the adults own the pipe. Per player: `face` 0-3 (S/W/N/E; `custom.ts` uses 0 up, 1 right, 2 down, 3 left), `reg1`-`reg5`, `cp`, `hp`, and `run`, which the bridge sets to 1 to start the register loop. Card codes 1/2/3 move, 4 back, 5 left, 6 right, 7 U-turn. The five registers predate the 4-card decision and were never reconciled.
- **Engine: the player is the robot, the floor is the program.** A vanilla datapack (functions beat chained command blocks). Movement snaps the player's rotation to `face`, then steps with caret coordinates if the block ahead is air (`tp @s ^ ^ ^1`); move 2/3 repeat the step so walls stop mid-move, as in the board game; back up is `^ ^ ^-1`; turning adjusts `face` and wraps 0-3. A tick counter drives phases (register 1 for everyone, board elements, register 2, and so on) at one second each, everyone simultaneously; pushing via `execute if entity @a[distance=..1]`. Build order: movement with one player, then the palette, then the register loop; about two evenings.
- **Floor palette,** read under each player after every register: coloured wool = conveyor in a direction; yellow concrete = gear (`face` +1); red concrete = laser (`damage @s 2`); gold block = checkpoint (`cp` +1, checked in order); hole = pit (teleport to last checkpoint, lose a card).
- **Kids touch exactly two command-block shapes.** A custom tile is one always-active repeating command block in an "engine room": `execute as @a at @s if block ~ ~-1 ~ purple_wool run tp @s 10 68 -4`, read as "for each player standing on X, do Y", the Arcade overlap block in text. A card button is one impulse command block behind a button: `scoreboard players set @p reg1 3`; the datapack handles "next empty register". Kids rebuild their own Arcade tilemap with the palette and port their tile rules; say the parallel out loud.
- **Engine grows with their ideas:** when a kid proposes something the engine cannot do (a timer that ends the round), add a scoreboard to the engine and hand them the command block that reads it. Their surface stays small while the engine grows.
- **An in-world card booth** (seven buttons plus run) writes the same scoreboards as the bridge, so both work at once; the booth is what works from home without a micro:bit.
- **Earlier micro:bit card-picker sketch** (before RFID scanning replaced it as the input; usable as a no-reader fallback): A cycles the card on the LED matrix, B commits it to the next register as `reg1:3` over serial, shake sends `run:1`; the bridge sends `hp:14` and `cp:2` back. Kids own icons, sounds, a health bar, tilt instead of buttons; the line protocol is the fixed contract.

## Home kit

- **A Chrome Web NFC page plus the server, no mod.** The page reads the tag serial, sends `card:3` over a WebSocket to the bridge beside the server, which writes the scoreboard over RCON; the kid joins from a normal Java client. Same page as the club version with Web Serial swapped for Web NFC. Server stays vanilla, kids whitelisted; parents can watch and the kid can explain the command blocks they wrote. A Modrinth "home pack" with a Fabric mod was the earlier idea.
- **Java edition at home is a prerequisite.** Confirm before session 4 who has it; many Danish 9-11-year-olds are on Bedrock, and command-block syntax differs enough that the season sticks to one edition.
- Optional end-of-season items: a tournament across all boards, boards exported as world files, a laser-cut plaque of each kid's board (decide around session 8).

## Adults' prep, in order

1. Arcade single-player starter, tested on a school laptop, plus a one-page card of the moves.
2. RC522 + micro:bit reading UIDs and sending serial lines.
3. Python injector, end to end into the simulator.
4. Multiplayer starter.
5. Bridge, datapack and floor palette on the server, plus a micro:bit MakeCode starter for the Minecraft phase; then the Web NFC page.

## Parked

- **Lua and Blockly** (EduBlocks, a Lua Blockly editor, motivated by the kids' love of Roblox). MakeCode is already Blockly, nothing in this stack speaks Lua, and MakeCode's blocks/JavaScript toggle is the better bridge to text. Roblox Studio is a theme for next season. Two volunteers running micro:bit, Arcade, Minecraft and Lua at once is where seasons fall over.
