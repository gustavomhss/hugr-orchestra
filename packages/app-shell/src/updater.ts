import type { Accessor } from "solid-js"

export type UpdaterState =
  | { status: "disabled" }
  | { status: "idle" }
  | { status: "checking" }
  | { status: "downloading"; version: string; percent?: number }
  | { status: "ready"; version: string }
  // A build that cannot replace itself (unsigned macOS, deb, rpm) only announces the update and its release page.
  | { status: "available"; version: string; url: string }
  | { status: "up-to-date" }
  | { status: "installing"; version: string }
  | { status: "error"; message: string }

export type UpdaterPlatform = {
  state: Accessor<UpdaterState>
  check(): Promise<UpdaterState>
  install(): Promise<void>
}
