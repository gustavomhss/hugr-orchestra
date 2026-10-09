export * as LeanProcessor from "./lean-processor"

import { filter } from "hugr-lean/core"

/** One approved package engine for every native host adapter; no command execution or I/O. */
export const process = filter
