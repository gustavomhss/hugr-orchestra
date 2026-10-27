// `always` holds the resources "Allow always" saves for this project. "*" covers every request of the tool,
// anything else covers only those exact resources. No entries means the request cannot be remembered.
export function alwaysScope(always: readonly string[]) {
  if (!always.length) return
  return always.includes("*") ? ("any" as const) : ("exact" as const)
}
