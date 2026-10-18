// @atlas/adapter-io — src/prompt.ts  (ADR-0011 Decision 3: the prompt is a versioned, hashed artifact)
//
// Builds the one S2 proposal prompt from a template that SHIPS AS A FILE (`prompts/propose.md`), rather
// than from a string literal. The template carries GEN-12 (abstention is valid), GEN-4d (no
// self-declaration), GEN-6 (a mined signal is not a fact) and the obviousness SCORE (non-obvious ∧
// actionable — scored by the harness, never a rejection: ADR-0012). A prompt
// that is freely editable AND invisible turns those invariants into suggestions, so the resolved template
// is DIGESTED and the digest travels with the run: an override is recorded, never silent.
//
// The template's own per-clause justification lives inside it as an HTML comment and is STRIPPED here, so
// the reasoning is versioned next to the text without being sent to the model.

import { closeSync, constants as fsConstants, existsSync, fstatSync, openSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { id, defaultEncoder } from "@atlas/kernel"
import { bindSpan } from "@atlas/grounding"
import type { GroundingSpan } from "@atlas/grounding"
import type { Hash, StructRef } from "@atlas/contracts"
import type { Candidate } from "@atlas/genesis"

import { isContainedIn } from "./containment.js"

/** The read-open flags of the N14 door (`store.ts`), which this reader now mirrors. `O_NOFOLLOW` ⇒ a symlink
 *  AT the final component fails to open (ELOOP) atomically; `O_NONBLOCK` ⇒ opening a FIFO returns instead of
 *  blocking on a writer. Declared here rather than exported from `store.ts`: the flag set is three constants,
 *  and widening a store's public surface to share them would cost more than restating them. */
const O_READ_NO_SYMLINK = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0) | (fsConstants.O_NONBLOCK ?? 0)

/** Why a prompt could not be built. Thrown, never papered over — see `NO_SOURCE` in particular. */
export type PromptRefusal =
  | "template-unreadable"
  | "template-has-no-source-slot" //   a template that never interpolates the code would send an empty ask
  | "template-has-no-related-slot" //  a `related` reader was injected but the template omits {{RELATED}}
  | "template-has-no-candidates-slot" // a `candidates` reader was injected but the template omits {{CANDIDATES}}
  | "source-unreadable" //            sending a source-less prompt is what invites a fabricated fact

export class PromptError extends Error {
  constructor(
    readonly refusal: PromptRefusal,
    message: string,
  ) {
    super(message)
    this.name = "PromptError"
  }
}

/** The four slots the template may interpolate. `{{SOURCE}}` is MANDATORY (see `assertUsable`). `{{RELATED}}`
 *  is MANDATORY ONLY when an enriched template is used (a `related` reader is injected). */
const SLOT_SOURCE = "{{SOURCE}}"
const SLOT_PATH = "{{PATH}}"
const SLOT_UNIT = "{{UNIT}}"
const SLOT_RELATED = "{{RELATED}}"
const SLOT_CANDIDATES = "{{CANDIDATES}}"

/**
 * The shipped template, resolved from the PACKAGE ROOT — the nearest ancestor holding a `package.json`.
 *
 * Not module-relative, and the difference is a real shipping bug rather than a style choice: `tsc` emits to
 * `dist/` and copies no assets, so `dirname(module)/../prompts` resolves to `packages/adapter-io/prompts`
 * from source and to `packages/adapter-io/dist/prompts` — which does not exist — from the build. Tests
 * import from `src/` and would stay green while the shipped CLI refused every run. Found by probing the
 * built binary, never by the suite.
 *
 * No cwd is consulted, so the CLI, the MCP server and a test all resolve the same file.
 */
export function shippedTemplatePath(): string {
  return join(packageRoot(dirname(fileURLToPath(import.meta.url))), "prompts", "propose.md")
}

/** The ENRICHED proposal template (opt-in ENRICH arm) — resolved the same package-root way as
 *  `shippedTemplatePath` (see its note on why not module-relative). Carries the `{{RELATED}}` slot the
 *  bare template omits; used only when a `SiblingReader` is injected into `createPromptFactory`. */
export function shippedEnrichedTemplatePath(): string {
  return join(packageRoot(dirname(fileURLToPath(import.meta.url))), "prompts", "propose-enriched.md")
}

/** The DEPENDENCY proposal template (ADR-0017 dependency slot, opt-in `ATLAS_MINE_SLOT=dependency` arm) —
 *  resolved the same package-root way as `shippedTemplatePath`. Asks the model for one `DEPENDS-ON:
 *  <target> @ <scope>` line (or `NO-FACT`); paired with `dependencyClaimParser` (llm.ts). Uses only
 *  `{{PATH}}`/`{{UNIT}}`/`{{SOURCE}}` — no `{{RELATED}}` — so it loads with no sibling reader injected. */
export function shippedDependencyTemplatePath(): string {
  return join(packageRoot(dirname(fileURLToPath(import.meta.url))), "prompts", "propose-dependency.md")
}

/** The COUNT proposal template (#196c cardinality slot, opt-in `ATLAS_MINE_SLOT=count` arm) — resolved the same
 *  package-root way as `shippedTemplatePath`. Asks the model for one `COUNT: <name>` line (or `NO-FACT`), the
 *  name SELECTED from the closed `{{CANDIDATES}}` list of the unit's externally-called exports; paired with
 *  `makeCountClaimParser` (llm.ts). Uses `{{PATH}}`/`{{UNIT}}`/`{{SOURCE}}`/`{{CANDIDATES}}` — no `{{RELATED}}`. */
export function shippedCountTemplatePath(): string {
  return join(packageRoot(dirname(fileURLToPath(import.meta.url))), "prompts", "propose-count.md")
}

/** The DEFINITION proposal template (#196d definition slot, opt-in `ATLAS_MINE_SLOT=definition` arm) — resolved
 *  the same package-root way as `shippedTemplatePath`. Asks the model for one `DEFINES: <name>` line (or
 *  `NO-FACT`), the name SELECTED from the closed `{{CANDIDATES}}` list of the unit's own definitions; paired with
 *  `makeDefinitionClaimParser` (llm.ts). Uses `{{PATH}}`/`{{UNIT}}`/`{{SOURCE}}`/`{{CANDIDATES}}` — no `{{RELATED}}`. */
export function shippedDefinitionTemplatePath(): string {
  return join(packageRoot(dirname(fileURLToPath(import.meta.url))), "prompts", "propose-definition.md")
}

/** The SEMANTIC proposal template (196c — the ONE general justified arm, opt-in `ATLAS_MINE_SLOT=semantic`) —
 *  resolved the same package-root way as `shippedTemplatePath`. A SEMANTIC arm: no oracle, no candidate list.
 *  Asks the model to reason freely then emit ONE `atlas-fact` block carrying `{slot, claim, derivation}` — it
 *  CLASSIFIES the fact into one of the eight `SemanticSlot`s (gotcha is now just one option), states the claim,
 *  and supplies its contestable grounds (the derivation is the `justified` seal's persisted grounds); paired
 *  with `semanticClaimParser` (llm.ts). Uses only `{{PATH}}`/`{{UNIT}}`/`{{SOURCE}}` — no `{{CANDIDATES}}`, no
 *  `{{RELATED}}` — so it loads with just a source reader injected (like the bare `propose.md`, `block` contract). */
export function shippedSemanticTemplatePath(): string {
  return join(packageRoot(dirname(fileURLToPath(import.meta.url))), "prompts", "propose-semantic.md")
}

/** Walk up to the nearest directory containing `package.json`. Bounded by the filesystem root, so a module
 *  outside any package yields its own directory rather than looping. */
function packageRoot(from: string): string {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir
    const up = dirname(dir)
    if (up === dir) return from // reached the root without finding one
    dir = up
  }
}

/** Read the anchored unit's source. Injected because slicing a symbol out of a file is the AST's business,
 *  not this module's; `null` means the bytes could not be produced (deleted file, unresolvable anchor). */
export interface SourceReader {
  read(site: StructRef): string | null
}

/** One RELATED unit shown to the model as CONTEXT alongside the anchored target — its name and its bytes.
 *  Never a citation and never grounded: it exists only to widen what the proposer can SEE, so a fact whose
 *  truth depends on a sibling unit's bytes/type is derivable instead of guessed (#201, the cross-unit trap
 *  measured in A4-LEVER.md). The grounding anchor and the evidence span stay on the TARGET (see below). */
export interface RelatedUnit {
  readonly name: string
  readonly content: string
}

/** Resolve the CONTEXT units a target site references — the minimal same-file sibling set (identifier BFS,
 *  capped) that the anchored-unit-only view hides. Injected for the same reason as `SourceReader`: which
 *  siblings a symbol references is the AST's business. Total: an unresolvable/whole-file site yields `[]`. */
export interface SiblingReader {
  readSiblings(site: StructRef): readonly RelatedUnit[]
}

/** [#196a candidate-grounded] Resolve the CLOSED CANDIDATE LIST a dependency proposer selects from — the
 *  unit's real cross-unit dependency NAMES, computed mechanically from the index (`UnitDepsApi.candidatesFor`).
 *  Injected for the same reason as `SourceReader`: which symbols a unit depends on is the index's business,
 *  not the prompt's. The model may only SELECT from this list, which is what makes the pick sound (it resolves
 *  to a real symbol the gate re-proves) instead of a free-form guess. Total: an unknown/no-dep site yields `[]`. */
export interface CandidateReader {
  candidates(site: StructRef): readonly string[]
}

/** A prompt builder plus the digest of the template it was built from — the pair is what makes an override
 *  auditable. `digest` is the sealed kernel `id` (never a hand-rolled hash — KERNEL-1/2a) over the template
 *  TEXT AS READ, comments included, **NFC-normalized**.
 *
 *  NOT over the raw bytes, and the difference is observable rather than pedantic: `canonical.ts` normalizes
 *  every string it serializes, so two templates that differ only in Unicode normalization share one digest
 *  even though the NFD spelling is a byte longer on disk and DIFFERENT BYTES are sent to the model (measured
 *  against the built modules: 26 bytes vs 27, digests identical). That is the
 *  deliberate, ratified price of NFC in the canonical preimage (`canonical.ts:12` says the same thing about
 *  `id` in general), and it is stated here so nobody reads "raw bytes" and concludes the digest witnesses
 *  the file byte-for-byte. What it witnesses is the artifact up to Unicode normalization. */
export interface PromptFactory {
  readonly digest: Hash
  readonly build: (cand: Candidate) => string

  /**
   * THE EVIDENCE SPAN (owner-approved SPAN amendment, 2026-08-02): a `GroundingSpan` addressing the exact
   * bytes `build` would interpolate for `cand` — the evidence the claim must re-derive from — or `null`
   * when the source cannot be read.
   *
   * IT IS MINTED FROM BYTES ATLAS READ, NEVER FROM WHAT THE MODEL SAYS IT READ, and that is the point of
   * putting it here rather than in the output contract. The proposer's entire channel is
   * `CompletionResult.claim: string | null` (llm.ts) — one line of prose or an abstention — so there is no
   * wire on which a model could hand back a span, and `prompts/propose.md` is NOT amended to ask for one.
   * ADR-0011 already withholds `Candidate.signals` from the prompt so a proposer cannot self-certify; a
   * span taken from the model's own report would reinstate exactly that hazard. This one is computed from
   * the file's bytes before the model is called and is unchanged by whatever comes back.
   *
   * GRANULARITY, STATED RATHER THAN IMPLIED — the span is only ever as narrow as the reader is, and the
   * shipped reader is FILE-granular even for a `symbol` anchor (see `createFileSourceReader`). So today
   * this addresses the whole file that was shown. That is the honest current state, not a claim of
   * symbol-precision: what lands now is the CARRIER — content-addressed, re-derivable, no stored text —
   * and when symbol slicing arrives the range narrows with no change to the shape or to its readers.
   */
  readonly evidenceSpan: (cand: Candidate) => GroundingSpan | null
}

/**
 * Load a prompt template and return a `buildPrompt` over it.
 *
 * The digest is taken over the file as it ships — including the justification comment, and NFC-normalized by
 * the canonicalizer (see `PromptFactory.digest`) — because the question provenance has to answer is "which
 * artifact produced this fact", and an edit to the reasoning is an edit to the artifact even when the sent
 * text is unchanged.
 */
export function createPromptFactory(deps: {
  source: SourceReader
  templatePath?: string
  /** OPT-IN cross-unit context (the ENRICH fix, A4-LEVER.md). ABSENT ⇒ byte-identical to the shipped
   *  anchored-unit-only prompt — the default arm is unchanged. PRESENT ⇒ the template MUST carry `{{RELATED}}`
   *  and `build` interpolates the sibling context; the grounding anchor and `evidenceSpan` are UNTOUCHED — a
   *  related unit is what the model SEES, never what the fact is anchored to (KNOW-15g). */
  related?: SiblingReader
  /** [#196a] OPT-IN candidate list for the CANDIDATE-GROUNDED dependency arm. ABSENT ⇒ unchanged. PRESENT ⇒
   *  the template MUST carry `{{CANDIDATES}}` and `build` interpolates the unit's real cross-unit dep NAMES,
   *  the closed set the model SELECTS from. Does not touch the anchor or `evidenceSpan`. */
  candidates?: CandidateReader
}): PromptFactory {
  const path = deps.templatePath ?? shippedTemplatePath()
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch (e) {
    throw new PromptError("template-unreadable", `the prompt template at ${path} could not be read: ${String(e)}`)
  }
  const template = assertUsable(stripComments(raw), path, deps.related !== undefined, deps.candidates !== undefined)
  const digest = id({ promptTemplate: raw } as never)
  // The GROUND-10 seam, not a local digest: a blake3↔stub encoder swap flows through spans exactly as it
  // flows through every anchor. `bindSpan` refuses anything that is not a real in-bounds byte range.
  const { mintSpan } = bindSpan(defaultEncoder)

  return {
    digest,
    evidenceSpan(cand: Candidate): GroundingSpan | null {
      const source = deps.source.read(cand.site)
      if (source === null) return null // no bytes ⇒ no span. Absent means UNKNOWN, never "the whole unit".
      const bytes = new TextEncoder().encode(source)
      return mintSpan(bytes, 0, bytes.length) ?? null
    },
    build(cand: Candidate): string {
      const site = cand.site
      const source = deps.source.read(site)
      if (source === null) {
        // NOT an abstention. An abstention says "this unit holds no fact"; this says "we never showed the
        // model the unit". Collapsing the two would let a broken source path read as a barren repository.
        throw new PromptError(
          "source-unreadable",
          `no source could be read for ${site.qualifiedPath} — refusing to prompt without the bytes the ` +
            `claim must re-derive from`,
        )
      }
      // The RELATED context (opt-in). Interpolated BEFORE the target source so the target bytes — injected
      // LAST — are never re-scanned for a slot token. A related unit is CONTEXT the model sees; it is not
      // grounded and does not touch `evidenceSpan`/the anchor above.
      const related = deps.related === undefined ? "" : renderRelated(deps.related.readSiblings(site))
      // [#196a] The CANDIDATE list (opt-in) — the unit's real cross-unit dep names the model selects from. Also
      // interpolated BEFORE the source, for the same reason. Never touches the anchor/`evidenceSpan`.
      const candidates = deps.candidates === undefined ? "" : deps.candidates.candidates(site).join(", ")
      return template
        .split(SLOT_PATH)
        .join(filePathOf(site))
        .split(SLOT_UNIT)
        .join(unitNameOf(site))
        .split(SLOT_RELATED)
        .join(related)
        .split(SLOT_CANDIDATES)
        .join(candidates)
        .split(SLOT_SOURCE)
        .join(source)
    },
  }
}

/**
 * The shipped `SourceReader`: the FILE the anchor lives in, read from the repo.
 *
 * **Granularity is stated, not implied.** This is FILE-granular even for a `symbol` anchor — slicing the
 * exact subtree out needs the AST fold, which is a separate seam. The consequence is real and belongs on
 * the record: the model is shown more than the anchored unit, so a claim it makes may be true of the file
 * while being attributed to the symbol. The admission gate re-derives against the anchor regardless, so
 * this widens what may be PROPOSED, never what may be admitted. Symbol-granular slicing is the refinement.
 *
 * **ONLY BYTES THAT REALLY LIVE IN THE REPOSITORY ARE READ**, and nothing else is (`null`). `qualifiedPath`
 * originates in the index, but a reader that trusts its input is one index bug away from serving
 * `/etc/passwd` to the operator's model endpoint — and that is not hypothetical: a textual `relative()` test
 * plus a plain `readFileSync` PASSED a git-tracked symlink `src/leak.ts → /etc/passwd` and sent the target's
 * bytes, because the string never left the repo while the read did. Three checks, in cost order:
 *
 *   1. the textual escape — `../` and absolutes, refused without touching the filesystem;
 *   2. KERNEL-IDENTITY containment (`containment.ts`) — a symlinked INTERMEDIATE directory pointing out of
 *      the tree passes (1) and passes (3), because its final component is an ordinary file;
 *   3. an fd-pinned read mirroring the N14 door in this same package (`store.ts`): `O_NOFOLLOW` makes a
 *      final-component symlink fail to open, `fstat` on the OPEN fd refuses anything that is not a regular
 *      file (device / FIFO / directory / socket), and the bytes come FROM THAT fd, so a post-check swap
 *      cannot redirect the read. The fd is always closed.
 *
 * **DELIBERATE BEHAVIOUR CHANGE: A SYMLINK IS NEVER READ AS SOURCE**, not even one pointing at another file
 * inside the repository. Reading a link's target and attributing the resulting claim to the link's own path
 * was never sound — the claim would name a unit whose bytes are somewhere else — so refusing is the safe
 * direction, and it is the direction N14 already took for the CAS.
 *
 * Total: every refusal is `null` and nothing throws, because the caller (`createPromptFactory.build`) turns
 * `null` into a stated refusal rather than a prompt without source.
 */
export function createFileSourceReader(repoPath: string): SourceReader {
  const root = resolve(repoPath)
  return {
    read(site: StructRef): string | null {
      const rel = filePathOf(site)
      const abs = resolve(root, rel)
      const inside = relative(root, abs)
      if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return null // escapes the repo
      if (!isContainedIn(root, abs)) return null // …and the bytes really live there, by (dev, ino)
      let fd: number | undefined
      try {
        fd = openSync(abs, O_READ_NO_SYMLINK) // final-component symlink ⇒ ELOOP ⇒ refused
        if (!fstatSync(fd).isFile()) return null // device / FIFO / dir / socket, decided on the pinned inode
        return readFileSync(fd, "utf8") // FROM THE fd — the inode is pinned, never re-resolved
      } catch {
        return null // deleted / unreadable / a directory — the caller REFUSES rather than prompting blind
      } finally {
        if (fd !== undefined) {
          try {
            closeSync(fd)
          } catch {
            /* best-effort close; the refuse/read decision above is already made */
          }
        }
      }
    },
  }
}

/** Remove the template's own justification block. Non-greedy and repeated, so several comments are handled
 *  and a `-->` inside prose cannot swallow the rest of the file. Both halves of that sentence now have a
 *  WITNESS (`prompt.test.ts`, "the strip is NON-GREEDY and REPEATED"): the shipped template carries exactly
 *  one comment and no stray `-->`, so dropping the `?` survived the entire suite until a fixture with two
 *  comments and an arrow in the prose between them was added. */
function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->\n?/g, "").trimStart()
}

/** A template that never interpolates the code would send a well-formed ask with nothing to ground against,
 *  and the model would answer it from memory. Refusing at LOAD time makes that unshippable rather than a
 *  quiet degradation on every site. When a `related` reader is injected, the template MUST carry `{{RELATED}}`
 *  too — otherwise the enriched context is silently dropped and the ENRICH arm would run as the bare arm
 *  while claiming otherwise, the exact "wired but not functional" trap. */
function assertUsable(template: string, path: string, requireRelated: boolean, requireCandidates: boolean): string {
  if (!template.includes(SLOT_SOURCE)) {
    throw new PromptError(
      "template-has-no-source-slot",
      `the prompt template at ${path} never interpolates ${SLOT_SOURCE} — a prompt carrying no source ` +
        `cannot be grounded, and the model would answer it from parametric memory`,
    )
  }
  if (requireRelated && !template.includes(SLOT_RELATED)) {
    throw new PromptError(
      "template-has-no-related-slot",
      `the prompt template at ${path} never interpolates ${SLOT_RELATED}, but a sibling reader was injected ` +
        `— the enriched context would be silently dropped. Use the enriched template, or drop the reader`,
    )
  }
  if (requireCandidates && !template.includes(SLOT_CANDIDATES)) {
    throw new PromptError(
      "template-has-no-candidates-slot",
      `the prompt template at ${path} never interpolates ${SLOT_CANDIDATES}, but a candidate reader was ` +
        `injected — the candidate list would be silently dropped. Use the candidate-grounded template, or drop the reader`,
    )
  }
  return template
}

/** Render the RELATED units as CONTEXT blocks — the same shape the target unit is shown in, tagged as
 *  related so the template can frame them as context-only. Empty set ⇒ empty string (the enriched template's
 *  surrounding prose states that no related units means none were found). Order is the reader's — the caller
 *  (`createUnitSiblingReader`) returns them in a deterministic BFS order. */
function renderRelated(units: readonly RelatedUnit[]): string {
  return units.map((u) => `<related-unit name="${u.name}">\n${u.content}\n</related-unit>`).join("\n")
}

/** `qualifiedPath` is `<file>::<symbol>` for a symbol anchor and a bare path otherwise (struct.ts). Split on
 *  the FIRST separator only: a path may legitimately contain more (`::` is escaped upstream, not absent). */
function filePathOf(site: StructRef): string {
  const at = site.qualifiedPath.indexOf("::")
  return at === -1 ? site.qualifiedPath : site.qualifiedPath.slice(0, at)
}

/** The unit's own name — the symbol for a symbol anchor, otherwise the whole path (a file/repo anchor IS
 *  its path). Never empty: an unnamed unit gives the model nothing to anchor the claim to. */
function unitNameOf(site: StructRef): string {
  const at = site.qualifiedPath.indexOf("::")
  const name = at === -1 ? site.qualifiedPath : site.qualifiedPath.slice(at + 2)
  return name === "" ? site.qualifiedPath : name
}
