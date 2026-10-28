# Seat skill trees

Status: proposal, waiting for the owner's approval. No code changes until it is approved.

## Problem

A seat's knowledge is hard to see and costs too many hops to reach.

- The backend seat lists six skills. Its framework, library, protocol and tool knowledge (74 pages) sits as nested
  reference pages inside `backend-implement`. The agent screen shows that knowledge under Toolkit, not Skills, so the
  seat looks like it has a single skill.
- The model gets there in three hops: the prompt names `backend-implement`, its `SKILL.md` links to
  `references/languages/<lang>.md`, and that page links on to `../frameworks/...` and `../libraries/...`. Anthropic's
  Agent Skills guidance keeps references one level below `SKILL.md`, because the model reads deeper links only partly
  or skips them. The framework pages are two levels deep.
- No page says when _not_ to open it. The model opens pages by guessing from link text.
- `SeatSkillContent.validate` rejects any `SKILL.md` that is not a declared entry skill. A nested skill cannot exist
  today.

## Decision proposed

Each seat's knowledge becomes a **skill tree**. The model starts at the root skills and opens one level at a time,
loading only the branch the work needs.

1. **Every node is a real skill.** Each node is a directory with a `SKILL.md` that has `name` and `description`
   frontmatter. A node's name is its path joined with `-`, for example `backend-stack-python-fastapi`. A node holds
   either children or content.
2. **Only the roots are always in context.** The `skill` tool lists a seat's roots, about eight names and descriptions.
   Deeper nodes stay off the list and are loaded by name with the same `skill` tool.
3. **The level index is generated, never written by hand.** When the `skill` tool loads a node, it appends a "Next
   level" section built from the children's frontmatter: name, description, and `when`/`not-when` lines. The text that
   chooses a branch exists in one place, the child's frontmatter, so a parent's index cannot go out of date.
4. **Leaves are self-contained.** A leaf may keep a flat `references/` folder, one level deep, for long tables or
   examples. It never links sideways into another branch. Shared content moves up to the nearest common parent.
5. **Two separate axes.** Domain branches say _what_ the work is (API, data, concurrency). The `stack` branch says
   _with what_ (language, framework, library). Codegen tools get their own branch. A task opens at most one node per
   axis at each level, so a gRPC endpoint on FastAPI loads `api > grpc` and `stack > python > fastapi`.
6. **Limits the build enforces:**
   - depth of at most 3 below a root
   - at most 10 children per node
   - every child's `description` names a trigger
   - no orphan directories
   - no links that escape a leaf

### Child frontmatter

```yaml
---
name: backend-stack-python-fastapi
description: FastAPI routes, dependencies, lifespan and response models for an assigned Python HTTP change.
when: The change touches a FastAPI app, router, dependency or Pydantic response model.
not-when: Django or plain Starlette code; pure Pydantic validation outside a route (open backend-stack-python-pydantic).
---
```

`when` and `not-when` are optional on roots, whose `description` is already the trigger the `skill` tool lists. They
are required on every deeper node.

## Trees

Every seat gets a tree, Maestro included. Where content exists (backend, `archie`, `jimmy`, Maestro's playbooks) the
tree moves it and adds only the `when`/`not-when` lines and a short summary at the top of each node. The other six
seats have no content today, so their trees are new writing, grounded in a named public reference and checked by
the same rules.

### Shared stack tree (`team-stack`)

Language and framework knowledge is not owned by one seat. A FastAPI diff matters to the backend seat that writes it,
the reviewer that reads it, and the security reviewer that hunts in it. Writing that knowledge once per seat would
fork it, so it lives in one shared tree:

```
team-stack
├─ python              fastapi, django, kubeflow, pydantic, sqlalchemy
├─ go                  chi, pgx, sqlc
├─ js-ts               express, fastify, solid, react, vue, svelte, tailwind
├─ ruby                rails
└─ php                 laravel
```

A leaf states facts about the stack (idioms, traps, versions, test tools) and never a seat's procedure. Each seat's
own nodes say what to do with those facts. A seat opts in by listing `team-stack` among its roots. Today that is the
backend, `patty`, `lucy` and `billy`.

### Backend seat

```
backend-implement      common procedure, always loaded (modes: feature, repair, migration, optimization, refactor, tests)
backend-api            rest, grpc, graphql, websocket, sse, webhook, upload, codec
backend-data           query, transaction, migration-phase
backend-concurrency    cancellation, jobs, retries, streams
backend-refactor       scoped-transformation, syntax-vs-symbol
backend-check          real-services, faults, http-fixtures, generated-inputs
backend-codegen        index plus one leaf per tool (buf, sqlc, orval, kiota, squawk, ast-grep, ...)
team-stack             shared, see above
```

The current `languages`, `frameworks` and `libraries` pages move into `team-stack`. The `cards` pages (app-auth,
observability) go under `backend-api`. `continuity.md` stays in `backend-implement`.

There are 20 codegen tools, more than the 10-child limit, so `backend-codegen` groups them in one more level:

- `schema` (buf, protoc-gen-es, openapi-generator, ogen, orval, kiota, modelina, datamodel-codegen)
- `sql` (sqlc, sqlx, kysely-codegen, gocqlx-schemagen, squawk, sqlglot, postgres-language-server, datafusion-cli)
- `kube` (controller-gen, kopium, kubeconform)
- `code` (ast-grep)

### Upstream seat (`archie`)

```
archie-plan            decomposition, load-bearing-contracts, briefs, product-design-spec
archie-work-package    native-proposal, native-fields
```

These pages are short and already one level deep, so they become leaves without new grouping.

### Research seat (`jimmy`)

`jimmy-reference` splits into two roots, `jimmy-web-research` and `jimmy-calibration`, because they serve different
moments: finding sources, and judging how sure a claim is.

### Maestro

The ten playbooks become one tree, grouped by the moment of the work:

```
frame-request          request intake (keeps its name: the app and other Sessions address it)
maestro-plan           decompose, contract, pack
maestro-run            loop, governed, verify
maestro-repo           repo-maintenance, arsenal-operators
maestro-composer       FastAPI reuse through the composer plugin
```

`PlaybookContent` applies the same tree rules as `SeatSkillContent`. Other agents stay denied every Maestro node, as
they are denied playbooks today.

### New trees

These six seats have no content today. Each tree below is the branch plan. Its leaves are written from the public
reference named on the root, cut down to what the seat acts on.

**Code reviewer (`lucy`).** Reference: Google's engineering practices for code review.

```
lucy-review            procedure: read the diff cold, cite file:line, build the APPROVE/FIX_FIRST/REJECT card
lucy-correctness       logic and edge cases, error paths, concurrency, resource lifetime
lucy-tests             missing tests, tests without teeth, flaky patterns, mocks that hide the bug
lucy-compat            public API and wire changes, migrations, config and flag defaults
lucy-security          the first-pass checklist, and when to hand off to the security reviewer
team-stack             shared
```

**Security reviewer (`billy`).** Reference: the OWASP ASVS, the OWASP Top 10 and the OWASP Top 10 for LLM
applications.

```
billy-review           procedure: trust boundaries first, threat verdict, cited controls
billy-access           authentication, authorization, tenancy, sessions and tokens
billy-injection        sql, shell, path, template, ssrf, deserialization
billy-secrets          secrets in code and logs, crypto use, data handling and retention
billy-supply-chain     dependencies and lockfiles, CI and release pipelines
billy-agents           tool permissions, sandboxes, untrusted text reaching a model, prompt injection
team-stack             shared
```

**Process auditor (`frankie`).** Reference: the repository's own rules (AGENTS.md, Guardrail) plus SLSA provenance
levels.

```
frankie-audit          procedure: claim, evidence, verdict
frankie-evidence       receipts, which gate really ran, test teeth, local green versus CI green
frankie-ledger         approval chains, event seals, governed dispatch records
frankie-repo           branch, commit and PR rules, guard findings and their waivers
```

**Documentation (`rosie`).** Reference: Diátaxis (tutorial, how-to, reference, explanation).

```
rosie-docs             procedure: find the reader, make the smallest change, run checks
rosie-kinds            tutorial, how-to, reference, explanation
rosie-style            plain words, one idea per sentence, examples that run, i18n strings
rosie-check            links, code samples, generated reference stays generated
```

**Frontend (`patty`).** Reference: WCAG 2.2 and the web platform docs on MDN.

```
patty-implement        procedure, and the sensory evidence the card needs
patty-ui               components, state, forms, routing, data loading
patty-style            css, tokens, layout, responsive, motion, dark mode
patty-a11y             roles and names, keyboard, focus, contrast, reduced motion
patty-check            playwright, visual snapshots, screenshots as evidence
team-stack             shared (solid, react, vue, svelte, tailwind)
```

**Meeting copilot (`live`).** Reference: its own prompt. The tree holds the meeting kinds its answers depend on.

```
live-answer            answer format, sources (heard, on screen, memory), when to call live_look
live-meetings          sales call, interview, standup, technical review, negotiation
```

### Content rule for the new trees

A new leaf states what to do and how to check it, the way the backend leaves do. It is not a summary of its
reference. A leaf that cannot name a check the seat runs or a fact the seat cites is cut. Each new tree lands as its
own PR, and nothing new is benchmarked without the owner's permission.

## How it is wired

### Seat definition

`Seat.skills` still lists **roots** only. The permission becomes `skill: { "*": deny, "<seat-id>-*": allow }`, plus
`team-stack-*` for a seat that lists `team-stack`. A seat can load any node of its own tree and of the shared trees
it opted into, and nothing else. The prefix rule in `validate` pins every name to the seat id or to `team-`.

Shared trees live in `modules/specialists/team/skills` and are embedded once. Every seat with skills gets a tree
directory, so `skillSource` stops special-casing `backend` and `archie`.

### Validation (`SeatSkillContent.validate`)

The check that every `SKILL.md` is a declared entry is replaced by tree rules:

- Every `SKILL.md` is either a declared root or a node whose parent directory holds a `SKILL.md`.
- Its name equals the path joined with `-`.
- The depth, child count, `when`/`not-when` and leaf-link limits from the decision above hold.

The same function runs at build time (`script/seat-skills.ts`), at extraction, and when the tree is read from
source.

### Loading

The `skill` tool resolves a node by name, appends the generated "Next level" index, and keeps the roots-only
listing.

The V2 seat plugin (`modules/maestro/coordination/src/v2/seats.ts`) must register each seat root as a skill source,
the way playbooks are registered today. **Check this first**: the V2 skill sources found so far are the playbooks and
config/plugin directories. If seat roots are not registered, `skill("backend-implement")` fails on V2 today, and that
is a bug to fix before any tree work.

### Seat prompts

`backend.txt` step 2 becomes: "Load `backend-implement`, then open the branches the packet needs, one level at a
time. Stop at the first node that covers the work."

Every seat prompt gets the same line with its own roots, and Maestro's prompt names its new playbook groups. The
prompts no longer list deeper names. The tree is the list.

### Agent screen

The Skills tab becomes **Skill tree**: "Skill tree" in English and "Árvore de skills" in pt-BR. The agents chapter
carries only those two locales; the others fall back to English.

- `SeatSkillContent.describe` returns the tree as a flat, depth-first list of `{ name, description, when, parent }`
  instead of a `references` list. The HttpApi codegen does not support recursive schemas, so the client rebuilds the
  tree from `parent`.
- The tab shows the tree collapsed to the roots. Each node expands to its children, and a leaf shows its description
  and `when` line.
- Project and profile catalog skills appear below as their own flat group. They are not seat trees.
- Toolkit keeps showing tools and stops showing skill pages.

### Toolkit pack

`packages/core/script/toolkit-pack.ts` generates `ENTRY_SKILLS` from the backend tree. It keeps emitting roots only.
`packages/core/test/skill/backend-families.test.ts` moves to the new paths.

## Tests and gates

- `modules/maestro/coordination/test/seat-skill-root.test.ts` and `seat-skills-build.test.ts` cover the tree rules.
  Each rule needs a case that fails on a broken tree: an orphan, wrong name, a fourth level, an 11th child, a missing
  `when`, and a link that escapes its leaf.
- A skill tool test loads a root, then a child, and checks the generated "Next level" index. It also checks that a
  node of another seat is denied.
- An app e2e checks that the Skill tree tab expands a root and shows a leaf.
- Gates: `bun run test:ci` on the files above, `typecheck.yml` on the branch, and `bun run check:guards --base
origin/dev`.

## Docs and skills

- `docs/guides/agent-screen.md` and `docs/guides/skills.md` explain the Skill tree tab.
- `.orchestra/skills/orchestra-maintenance` gets the tree rules and the steps to add a node.
- Both stay repo-only. The trees themselves ship, as seat skills do today.

## Cost and what this does not prove

- Each level is one more `skill` call. A gRPC endpoint on FastAPI costs about five loads where it costs three today,
  but each load is small and on topic.
- A wrong first branch costs a wasted load. The `not-when` lines exist to lower that risk.
- Research on tool selection reports that hierarchical choice beats a flat list of many tools (AnyTool, 2024). Only
  an eval on our own packets would show that it helps these seats. None runs without the owner's permission.

## Order of work

1. Check how V2 resolves seat skills, and fix it if seat roots are not registered.
2. Validation and loader changes, with their tests.
3. Move existing content: the backend tree with `team-stack`, then `archie`, `jimmy` and Maestro's playbooks.
4. Prompt changes for those seats.
5. Agent screen Skill tree tab, then i18n, then e2e.
6. Docs and the maintenance skill.
7. Write the new trees, one PR per seat: `lucy`, `billy`, `patty`, `rosie`, `frankie`, `live`. Each PR includes that
   seat's prompt line.
