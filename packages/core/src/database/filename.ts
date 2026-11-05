export * as DatabaseFilename from "./filename"

import { isAbsolute, join } from "path"
import { Global } from "../global"
import { Flag } from "../flag/flag"

// Shared profile path resolution, without loading Database's driver or migrations.
export function path() {
  if (Flag.ORCHESTRA_DB) {
    if (Flag.ORCHESTRA_DB === ":memory:" || isAbsolute(Flag.ORCHESTRA_DB)) return Flag.ORCHESTRA_DB
    return join(Global.Path.data, Flag.ORCHESTRA_DB)
  }
  return releasePath()
}

export function releasePath() {
  return join(Global.Path.data, "orchestra.db")
}
