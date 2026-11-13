/** The one normalized request authorized to regenerate and publish Atlas boundary evidence. */
export function isAtlasGeneratedRequest(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const request = value as Record<string, unknown>
  return request.package === "core" && request.directory === "packages/core" && request.runner === "bun" &&
    Array.isArray(request.args) && request.args.length === 3 && request.args[0] === "./test/atlas-generated-artifact.test.ts" &&
    request.args[1] === "--timeout" && request.args[2] === "900000" && request.env !== null &&
    typeof request.env === "object" && !Array.isArray(request.env) && Object.keys(request.env).length === 0 &&
    request.config === undefined && request.benchmarkRenderer === undefined
}
