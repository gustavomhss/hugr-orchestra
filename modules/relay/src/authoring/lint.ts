export * as AuthoringLint from "./lint"

// `relay-spec lint` (bin/relay-spec.py `lint_sprint`; WP7), for draft diagnostics. It reads the plan as raw JSON, as the
// CLI does, so it can report what a decoded `RelaySprint.Sprint` could not hold (an unknown kind); a decoded sprint is
// accepted too. Details quote values the way Python's `!r` prints them.

export interface Finding {
  readonly category:
    | "unknown-kind"
    | "inject-without-file"
    | "undeclared-macro"
    | "duplicate-control-id"
    | "trivial-control"
    | "advisory-only"
    | "ungated"
    | "self-check-restates-control"
    | "chain-exceeds-default-cap"
  readonly severity: "error" | "warn"
  // null only for the chain-length finding, which is about the whole plan.
  readonly wp: string | null
  readonly detail: string
}

// A command that cannot fail is not a control, compared after whitespace is collapsed.
const TRIVIAL_CMDS = new Set(["true", ":", "exit 0", "test -e .", "test -d .", "echo", "/bin/true"])
const KNOWN_KINDS = ["execute", "gate", "human", "inject", "review"]
// The documented default; the lint runs offline and cannot see the live cap.
const DEFAULT_BLOCK_CAP = 8

// Worst first. Only an error fails the lint.
export const lint = (sprint: unknown, options?: { readonly allowUngated?: boolean }): ReadonlyArray<Finding> => {
  const wps = list(field(sprint, "work_packages"))
  const declared = new Set<unknown>(list(field(sprint, "macros")).map((macro) => field(macro, "id") ?? null))
  const owners = new Map<unknown, unknown>()
  const findings = wps.flatMap((wp): Finding[] => {
    const id = field(wp, "id", "?")
    const name = typeof id === "string" ? id : str(id)
    const finding = (category: Finding["category"], severity: Finding["severity"], detail: string): Finding => ({
      category,
      severity,
      wp: name,
      detail,
    })
    const kindValue = field(wp, "kind")
    const kind = truthy(kindValue) ? kindValue : "execute"
    const checklist = list(field(wp, "checklist"))
    const macro = field(wp, "macro")
    const shape = [
      ...(KNOWN_KINDS.includes(kind as string)
        ? []
        : [finding("unknown-kind", "error", `kind ${repr(kind)} is not one of ${repr(KNOWN_KINDS)}`)]),
      ...(kind === "inject" && !truthy(field(wp, "file")) && !truthy(field(wp, "text"))
        ? [
            finding(
              "inject-without-file",
              "error",
              "an inject state with neither `file` nor inline `text` delivers nothing, and the agent is then judged " +
                "against rules it was never handed",
            ),
          ]
        : []),
      ...(truthy(macro) && declared.size && !declared.has(macro)
        ? [
            finding(
              "undeclared-macro",
              "error",
              `macro ${repr(macro)} is not in macros[], so its protocol is never injected`,
            ),
          ]
        : []),
    ]
    const controls = checklist.flatMap((control) => {
      const cid = field(control, "id", "?")
      const duplicate =
        owners.has(cid) && owners.get(cid) !== id
          ? [
              finding(
                "duplicate-control-id",
                "error",
                `control id ${repr(cid)} is also used in ${repr(owners.get(cid))}; retry state, keep-best and drift ` +
                  "detection all key on it, so one silently stands in for the other",
              ),
            ]
          : []
      if (!owners.has(cid)) owners.set(cid, id)
      const cmd = field(control, "cmd")
      if (truthy(cmd) && TRIVIAL_CMDS.has(collapse(str(cmd))))
        return [
          ...duplicate,
          finding(
            "trivial-control",
            "error",
            `control ${repr(cid)} runs ${repr(cmd)}, which cannot fail — the state reads as covered, which is worse ` +
              "than an admitted gap",
          ),
        ]
      // A judge verdict never counts as a deterministic control; a non-blocking one stops nothing at all.
      if (!truthy(cmd) && truthy(field(control, "judge")) && !truthy(field(control, "blocking")))
        return [
          ...duplicate,
          finding(
            "advisory-only",
            "warn",
            `control ${repr(cid)} is a non-blocking judge: it is recorded and it never stops anything`,
          ),
        ]
      return duplicate
    })
    const gated = checklist.some((control) => {
      const cmd = field(control, "cmd")
      return truthy(cmd) && !TRIVIAL_CMDS.has(collapse(str(cmd)))
    })
    // `inject` has no work of its own; demanding a control there would train authors to add a trivial one.
    const ungated =
      kind !== "inject" && kind !== "human" && !gated
        ? [
            finding(
              "ungated",
              options?.allowUngated ? "warn" : "error",
              "no deterministic control: this state advances on nothing",
            ),
          ]
        : []
    const restated = list(field(wp, "self_check")).flatMap((question) =>
      checklist
        .filter((control) => truthy(field(control, "assert")) && norm(question) === norm(field(control, "assert")))
        .map((control) =>
          finding(
            "self-check-restates-control",
            "warn",
            `self-check ${repr(question)} asks what control ${repr(field(control, "id") ?? null)} already measures; a ` +
              "self-check must probe the protocol's steps",
          ),
        ),
    )
    return [...shape, ...controls, ...ungated, ...restated]
  })
  const blocks = wps.length + 1
  const capped: Finding[] =
    blocks > DEFAULT_BLOCK_CAP
      ? [
          {
            category: "chain-exceeds-default-cap",
            severity: "warn",
            wp: null,
            detail:
              `this chain needs at least ${blocks} hook blocks and the documented default cap is ${DEFAULT_BLOCK_CAP}; ` +
              "set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0. This lint cannot see the live value — the hook's preflight " +
              "reads it at run time",
          },
        ]
      : []
  // A stable sort, as Python's.
  return [...findings, ...capped].sort((a, b) => rank(a.severity) - rank(b.severity))
}

const rank = (severity: Finding["severity"]) => (severity === "error" ? 0 : 1)

function field(value: unknown, key: string, fallback?: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : fallback
}

// `for item in (value or [])`: Python iterates a string's characters and an object's keys.
function list(value: unknown): ReadonlyArray<unknown> {
  if (Array.isArray(value)) return value
  if (typeof value === "string") return Array.from(value)
  if (typeof value === "object" && value !== null) return Object.keys(value)
  return []
}

function truthy(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object" && value !== null) return Object.keys(value).length > 0
  return Boolean(value)
}

// `" ".join(text.split())`: Python's whitespace, which includes the information separators and NEL.
function collapse(text: string) {
  return text.split(WHITESPACE).filter(Boolean).join(" ")
}

function norm(value: unknown) {
  return collapse(str(value).toLowerCase()).replace(/^[ .]+|[ .]+$/g, "")
}

function str(value: unknown) {
  return typeof value === "string" ? value : repr(value)
}

// Python's repr() of a JSON value.
function repr(value: unknown): string {
  if (value === null || value === undefined) return "None"
  if (typeof value === "boolean") return value ? "True" : "False"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return quoted(value)
  if (Array.isArray(value)) return `[${value.map(repr).join(", ")}]`
  return `{${Object.entries(value)
    .map(([key, item]) => `${quoted(key)}: ${repr(item)}`)
    .join(", ")}}`
}

function quoted(text: string) {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'"
  const body = Array.from(text)
    .map((char) => {
      if (char === quote || char === "\\") return "\\" + char
      if (char === "\t") return "\\t"
      if (char === "\n") return "\\n"
      if (char === "\r") return "\\r"
      if (char === " " || !HIDDEN.test(char)) return char
      const code = char.codePointAt(0)!
      if (code < 0x100) return "\\x" + code.toString(16).padStart(2, "0")
      if (code < 0x10000) return "\\u" + code.toString(16).padStart(4, "0")
      return "\\U" + code.toString(16).padStart(8, "0")
    })
    .join("")
  return quote + body + quote
}

const WHITESPACE = /[\t\n\u000b\u000c\r\u001c-\u001f \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/
// Python's non-printable characters: the Other and Separator categories.
const HIDDEN = /^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]$/u
