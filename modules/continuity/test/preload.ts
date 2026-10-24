import { mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"

// Tests never touch the user's database or data directory: the archive lives under a fresh XDG data home.
process.env.ORCHESTRA_DB = ":memory:"
process.env.XDG_DATA_HOME = mkdtempSync(path.join(os.tmpdir(), "continuity-test-"))
process.env.ORCHESTRA_DISABLE_MODELS_FETCH = "true"
