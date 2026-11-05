import type { Admission, Limits } from "./contracts"
import { BoundedJson } from "./json"

export function admit(value: unknown, limits?: Partial<Limits>): Admission {
  return BoundedJson.admit(value, "workspace", limits)
}

export function parse(text: string, format: "json" | "yaml", limits?: Partial<Limits>): Admission {
  return BoundedJson.parse(text, format, "workspace", limits)
}
