# Architecture

A pixel-art single-player colony sim in the lineage of RimWorld / Odd Realm, with a multi-generational time-and-narrative hook as our unique identity.

## Design Pillars

1. **Legacy over individuals.** Settlers age, die, reproduce. The colony outlives any one person. Buildings, traditions, and chronicle entries persist across generations.
2. **Emergent simulation.** No scripted events. The story comes out of systems colliding: needs, weather, scarcity, relationships, time.
3. **Readable at a glance.** Pixel art, top-down, Y-sorted. The player should be able to glance at a paused frame and understand what every settler is doing and why.
4. **Player as steward, not god.** No omniscient control. No pause-to-queue-everything micromanagement. Sim runs, the player nudges.

## Tech Stack

- **Engine:** Phaser 4.0.0 (with Phaser 3.80.x as fallback if 4 hits a wall on rendering/input)
- **Build:** Vite 6, TypeScript 5.7 (strict mode)
- **World gen:** `simplex-noise` (seeded)
- **Pathfinding:** `ngraph.path` (A* on a walkability grid)
- **ECS:** hand-rolled, ~150 lines (see `src/ecs/`)
- **Save format:** JSON v1; migrate to msgpackr only if profiling demands it
- **Audio:** Phaser's built-in sound
- **No UI framework.** Plain DOM HUD; Phaser scene graph for in-world UI

## High-Level Architecture

```
+-------------------------+        +-----------------------+
|       Phaser Scene      |        |   Browser DOM (HUD)   |
|  (World — persistent)   |<-----> |  Top bar, panels,     |
|                         | events |  build menu, minimap  |
+-------------------------+        +-----------------------+
            |
            v
+---------------------------------------------------------+
|                  Simulation Core (pure TS)              |
|                                                         |
|  +-----------+   +-----------+   +-------------------+  |
|  |   World   |   |   ECS     |   |   Job Queue       |  |
|  | (chunks,  |<->|  (ents,   |<->|   (priority,      |  |
|  |  tiles)   |   |  comps,   |   |    work-givers)   |  |
|  |           |   |  systems) |   |                   |  |
|  +-----------+   +-----------+   +-------------------+  |
|        ^               ^                 ^             |
|        |               |                 |             |
|        +-------+  Pathfinding  +----------+             |
|                |  (ngraph.path) |                       |
|                +----------------+                       |
+---------------------------------------------------------+
            |                    |
            v                    v
+--------------------+  +------------------+
|   Save / Load      |  |   Chronicle      |
|   (JSON, versioned)|  |  (event log)     |
+--------------------+  +------------------+
```

Key principle: **the simulation core is pure TypeScript and has no Phaser imports.** Phaser is only the renderer. This keeps the simulation testable, saveable, and decoupled from the engine.

## Core Systems (build order)

### 1. Tile Map & Chunks

- Tile size: **16x16** pixels (classic pixel art)
- World size: variable, default **256x256** tiles (~4M tiles at 1x1 per chunk)
- Chunk size: **16x16** tiles (256 tiles per chunk)
- Chunk key: `"x,y"` in chunk coordinates
- World = `Map<ChunkKey, Chunk>` + helpers (get tile, set tile, mark dirty)
- Chunk = `{ tiles: Uint16Array, structures: Uint8Array, items: ItemId[][], version: number }`
- Tile encoding: small integer enum (dirt, grass, stone, water, sand, tree, etc.) in a `Uint16Array` for memory efficiency
- Dirty tracking: tiles mark chunks dirty on write; render system reads dirty flags and uploads to a Phaser tilemap layer

### 2. ECS (Entity Component System)

Hand-rolled. Components are plain interfaces; entities are integer IDs; systems are functions that read components and write back. The world stores `Map<ComponentType, Map<EntityId, Component>>`.

Why hand-roll: for a game this size, bitecs is fast but its API is rigid. A 150-line version is easier to debug, and the perf is fine until proven otherwise.

**Core components** (start with these, add as needed):
- `Position` (chunk-local + world coords, for fast lookup)
- `Render` (sprite key, frame, scale, alpha, tint)
- `Name` (display name)
- `Stats` (HP, max HP)
- `Needs` (hunger, rest, mood, recreation, social)
- `Skills` (mining, construction, growing, cooking, crafting, hauling, social)
- `Inventory` (item ids + stack counts)
- `AI` (current job, job state, path)
- `Life` (birthTime, deathTime, ageStage, parents, generation, lineageId, traits)
- `Relationship` (partnerId, family ties, friends, rivals)
- `Path` (cached path; dirty on world change)

**Systems** (run in this order each tick):
1. `timeSystem` — advance clock, age settlers, handle deaths, trigger pregnancies
2. `needsSystem` — decay needs; emit alerts when critical
3. `aiSystem` — for each settler: evaluate needs, pick job, claim from queue
4. `pathSystem` — assign paths to AI-requesting settlers
5. `jobSystem` — advance job state (in progress, complete, cancel)
6. `movementSystem` — step settlers along their path
7. `interactionSystem` — pickup, drop, build, eat, sleep
8. `renderSyncSystem` — copy ECS state to Phaser display list (only dirty entities)
9. `chronicleSystem` — emit narrative events (births, deaths, marriages, achievements)

### 3. Time & Tick

- **Fixed timestep:** 60 sim ticks per real second
- **Sim speed:** pause / 1x / 2x / 3x / 4x. Speed only changes how many sim ticks run per render frame, not the tick duration.
- **Decoupled from render.** Render uses Phaser's `requestAnimationFrame`; sim uses a fixed accumulator.
- **Calendar:**
  - 1 day = 24 in-game hours
  - 1 season = 30 days
  - 1 year = 4 seasons = 120 days
- **Lifespan:** settlers live roughly 60 in-game years (configurable). Age stages: infant (0-2y), child (2-12y), adult (12-50y), elder (50y+). Death by old age is a soft probability curve, not a hard cutoff.
- **Pregnancy:** ~9 in-game months gestation. Pairing needs: both adults, in relationship, not currently pregnant, dwelling in same structure.

### 4. Pathfinding

- `ngraph.path` over a walkability grid
- Walkability grid is a derived `Uint8Array` of the same dimensions as the world, rebuilt incrementally on tile change
- Repath triggers: tile block changed, structure placed/removed, door opened/closed
- Path cache per settler; invalidated on world change in their path's bounding box
- Path cost = 1 per step; diagonal allowed but no corner-cutting through walls

### 5. Job System

**Job lifecycle:** `pending` -> `claimed` -> `in_progress` -> `complete` or `cancelled`

**Priority queue:** sorted by `(priority, createdAt)`. Settlers claim the highest-priority job they can perform.

**Work-givers** (one file each in `src/jobs/work-givers/`):
- `mine.ts` — find adjacent rock tiles, mark for mining
- `build.ts` — find blueprints with satisfied materials, build
- `haul.ts` — find items in non-stockpile locations, move to stockpile
- `farm.ts` — find tilled soil, plant/harvest
- `cook.ts` — find raw food + kitchen, cook meal
- `craft.ts` — find workshop + recipe + materials, produce item
- `sleep.ts` — find unowned bed, sleep
- `eat.ts` — find meal in stockpile, consume
- `recreate.ts` — find leisure building, recreate
- `socialize.ts` — find nearby settler, chat

Work-givers run as a low-frequency scan (every N ticks, not every tick) to find pending jobs and insert into the queue.

### 6. Building / Blueprint

- `Building` = definition (id, footprint, required materials, build time, category)
- `Blueprint` = `Building` instance with state `pending -> underConstruction -> complete`
- **Materials** are items in stockpiles within hauling range
- **Construction job** requires materials to be hauled to the build site first, then a builder performs the build
- **Categories:** walls, doors, floors, furniture (bed, table, chair, stove), workshops, stockpiles (zone, not building), farms (zone)

### 7. World Generation

- Seeded: player enters a seed or generates random
- `simplex-noise` for elevation and moisture
- **Biomes** derived from elevation + moisture: ocean, beach, grassland, forest, mountain, desert, snow
- **Rivers** traced from high elevation along moisture gradient
- **Resources** (ore, trees) scattered with noise, biased by biome
- **Starting site** picked by: flat, near water, near trees and stone
- **Settlers** start with 3-5 founder archetypes

### 8. Camera & Rendering

- **Camera** supports zoom (1x to 4x, pixel-snapped at high zoom) and pan (right-click drag, edge scroll, WASD)
- **Tile rendering:** Phaser tilemap layer; static chunks uploaded once, dirty chunks re-uploaded
- **Entity rendering:** Y-sorted container; sprites are Phaser game objects
- **Lighting:** additive overlay computed from sun angle + light sources (torches, windows, room interiors)
- **Selection box:** pointer picks entity by Y at click position
- **Cursor:** tile grid highlight, color-coded by mode (build, mine, zone)

### 9. UI

- **Top HUD** (DOM): date, season, year, sim speed buttons, alerts
- **Bottom panel** (DOM, on settler selected): portrait, needs bars, skills, inventory, relationships
- **Build menu** (DOM, hotkey B): categories, building list, materials preview
- **Minimap** (Phaser or canvas): terrain + entity dots + camera frame
- **Chronicle** (DOM, hotkey L): scrollable event log with filters
- **Zone tool:** drag to define stockpile / farm / room areas

### 10. Save / Load

- **Trigger:** manual save (hotkey F5), auto-save every 5 minutes
- **Format:** versioned JSON. Schema version stored as `"version": 1`
- **Structure:**
  ```json
  {
    "version": 1,
    "world": { "seed": 123, "size": [256,256], "chunks": {...} },
    "time":  { "tick": 98765, "calendar": { "day": 12, "season": 2, "year": 3 } },
    "entities": { "settlers": [...], "items": [...], "buildings": [...] },
    "chronicle": [ ... events ... ]
  }
  ```
- **Migration:** on load, if version < current, run migration functions in order
- **Performance:** save only what changed via a dirty-tracking set; full save as fallback

### 11. Audio

- Ambient: wind, rain, day/night crossfade
- SFX: pickaxe, build complete, eat, sleep, alert, click
- Music: layered tracks, intensity driven by sim state (peaceful vs crisis)

## Unique Hook: Time & Narrative

This is what makes the game *ours*, not RimWorld.

### Generational model

- Founders start as adults with random archetypes (backstory, traits, starting skills)
- Children inherit: average of parents' skill XP (-/+ 20%), 1-2 traits from parents (with mutation chance)
- Each generation is a "chapter" in the chronicle
- Colony metrics per chapter: founded, peak population, died-in-generation, structures built, events survived

### Chronicle (event log)

Append-only log of:
- Births, deaths, marriages, divorces
- Firsts (first building, first death, first harvest, first winter survived)
- Disasters, triumphs, milestones
- Player-journalable: any event can be flagged as important

### Legacy mechanics (later, post-slice)

- **Memorials:** when a settler dies, a tomb is placed. Visiting it gives mood bonus to their family/friends.
- **Founder bonuses:** first-gen settlers gain a "Founder" trait (+10% skill gain, +mood from completed buildings)
- **Colony reputation:** aggregate score of chronicle events. Affects random events and visitor spawns.
- **Traditions:** buildings of type X, built by generation N, give cumulative bonuses ("Hearty Hearth" — well-fed for 10% longer).

## File Layout

```
src/
  main.ts                       # Phaser bootstrap
  game/
    main.ts                     # Phaser config, scene registration
    config/
      game.config.ts            # tile size, world size, sim rates
    world/
      tile.ts                   # TileType enum
      chunk.ts                  # Chunk model
      world.ts                  # World = Map<ChunkKey, Chunk>
      world-gen.ts              # procedural generation
      walkability.ts            # derived grid
    ecs/
      world.ts                  # ECS world container
      components/               # one file per component family
      systems/                  # one file per system
    entities/
      settler.ts                # settler factory
      item.ts                   # item factory
    jobs/
      job.ts                    # Job, JobType, JobState
      job-queue.ts              # priority queue
      work-givers/              # mine.ts, build.ts, haul.ts, ...
    ai/
      settler-ai.ts             # need evaluation
    pathfinding/
      pathfinder.ts             # A* wrapper
    render/
      tilemap-renderer.ts
      entity-renderer.ts
      lighting.ts
      camera-controller.ts
    scenes/
      Boot.ts
      Preloader.ts
      MainMenu.ts
      World.ts                  # persistent simulation scene
      PauseMenu.ts
    ui/
      hud.ts
      bottom-panel.ts
      build-menu.ts
      minimap.ts
      chronicle.ts
    data/
      tile-types.ts             # terrain definitions
      buildings.ts              # building definitions
      recipes.ts                # craft recipes
      settler-archetypes.ts     # backstories, traits
    chronicle/
      log.ts                    # event log
      events.ts                 # event types
    save/
      serializer.ts
      deserializer.ts
      schema-version.ts
      migrations/
    util/
      rng.ts                    # seeded RNG (mulberry32)
      event-bus.ts
      math.ts
```

## Vertical Slice (first playable)

Build in this order. Stop and playtest after each step.

1. **Tick + time + calendar** — a black screen with a counter ticking at 60Hz, a speed slider, day/season/year display
2. **World + chunks + render** — a fixed-size flat world, no features, scrollable, zoomable
3. **World gen** — flat world with simplex noise elevation + biomes, no resources
4. **One settler** — render a settler, no AI, just walks randomly
5. **Settler AI** — settler evaluates hunger, seeks food, eats
6. **Job system + work-givers** — settler can mine a tile, can haul an item
7. **Building** — place a wall, settler hauls materials, builds
8. **Second settler** — basic needs, social interactions
9. **Reproduction + children** — pair up, pregnancy, growth
10. **Chronicle** — log events, basic UI panel
11. **Save/load** — round-trip
12. **First playtest.** Add polish, balance, more content from here.

## Risks & Open Questions

- **Phaser 4 maturity.** Brand new. Have a Phaser 3.80.x branch ready if we hit showstoppers.
- **Performance at scale.** 100+ settlers, full pathfinding grid. Profile after step 6. Cache aggressively.
- **Scope creep.** Resist adding seasons/weather/combat until step 12 is fun.
- **Save size.** JSON is verbose; long sessions may produce multi-MB saves. Watch file size; switch to msgpackr if it becomes a problem.
- **AI quality.** Need-driven priority AI is well-trodden (RimWorld does it) but balance is hard. Iterate from playtests.
- **Chronicle narrative quality.** A log of events isn't a story. We may want light editorialization ("Asha, daughter of Bjorn, was born under a dark winter sky") — generated from event templates, not LLM.

## Non-Goals (v1)

- Multiplayer (architectural notes about server-authoritative state preserved, but not implemented)
- Combat
- Trading with caravans
- Faction / diplomacy
- Modding
- Procedural name generation beyond a basic syllable-list approach
