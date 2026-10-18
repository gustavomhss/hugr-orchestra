type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.ORCHESTRA_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

// Orchestra is a fork separated from upstream opencode and publishes no releases of its own, so any
// update feed would install upstream OpenCode over Orchestra. Re-enable only with Orchestra's own feed.
export const UPDATER_ENABLED = false
