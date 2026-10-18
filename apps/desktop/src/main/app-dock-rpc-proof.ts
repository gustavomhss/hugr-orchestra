export function requireRPCProof(value: unknown, required: readonly string[]) {
  if (!required.length || new Set(required).size !== required.length) throw new Error("rpc-proof-requirements-invalid")
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1
    || !("electronVersion" in value) || typeof value.electronVersion !== "string" || !value.electronVersion
    || !("cases" in value) || !Array.isArray(value.cases)) throw new Error("rpc-proof-artifact-invalid")
  if ("error" in value && value.error !== undefined) throw new Error("rpc-proof-artifact-reported-error")
  const cases = value.cases
  if (cases.length !== required.length || !required.every((id) => cases.some((item: unknown) => item !== null
    && typeof item === "object" && "id" in item && item.id === id && "status" in item && item.status === "pass")))
    throw new Error("rpc-proof-required-case-missing-or-failed")
}
