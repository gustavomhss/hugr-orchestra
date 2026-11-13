import { isAbsolute } from "node:path"
import type { HeaderBinding } from "./native-memory.js"

/** Clause 1: a deep, frozen COPY, so neither the caller's object nor a later mutation of it can move the
 *  owner or the root after composition. Validated, because an empty owner or root is a host bug that would
 *  otherwise surface as an `unowned` refusal or a write into `cwd`. */
export function freezeBinding<T extends HeaderBinding>(input: T): T {
  if (typeof input.memoryOwner !== "string" || input.memoryOwner === "") {
    throw new Error("native-memory: AtlasBinding.memoryOwner must be a non-empty roster member id")
  }
  if (
    input.legacyOwners !== undefined &&
    (!Array.isArray(input.legacyOwners) ||
      input.legacyOwners.some((o) => typeof o !== "string" || o === "" || o === input.memoryOwner))
  ) {
    throw new Error("native-memory: AtlasBinding.legacyOwners must be non-empty ids other than memoryOwner")
  }
  if (typeof input.storage?.root !== "string" || !isAbsolute(input.storage.root)) {
    throw new Error("native-memory: AtlasBinding.storage.root must be an absolute path")
  }
  return deepFreeze(structuredClone(input))
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}
