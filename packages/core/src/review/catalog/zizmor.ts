import pinned from "../../backend-toolkit/packs/zizmor"

// zizmor 1.32.0, source 21bd300700d43d9ba04b0c1fce72a89391ac80b4.
// Severity is per finding: the SARIF `level` spelling (note/warning/error) is the
// catalog key, converted with note -> P3, warning -> P2, error -> P1.
// A raw native diagnostic is a candidate, not a confirmed defect or permission verdict.
const severity = { note: "P3", warning: "P2", error: "P1" } as const

const descriptors = [
  { rule: "zizmor/artipacked", class: "security.secret", lens: "security", triage: "artipacked: confirm the persisted credential is a real secret and the upload path exposes it; the native severity already follows the checkout version and upload shape." },
  { rule: "zizmor/unsound-contains", class: "logic.invariant", lens: "correctness-logic", triage: "unsound-contains: confirm the container syntax and the actual string being matched; a generic contains check is not proof of the workflow's behavior." },
  { rule: "zizmor/unsound-ternary", class: "logic.invariant", lens: "correctness-logic", triage: "unsound-ternary: confirm the expression's branches and the values that reach them; the native diagnostic alone does not establish a broken workflow." },
  { rule: "zizmor/excessive-permissions", class: "security.ci", lens: "security", triage: "excessive-permissions: confirm the granted scope and the steps that consume it; a broad permission is not by itself an exploitable boundary." },
  { rule: "zizmor/dangerous-triggers", class: "security.ci", lens: "security", triage: "dangerous-triggers: confirm the trigger is reachable from untrusted input and what it executes; the trigger name alone is not proof of exploitation." },
  { rule: "zizmor/use-trusted-publishing", class: "security.supply-chain", lens: "security", triage: "use-trusted-publishing: confirm the publishing path and the OIDC trust configuration; the native diagnostic is a candidate, not a confirmed compromise." },
  { rule: "zizmor/template-injection", class: "security.boundary", lens: "security", triage: "template-injection: confirm the untrusted value reaches the expression sink and what it can reach; the native diagnostic alone does not establish code execution." },
  { rule: "zizmor/hardcoded-container-credentials", class: "security.secret", lens: "security", triage: "hardcoded-container-credentials: confirm the literal is a live credential and how it is delivered; a hardcoded value alone is not proof of exposure." },
  { rule: "zizmor/self-hosted-runner", class: "security.ci", lens: "security", triage: "self-hosted-runner: confirm the runner label resolves to a self-hosted pool and what code it executes; the label alone does not prove the fleet." },
  { rule: "zizmor/unpinned-uses", class: "security.supply-chain", lens: "security", triage: "unpinned-uses: confirm the referenced action and the ref it resolves to; an unpinned ref is a candidate, not a confirmed supply-chain break." },
  { rule: "zizmor/undocumented-permissions", class: "security.ci", lens: "security", triage: "undocumented-permissions: confirm the permission is actually granted and consumed; a missing declaration alone is not proof of privilege." },
  { rule: "zizmor/insecure-commands", class: "security.ci", lens: "security", triage: "insecure-commands: confirm the workflow command is reachable and what it controls; the native diagnostic alone does not establish an exploitable boundary." },
  { rule: "zizmor/github-env", class: "security.boundary", lens: "security", triage: "github-env: confirm the env value reaches a shell or script sink and what it can alter; the native diagnostic is a candidate, not a confirmed injection." },
  { rule: "zizmor/cache-poisoning", class: "security.supply-chain", lens: "security", triage: "cache-poisoning: confirm the cache key and the restore path; the native diagnostic alone does not prove a poisoned cache." },
  { rule: "zizmor/secrets-inherit", class: "security.secret", lens: "security", triage: "secrets-inherit: confirm the inherited secret and the job that receives it; the native diagnostic alone does not establish exposure." },
  { rule: "zizmor/bot-conditions", class: "logic.invariant", lens: "correctness-logic", triage: "bot-conditions: confirm the actor condition and the permission it guards; the native diagnostic alone does not establish a bypass." },
  { rule: "zizmor/overprovisioned-secrets", class: "security.secret", lens: "security", triage: "overprovisioned-secrets: confirm the secret is granted beyond the steps that consume it; the native diagnostic alone does not establish exposure." },
  { rule: "zizmor/unredacted-secrets", class: "security.secret", lens: "security", triage: "unredacted-secrets: confirm the secret is actually logged and where; the native diagnostic alone does not establish exposure." },
  { rule: "zizmor/forbidden-uses", class: "security.supply-chain", lens: "security", triage: "forbidden-uses: confirm the forbidden action and why it is forbidden in this project; the native diagnostic alone does not establish a break." },
  { rule: "zizmor/obfuscation", class: "security.boundary", lens: "security", triage: "obfuscation: confirm the obfuscated expression and what it hides; the native diagnostic alone does not establish malicious intent." },
  { rule: "zizmor/unpinned-images", class: "security.supply-chain", lens: "security", triage: "unpinned-images: confirm the image ref and the digest it resolves to; an unpinned image is a candidate, not a confirmed supply-chain break." },
  { rule: "zizmor/anonymous-definition", class: "logic.invariant", lens: "correctness-logic", triage: "anonymous-definition: confirm the anonymous definition and the reference that resolves it; the native diagnostic alone does not establish a broken workflow." },
  { rule: "zizmor/unsound-condition", class: "logic.invariant", lens: "correctness-logic", triage: "unsound-condition: confirm the condition and the values that reach it; the native diagnostic alone does not establish a skipped or broken job." },
  { rule: "zizmor/dependabot-execution", class: "security.ci", lens: "security", triage: "dependabot-execution: confirm the Dependabot job and the permission it grants; the native diagnostic alone does not establish exploitation." },
  { rule: "zizmor/dependabot-cooldown", class: "reliability.retry", lens: "correctness-reliability", triage: "dependabot-cooldown: confirm the cooldown window and the update cadence it imposes; the native diagnostic alone does not establish a broken pipeline." },
  { rule: "zizmor/concurrency-limits", class: "concurrency.order", lens: "correctness-concurrency", triage: "concurrency-limits: confirm the concurrency group and the jobs that contend; the native diagnostic alone does not establish a race." },
  { rule: "zizmor/archived-uses", class: "contracts.third-party", lens: "contracts", triage: "archived-uses: confirm the archived action and whether it is still maintained; the native diagnostic alone does not establish a break." },
  { rule: "zizmor/typosquat-uses", class: "security.supply-chain", lens: "security", triage: "typosquat-uses: confirm the action name and its real publisher; the native diagnostic alone does not establish a typosquat." },
  { rule: "zizmor/misfeature", class: "logic.contract", lens: "correctness-logic", triage: "misfeature: confirm the feature and the behavior the workflow expects; the native diagnostic alone does not establish a defect." },
  { rule: "zizmor/secrets-outside-env", class: "security.secret", lens: "security", triage: "secrets-outside-env: confirm the secret is used outside the env context and where; the native diagnostic alone does not establish exposure." },
  { rule: "zizmor/superfluous-actions", class: "logic.contract", lens: "correctness-logic", triage: "superfluous-actions: confirm the action is redundant with the step it wraps; the native diagnostic alone does not establish a defect." },
  { rule: "zizmor/github-app", class: "security.ci", lens: "security", triage: "github-app: confirm the app token and the permission it grants; the native diagnostic alone does not establish exposure." },
  { rule: "zizmor/unpinned-tools", class: "security.supply-chain", lens: "security", triage: "unpinned-tools: confirm the tool ref and the digest it resolves to; an unpinned tool is a candidate, not a confirmed supply-chain break." },
  { rule: "zizmor/adhoc-packages", class: "security.supply-chain", lens: "security", triage: "adhoc-packages: confirm the package source and the integrity it lacks; the native diagnostic alone does not establish a supply-chain break." },
  { rule: "zizmor/insecure-url-scheme", class: "security.boundary", lens: "security", triage: "insecure-url-scheme: confirm the URL and what it carries; the native diagnostic alone does not establish an exposed secret." },
  { rule: "zizmor/self-repository", class: "security.ci", lens: "security", triage: "self-repository: confirm the repository reference and the token it uses; the native diagnostic alone does not establish exposure." },
] as const

export const zizmor = {
  pack: {
    id: "zizmor",
    tool: "zizmor",
    version: pinned.version,
    pin: {
      source: "backend-toolkit/packs/zizmor",
      integrity: Object.fromEntries(Object.entries(pinned.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    },
    licence: "pinned",
    backend: "pinned",
    languages: "any",
    detection: { manifests: [], extensions: [], absent: [], paths: [".github/workflows/*.{yml,yaml}"] },
    lane: "no-build",
    tiers: ["standard", "deep"],
    output: { format: "sarif" },
    cost: "low",
    network: { kind: "none" },
    scratchWrites: false,
    template: "zizmor-host-sarif",
    lenses: ["security", "correctness-logic", "correctness-concurrency", "correctness-reliability", "contracts"],
    status: "probation",
  },
  rules: descriptors.map((entry) => ({
    pack: "zizmor",
    rule: entry.rule,
    class: entry.class,
    lens: entry.lens,
    severity: { ...severity },
    triage: entry.triage,
    status: "probation" as const,
  })),
} as const
