import { Flag } from "@orchestra/core/flag/flag"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.ORCHESTRA_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

// Only prod builds embed Orchestra's update feed (electron-builder.config.ts). ORCHESTRA_DISABLE_AUTOUPDATE turns
// every update check off, the menu entry included.
export const UPDATER_ENABLED = CHANNEL === "prod" && !Flag.ORCHESTRA_DISABLE_AUTOUPDATE

// Set by .github/workflows/release-desktop.yml for a macOS build it signed. Squirrel.Mac cannot install an update into
// an unsigned app, so every other macOS build only announces updates.
export const MAC_SIGNED = import.meta.env.ORCHESTRA_MAC_SIGNED === "true"
