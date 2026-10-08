import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["ORCHESTRA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["ORCHESTRA_DISABLE_FFF"]

export type OmniSpawner = "off" | "on" | "strict"

// Set by the CLI build per target (packages/orchestra/script/build.ts): false where omni ships no addon yet (D-L9).
// Undefined in dev, tests and the desktop bundle, where the flag alone decides.
declare const OMNI_ENABLED: boolean | undefined

const omniWarned = new Set<string>()

/**
 * ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER has three states, so it has its own parser rather than truthy(), and
 * ORCHESTRA_EXPERIMENTAL does not turn it on. Unset or "0" is off (legacy spawning), "1" is on (omni, delegating
 * unsupported options to legacy), "strict" is omni with no delegation. Anything else is off, with one warning.
 */
export function omniSpawner(value: string | undefined): OmniSpawner {
  if (value === undefined || value === "" || value === "0") return "off"
  if (typeof OMNI_ENABLED !== "undefined" && !OMNI_ENABLED) {
    if (!omniWarned.has("")) {
      omniWarned.add("")
      console.warn("ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER is set, but this build has no hugr-omni for its platform; omni stays off.")
    }
    return "off"
  }
  if (value === "1") return "on"
  if (value === "strict") return "strict"
  if (!omniWarned.has(value)) {
    omniWarned.add(value)
    console.warn(`ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=${JSON.stringify(value)} is not 0, 1 or strict; omni stays off.`)
  }
  return "off"
}

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("ORCHESTRA_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  ORCHESTRA_AUTO_HEAP_SNAPSHOT: truthy("ORCHESTRA_AUTO_HEAP_SNAPSHOT"),
  ORCHESTRA_GIT_BASH_PATH: process.env["ORCHESTRA_GIT_BASH_PATH"],
  ORCHESTRA_CONFIG: process.env["ORCHESTRA_CONFIG"],
  ORCHESTRA_CONFIG_CONTENT: process.env["ORCHESTRA_CONFIG_CONTENT"],
  ORCHESTRA_DISABLE_AUTOUPDATE: truthy("ORCHESTRA_DISABLE_AUTOUPDATE"),
  ORCHESTRA_ALWAYS_NOTIFY_UPDATE: truthy("ORCHESTRA_ALWAYS_NOTIFY_UPDATE"),
  ORCHESTRA_DISABLE_PRUNE: truthy("ORCHESTRA_DISABLE_PRUNE"),
  ORCHESTRA_DISABLE_TERMINAL_TITLE: truthy("ORCHESTRA_DISABLE_TERMINAL_TITLE"),
  ORCHESTRA_SHOW_TTFD: truthy("ORCHESTRA_SHOW_TTFD"),
  ORCHESTRA_DISABLE_AUTOCOMPACT: truthy("ORCHESTRA_DISABLE_AUTOCOMPACT"),
  ORCHESTRA_DISABLE_MODELS_FETCH: truthy("ORCHESTRA_DISABLE_MODELS_FETCH"),
  ORCHESTRA_DISABLE_MOUSE: truthy("ORCHESTRA_DISABLE_MOUSE"),
  ORCHESTRA_FAKE_VCS: process.env["ORCHESTRA_FAKE_VCS"],
  ORCHESTRA_SERVER_PASSWORD: process.env["ORCHESTRA_SERVER_PASSWORD"],
  ORCHESTRA_SERVER_USERNAME: process.env["ORCHESTRA_SERVER_USERNAME"],
  ORCHESTRA_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("ORCHESTRA_DISABLE_FFF"),

  // Experimental
  ORCHESTRA_EXPERIMENTAL_FILEWATCHER: Config.boolean("ORCHESTRA_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  ORCHESTRA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("ORCHESTRA_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  ORCHESTRA_MODELS_URL: process.env["ORCHESTRA_MODELS_URL"],
  ORCHESTRA_MODELS_PATH: process.env["ORCHESTRA_MODELS_PATH"],
  ORCHESTRA_DB: process.env["ORCHESTRA_DB"],

  ORCHESTRA_WORKSPACE_ID: process.env["ORCHESTRA_WORKSPACE_ID"],
  ORCHESTRA_EXPERIMENTAL_WORKSPACES: enabledByExperimental("ORCHESTRA_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get ORCHESTRA_DISABLE_PROJECT_CONFIG() {
    return truthy("ORCHESTRA_DISABLE_PROJECT_CONFIG")
  },
  get ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER() {
    return omniSpawner(process.env["ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER"])
  },
  get ORCHESTRA_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("ORCHESTRA_EXPERIMENTAL_REFERENCES")
  },
  get ORCHESTRA_TUI_CONFIG() {
    return process.env["ORCHESTRA_TUI_CONFIG"]
  },
  get ORCHESTRA_CONFIG_DIR() {
    return process.env["ORCHESTRA_CONFIG_DIR"]
  },
  // Dev and branch builds read integration credentials from the release
  // database (<data>/orchestra.db) read-only when their own database has none
  // for an integration. "0"/"false" disables it; "1"/"true" forces it on even
  // with ORCHESTRA_DB=":memory:". Unset means on, except for ":memory:".
  get ORCHESTRA_INHERIT_CREDENTIALS() {
    if (process.env["ORCHESTRA_INHERIT_CREDENTIALS"] === undefined) return undefined
    return truthy("ORCHESTRA_INHERIT_CREDENTIALS")
  },
  get ORCHESTRA_PURE() {
    return truthy("ORCHESTRA_PURE")
  },
  get ORCHESTRA_PERMISSION() {
    return process.env["ORCHESTRA_PERMISSION"]
  },
  get ORCHESTRA_PLUGIN_META_FILE() {
    return process.env["ORCHESTRA_PLUGIN_META_FILE"]
  },
  get ORCHESTRA_CLIENT() {
    return process.env["ORCHESTRA_CLIENT"] ?? "cli"
  },
}
