# Robo Rally in Minecraft 26.2: a datapack engine the kids program

> **Status (2026-09-15):** design draft. Revised after three independent reviews, a 15-claim
> verification against decompiled 26.2 source (Appendix A), and a five-lens review whose 56 confirmed
> findings are folded into the text and listed in Appendix B. **23 findings from that review, mostly
> logistics and game feel, were never verified** (the run hit the usage limit); Appendix C lists them
> as decisions still to take.

## Context

The Arcade game is session 1-3 of the season; `historical-claude-correspondance.md` plans a Minecraft
port for sessions 4-5. The ask: a Robo Rally mini-game as a **vanilla Java 26.2 datapack** (released
2026-06-16, pack format 107.1), where the adults build the fundamentals and 10-year-olds program the rest.

It is feasible. Two of the Arcade engine's hardest problems vanish:
- **Every player has their own screen**, so hands are private for free and none of the two-screen
  machinery has a counterpart.
- **Minecraft's font has æ, ø and å.**

Two things get harder:
- **There are no fibers**, so the round becomes a tick-driven state machine.
- **The kids' code is command blocks and text**, not Blocks.

**Decided with the user:**
- The player **rides a robot entity that the engine controls**. The camera is always theirs: first
  person and F5, while programming and while moving. There is no map and no top-down camera.
- **Two tiers of kid code.** The youngest use command blocks only; the older kids also write
  `.mcfunction` files.
- **One board per world**, played on a laptop with friends over LAN, and **one Java account per kid**.
- **Cards are right-clicked in the hotbar**; the inventory screen is never needed.
- **Scope: the full foundational plan**, built MVP-first so that every milestone leaves a playable game.

**What changed since the first draft:**
- Tiles are **1×1**.
- **One card is one command-block chain.** The deck is collected from the chains, so there is no deck chest.
- **The copper golem carries the robot's health.**
- **Only the engine raises moments**, and each moment is about one robot.
- **A tile rule reads a block placed on the rule itself.**
- **Treasure is not a chest.**
- **The kids' rules files cannot silently switch each other off.**
- There is an explicit **MVP line**.

## 1. The robot is an entity we control; the player rides it

The engine never moves, turns or reads the player. Everything the game knows lives on the robot.

- **The body is a copper golem**, summoned with
  `{NoAI:1b,Invulnerable:1b,Silent:1b,NoGravity:1b,PersistenceRequired:1b,next_weather_age:-2L}`.
  - **Waxing (`next_weather_age:-2L`) is mandatory.** Weathering runs even with NoAI: after about 21 h of
    loaded time the golem is fully oxidised, and from then on each tick has a 0.58 % chance to turn it
    into a statue *block*, which deletes the robot.
  - **Its hands stay empty.** See §2 for why.
  - **One team per seat,** with a colour and `collisionRule never`.
  - **Why a living body:** it gives us three things below: hearts on the HUD, `camera_distance`, and a
    locator-bar dot.
  - **Fallback** if the feel is wrong: a `block_display` of a copper golem statue.
- **Riding.** `/ride <player> mount <golem>` puts the kid **directly** on the golem; any seat entity in
  between breaks the heart display.
  - A NoAI mob never has a controlling passenger, so WASD does nothing.
  - Sneaking always dismounts, server-side, and cannot be blocked. So the engine re-mounts anyone without
    a vehicle every tick.
  - Every re-mount makes the client show "Press Shift to Dismount" in the actionbar slot for 60 ticks,
    replacing the program. **`motor:tick` therefore re-sends the program *after* any `/ride`, in the same
    tick** (last write wins).
- **Moving.** Only ever teleport the golem. Teleporting the *player* takes them off.
  - Give no rotation argument.
  - **Glide:** 0.2 block per tick, 5 ticks per tile (anything from 0.1 to 0.25 glides).
  - Clients trail the server by about 3 ticks plus ping, so wait about 3 ticks after the last step before
    the next visual beat.
  - Source-confirmed: the rider comes along as a passenger, and their camera never snaps. Bug MC-262324,
    fixed in 1.20, was exactly this setup.
- **Turning.** Run `execute as <golem> run rotate @s <yaw> 0` with the absolute yaw for `rr.face`
  (N 180, E −90, S 0, W 90).
  - Never use a relative `~` from a command block: its rotation follows the block's facing.
  - `/rotate` sets yaw and head, but not the body, which takes about 1.2 s to follow. So a turn is
    `rotate` + `execute as <golem> at @s run tp @s ~0.01 ~ ~` (this snaps the body), and the next move
    re-centres the golem absolutely.
  - The rider's camera is untouched throughout.
- **`motor:flyt` is the only function that moves a robot.** It moves the golem, the facing arrow and the
  speech bubble, and records `rr.col/row/face`. The arrow and bubble are `text_display`s that it moves,
  not passengers.
- **Facing** is the score `rr.face`, shown as a flat arrow in the seat's colour on the tile ahead. That
  is exactly where `frem` will take you, and you can read it in first person without turning your head.
- **Health is the golem's hearts,** which the HUD shows in the food-bar slot while you ride. 1 hit is 1
  heart.
  - `max_health` = 2 × start hits. Hearts only show from 1.5 up, so it is never below 2.
  - Write `max_health` first, then `Health`. Health is clamped to the maximum, and raising the maximum
    does not heal.
  - **Never 0:** the golem dies 20 ticks later and drops the rider. This is the Arcade `info` trap,
    reborn.
  - The player's own hearts play no part: `pvp false`, and the damage gamerules are off.
- **Camera.** The player's `camera_distance` goes to about 10 during a game. The camera uses the larger
  of the player's and the vehicle's value, so F5 and looking down gives a drone view.
- **A rider who logs out takes the robot with them,** because a vehicle is saved with its only player.
  - That seat is then *absent*: its window counts as shut and its registers are skipped.
  - When it reappears, its tile is re-checked, and it respawns if the tile is taken.
- **A robot with nobody on it is still a whole robot:** a solo opponent, and the headless tests.

## 2. The screen: every HUD element has one job

| HUD element | Job |
|---|---|
| Hotbar 1-6 | **Your hand.** Pick with scroll or 1-6, right-click to commit. A committed card stays in its slot and glows, with its register number as the item count; right-click it again to take it back. That leaves a hole (`·` in the actionbar), and the next commit fills the first hole, so the order never shifts under you. |
| Actionbar | **Your program**, in order: `1 +2   2 V   3 ·   4 ·` (plain text in the MVP, inline item sprites later). Private. |
| Bossbar | While programming, a personal bar in your colour: `VÆLG KORT`, then your seconds. While executing, one shared bar: `P2 spiller +2` in P2's colour, `BANEN`. |
| Food-bar slot | **Robot health**, shown as the golem's hearts. |
| Locator bar | *(post-MVP)* one dot per robot in its team colour (golem `waypoint_transmit_range` 256, player 0). |

- **The actionbar fades after 60 ticks.** It is re-sent at least every 40 ticks, and straight after every
  re-mount.
- **The card item** is a `carrot_on_a_stick` with `item_model`, `custom_name`,
  `custom_data={robo:{kort:"+2"}}`, and glint when committed.
  - The press is read from `minecraft.used:minecraft.carrot_on_a_stick`, which counts whatever the
    crosshair is on.
  - Holding the button repeats every 4 ticks, so a plain rate limit would commit, take back and commit
    again. The engine detects the **press**: a rise of the stat counts only if the last rise was ≥ 8
    ticks ago (`rr.klik_t`). The stat is zeroed every tick in every phase, and a held button is one
    press. `use_cooldown` does not apply, because this use returns PASS.
  - Clicks are ignored for ~6 ticks after programming opens (Arcade's `PHASE_GRACE`).
- **The same click also does an off-hand pass.**
  - With an empty off hand, that pass is an empty-hand interaction with the golem under the crosshair,
    which throws out anything that golem holds. **So golems never hold items.**
  - A card swapped to the off hand with F is put back by the re-render. It is never deleted.
- **Storage is the truth; the hotbar is only a view re-rendered from it.** A card dropped with Q comes
  back. Nothing a kid does in the inventory can change their program.
- **Card icons (post-MVP):**
  - Always write `atlas:"minecraft:items"`. The default atlas is `blocks`, and an item sprite in it draws
    as a checkerboard.
  - A coloured parent component tints the icon, so colour only the text around it.
  - An icon is 8 px, and it works in the actionbar, title, subtitle and bossbar name.
  - The sprite path is not the item id, so use a curated icon table.
- **"Klar" grace:** when the last robot goes ready, undo still works for 20 ticks before the round starts.
- **During execution**, the hotbar is re-packed so slots 1-4 are the program, and the running card glows.
  Grey spent cards are post-MVP.
- **Known limit:** others can see the card in your hand from third person.

## 3. The board: one block is one tile

- **1×1 tiles.** One block is one tile is one Arcade tile, so a kid can rebuild their own Arcade tilemap
  block for block ("painting lava is placing red concrete").
- **Floor is at `y0`; robots stand at `y0+1`.**
  - **A wall** is any solid block at robot height on the tile.
  - **Ask "off the board?" before "wall?"** ([custom.ts:1084](custom.ts#L1084) `step`).
  - **A hole** is just no floor, and nothing happens unless a rule says so.
  - **Holes must be plain `minecraft:air`:** `cave_air` never matches an empty rule head.
- **Start pad** = `lodestone`. **Treasure** = `gold_block`, which becomes `raw_gold_block` once taken.
  - It is not a chest: an adventure-mode player can open a chest, and the card right-click would do that
    instead. Nothing clickable may be within reach of a robot.
- **`lite`:** 10×7 with a wall ring, 2 start pads, one treasure and a few magma blocks.
  **`master`:** 16×11 with belts, lasers and holes.
- **Forceload the board and the engine room**, meaning the chunks themselves. The ring of chunks around a
  forced chunk runs command blocks but freezes entities, and spawn chunks no longer exist.
  - `execute if blocks` *errors* rather than answering false on unloaded or out-of-world coordinates, so
    the off-board check always comes first.
- **The engine room.** Rule slots **lie flat**: head + 5 chain blocks in a horizontal row, with a sign in
  front, and rows side by side.
  - The tile block stands on the head, so nothing else may ever sit on top of a head.
  - A vertical column would put the first chain block exactly where the tile block goes.
- **Boards are built by a generated function**, not a binary structure.
  - `tools/gen-bane.js` (the counterpart of `gen-map.js`) turns an ASCII map into `kort:byg`.
  - That function places the floor, walls, pads and treasure with `setblock`, plus every pre-built
    command block.
  - Every command block, **chain blocks included**, needs `auto:1b`. Kids' slots get `TrackOutput:1b`, so
    errors show in the block's GUI.
  - A command containing double quotes is written as a single-quoted SNBT string.
  - The function is diffable and can be rebuilt after an engine change. After that, the world is the kid's.

## 4. The kids' surface

**Principles carried over from the Arcade `CLAUDE.md`:**
- **A card is one thing.**
- **There is one way to refer to the robot.**
- **Order between rules never matters; order inside a rule always does.**
- **Grow by primitives, not features.**

**A rule is a slot.** It is one Repeat head followed by Chain blocks, all Always Active and
**Unconditional**.
- Slots are pre-built, flat, 1 head + 5 chain blocks, with a sign on each. **Kids never place or break
  a command block.** They edit text in pre-built ones, and copy a rule by copying its text (Ctrl+A,
  Ctrl+C in one block, Ctrl+V in a blank one). Pick-block copies a block without its facing or mode,
  and laptop touchpads have no middle button.
- A chain runs start to finish, in order, in one tick, before any other chain starts. So a slot is
  Arcade's hat: the head is the hat, and the chain is the blocks inside it.
- **Every head clears, then tags.** Its first line removes `robot` from every entity; on a match it
  tags the one robot the moment is about and ends `return 1`, otherwise `return fail`. Without the
  clear, a tag left by an earlier head leaks into every rule below it in a file: the plan's own `U` +
  magma example killed the robot on every `U`.
- **Verbs do nothing when no robot is tagged**, and always end `return 1`, even when the move was
  blocked by a wall. A chain block under a head that did not match is therefore harmless.
- Chains are *not* Conditional. A Conditional chain is an AND over its lines, so an empty block, an
  effect already on, or a particle nobody receives silently stops the rest of the card.
- `return 0` counts as *success* and a function with no `return` counts as failure, so the engine
  relies on neither: every `robo:` function ends in an explicit `return 1` or `return fail`.

| Head | Means | Arcade |
|---|---|---|
| `function robo:kort {navn:"U",antal:1}` | this card: `antal` copies go in the deck, and the chain runs when it is played | `card "U" (1 in the deck)` |
| `function robo:felt` | a robot lands on **the block standing on top of this command block** | `on lands on <tile>` |
| `function robo:trin {trin:1}` *(post-MVP)* | board step 1 reaches a robot standing on the block on top | `on … between cards` |

- **The block on top is the tile picker, as a physical act.**
  - No block id is typed.
  - The comparison is the exact block state, so a belt slot holds the glazed terracotta turned the way it
    lies on the board. Waterlogged, powered and lit count too.
  - Kids never reason about `facing`; the terracotta arrow points *opposite* its `facing` value.
- **Heads are always called bare,** never behind `execute`. Under `execute`, an error is silently
  dropped, so the kid would never see it.
  - A card head is a macro, and 26.2 caches only 8 argument sets per function, so a wall of slots
    re-instantiates it every tick.
  - To keep that cheap, `robo:kort` has one `$` line that stores its arguments, then calls a plain
    function.
  - The spike measures the cost with about 30 slots.
- **The robot is `@e[tag=robot]`, always**, and the rider is `@a[tag=spiller]`. Never `@p` or `@s`.
  - **One rule for every line, in both tiers:** it is either `function robo:…` or it starts with
    `execute at @e[tag=robot] run …`. In a slot a bare `~` is the command block, so `setblock ~ ~ ~`
    replaces the block that runs it.
  - `robo:` lines are the robot's *plan* and run later, one per beat; every other line happens the
    moment the card is turned over. So a particle or a "did I land on gold" check belongs in a tile
    rule, not between two `frem`s. A queued native line, `robo:koer {cmd:"…"}`, comes in milestone 2.
- **The verbs.** The namespace `robo:` holds *only* these, so typing `function robo:` and pressing Tab is
  the toolbox. Engine internals live in `motor:`.
  - **MVP:** `frem`, `tilbage`, `venstre`, `hoejre`, `skub/nord` `/oest` `/syd` `/vest` (path
    segments: Tab completes them and a typo fails visibly), `doe`, `sig {tekst:"…"}`, and
    **`proev {navn:"V"}`**: in build mode it plays one card on a riderless test golem through the real
    queue and landing rules, so a kid sees a new card work without a round. Without it, every edit
    costs a full round for both kids and a deal that may not even contain the card.
  - **Later:** `skyd`, `skade {antal:1}`, `vind`, `byt {fra:"…",til:"…"}`, `tilfaeldig`, `koer`.
- **The deck comes from the heads.**
  - At the end of the lobby the engine raises one setup moment, in which every `robo:kort` head adds its
    copies. That is order-independent.
  - It then prints `Bunken: +1 ×5, H ×4, U ×1`, refuses duplicates (`Kortet U findes to gange!`), and
    refuses an empty deck.
  - A card cannot be in the deck without its rule, so Arcade's `KORT? XX` problem cannot happen.
  - Names are strings, so `Hø` works.
- **Tier 2 is the same lines, in the same order, in a file.**
  - A file has no block to stand on, so tile heads name their block:
    `robo:felt_blok {blok:"magma_block"}`. This must be a separate name, because a macro function cannot
    be called without arguments.
  - A file has no Conditional mode. So a line that is not a `robo:` verb must be anchored on
    `@e[tag=robot]`, or it runs every tick.
  - **The next rungs:** their own functions, scores, macros, and pitching a new primitive to the adults.
- **One file per tier-2 kid, each its own optional tag entry,** e.g.
  `{"values":[{"id":"kort:asger","required":false},{"id":"kort:freja","required":false}]}`.
  - A file that fails to parse is simply absent. As an optional entry it takes nothing else down.
  - As a plain (required) entry it would empty the whole tag, across every pack.
  - Parse errors go **only to the log**. So each file's first line is `function robo:fil {navn:"freja"}`.
    After every `/reload` the engine prints `Regler indlæst: asger, freja`, and a missing name means
    "your file has an error". Spyglass in VS Code shows where.
  - Kids' functions never go in `#minecraft:tick` or `#minecraft:load`, which are merged across every pack.
- **LAN permissions.**
  - A guest with "Allow Commands" gets owner level 4: everything, including `/unpublish`. There is no
    level 2 on LAN.
  - So **build sessions:** guests' commands ON. **Play and tournaments:** OFF.
  - In 26.2 the host's own commands come only from Pause → World Options → Allow Commands, not from the
    LAN screen.
- **The design test lives on the sign.** The front says "Hvad gør den?", the back "Hvad ændrer den?". A
  rule is done when both are filled in.

**The whole cheat-sheet:**
```
KORT   [Gentag · Altid aktive]           function robo:kort {navn:"U",antal:1}
       [Kæde · Altid aktive]             function robo:venstre
       [Kæde · Altid aktive]             function robo:venstre

FELT   (læg blokken oven på den første kommandoblok, vendt som på banen)
       [Gentag · Altid aktive]           function robo:felt
       [Kæde · Altid aktive]             function robo:doe

ROBOTTEN er altid @e[tag=robot]. DIG er @a[tag=spiller]. Aldrig @p eller @s.
Alt med ~ starter med:  execute at @e[tag=robot] run   (fx  ... run setblock ^ ^-1 ^1 magma_block)
robo:-linjer er robottens plan og sker bagefter, en ad gangen. Alt andet sker med det samme.
Skriv  function robo:  og tryk Tab.      Prøv et kort:  function robo:proev {navn:"V"}
Kopier en regel: åbn blokken, Ctrl+A, Ctrl+C, Esc. I den tomme blok: Ctrl+V.
Gik det galt? Åbn blokken og læs "tidligere udtryk" nederst.
```
Print a keyboard strip with `{ } [ ] @ ~ ^ "` (AltGr and dead keys on a Danish keyboard) on the sheet.

## 5. Engine (adults)

**State.**
- **Global scores** (objective `rr`, fake players): `#fase`, `#reg`, `#saede`, `#nu` (game time),
  deadlines, `#budget`, `#stille`, `#svar`, chest counters, and the board's origin and size.
- **The seat is the truth; the golem is a body.** Chests, the ready flag, the table deadline `#frist`
  (0 = hourglass not turned) and the card lists live on fake players `#s1..#s4` and in storage. The
  golem carries only `rr.seat`, `rr.col`, `rr.row`, `rr.face` and its `Health`. So `/kill @e`, which
  bypasses Invulnerable and which a kid *will* type, costs a body, not a game: a seat whose golem is
  missing or at Health 0 is treated as `doe` and re-summoned from seat state. Every golem is stamped
  with the game id `#spil`, and a golem from another game (one that came back inside a player's save)
  is removed on sight. The **recorded tile** (`rr.col/row`, written at the *start* of a glide) is the
  only answer to "where is this robot", for pushes, respawn and joining.
- **On the player:** `rr.seat` (survives a relog) and `rr.klik`.
- **Storage `motor:s`:** `deck`; `p1`..`p4` = `{bunke, kast, haand, prog, …}`; the action queue `q` and
  its intake `q_ny`; and the current moment.
- Per-seat work copies `p$(s)` to a scratch slot and back, so macros are only needed for list indices.

**Randomness.**
- **Never shuffle.** A random-index draw is a shuffle:
  `execute store result score #r rr run random value 0..65535 motor:kort`, then `%= n`.
- **One named sequence per purpose:** `motor:kort` for dealing, and `motor:tilfaeldig` for the random card
  and for kids' rules.
- Kid code never draws from `motor:kort`.
- Tests start with `random reset motor:kort <seed> false`, which is deterministic on every machine.

**Return discipline.** Every `robo:` verb ends in `return 1`. Heads end in `return 1` or `return fail`.
Nothing relies on `return 0` or on having no `return`.

**Moments: only the engine raises them, one per tick, and each is about one robot.** `motor:tick` is a
`#minecraft:tick` function, so it runs before every repeating command block in the same tick. In order,
it:
1. **retires** last tick's moment and every `robot` tag;
2. **takes in** the actions the rules have asked for since then. **`q` is a stack:** `q_ny` is
   *prepended* in its own order, so a landing's reactions run before the rest of the card. Otherwise
   `+2` over lava walks off the lava, because `doe` queues behind the second `frem`;
3. **catches native moves**, only on the tick after a moment (kid code runs in no other tick, and no
   glide is in flight then). If the robot that moment was about is off its recorded tile, it is snapped
   to the tile centre, `rr.col/row` are rewritten and its landing goes to the front of `q` (Arcade
   `checkLanded`, [custom.ts:1379](custom.ts#L1379)). Off the board or inside a wall counts as `doe`;
   an occupied tile steps aside, as on respawn;
4. **re-mounts** anyone who sneaked off, then **re-sends actionbars**;
5. **runs the phase machine,** which may play one queued action and publish at most one moment (card,
   landing, step or setup) for one robot;
6. **runs tier 2:** `function #robo:regler`, then clears every `robot` tag again.

Then the world ticks, and every slot sees the same moment exactly once. Verbs never act or raise
anything themselves; they only append to `q_ny`. One consequence for tier 2, which is documented: a
condition after `robo:frem` in the same file sees the robot where it was. Conditions belong in tile rules.

**One card, beat by beat:**
1. Focus: 10 ticks, with the bossbar in the seat's colour, **the acting golem glowing** until it
   settles, a seat-pitched `note_block.pling` at the golem, and the card name in its bubble. Then the
   Arcade A-gate, **kept**: the active rider right-clicks their glowing running card to say *Kør!*, or
   60 ticks pass; a solo game skips it.
2. The card moment.
3. The queue plays one action per beat (a step is 5 ticks plus a 3-tick visual settle, a turn about 3).
   Each arrival publishes that robot's landing, which may queue more actions.
4. **Settled** when the queue is empty and nothing new has arrived for 2 ticks.
5. 10 ticks, then the bubble comes down, then 10 more ticks.
6. `checkEnd`, then the next seat.

**Guards:**
- A shared landing budget of **24** per card (the value in [custom.ts:112](custom.ts#L112)), then `loop?`.
- A card deadline of 300 ticks.
- At most 48 actions.
- Every wait has a deadline **except the lobby**.

**Rules carried over from the Arcade engine** (the traps in the Architecture section of `CLAUDE.md`):

*Keep:*
- **Setup is order-independent:** the deck, the chest count and the start pads are read at the end of the
  lobby.
- **Every wait has a deadline except the lobby.**
- **A phase ends only when every window has shut.**
- **Undo works until your own clock runs out.**
- **An unturned hourglass has deadline 0:** the `windowShut` trap, [custom.ts:2091](custom.ts#L2091).
- **The 20 s hourglass is turned by the first commit** ([custom.ts:1799](custom.ts#L1799)), with a 45 s
  idle backstop. On timeout the program is filled at random, and only robots it filled hear
  `Tiden er gået!`.
- **Never write 0 health.**
- **Death:**
  - It skips the rest of your registers and clears only your queue entries.
  - Respawn is deferred to the next tick, at the **nearest free** start pad, stepping aside from an
    occupant and facing the middle ([custom.ts:1143](custom.ts#L1143)).
- **Pushing:**
  - The push chain is bounded by 4.
  - Check "off the board" before "wall".
  - After a shove, ask the board whether the tile is free, not the step's result.
- **Ending:**
  - `win` raises a flag, and `checkEnd` ends the game between cards ([custom.ts:2263](custom.ts#L2263)).
  - A tie is `Uafgjort!`.
  - Keep the `chestsTotal` guard.

*Drop:*
- The two-screen machinery.
- `closeProgram`/`outOfTime`, because every window is simultaneous here.
- The re-entrant `fireLanded`. The queue replaces recursion; only the budget survives.
- Elimination.

*Later (post-MVP), decided now:*
- **The board turn animates cosmetically** (particles, sound) and never swaps machine tiles, so Arcade's
  "machines are asleep when you ask" trap cannot occur.
- Positions are snapshotted once per step, and steps nobody stands on are skipped
  ([custom.ts:1404](custom.ts#L1404), [custom.ts:1524](custom.ts#L1524)).
- Jokers replace cards and are never discarded.

**Lobby and round control** live in `spil:`, not `robo:`, so they are never one Tab away inside a
slot, and each starts with `execute unless entity @s[type=player] run return fail`.
- `/function spil:start` snapshots the board (`clone` of the floor and robot layers into the forceloaded
  engine room; a taken treasure would otherwise stay `raw_gold_block` and the next game would have no
  ending), gives every online player a *Deltag* item and the host a *Start* item, and bumps `#spil`.
- Joining summons your golem on the lowest-numbered free start pad and seats you on it.
- The lobby waits for Start, forever. At its end the engine lints the slots: felt heads whose block
  matches no board tile, duplicate tiles, heads that did not register, and prints `Bunken: …`,
  `Felter: N regler`.
- `/function spil:stop` ends any game: restores the board, clears queues, kills golems and displays,
  and dismounts everyone into creative with the camera reset. The normal ending calls it too, after
  ~200 ticks of title and fireworks, so the next game is one right-click away. The board generator is
  `motor:bane/lite|master` and refuses to run twice without `{bekraeft:"SLET ALT"}`.

**World settings the engine owns.** They are set in `load`, which must be idempotent: a tier-2 kid's
`/reload` mid-round must not wipe the game.
- Command blocks: `command_blocks_work true`, `command_block_output false` (otherwise every head floods
  ops' chat and the log), `send_command_feedback true`.
- No damage: `pvp false`, and `fall_damage`/`fire_damage`/`drowning_damage`/`freeze_damage false`.
- A still world: `keep_inventory true`, `spawn_mobs false`, `advance_time false`,
  `advance_weather false`, `mob_griefing false`, `random_tick_speed 0` (unwaxed copper and dirt would
  otherwise drift out of match with the rule heads), `fire_spread_radius_around_player 0`. Plus a
  damage-type tag file that lists `in_wall` under drowning, so a rider whose head ends up in a block
  takes nothing.
- `forceload add` for the board and the engine room.
- Adventure mode during play.

## 6. Repo, versions, home

```
robo-rally-minecraft/          new sibling repo; master = finished, lite = starting point
  CLAUDE.md
  robo/                        ENGINE pack, identical on both branches
    pack.mcmeta                min_format 107, max_format 107 until 26.3 is smoke-tested
    data/robo/function/        the kid API only (Tab-complete = the toolbox)
    data/motor/function/       everything else
    data/robo/tags/function/regler.json      empty hook
    data/minecraft/tags/function/{load,tick}.json
  kort/                        KIDS' pack: the only thing that differs between branches
    data/kort/function/byg.mcfunction        generated board + pre-built slots
    data/kort/function/<kid>.mcfunction      one tier-2 file per kid (lite: one example)
    data/robo/tags/function/regler.json      one {"id":...,"required":false} per file
  tools/gen-bane.js            ASCII map -> kort:byg
  tools/install.ps1            junction the packs into a dev world (live /reload)
  tools/export.ps1             zip a world with REAL copies of both packs (junctions don't travel)
  tools/test/run.ps1           headless smoke test
```

- **Pin 26.2** on every laptop (launcher → Installations → release 26.2).
  - LAN needs identical versions.
  - 26.3 is due this month: pre-releases from 1 September, pack format 119, and `/publish` loses its
    gamemode argument.
  - Run the smoke test on 26.3 before widening `max_format`.
- **Java 25.** The 26.x launcher bundles it, but the headless server needs a JDK 25, and this PC has 21.
- **LAN host setup in 26.2:**
  1. Pause → Open to LAN.
  2. Set Network to LAN.
  3. Under "Settings for Other Players", set Game Mode and Allow Commands.
  4. The host's own commands come from World Options.
- **Home play.** Online play without a server was in the 26.2 snapshots but was reverted before release.
  So home play means one of:
  - LAN at home;
  - the developer's home server hosting a tournament world;
  - Realms.

  Kids without Java at home get the Arcade share link. Say so rather than promise more.

## 7. Milestones: the full plan, MVP first

0. **Spike** (one evening, throwaway world). Only what the source could not settle:
   - how the glide feels, and the ~150 ms client lag;
   - whether the turn reads well with the nudge;
   - how the hearts look in the food-bar slot;
   - the facing arrow's readability on 1×1 with golems and riders side by side;
   - how often the mount hint still flashes once the actionbar is re-sent after `/ride`;
   - the tick cost of about 30 macro heads (`/tick query`);
   - LAN guests editing slots on the real club network;
   - a logout and rejoin mid-card.
1. **The robot:**
   - the 1×1 grid, golem, riding and re-mounting, facing arrow and `motor:flyt`;
   - turns, walls, off the board, the push chain, and native-move detection;
   - the parse gate and a test harness skeleton.
2. **Moments + kid surface:**
   - the tick lifecycle, with the queue, settling, the budget and the deadlines;
   - the heads `kort` and `felt`, and the MVP verbs with return discipline;
   - the deck from heads (setup moment, printout, duplicates);
   - `doe` with deferred respawn, and treasure, the ending and the tie;
   - tier-2 files with the `Regler indlæst` report;
   - `gen-bane.js`, and the `lite` world with its slots.
3. **The round, without UI:**
   - the lobby, and dealing (pile + discard per seat);
   - `motor:vaelg {s,i}`, the single commit entry point, which a future RFID/RCON bridge also uses;
   - the hourglass, backstop and timeout, then registers × seats;
   - a scripted two-robot round passes in the tests.
4. **Programming UI:**
   - the hotbar as a view, clicks and debounce, glint and take-back, and both graces;
   - the actionbar and bossbars, adventure mode and camera distance;
   - two laptops over LAN.

   **This is the MVP: what the first Minecraft session needs.**
5. **Board turn and weapons:**
   - `robo:trin` heads, and steps with cosmetic animation and skipping;
   - `skyd`, `skade`, jokers, `byt` and `vind`;
   - the `master` world with belts and lasers.
6. **Polish and ship:**
   - card sprites, grey spent cards, the locator bar, glowing, and 3-4 players;
   - the Danish cheat-sheet and the new repo's `CLAUDE.md`;
   - export, and the 26.3 check.

**Go/no-go, one week before session 4:** two club laptops play a full round, and the creative volunteer
builds a `V` card from the cheat-sheet alone in under five minutes. If not, session 4 is an Arcade
tournament plus paper design.

## 8. The first Minecraft session (90 min)

| Min | |
|---|---|
| 0-5 | Paper pitch of new tiles (the ritual). |
| 5-15 | One `master` round on the projector; walk along the slot wall: "the head is the hat, the chain is the blocks inside it". |
| 15-30 | Pairs play a `lite` round over LAN. |
| 30-45 | Build a `V` card: copy the `H` slot and change two words. The deck printout proves it worked. |
| 45-55 | Build `U`: two `venstre` in one chain. Ask: "what if a third line were `frem`?" |
| 55-70 | Your own tile: a block on the board and on a free head, pick a verb, fill in the sign. |
| 70-85 | Swap boards; the builders explain their signs. |
| 85-90 | "What did your tile change about the way to the treasure?" New ideas go on backlog cards. |

Session 5: port your Arcade board block for block; tier-2 files for the older kids; a tournament.

## 9. Verification

- **Parse gate** (`tools/test/run.ps1`, the counterpart of `tools/check-blocks.js`):
  1. Start a 26.2 dedicated server `nogui` with RCON and **`pause-when-empty-seconds=0`**. Otherwise the
     server stops ticking 60 s after the last player leaves, and a test run has no players.
  2. Link the packs in (junctions), then run `reload`.
  3. Fail on `Failed to load function`, `Couldn't load tag`, `Unknown function` or any parse error in
     `logs/latest.log`.
- **Tests in the pack.** `motor:test/tick` runs about 10 cases on a forceloaded test board.
  - Robots have no riders, and each case starts with `random reset motor:kort 42 false`.
  - Cases assert through scores. The RCON driver polls `#test_faerdig` (60 s cap, `tick sprint`) and
    exits non-zero on a failure.
  - **The cases are the traps:**
    - off the board is checked before a wall;
    - a shove into lava frees the tile;
    - `+2` over lava stops;
    - a belt ping-pong runs out of budget;
    - a dead robot skips its registers;
    - respawn steps aside;
    - the treasure ending, and the tie;
    - an unturned hourglass doesn't end the phase;
    - the phase waits for every window;
    - a moment is seen exactly once.
- **By hand, per milestone:** two laptops over LAN play a full round.
  - Both kids look around freely the whole time, and no robot turns because somebody moved a mouse.
  - The same card built as a slot and as file lines behaves the same.

## Appendix A: what the 26.2 source confirmed

Each claim was checked by one investigator against decompiled 26.2 source, and parts against the release
jar. A skeptic then tried to refute the verdict.

| Claim | Verdict | What the design does about it |
|---|---|---|
| Teleporting a ridden vehicle keeps the rider | confirmed | Move the golem only, never the player; no rotation argument; 0.1-0.25 block/tick glides; ~3-tick client lag. |
| Chain command blocks: order and Conditional | confirmed | A chain runs whole and never interleaves. Conditional is an AND-chain on the block directly behind, so an empty or failing block stops the rest. |
| Function run from a command block: context and success | partly | Runs at the block's centre with no entity (`~ ~1 ~` = block above). `return fail` = no, `return 1` = yes, **`return 0` = yes**, no return = no. |
| `execute if blocks … all` | confirmed | Exact state match, including block entities; plain air only; integer coordinates in macros; errors on unloaded/out-of-world coordinates. |
| Macro calls | partly | Missing arguments fail visibly, but only if the call is not under `execute` and `TrackOutput` is on. 8-entry cache per function: keep macro lines minimal. |
| LAN guests' permissions | confirmed | Allow Commands gives guests level 4 (everything). In 26.2 the host's own commands come from World Options. |
| Mount "Press Shift to Dismount" overlay | confirmed | 60 ticks, same slot as the actionbar; re-send the program after every `/ride`, in the same tick. |
| Carrot-on-a-stick right-click | partly | Counts on any target. The empty-hand off-hand pass interacts with the targeted golem, so golems hold nothing. |
| Golem hearts in the food-bar slot | confirmed | Direct vehicle only; `max_health` ≥ 2; write max first; Health 0 kills after 20 ticks. |
| `random reset` determinism | confirmed | `random reset <seq> <seed> false`; one sequence per purpose. |
| Function tag `required:false` | confirmed | One optional entry per kid file. Parse errors are in the log only, so the engine prints which files loaded. |
| `/rotate` on a NoAI golem | partly | Sets yaw and head, not the body (~1.2 s to follow); a 0.01-block tp snaps it; use absolute yaw. |
| Sprites in actionbar, title and bossbar | confirmed | Always `atlas:"minecraft:items"`; don't colour an icon's parent. |
| `setblock`-built command blocks | confirmed | `auto:1b` on every block, chain blocks included; `TrackOutput:1b` on kids' slots; single-quoted SNBT for commands with quotes. |
| `forceload` ticking | confirmed | Forceload the board and engine room themselves; spawn chunks are gone; the headless server needs `pause-when-empty-seconds=0`. |

## Appendix B: the five-lens review, confirmed findings folded in above

Five reviewers (Minecraft technical, engine, kid UX, game feel, logistics) raised ~100 findings, 82
after merging; skeptics upheld 56 and refuted 3. The big ones are already in the text (heads clear-then-tag,
Unconditional chains, one anchoring rule for every line, the queue as a stack, seat state off the golem,
`kill` = `doe`, board snapshot and restore, `robo:proev`, lobby-end lint, `spil:` for round control).
The rest, adopted but not yet worked into the sections:
- **Tier 2 = the same chain lines under a file head.** The only difference is that a file head names
  its block (`robo:felt_blok {blok:"magma_block"}`, bare block id matches any facing). One file per
  tier-2 kid, each an optional tag entry, and a tier-2 kid hosts their own board.
- **Hearts:** `Health = hits`, `max_health = max(2, start hits)`, so Arcade's "2 health = 1 heart" stays
  true. Seat colours red / blue / yellow / green (no orange bossbar exists).
- **Bubble:** a `text_display` at about `y0+4`, above the rider's name tag; the rider gets the same text
  as a subtitle, because they cannot see their own bubble. `sig` bubbles live ≥ 40 ticks.
- **Displays** get `teleport_duration:3` and are teleported in the same `motor:flyt` call as the golem.
- **Death** drops every queue entry and pending landing about that robot; respawn publishes no landing.
  Between death and respawn the robot is untouchable; afterwards it can be pushed.
- **Guards** (24 landings, 300 ticks, 48 actions) are all per card and, later, per robot per board step.
  Whichever fires: drop the queue, finish the glide onto the recorded tile, say `loop?`, carry on.
- **Board step** (post-MVP) is played like a card, once per robot in seat order, against a snapshot of
  every robot's tile taken at the start of the step; the head compares a cloned probe of that floor.
- **Hourglass:** one table deadline `#frist`; the 45 s idle backstop *turns* the hourglass rather than
  ending the phase.
- **Hotbar** is re-rendered every tick from a container in the engine room with six fixed `item replace`
  lines (no macros); card items on the ground are killed every tick; the off-hand card goes back.
- **Duplicate cards** are refused with both locations shown (particles on both heads, or file names).
  Duplicate *tiles* warn and play on. `antal` clamps to 0-20. An empty felt head means "the hole" and
  is printed as `Hul-regler: N` so a forgotten block is visible.
- **Misspelt function names** never fail at `/reload`; `run.ps1` gets a ~30-line resolver that checks
  every `function ns:path` literal, including those inside `kort:byg`.
- **Wall** = any block at `y0+1` not in `#minecraft:air`. **Off the board** is decided by arithmetic on
  `rr.col/row`, never by a block test, and means glide over the edge, sink, `doe`.
- **Engine updates:** `install.ps1 -Update` replaces `datapacks/robo` in every world and never touches
  `kort/`; `load` prints its version. `robo:` names and argument keys are frozen once a kid has used
  them (the counterpart of "never change a blockId"), so settle the verb names before session 4.
- **Missing:** `kort/pack.mcmeta`; `/ride` takes single entities (four literal lines per seat);
  `/say` is invisible to chat-restricted child accounts, so the engine uses `tellraw` only.
- Refuted, and not adopted: a registry of `trin` blocks for `stepBusy` (the queue already answers it),
  reordering milestones, and an origin field on queue entries for jokers.

## Appendix C: unverified findings - decisions still to take

The skeptic pass on these never ran. They come from the logistics and game-feel reviewers and read as
plausible; each needs a decision or a checklist item before session 4.
- **Venue network.** LAN discovery is UDP multicast; school Wi-Fi commonly blocks device-to-device
  traffic; and the host verifies every guest login online, so an offline travel router is not enough.
  Fix proposed: a travel router *with* an uplink, fixed IPs for hosts, saved servers `Bord 1..3`.
- **Child accounts** cannot join multiplayer until a parent sets an Xbox privacy option, which can take
  a day. Hosting works without it. Send a parent letter with a deadline; pair unready kids as hosts.
- **Windows Firewall** on managed laptops blocks hosting unless rules are added with admin rights.
- **26.3** will be "Latest release" before session 4 and upgrades a world in place on one click. Give
  the 26.2 installation its own game directory and remove the "Latest release" tile on club laptops.
- **Laptop specs:** the 2026 Java minimum is 8 GB + discrete GPU or 12 GB integrated; the host also
  runs the server. Inventory the laptops; the three strongest host.
- **Go/no-go** should be a dress rehearsal at the venue with six laptops and real child accounts, not
  two laptops at home. **Solo play against a riderless robot** becomes an MVP test and the in-session
  fallback if LAN is not up in five minutes.
- **Setup time:** first launch downloads hundreds of MB per laptop; adults arrive 30 min early.
- **Backups:** an end-of-session ritual zips every world to a USB stick; kids' work otherwise lives on
  one host laptop that may be reimaged.
- **Host sleep / Save and Quit** ends the board for everyone: power plans, chargers, fixed ports.
- **Junctions:** deleting a junctioned dev world from inside Minecraft deletes the repo's pack files.
- **Home play** as written contradicts the pin (Realms runs the latest release) and the tournament
  import (only lite/master have build functions): export kids' boards with a structure block instead.
- **The session-4 demo needs `master`**, which is milestone 5. Demo on `lite`, or pull belts forward.
- **Topology question:** three adult-run dedicated servers on one laptop would remove the firewall,
  sleep, backup and account issues, and are the only thing RCON (the micro:bit bridge) can reach; the
  cost is that every kid becomes a guest and needs the multiplayer flag.
- **Game feel:** a 30-tick death beat with smoke and a title; a cue table (sounds, particles, short
  titles) for card, push, wall bump, treasure, end; programs shown above each robot during execution so
  collisions read as anticipated rather than random; the starting seat rotates each round so P1 does not
  win every close race; see-through walls (`waxed_copper_grate`) because a 1-block wall hides the tiles
  behind it from a seated rider; an 11-block clear zone around the board so the F5 camera does not zoom
  in and out against the engine room; a specified end-of-game sequence back into the lobby.
