import { Schema } from "effect"
import { NativeCall } from "./actions-native-data"

// Captured before native execution; the shim checks inherited state without repairing it.
export const RunnerConfig = Schema.Struct({
  directory: Schema.NonEmptyString,
  environment: Schema.Struct({ GH_CONFIG_DIR: Schema.NonEmptyString }),
  credentialSelection: Schema.Literal("config"),
})

export const githubTokenKeys = ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"] as const

export const NativeScope = Schema.Struct({
  location: Schema.Literal(true),
  configDirectory: Schema.Literal(true),
  configCredentials: Schema.Literal(true),
})

export const ScopedNativeCall = Schema.Struct({ ...NativeCall.fields, scope: NativeScope })
