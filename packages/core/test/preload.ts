import path from "path"

process.env.OPENCODE_DB = ":memory:"
// Tests never read the user's release database. This preload leaves XDG at
// the real data dir, so inheritance must be off even for file databases.
process.env.OPENCODE_INHERIT_CREDENTIALS = "0"
process.env.OPENCODE_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.OPENCODE_DISABLE_MODELS_FETCH = "true"
