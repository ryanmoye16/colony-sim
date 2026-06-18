# Colony Sim

A pixel-art colony simulation built with Phaser 4 + TypeScript. Every sprite — settlers, items, tiles, trees — is hand-coded as a character-grid + palette and rendered pixel-by-pixel into a `CanvasTexture`. The world is a single composite canvas blitted each frame.

![screenshot](.playwright-mcp/41-world-overview-final.png)

## Highlights

- **Hand-coded pixel art** — settlers (16×16, 3 walking frames), 3-variant grass tiles, multi-tone trees with trunks, 11 tile types, item sprites. No AI-generated art, no external image files.
- **Hand-rolled ECS** — `Map<string, Map<EntityId, T>>` storage, custom fixed-timestep time system, hand-rolled BFS pathfinding (`ngraph.path` not used).
- **Multi-generational hook** — pairing → pregnancy → birth → aging → death. Settlers pass down traits. Chronicle panel logs every life event (open with `L`).
- **Walking animation** — settlers swap between idle/walk-a/walk-b frames and bob while moving.
- **HUD** — date / tick / sim-speed / zoom controls (1x/2x/3x/4x). Bottom-right minimap with camera viewport rectangle. Bottom-left settler inspector with portrait, hunger/social bars, critical-need warnings.
- **Save/load** — `F5` save, `F9` load. Persists world, time, ECS, chronicle.

## Controls

| Key            | Action                          |
|----------------|---------------------------------|
| WASD / Arrows  | Pan camera                      |
| Mouse edge     | Pan camera                      |
| Wheel          | Zoom                            |
| Space          | Cycle sim speed (0/1/2/3/4x)    |
| Click          | Select settler (opens inspector)|
| ESC            | Pause menu                      |
| L              | Chronicle panel                 |
| F5 / F9        | Save / Load                     |

## Run

```bash
npm install
npm run dev       # http://localhost:8080
npm run build     # production bundle in dist/
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system plan, vertical slice, and multi-generational hook spec.

## Stack

- Phaser 4.0.0
- Vite 6
- TypeScript 5.7 (strict, `noUnusedLocals`)
- simplex-noise (world gen)
- No CSS framework, no UI library — all HUD chrome is plain DOM + CSS

## License

ISC
