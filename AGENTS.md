# Agent guidelines

## Commits

- Never add an AI assistant (Claude or any other) as a co-author on commits. No `Co-Authored-By` trailers for agents.
- Use semantic commit messages (Conventional Commits): `feat:`, `fix:`, `refactor:`, `style:`, `docs:`, `chore:`, `perf:`, `test:`, `build:`, `ci:`.
- Commit often: one logical change per commit, not one large commit at the end.

## Stack

- Vite + React 19 + TypeScript. State lives in a zustand store (`src/store.tsx`): settings, the current round, and actions such as `pick`, `start` and `goMenu`.
- The map (`src/map.ts`) is imperative D3, kept outside React on purpose: zoom and pan write to the DOM every frame. `components/Play.tsx` creates it, registers it with the store, and routes its events into store actions.
- Game rules (`src/game.ts`), score sharing and challenge links (`src/share.ts`), country data (`src/data.ts`), regions (`src/regions.ts`) and island zones (`src/zones.ts`) are framework-free.
- Pushes to `master` deploy to Netlify (mapped.keijay.me; flags.keijay.me redirects there) via a build hook.
