import path from "node:path"

// Pure candidate identity, safe to bundle for Node: no Bun globals and no import.meta.dir at module load.
// The Node acceptance bundle runs outside packages/desktop, so the runner passes the desktop directory explicitly.
export const desktop = process.env.LEAN_CANDIDATE_DESKTOP ?? path.resolve(import.meta.dirname, "..")
export const appID = "ai.hugr.orchestra.lean.candidate"
export const productName = "HuGR Lean Candidate"
