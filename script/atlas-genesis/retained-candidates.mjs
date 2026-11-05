// Candidate-only recovery. One atomic, retried union per source; never restore sidecars by copying them.
// The caller pins sourceRevision from GitHub metadata and verifies ancestry/index reuse before entry.
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname, join, resolve, sep } from "node:path"

const HASH = /^[0-9a-f]{64}$/
const REVISION = /^[0-9a-f]{40}$/

class RetainedCandidatesError extends Error {
  constructor(code, details) {
    super(`retained-candidates:${code}`)
    this.name = "RetainedCandidatesError"
    this.code = code
    this.details = details
  }
}

const refuse = (code, details = {}) => { throw new RetainedCandidatesError(code, details) }
const requireValue = (condition, code, details) => { if (!condition) refuse(code, details) }

// Check components, not just the final inode: intermediate symlinks must not redirect a CAS/source read.
function contained(root, relative) {
  requireValue(typeof relative === "string" && relative.length > 0 && !/[\\:\0]/.test(relative), "unsafe-path")
  const segments = relative.split("/")
  requireValue(segments.every((s) => s && s !== "." && s !== ".." && s !== ".git"), "unsafe-path")
  let path = root
  for (const segment of segments) {
    path = join(path, segment)
    // lstat also detects dangling links, unlike existsSync.
    const stat = lstatSync(path, { throwIfNoEntry: false })
    requireValue(!stat?.isSymbolicLink(), "unsafe-path", { path })
  }
  return path
}

function rootPath(path) {
  requireValue(typeof path === "string" && path.length > 0, "unsafe-root")
  const root = resolve(path)
  requireValue(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), "unsafe-root")
  return realpathSync(root)
}

function regularBytes(root, relative) {
  const path = contained(root, relative)
  const stat = lstatSync(path, { throwIfNoEntry: false })
  requireValue(stat?.isFile() && stat.size <= 64 * 1024 * 1024, "missing-or-unsafe-file", { relative })
  return readFileSync(path)
}

function safeObject(value) {
  if (value === null || typeof value !== "object") return
  requireValue(Object.getPrototypeOf(value) === (Array.isArray(value) ? Array.prototype : Object.prototype), "unsafe-prototype")
  for (const key of Object.keys(value)) {
    safeObject(value[key])
  }
}

// Inspect every supplied generation as well as using the store's own highest-readable-generation reader.
// A corrupt/foreign newest file must not silently turn this recovery into a fallback-to-older import.
function inspectSidecars(root, relative, identity, required) {
  const dir = contained(root, relative)
  const names = existsSync(dir) ? readdirSync(dir).filter((n) => /^staging(?:\.\d{1,15})?\.json$/.test(n)) : []
  requireValue(!required || names.length > 0, "missing-staging")
  for (const name of names) {
    const wire = JSON.parse(regularBytes(root, `${relative}/${name}`).toString("utf8"))
    safeObject(wire)
    requireValue(wire.identity === identity, "identity-mismatch")
    requireValue(Array.isArray(wire.current) && Array.isArray(wire.cas), "staging-shape")
    requireValue(wire.current.every((e) => Array.isArray(e) && e.length === 2 && e[0] === e[1]?.nodeKey), "staging-shape")
    requireValue(new Set(wire.current.map(([key]) => key)).size === wire.current.length, "duplicate-node-key")
  }
}

/** Restore integrity-checked candidate snapshots, not truth judgments. Throws a named refusal with .receipt.
 * Each source is atomic; a later source refusal can follow an earlier settled source (recorded in .receipt).
 * CAS installation uses exclusive link publication: metadata-excluded collisions never overwrite bytes.
 */
export async function restoreRetainedCandidates(repo, sources) {
  const audit = { settled: false, sources: [], retainedKeys: [], retainedClaims: 0 }
  try {
    requireValue(Array.isArray(sources) && sources.length > 0, "missing-sources")
    const destination = rootPath(repo)
    const { createDiskStore, IDENTITY_SCHEMA, initAst, foldAstUnits, gitSidecarTrust } = await import(
      "../../modules/atlas/packages/adapter-io/dist/src/index.js"
    )
    const { id } = await import("../../modules/atlas/packages/kernel/dist/src/index.js")
    const { nodeKey, primaryAnchorId, relationKey, negationKey, normalizeCheck } = await import(
      "../../modules/atlas/packages/knowledge/dist/src/index.js"
    )
    const { build } = await import("../../modules/atlas/packages/index/dist/src/index.js")
    await initAst()
    const objects = new Map()
    const fileTrees = new Map()
    const readSnapshot = (store) => {
      const read = store.commitStaging((p) => ({ out: p }))
      requireValue(read.settled, "staging-read-refused", { refusal: read.refusal })
      return read.out
    }
    const checkGrounding = (fact) => {
      requireValue(Array.isArray(fact.grounding?.entries) && fact.grounding.entries.length > 0, "missing-grounding")
      for (const entry of fact.grounding.entries) {
        const qualified = entry.anchor?.qualifiedPath
        requireValue(typeof qualified === "string" && typeof entry.anchor.subtreeHash === "string" && HASH.test(entry.anchor.subtreeHash), "grounding-shape")
        const file = qualified.split("::")[0]
        requireValue(entry.path === file && ["file", "symbol"].includes(entry.anchor.kind), "unsupported-grounding")
        if (!fileTrees.has(file)) {
          const content = regularBytes(destination, file).toString("utf8")
          fileTrees.set(file, build(foldAstUnits({ path: file, content, children: [] }), { documents: [] }).spatial)
        }
        const find = (tree) => tree.key === qualified ? tree : tree.children.map(find).find(Boolean)
        requireValue(find(fileTrees.get(file))?.subtreeHash === entry.anchor.subtreeHash, "grounding-mismatch", { file })
      }
    }
    const readCas = (store, root, prefix, hash) => {
      requireValue(typeof hash === "string" && HASH.test(hash), "invalid-cas-reference")
      const bytes = regularBytes(root, `${prefix}/${hash.slice(0, 2)}/${hash}`)
      const value = store.get(hash)
      requireValue(value !== undefined && String(id(value)) === hash, "cas-integrity", { hash })
      safeObject(value)
      // Native DiskStore serialization is required so retry/read-back compares exact stored bytes.
      requireValue(bytes.equals(Buffer.from(JSON.stringify(value))), "cas-serialization", { hash })
      const prior = objects.get(hash)
      requireValue(prior === undefined || prior.bytes.equals(bytes), "cas-byte-conflict", { hash })
      objects.set(hash, { value, bytes })
      return value
    }
    const validateRow = (key, row, store, root, prefix, revision) => {
      safeObject(row)
      requireValue(HASH.test(key) && row.nodeKey === key && row.tier === "T2" && row.scope === "atlas:mined", "row-identity")
      requireValue(typeof row.derivedAt === "string" && REVISION.test(row.derivedAt) && (revision === undefined || row.derivedAt === revision), "source-revision-mismatch", { key })
      requireValue(Array.isArray(row.claims) && row.claims.length > 0 && new Set(row.claims).size === row.claims.length, "claim-shape")
      requireValue(row.claims.every((c) => typeof c === "string" && c.length > 0 && c === c.normalize("NFC")), "claim-shape")
      const checkFact = (hash, claim) => {
        const fact = readCas(store, root, prefix, hash)
        requireValue(fact && typeof fact === "object" && fact.kind === row.family && fact.tier === "T2" && fact.scope === "atlas:mined", "fact-shape")
        const view = { ...fact, slot: fact.predicateSlot }
        const intrinsic = ["advisory", "predicate"].includes(fact.kind) ? String(nodeKey(view)) : undefined
        const minted = fact.kind === "relation" ? String(relationKey(fact.endpointA, fact.relationKind, fact.endpointB))
          : fact.kind === "negation" ? String(negationKey(fact.relationKind, fact.target, fact.scope))
          : fact.kind === "advisory" && fact.quarantine !== undefined ? String(id({ quarantineOf: intrinsic, reason: fact.quarantine })) : intrinsic
        requireValue(minted === key && fact.predicateSlot === row.slot, "node-key-mismatch", { key })
        const anchor = fact.kind === "relation" ? fact.endpointA : String(primaryAnchorId(view))
        requireValue(anchor === row.primaryAnchor, "anchor-mismatch", { key })
        const text = fact.kind === "predicate" ? normalizeCheck(fact.check)
          : fact.kind === "relation" ? `${fact.endpointA} ${fact.relationKind} ${fact.endpointB}` : fact.claimNorm
        requireValue(typeof text === "string" && (claim === undefined || text === claim), "claim-fact-mismatch", { key })
        checkGrounding(fact)
        return text
      }
      const checkAnswer = (hash) => {
        if (hash !== undefined) requireValue(typeof readCas(store, root, prefix, hash) === "string", "answer-shape")
      }
      const mainClaim = checkFact(row.contentHash)
      checkAnswer(row.answerRef)
      requireValue(row.claims.includes(mainClaim), "claim-fact-mismatch", { key })
      const evidence = row.claimEvidenceByClaim === undefined ? (() => {
        requireValue(row.claims.length === 1 && row.claims[0] === mainClaim, "legacy-multiclaim", { key })
        return { [mainClaim]: { factRef: row.contentHash, ...(row.answerRef === undefined ? {} : { answerRef: row.answerRef }) } }
      })() : row.claimEvidenceByClaim
      safeObject(evidence)
      requireValue(evidence && typeof evidence === "object" && !Array.isArray(evidence), "claim-evidence-shape")
      requireValue(Object.keys(evidence).length === row.claims.length && row.claims.every((c) => Object.hasOwn(evidence, c)), "claim-evidence-keys", { key })
      for (const claim of row.claims) {
        const receipt = evidence[claim]
        requireValue(receipt && typeof receipt === "object" && Object.hasOwn(receipt, "factRef") && Object.keys(receipt).every((k) => ["factRef", "answerRef"].includes(k)), "claim-evidence-shape")
        checkFact(receipt.factRef, claim)
        checkAnswer(receipt.answerRef)
      }
      requireValue(evidence[mainClaim].factRef === row.contentHash && evidence[mainClaim].answerRef === row.answerRef, "row-receipt-mismatch", { key })
      return { ...row, claimEvidenceByClaim: evidence }
    }
    inspectSidecars(destination, ".atlas", IDENTITY_SCHEMA, false)
    const prepared = sources.map((source) => {
      safeObject(source)
      requireValue(typeof source.sourceRevision === "string" && REVISION.test(source.sourceRevision), "invalid-source-revision")
      const root = rootPath(source.artifactRoot)
      audit.activeSource = { artifactRoot: root, sourceRevision: source.sourceRevision }
      requireValue(root !== destination && !root.startsWith(destination + sep) && !destination.startsWith(root + sep), "overlapping-source-destination")
      inspectSidecars(root, "atlas", IDENTITY_SCHEMA, true)
      const store = createDiskStore(contained(root, "atlas/cas"))
      const snapshot = readSnapshot(store)
      requireValue(snapshot.current.size > 0, "empty-source")
      const rows = [...snapshot.current].map(([key, row]) => {
        requireValue(snapshot.cas.has(row.contentHash), "staging-cas-membership")
        return [key, validateRow(key, row, store, root, "atlas/cas", source.sourceRevision)]
      })
      return { artifactRoot: root, sourceRevision: source.sourceRevision, rows }
    })
    for (const source of prepared) {
      audit.activeSource = { artifactRoot: source.artifactRoot, sourceRevision: source.sourceRevision }
      // New rows MUST retain this source's revision. Omitting headSha drops new-row derivedAt;
      // using destination HEAD launders it. A separate atomic commit per source avoids both.
      const disk = createDiskStore(contained(destination, ".atlas/cas"), () => source.sourceRevision, gitSidecarTrust(destination))
      const checkDestinationObject = (hash, expected) => {
        const path = contained(destination, `.atlas/cas/${hash.slice(0, 2)}/${hash}`)
        if (!existsSync(path)) return
        requireValue(regularBytes(destination, `.atlas/cas/${hash.slice(0, 2)}/${hash}`).equals(expected), "cas-byte-conflict", { hash })
        requireValue(disk.get(hash) !== undefined, "destination-cas-integrity", { hash })
      }
      disk.put = (value) => {
        const hash = String(id(value))
        const bytes = Buffer.from(JSON.stringify(value))
        checkDestinationObject(hash, bytes)
        const path = contained(destination, `.atlas/cas/${hash.slice(0, 2)}/${hash}`)
        if (!existsSync(path)) {
          mkdirSync(dirname(path), { recursive: true })
          const temporary = join(dirname(path), `.retained-${randomUUID()}.tmp`)
          const fd = openSync(temporary, "wx", 0o600)
          try {
            try {
              writeFileSync(fd, bytes)
              fsyncSync(fd)
            } finally {
              closeSync(fd)
            }
            try {
              linkSync(temporary, path)
            } catch (error) {
              if (error.code !== "EEXIST") throw error
            }
          } finally {
            unlinkSync(temporary)
          }
        }
        // Never delegate back to the native nonexclusive writer after exclusive installation.
        requireValue(regularBytes(destination, `.atlas/cas/${hash.slice(0, 2)}/${hash}`).equals(bytes), "cas-byte-conflict", { hash })
        const stored = disk.get(hash)
        requireValue(stored !== undefined && String(id(stored)) === hash, "destination-cas-integrity", { hash })
        return hash
      }
      const commit = disk.commitStaging((snapshot) => {
        const current = new Map(snapshot.current)
        const cas = new Set(snapshot.cas)
        const decisions = []
        const puts = new Map()
        for (const [key, incoming] of source.rows) {
          const existing = current.get(key)
          const prior = existing === undefined ? undefined : validateRow(key, existing, disk, destination, ".atlas/cas")
          const priorEvidence = prior?.claimEvidenceByClaim ?? {}
          // Match the production carrier: these are arbitrary own claim keys, not property assignments.
          const evidence = Object.fromEntries([
            ...Object.entries(priorEvidence),
            ...Object.entries(incoming.claimEvidenceByClaim).filter(([claim]) => !Object.hasOwn(priorEvidence, claim)),
          ])
          for (const claim of incoming.claims) {
            const before = Object.hasOwn(priorEvidence, claim) ? priorEvidence[claim] : undefined
            const after = incoming.claimEvidenceByClaim[claim]
            requireValue(before === undefined || before.factRef === after.factRef, "claim-fact-conflict", { key, claim, before, after })
            requireValue(before === undefined || before.answerRef === after.answerRef, "claim-answer-conflict", { key, claim, before, after })
          }
          const claims = [...new Set([...(prior?.claims ?? []), ...incoming.claims])]
          const row = { ...(existing ?? incoming), claims, claimEvidenceByClaim: evidence }
          const changed = JSON.stringify(row) !== JSON.stringify(existing)
          if (changed) current.set(key, row)
          decisions.push({ nodeKey: key, decision: existing === undefined ? "added" : changed ? "union" : "unchanged", claimsAdded: claims.length - (prior?.claims.length ?? 0) })
          for (const receipt of Object.values(incoming.claimEvidenceByClaim)) {
            cas.add(receipt.factRef)
            for (const hash of [receipt.factRef, receipt.answerRef].filter((h) => h !== undefined)) {
              checkDestinationObject(hash, objects.get(hash).bytes)
              puts.set(hash, objects.get(hash).value)
            }
          }
        }
        return {
          out: decisions,
          ...(decisions.some((d) => d.decision !== "unchanged") ? { next: { ...snapshot, current, cas }, put: [...puts.values()] } : {}),
        }
      })
      requireValue(commit.settled, "staging-commit-refused", { refusal: commit.refusal })
      audit.sources.push({ artifactRoot: source.artifactRoot, sourceRevision: source.sourceRevision, rowCount: source.rows.length, rows: source.rows.map(([nodeKey, row]) => ({ nodeKey, claims: row.claims, evidence: row.claimEvidenceByClaim, derivedAt: row.derivedAt })), decisions: commit.out })
      audit.retainedKeys = [...new Set(audit.sources.flatMap((s) => s.rows.map((row) => row.nodeKey)))].sort()
      audit.retainedClaims = new Set(audit.sources.flatMap((s) => s.rows.flatMap((row) => row.claims.map((c) => JSON.stringify([row.nodeKey, c]))))).size
    }
    delete audit.activeSource
    return { ...audit, retainedKeyCount: audit.retainedKeys.length, settled: true }
  } catch (error) {
    const refusal = error instanceof RetainedCandidatesError ? error : new RetainedCandidatesError("invalid-source-or-destination", { message: error.message })
    refusal.receipt = { ...audit, refusal: refusal.code, conflict: refusal.details }
    if (refusal !== error) refusal.cause = error
    throw refusal
  }
}
