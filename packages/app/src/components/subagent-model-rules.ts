export interface ModelRule {
  permission: string
  pattern: string
  action: "allow" | "deny" | "ask"
}

/** Client mirror of the server Wildcard.match (packages/opencode/src/util/wildcard.ts):
    `*` spans `/`, match is full-string. Kept to the shapes this feature
    reads and writes; exotic patterns fall back to generic `*` handling. */
export function wildcardMatch(str: string, pattern: string): boolean {
  const normalized = pattern.replaceAll("\\", "/")
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "s").test(str.replaceAll("\\", "/"))
}

const TASK = "task"

/** True when the session carries model-scoped task rules. Mirrors the
    detection in TaskTool (packages/opencode/src/tool/task.ts) exactly:
    permission === "task" with a "/" in the pattern. */
export function hasModelScope(rules: readonly ModelRule[]): boolean {
  return rules.some((rule) => rule.permission === TASK && rule.pattern.includes("/"))
}

/** Effective state for one provider/model: last matching rule wins,
    mirroring Permission.evaluate (default: unconstrained). */
export function effectiveModelState(
  rules: readonly ModelRule[],
  providerID: string,
  modelID: string,
): "allow" | "deny" | undefined {
  const target = `${providerID}/${modelID}`
  let state: "allow" | "deny" | undefined
  for (const rule of rules) {
    if (rule.permission !== TASK && !wildcardMatch(TASK, rule.permission)) continue
    if (!wildcardMatch(target, rule.pattern)) continue
    if (rule.action === "allow" || rule.action === "deny") state = rule.action
  }
  return state
}

/** Rules to APPEND (server merges, last match wins) for toggling one model.
    First constraint also writes the star-slash-star deny baseline so unchecked
    models stay unavailable instead of falling through to ask. That shape only
    matches provider/model patterns — never a bare subagent_type. */
export function toggleModelRules(
  rules: readonly ModelRule[],
  providerID: string,
  modelID: string,
  allow: boolean,
): ModelRule[] {
  const out: ModelRule[] = []
  if (allow && !hasModelScope(rules)) {
    out.push({ permission: TASK, pattern: "*/*", action: "deny" })
  }
  out.push({ permission: TASK, pattern: `${providerID}/${modelID}`, action: allow ? "allow" : "deny" })
  return out
}
