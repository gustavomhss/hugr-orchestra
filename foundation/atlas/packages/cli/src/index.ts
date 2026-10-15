// @atlas/cli — barrel
//
// The `atlas` entrypoint (constitution CLI-1/2/3/4): argv → wired handler → rendered verdict.

export { main } from "./cli.js"
export { renderVerdict } from "./render.js"
export type { CliVerdict } from "./render.js"
export { runMine, MINED_SCOPE, MINED_TIER } from "./mine.js"
// `MINED_TIER` rides out beside `MINED_SCOPE` for the SAME reason (#199 fix-round, tier-mirror
// staleness finding): every consumer that needs to know what tier a mined fact carries imports
// THIS constant rather than retyping `'T2'` — a second copy is exactly the drift class the
// mirror-pin test (`reverify-store-mined-tier-pin.test.ts`, `@atlas/adapter-io`) exists to catch
// where importing is not possible (adapter-io cannot depend on cli — ARCH layering).
// CLI-5 — the `atlas promote` curator door (KNOW-8). `MINED_SCOPE` rides out beside it because a caller that
// stages or promotes has to name the SAME governance scope the mine driver stamps, and a second copy of that
// string is exactly the drift the constant exists to prevent.
export { runPromote, promoteVerdict } from "./promote.js"
