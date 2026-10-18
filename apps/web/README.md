# Web entry

Browser bootstrap and Vite distribution for Orchestra. The shared UI library and platform contracts live in `@orchestra/app`, at `packages/app-shell`; Desktop consumes that same library.

- Development: `bun --cwd apps/web dev` from the repository root.
- Build: `bun --cwd apps/web build`.
- Typecheck: `bun typecheck` in this directory.
- UI unit/browser/E2E harnesses remain with `packages/app-shell`.

Public assets have one canonical owner in `packages/app-shell/public`. Web and Desktop both consume them without copying source trees.
