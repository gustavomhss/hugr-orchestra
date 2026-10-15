# R46 — Native skill packaging and composition

**Verdict:** use ordinary named skill plus explicitly linked references. Compose task mode/domain, language/runtime, framework/library/version in model context from supplied component facts. Native loaders supply discovery, body delivery and permission checks; they do not supply variant matching, inheritance or dependency resolution.

## Evidence boundary

- Date: 2026-10-03. Both source worktree `backend-plugin` and metadata worktree `backend-r46-skill-composition` returned HEAD `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`. Source HEAD checked first; metadata HEAD checked before report write.
- Exact requested source paths exist. V1 means `packages/orchestra`; V2 means `packages/core` at this commit, not similarly named current upstream APIs. Source inspection only; existing tests read, not run. Candidate packaging below remains proposed, not installed/exercised.
- [Frozen contract][Brief] controls roles. [R03][Prior] and [R39][R39] supply prior findings; current source controls host claims. Official [AgentSkills specification][Spec] supplies portable packaging rules, not host behavior.

## Actual semantics: V1 versus V2

| Concern | V1 | V2 | Composition consequence |
| --- | --- | --- | --- |
| Discovery | Config directories scan `{skill,skills}/**/SKILL.md`; external `.claude`/`.agents` home and ancestor paths subject to flags; extra `skills.paths` and `skills.urls`. [V1-scan] | Registered directory/URL/embedded sources. Config plugin adds `skill/`, then `skills/`, plus `skills: string[]` paths/URLs; relative paths use Location directory. Native config discovers global config and ancestor `.orchestra`, not V1 external-directory scanning. [V2-config] [Config] [Sources] | Prefer `.orchestra/skills/<name>/SKILL.md` or already registered package asset root. Installing package alone does not register arbitrary asset directories. |
| Name | Frontmatter string required; used verbatim as registry key/tool argument. Generic loader does not enforce directory-name equality or standard name grammar. Special Own check exists. [V1] | Optional frontmatter name; direct-source `.md` can infer filename stem. Nested `SKILL.md` needs explicit name; unnamed root `SKILL.md` can become `SKILL`. [V2] | Always declare unique portable name matching directory. Directory hierarchy does not namespace names. |
| Description | Optional string; advertised only when defined. Verbose catalog includes name, description, location. [V1-list] | Optional string; guidance advertises name/description, without location. [Guidance] | Description supplies model selection cue, not executable predicate. Missing description hides catalog entry, not exact-name lookup or authority. |
| Body | Parsed Markdown content stored, then trimmed into `<skill_content>` on explicit `skill({name})`. [V1-tool] | Same model-facing delivery through canonical tool. [V2-tool] | Entire selected body loads, not only applicable section. Load extra documents explicitly. |
| References/assets | Tool reports base directory and sampled non-`SKILL.md` paths, limit 10. [V1-tool] | For `SKILL.md` locations: sorted non-`SKILL.md` file sample, limit 10. Flat `.md` gets no sibling listing. [V2-tool] | File paths are hints, not file contents, recursive includes or script execution. Explicit body links remain needed beyond sample. |
| Visibility/authority | `available(agent)` excludes deny; system prompt can omit guidance when tool disabled; load calls `ctx.ask` for selected name. [V1-list] [V1-prompt] [V1-tool] | Guidance filters agent deny; execution independently calls `permission.assert` with selected name/session/agent. [Guidance] [V2-tool] | Catalog visibility, semantic applicability and operation authorization are separate. Skill access never grants shell/read/write access. |
| Duplicate names | Warn, then overwrite. Disk loads parse concurrently with unbounded concurrency, so duplicate winner depends on completion; disk loads follow built-in registration. [V1] [V1-list] | Sources deduplicated by source identity; sorted files within each directory, sequential source traversal, later assignment wins silently. Embedded-source identity is name. [V2] [Sources] | Neither merges bodies. Avoid relying on shadowing for framework/version specialization. |
| Commands | Skills become command templates unless name already occupied by command/MCP prompt. [V1-commands] | Loader stores `slash`; inspected config-command path reads separate command definitions. [V2] [V2-command] | `slash` is not inheritance, stack matching or dependency activation. Model-called skill tool is concrete common path. |

Portable standard requires `name` and nonempty `description`, constrains name/length, and recommends `scripts/`, `references/`, `assets/`, relative links and progressive disclosure. Host parsers are more permissive; follow standard for authored packs. Local docs claim required description and catalog in tool description; actual source permits missing descriptions and emits catalog through system guidance. [Spec] [Docs] [V1-prompt] [Guidance] [Tests1]

**Frontmatter labels are not execution:** inspected loaders retain name/description/content/location, plus V2 `slash`. They do not interpret `scope`, `language`, `runtime`, `framework`, `version`, `extends`, `requires`, `dependencies`, `compatibility`, `metadata` or `allowed-tools` as matchers, dependency declarations or grants. `allowed-tools` is experimental in specification, unsupported as permission enforcement in these paths. Put selection conditions needed by model in description/body. [V1] [V2] [Sources] [Spec]

## Supported composition and concrete boundaries

- Native sequence: permitted descriptions → model selects exact name → skill tool returns body/base/file sample → ordinary read loads chosen reference → the backend specialist applies combined guidance. Multiple explicit skill calls also compose conversation context; host supplies no dependency closure, precedence algebra or automatic parent/child activation. Positive mechanism is visible directly in both tool bodies. [V1-tool] [V2-tool]
- Reference links remain inert Markdown until read. Nested `references/*.md` do not become separately advertised skills under normal parent skill-root registration. V2 direct-source `*.md` support means registering a reference directory itself changes that behavior; register containing skill collection instead. [V2]
- Different names can coexist, e.g. independently reusable `backend-fastify` and shared backend skill. Loading child never loads parent automatically; explicit instruction/tool call would be needed. Start with bundled references; split only when standalone reuse merits separate catalog entry.
- Native plugin seam already registers V2 sources via `ctx.skill.transform(draft => draft.source(...))`; built-in plugin demonstrates embedded content. V1 already accepts extra skill paths. Prefer existing directory registration for packs with real companion files; synthetic embedded location does not materialize resources. [PluginHost] [Builtin] [V1-scan]
- URL sources consume `index.json` entries containing name/files/optional version and fetch listed assets into native cache. V1 requires `SKILL.md`; V2 also accepts `<name>.md`. Index version controls cached asset refresh, **not target framework compatibility or semver resolution**; include referenced files in distribution. [URLs1] [URLs2]
- V1 state caches discovered/loaded skills per Instance. V2 caches source contents by source key; `reload` replays source registration without clearing that map. Guidance updates track available summaries, not proof that changed body reached context. Do not promise hot-refresh or add backend-specialist-owned cache/persistence. [V1-list] [V2] [State] [Guidance]
- `own_` is special V1 Atlas route: verified availability and load, with snapshot/content hash; `.orchestra/skills/own/` also has naming checks. V2 generic skill tool has no equivalent branch. Do not use Own names for ordinary guidance or assume generic packaging inherits Atlas verification. [V1] [V1-tool] [V2-tool]
- **Current native backend specialist admission limit:** execution profile allows read/glob/grep/bash/edit, default denies others, including `skill`. Agent config skips permission overrides for native seats; invocation rechecks profile. Existing authorized Task can inject verified Own bodies, not arbitrary variant packs. On-demand candidate requires host-owned admission; frontmatter cannot provide it. [Profile] [AgentLock] [Enforce] [OwnHandoff]

## Minimal candidate packaging — proposal only

Future native asset path; no resolver, service, manifest DSL or activation change:

```text
.orchestra/skills/backend-backend/
  SKILL.md
  references/task-modes.md
  references/http-boundary.md
  references/typescript-runtime.md
  references/fastify-4-5.md
```

Minimal entry-body sketch; reference files would contain substantive guidance, not cloned generic recipes:

```markdown
---
name: backend-backend
description: Implement assigned backend features and diagnosed repairs using supplied component, runtime, framework, and version facts. Not for discovery, diagnosis, architecture, or independent review.
---
Use the supplied assignment, target component, behavior contract, exact stack
versions, constraints, and host grants. Read only applicable references:
- [Task modes](references/task-modes.md): feature, diagnosed repair, or refactor.
- [HTTP boundary](references/http-boundary.md): assigned HTTP input/output work.
- [TypeScript runtime](references/typescript-runtime.md): supplied JS/TS and Node/Bun facts.
- [Fastify versions](references/fastify-4-5.md): only a supplied Fastify target;
  use its exact version and validator configuration to select the relevant section.
If version or contract ambiguity changes implementation, ask for that missing fact.
Implement the assigned behavior; choose local SQL, helpers, calls, and focused checks.
Correct local implementation mistakes. Report changes, evidence, and upstream blockers.
```

Read actual supplied target files/interfaces while implementing; do not add repository inventory or framework-discovery phase. Caller supplies behavioral objective, component facts, owner decisions, boundaries and repair diagnosis when applicable—not finished algorithms or every command argument. Conflicting reference guidance needs narrow clarification when material; skill prose cannot override assignment or grants. [Brief]

### Small variant cards

All cards use already granted native read/edit/shell and existing project checks. Output: scoped implementation plus behavior-check evidence and specific blockers. Tool choice remains implementation judgment; no new tool is implied.

| Card | Applicability / non-trigger | Supplied inputs | Actual implementation differences | Local judgment / upstream blocker |
| --- | --- | --- | --- | --- |
| Shared feature mode | Assigned new backend behavior / “investigate why slow” | Behavior, component, constraints, stack facts, acceptance outcomes | Map behavior into existing seams; add meaningful focused checks. No diagnosis prerequisite for new feature. | Choose helpers/SQL/error branches; block only unresolved behavior/owner boundary. |
| Shared repair mode | Supplied diagnosis and expected correction / undiagnosed incident | Diagnosis, relevant evidence/reproduction, expected behavior | Implement bounded correction; exercise regression case and adjacent behavior. Fix own coding mistakes locally. | Choose patch shape; contradictory root-cause evidence returns to diagnosis owner. |
| Language/runtime | Supplied JS/TS and Node/Bun component / incidental package-manager dependency | Exact runtime/compiler and existing build/test entrypoints | Preserve language syntax, runtime APIs, module/lifecycle constraints; Bun tooling alone does not select Bun server APIs. | Choose compatible implementation/check command; missing runtime fact blocks only runtime-sensitive choice. |
| Fastify 4/5 HTTP | Supplied Fastify endpoint using default JSON Schema validator / Hono target or unrelated Fastify dependency | Exact Fastify/runtime versions, validator configuration, input/output contract | Shared HTTP rules plus version deltas: v5 requires full JSON Schema and Node >=20; v4 permits shorthand. Custom validators need their own facts. [Fastify] | Choose schema/helper organization; ambiguous major or validator returns narrow question. |

## Concrete cases and assigned behavior checks — all UNEXECUTED

Same assignment: add `GET /greet` accepting optional string `name`, return prescribed JSON greeting. Illustrative supplied pins: TypeScript 5.8.2, Node 22.14.0; existing default Fastify validator. Pins identify hypothetical fixtures, not installed or certified environments.

| Case | Expected composition / behavior check |
| --- | --- |
| Positive: Fastify 5.0.0, feature, HTTP scope granted | Load backend entry; read feature + HTTP + TS/Node + Fastify-v5 guidance. Use `querystring: { type: "object", properties: { name: { type: "string" } } }`. Check greeting for supplied/missing name and prescribed handling of invalid inputs through mounted route. |
| Same task: Fastify 4.29.1 | Same shared layers, v4 section. Existing `querystring: { name: { type: "string" } }` shorthand is supported; full schema is also suitable. Do not create separate full recipe when shared form works. |
| Wrong transfer | Copy v4 shorthand unchanged to default v5 validator. V5 removed shorthand; reject that guidance. Keep optionality fixed in comparison—do not accidentally add `required: ["name"]`. [Fastify] |
| Positive repair | Same v5 component; supplied diagnosis says route retained v4 shorthand. Use repair mode plus same HTTP/runtime/version references; correct schema and cover supplied regression. No framework migration or incident investigation. |
| Non-trigger: supplied Hono 4.10.7 target, Fastify elsewhere in monorepo | Skip Fastify reference. Consume supplied Hono guidance; unrelated dependencies do not select framework. Missing Hono recipe does not authorize framework migration. |
| Non-trigger: frontend-only CSS change or “find unknown root cause” | Backend implementation skill does not apply; diagnosis/discovery remains owner input. |
| Ambiguous: “Fastify” without major, conflicting pins, or unknown validator | Ask exact affected-component version/validator only when needed for version-sensitive step. Continue independent, version-neutral assigned work. Do not scan repository to invent stack selection. |
| Conflicting runtime: supplied Node 18 + Fastify 5 | Report concrete upstream incompatibility (v5 requires Node >=20); do not silently upgrade runtime or change framework. [Fastify] |
| Description absent, denied name, or duplicate name | Future host checks should distinguish undisclosed-but-addressable skill, permission rejection, V1 collision race, V2 replacement. None establishes auto-inheritance. |
| Reference omitted from first 10 sampled paths | Explicit body link still guides read of distributed file; missing actual file is packaging failure. Tool listing alone is not evidence reference content was loaded. |

Existing test source corroborates V1 undescribed discovery, V2 later-source precedence/dedup/cache and permission-filtering, and V2 tool body/reference-path output, denied/missing errors, flat-file sibling suppression. Tool test stubs skill/permission services; it is not end-to-end authorization evidence. These tests were not executed. [Tests1] [Tests2] [TestsTool]

## Lead framing that would create needless machinery

1. Calling dimensions “variants” can imply Cartesian-product skill generation. Extract only changing instructions: shared task/domain guidance, language/runtime rules, framework/version references, narrow recipes when genuinely distinct.
2. Calling selection “resolution” can imply manifest schema, semver solver, capability registry or routing agent. Existing descriptions, ordinary links, supplied facts and local judgment already cover selection.
3. Overloading “scope” with permission can create fake frontmatter ACLs. Keep assigned change/task mode, technical domain and host authority distinct; Maestro/caller owns grants.
4. Treating the backend specialist as investigator/architect adds repository discovery and diagnostic ceremony. Frozen contract assigns those inputs elsewhere; feature work needs no invented diagnosis phase.
5. “Fully prescribed packet” can become caller-written SQL/helpers/CLI steps. R39's packet wording needs frozen-contract correction: supply outcomes/interfaces/constraints, retain the backend specialist's local implementation freedom.
6. “Shared” can imply automatic inheritance, merged duplicate names, automatic reference reads or duplicated always-on context. State explicit reads; keep names unique; avoid repeating shared guidance in every leaf.
7. “Versioned skill” can conflate pack release, URL cache version and target framework version. Document target evidence in prose; consume host cache/lifecycle and Atlas persistence rather than building replacements.
8. “Native-compatible” can be mistaken for “enabled for native backend specialist.” Profile denial is real host-admission issue, not reason to invent permission system or bypass it with skill labels.

**Extraction order:** shared role/modes and component-fact expectations → runtime rules → cited framework deltas → compact selection/examples → later host-owned packaging/exercise. Recommended asset root remains `.orchestra/skills/backend-backend/`; distributed packs can use existing source registration. Lead report destination: `specs/backend-specialist/research/46-skill-composition.md`.

## Source links

Local links target inspected source worktree; line anchors plus baseline identify evidence. Web specification and Fastify versioned guide read 2026-10-03.

[Brief]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/skill-variants-plan.md#L7-L14
[Prior]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/03-native-plugin.md#L15-L29
[R39]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/research/39-typescript-code.md#L15-L16
[V1]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/skill/index.ts#L54-L145
[V1-scan]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/skill/index.ts#L179-L277
[V1-list]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/skill/index.ts#L279-L391
[V1-tool]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/tool/skill.ts#L12-L104
[V1-prompt]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/session/system.ts#L105-L117
[V1-commands]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/command/index.ts#L134-L152
[V2]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/skill.ts#L30-L128
[Guidance]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/skill/guidance.ts#L16-L68
[V2-tool]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/tool/skill.ts#L15-L99
[V2-config]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/config/plugin/skill.ts#L18-L47
[Config]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/config.ts#L173-L215
[Sources]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/schema/src/skill.ts#L7-L54
[V2-command]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/config/plugin/command.ts#L15-L48
[Builtin]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/plugin/skill.ts#L13-L30
[PluginHost]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/plugin/host.ts#L208-L217
[State]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/state.ts#L78-L85
[URLs1]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/skill/discovery.ts#L47-L130
[URLs2]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/src/skill/discovery.ts#L98-L207
[Profile]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/maestro/roster.ts#L10-L63
[AgentLock]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/agent/agent.ts#L291-L317
[Enforce]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/session/tools.ts#L87-L104
[OwnHandoff]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/src/tool/task.ts#L497-L541
[Tests1]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/orchestra/test/skill/skill.test.ts#L214-L239
[Tests2]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/test/skill.test.ts#L41-L124
[TestsTool]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/core/test/tool-skill.test.ts#L20-L145
[Docs]: /Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/packages/web/src/content/docs/skills.mdx#L34-L115
[Spec]: https://agentskills.io/specification
[Fastify]: https://fastify.dev/docs/v5.0.x/Guides/Migration-Guide-V5/#full-json-schema-is-now-required-for-querystring-params-and-body-and-response-schemas
