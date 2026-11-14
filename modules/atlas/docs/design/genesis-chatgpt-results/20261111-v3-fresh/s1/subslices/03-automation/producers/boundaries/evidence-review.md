# Evidência para revisão sem ferramentas

Projeção literal de branches/condições/erros decisivos, delimitada por corpo. Não substitui `evidence.md` integral nem `sources/`; fixtures extensas são representadas por contratos concretos e `coverage.jsonl` mantém a disposição dos 128 paths. Os juízes podem responder REQUEST_EVIDENCE nomeando path/linhas/claim faltante. Não há teste executado ou aceite pré-atribuído.

Índice pai: `records/evidence-index.json`. Cada entrada R abaixo é um subintervalo literal contido em um intervalo do índice pai. O subintervalo tem SHA256 próprio em `records/evidence-review-index.json`; o SHA256 integral e Git blob identificam a fonte. Os fences não acrescentam números de linha aos bytes citados.

# Necessidade de revisão: `bodies/boundaries.md`

Corpo deve ser lido integralmente; os trechos abaixo sustentam ramos decisivos e limites.

## R001 ← B01 — `packages/core/src/atlas.ts` 38–48

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f6718654785fb155e1bb1b2acb7e9985478b983b`; SHA256 fonte `4a80f71532a9766f0cfaa67e4a4474ae4d49dbe30a811033ce57a1fb9c58bec4`. Pai B01 38–48; SHA256 trecho `563edd58082b309091eeacfece73526e772a0c2f51682d233f5c8683fcd832f9`.

`````text
import type { AppProcess } from "./process"
import { Project } from "./project"

// The host side of the Atlas screen, shared by the legacy instance routes and the V2 server. `open` binds the Atlas
// surface (the boundary's `./surface` entry) to one store root and runs each read or write in process. The surface is
// synchronous: `own`, `health` and every write compose Atlas's runtime, which walks the tracked tree, so those calls
// hold the fiber for as long as that takes. A throw (an unreadable store, a disk fault during a commit) becomes
// `Unavailable`, never a defect.
// Setup (D37, D38): `install` creates the store and `index` runs the indexer the plan names. Mining (D39, D40) runs the
// boundary's `./mine` entry; `delegate` (D33) drafts interview answers. Both take the model call from the host, which
// owns provider resolution.
`````

## R002 ← B01 — `packages/core/src/atlas.ts` 109–125

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f6718654785fb155e1bb1b2acb7e9985478b983b`; SHA256 fonte `4a80f71532a9766f0cfaa67e4a4474ae4d49dbe30a811033ce57a1fb9c58bec4`. Pai B01 103–195; SHA256 trecho `0afd3100af381a552b078f72fb9e06a16855a86cbd00623800c1a67ada028df8`.

`````text
 */
export const open = (dependencies: Dependencies, root: string, projectID: string): Interface => {
  const runAt = <A>(name: string, call: () => A) =>
    Effect.try({ try: call, catch: (cause) => new Unavailable({ message: firstLine(cause) }) }).pipe(
      Effect.withSpan(`AtlasSurface.${name}`),
    )
  const run = <A>(name: string, call: (surface: ReturnType<typeof openSurface>) => A) =>
    runAt(name, () => call(openSurface(root)))
  const stored = () => existsSync(join(root, ".atlas"))
  const health = () => run("health", (surface) => surface.health())
  return {
    snapshot: () => run("snapshot", (surface) => surface.snapshot()),
    reasoning: (id) => run("reasoning", (surface) => surface.reasoning(id)),
    own: (scope) => run("own", (surface) => surface.own(scope)),
    health,
    promote: (input) => run("promote", (surface) => surface.promote(input)),
    draft: (input) => run("draft", (surface) => surface.draft(input)),
`````

## R003 ← B01 — `packages/core/src/atlas.ts` 132–148

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f6718654785fb155e1bb1b2acb7e9985478b983b`; SHA256 fonte `4a80f71532a9766f0cfaa67e4a4474ae4d49dbe30a811033ce57a1fb9c58bec4`. Pai B01 103–195; SHA256 trecho `60fb78951c8180953fe30027987fe4cbfc7c53d93b8133a88dcfd7f3d427bf1d`.

`````text
    propose: (input) => run("propose", (surface) => surface.propose(input)),
    decide: (input) => run("decide", (surface) => surface.decide(input)),
    answer: (input) => run("answer", (surface) => surface.answer(input)),
    memoryDecide: (input) => run("memoryDecide", (surface) => surface.memoryDecide(input)),
    territory: (input) => run("territory", (surface) => surface.territory({ ...input, projectId: projectID })),
    install: () => run("install", (surface) => surface.install()),
    index: () => index(dependencies, health, root),
    mineSites: (ceiling) =>
      runAt("mineSites", (): MineSitesResult => (stored() ? { state: "ok", ...mineSites(root, ceiling) } : EMPTY)),
    mineWith: (input) =>
      runAt(
        "mineWith",
        (): MineWithResult =>
          stored() ? { state: "ok", ...mineWith(root, input.ceiling, input.answers, input.model) } : EMPTY,
      ),
  }
}
`````

## R004 ← B02 — `packages/core/src/atlas.ts` 259–280

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f6718654785fb155e1bb1b2acb7e9985478b983b`; SHA256 fonte `4a80f71532a9766f0cfaa67e4a4474ae4d49dbe30a811033ce57a1fb9c58bec4`. Pai B02 239–280; SHA256 trecho `a49655487628d72601ba2e9bc01d8d16c282d2b1b4715047fe48a72a9e8632a5`.

`````text
    )
  })
  return { state: "ok", drafted } as DelegateResult
})

const draftOne = Effect.fn("AtlasDelegate.draftOne")(function* (
  services: DelegateServices,
  input: DelegateInput,
  question: AtlasInterviewQuestion,
) {
  const reply = yield* services.draft(delegatePrompt(question))
  if (!reply || !reply.answer.trim())
    return refused(question.id, "the model did not reply with a non-empty answer and why")
  const written = yield* services.atlas.answer({
    questionId: question.id,
    answer: reply.answer.trim(),
    drafted: { model: `${input.providerID}/${input.modelID}`, why: reply.why.trim() },
  })
  if (written.state === "empty") return refused(question.id, "the Atlas store is gone")
  if (!written.ok) return refused(question.id, written.rejected ?? "the surface refused the draft")
  return { questionId: question.id, ok: true, rejected: null }
})
`````

## R005 ← B02 — `packages/core/src/atlas.ts` 301–312

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f6718654785fb155e1bb1b2acb7e9985478b983b`; SHA256 fonte `4a80f71532a9766f0cfaa67e4a4474ae4d49dbe30a811033ce57a1fb9c58bec4`. Pai B02 301–321; SHA256 trecho `1e5f5ce36026f5eaf1a6f63afc1a18cbfb8e95df7986b8b2cfe5476108531842`.

`````text
// Genesis mining from the screen (DECISIONS.md D40). The boundary lists the sites the advisory pass visits with the
// exact prompt `atlas mine` would send; the host asks the chosen model once per site, four at a time, as plain text;
// the boundary runs the pass again answering each site from those replies, through Atlas's own answer gate and
// admission, and stages the candidates. A site whose call fails is left out and abstains. Nothing is promoted.

export type MineInput = { readonly providerID: string; readonly modelID: string; readonly ceiling: number }

// An empty system prompt would fall back to the model's general coding prompt.
export const MINE_SYSTEM =
  "You read one unit of a codebase and follow the message's instructions exactly. A program reads your reply, so reply only in the format the message asks for."

export type MineServices = {
`````

## R006 ← B03 — `packages/core/src/control-plane/move-session.ts` 87–111

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `49fe728d6956ca1555a763548e9458ea5f3938dc`; SHA256 fonte `302fd923821d8f2d4124b8e4cca38485abe86c3f3c74e2f0b9bc420b56ec2518`. Pai B03 77–148; SHA256 trecho `c125deda18951ae663e9f40e740f9af36835befcacc859d8f547d9508e29fdb5`.

`````text
      }

      const moveChanges = input.moveChanges && source.directory !== destination.directory
      const sourceRepository = moveChanges ? yield* git.repo.discover(current.location.directory) : undefined
      if (moveChanges && !sourceRepository)
        return yield* new CaptureChangesError({ message: "Source is not a Git repository" })
      const patch = sourceRepository
        ? yield* git.change
            .capture({ repository: sourceRepository, path: current.location.directory })
            .pipe(Effect.mapError((error) => new CaptureChangesError({ message: error.message })))
        : Git.ChangeSet.make("")
      if (patch) {
        const repository = yield* git.repo.discover(directory)
        if (!repository) return yield* new ApplyChangesError({ message: "Destination is not a Git repository" })
        yield* git.change
          .apply({ repository, path: directory, changes: patch })
          .pipe(Effect.mapError((error) => new ApplyChangesError({ message: error.message })))
      }

      yield* events.publish(SessionEvent.Moved, {
        sessionID: input.sessionID,
        location: Location.Ref.make({ directory }),
        subdirectory: RelativePath.make(path.relative(destination.directory, directory).replaceAll("\\", "/")),
        timestamp: yield* DateTime.now,
      })
`````

## R007 ← B03 — `packages/core/src/control-plane/move-session.ts` 113–148

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `49fe728d6956ca1555a763548e9458ea5f3938dc`; SHA256 fonte `302fd923821d8f2d4124b8e4cca38485abe86c3f3c74e2f0b9bc420b56ec2518`. Pai B03 77–148; SHA256 trecho `ea6710cb925cd3c0dd6f7bc03aa40a771e1e8420068cbc3fa8ca5269429e031a`.

`````text
      if (patch) {
        const repository = yield* git.repo.discover(current.location.directory)
        if (!repository)
          return yield* new ResetSourceChangesError({
            directory: current.location.directory,
            message: "Source is not a Git repository",
          })
        yield* git.change
          .discard({
            repository,
            path: current.location.directory,
            index: "preserve",
            untracked: "remove",
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new ResetSourceChangesError({
                  directory: current.location.directory,
                  message: error.message,
                  cause: error.cause,
                }),
            ),
          )
      }
    })

    return Service.of({ moveSession })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Git.node, EventV2.node, ProjectV2.node, SessionStore.node],
})
`````

## R008 ← B04 — `packages/core/src/control-plane/workspace.sql.ts` 7–20

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ef5195216acf535817143614ccb517ef02197c5f`; SHA256 fonte `b85701f8a1ee137d04553459849e84e85e191e89641a2f779cf06140b8612cae`. Pai B04 1–20; SHA256 trecho `058414273bafda8a012099538f352903fe9c455d414956735a8481042424a956`.

`````text
  id: text().$type<WorkspaceV2.ID>().primaryKey(),
  type: text().notNull(),
  name: text().notNull().default(""),
  branch: text(),
  directory: text(),
  extra: text({ mode: "json" }),
  project_id: text()
    .$type<ProjectV2.ID>()
    .notNull()
    .references(() => ProjectTable.id, { onDelete: "cascade" }),
  time_used: integer()
    .notNull()
    .$default(() => Date.now()),
})
`````

## R009 ← B05 — `packages/core/src/rag-studio/sql.ts` 1–11

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `214ab3375acc34072ee74c3123501c80615bf488`; SHA256 fonte `e6c3580d95d86b307624fe8c58b5790f3a07ce17ed20e5cbe851b44667c7add9`. Pai B05 1–36; SHA256 trecho `a8d85c912e32f244d5326d7d6502d6df836f9011ae42fbdfa8238df346cdba4c`.

`````text
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

// Corpus tables from docs/specs/rag-studio/SPEC.md. Chunks have no foreign key: removeSource deletes the
// source row and leaves chunks for orphan_delete. Embedding has no column and no vector table.

export const RagSourceTable = sqliteTable(
  "rag_source",
  {
    id: text().primaryKey(),
    location_id: text().notNull(),
    path: text().notNull(),
`````

## R010 ← B05 — `packages/core/src/rag-studio/sql.ts` 72–81

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `214ab3375acc34072ee74c3123501c80615bf488`; SHA256 fonte `e6c3580d95d86b307624fe8c58b5790f3a07ce17ed20e5cbe851b44667c7add9`. Pai B05 38–81; SHA256 trecho `0cb2df26a50267d608c3f24fdb576545f85a57247eda0e8edb2f8405bbf2fc60`.

`````text
// Not in the spec table list. readPipeline/setPipeline have nowhere else to persist. lexical stays true and
// embedding stays false, so neither is a column.
export const RagPipelineTable = sqliteTable("rag_pipeline", {
  location_id: text().primaryKey(),
  parser: text().notNull(),
  boundary: text().notNull(),
  tokenizer: text().notNull(),
  k: integer().notNull(),
  blocked: integer().notNull().default(0),
})
`````

## R011 ← B06 — `packages/core/src/relay-commands.ts` 7–11

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e2858f395f7c09e0a2cfb7c5b55a96c073d33926`; SHA256 fonte `d129efe12ceff333c6f6186a40cc679efcbbacb9b9164c40eea404a89de09b2c`. Pai B06 7–11; SHA256 trecho `1b10e66b73f48419d09d5f21ab9627e6b4291cb073acc57aca298945a820446e`.

`````text
// The check commands a project already declares, offered as suggestions in the workflow editor. Detection only reads
// manifest files in the project root; it never runs anything, so it needs no trust.

export interface Command {
  readonly command: string
`````

## R012 ← B06 — `packages/core/src/relay-commands.ts` 84–98

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e2858f395f7c09e0a2cfb7c5b55a96c073d33926`; SHA256 fonte `d129efe12ceff333c6f6186a40cc679efcbbacb9b9164c40eea404a89de09b2c`. Pai B06 75–114; SHA256 trecho `ebc649ad188fa75a02bce0668ebda721c9c8880bb6d27350c2d5aecc88250c7b`.

`````text
// The lockfile names the package manager; npm is the fallback every Node install has. Relay modules run under Node in
// the desktop server, so they read files through `node:fs` rather than the Bun runtime.
const packageRunner = Effect.fn("RelayCommands.packageRunner")(function* (directory: string) {
  const exists = (name: string) =>
    Effect.promise(() =>
      access(path.join(directory, name)).then(
        () => true,
        () => false,
      ),
    )
  if ((yield* exists("bun.lock")) || (yield* exists("bun.lockb"))) return `bun`
  if (yield* exists("pnpm-lock.yaml")) return "pnpm"
  if (yield* exists("yarn.lock")) return "yarn"
  return "npm"
})
`````

## R013 ← B08 — `packages/core/src/relay.ts` 219–239

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 fonte `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`. Pai B08 219–264; SHA256 trecho `7c4e1ad44ef73c3a3fb5cb661e45f9cb582bddf34c2353ec7841e0459d75f9a4`.

`````text
    // A check: a fresh bash in the workdir with PATH, HOME and the run's params only. Only the end of its output is
    // kept, for the seat's next turn, and the whole process group is killed at the timeout. Provider keys, `RELAY_*` from this process and the ledger key never
    // reach it, and BASH_ENV, ENV and SHELLOPTS would run code at startup that the Python gate never ran.
    const shell = (timeout: Duration.Input) =>
      GateShell.Service.of({
        run: (input) =>
          Effect.gen(function* () {
            const env = {
              ...Object.fromEntries(Object.entries(input.env).filter((entry) => !STARTUP.has(entry[0]))),
              PATH: process.env.PATH ?? "/usr/bin:/bin",
              HOME: global.home,
            }
            if (!(yield* Effect.promise(() => which("bash", { path: env.PATH, nothrow: true }))))
              return yield* new GateShell.Unavailable({ reason: "missing" })
            const argv = GateShell.argv(input.program)
            const native = yield* ToolSafety.NativeContext
            // The sandbox follows the caller's ToolSafety profile; it also scrubs credential-shaped names and values.
            const command = yield* ToolSafetySandbox.wrap(
              ChildProcess.make(argv[0], argv.slice(1), {
                cwd: input.cwd,
                env,
`````

## R014 ← B08 — `packages/core/src/relay.ts` 247–264

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 fonte `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`. Pai B08 219–264; SHA256 trecho `4b9da786f2913a5807a5405e1912ca380ae6440f19a7434d08e6a0d8a2444617`.

`````text
              Effect.provideService(ToolSafety.NativeContext, native ?? { directory: input.cwd }),
              Effect.mapError(() => new GateShell.Unavailable({ reason: "spawn" })),
            )
            const tail = outputTail(GateShell.OUTPUT_TAIL_BYTES)
            const result = yield* processes.run(command, { combineOutput: true, maxOutputBytes: 0, inspect: tail.keep }).pipe(
              Effect.mapError(() => new GateShell.Unavailable({ reason: "spawn" })),
              Effect.timeoutOrElse({
                duration: input.timeout ?? timeout,
                orElse: () => Effect.fail(new GateShell.Unavailable({ reason: "timeout" })),
              }),
            )
            // Param values may be secrets the check echoed; the seat only needs to know a value was there. Short values
            // such as `1` or `dev` are not secrets and would garble every line they appear in.
            const output = Object.values(input.env)
              .filter((value) => value.length >= 8)
              .reduce((text, value) => text.replaceAll(value, "[redacted]"), AgentTerminal.sanitize(tail.read().text))
            return { exitCode: result.exitCode, output }
          }).pipe(Effect.scoped),
`````

## R015 ← B08 — `packages/core/src/relay.ts` 267–283

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 fonte `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`. Pai B08 267–283; SHA256 trecho `ed5fa25dccd1ecf91e1ec68e4988261614d02ba1400b4d2b15f493da78f7c0d3`.

`````text
    // The sandboxed git helper of arsenal-completion: no optional locks, fsmonitor off, a timeout and an output cap.
    // GIT_* placement variables (GIT_DIR, GIT_EXTERNAL_DIFF, …) are dropped so a diff reads the workdir's own repository.
    const git = GateShell.Git.of({
      run: (cwd, args) =>
        processes
          .run(
            ChildProcess.make("git", ["--no-optional-locks", "-C", cwd, "-c", "core.fsmonitor=false", ...args], {
              cwd,
              env: {
                ...Object.fromEntries(
                  Object.entries(ToolSafetySandbox.environment()).filter((entry) => !entry[0].startsWith("GIT_")),
                ),
                GIT_OPTIONAL_LOCKS: "0",
              },
              extendEnv: false,
              stdin: "ignore",
              killSignal: "SIGKILL",
`````

## R016 ← B09 — `packages/core/src/relay.ts` 335–372

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 fonte `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`. Pai B09 319–372; SHA256 trecho `b4a7fa173877493bd4f3bdf0c1ec2996e53e5806975dab984be97e5f441158ba`.

`````text
    const verify = Effect.fn("Relay.verify")(
      function* (input: VerifyInput): Effect.fn.Return<Verified> {
        // An empty command would be graded as a judge control; a hook check is a command.
        if (!input.check) return { verdict: "unavailable", reason: "invalid-command", oracle: "" }
        const graded = yield* GateControl.run(
          {
            sprint: {
              work_packages: [
                {
                  id: input.nodeID,
                  checklist: [{ id: input.nodeID, assert: input.message, cmd: input.check, origin: "hook" }],
                },
              ],
            },
            index: 0,
            workdir: input.workdir,
            params: input.params ?? {},
          },
          // Recorded below, so a ledger failure cannot lose the verdict.
          () => Effect.void,
        ).pipe(ports(VERIFY_TIMEOUT), Effect.option)
        const verdict = Option.flatMap(graded, (result) => Option.fromUndefinedOr(result.verdicts[0]))
        if (Option.isNone(verdict)) return { verdict: "unavailable", reason: "invalid-node", oracle: "" }
        const recorded = yield* record(
          input.installID,
          GateControl.body({ wp: input.nodeID, i: 0 }, verdict.value),
        ).pipe(Effect.option)
        const sequence = Option.match(recorded, { onNone: () => ({}), onSome: (line) => ({ ledgerSeq: line.seq }) })
        const unavailable = /^unavailable\((.+)\)$/.exec(verdict.value.graded_by)?.[1]
        if (unavailable)
          return { verdict: "unavailable", reason: unavailable, oracle: verdict.value.oracle, ...sequence }
        // A pass nobody can audit is not a pass; a fail stays a fail either way.
        if (verdict.value.verdict === "pass" && Option.isNone(recorded))
          return { verdict: "unavailable", reason: "unrecorded", oracle: verdict.value.oracle }
        return { verdict: verdict.value.verdict, oracle: verdict.value.oracle, ...sequence }
      },
      (effect) => verifies.withPermit(effect),
    )
`````

## R017 ← B10 — `packages/core/src/relay.ts` 374–389

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 fonte `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`. Pai B10 374–418; SHA256 trecho `7b06effb9899018a70362eb83c34f360186ebd02a034729117c1af2179d67d92`.

`````text
    const recover = Effect.fn("Relay.recover")(function* (token: RelayArm.Token) {
      const key = yield* ledgerKey
      const arm = yield* ArmState.dir(token).pipe(Effect.provideService(ArmState.Store, store(key)))
      const lock = path.join(arm, RelayArm.Files.runLock)
      const info = yield* Effect.try({
        try: () => lstatSync(lock, { throwIfNoEntry: false }),
        catch: () => new ArmState.StateError({ path: lock, reason: "lock-acquisition" }),
      })
      // Stale only when no evaluation in this process holds it and it predates this process: this process releases
      // every lock it takes synchronously, and a younger lock may belong to a live evaluation it cannot see.
      if (!info?.isDirectory() || ArmState.held(arm) || info.mtimeMs >= performance.timeOrigin) return false
      const loaded = yield* ArmLoad.arm(arm).pipe(Effect.option)
      const position = yield* ArmState.read(arm, RelayArm.Files.position).pipe(
        Effect.orElseSucceed(() => Option.none<string>()),
      )
      // The WP at the recorded position, else the raw position, else `?` like an empty plan.
`````

## R018 ← B10 — `packages/core/src/relay.ts` 420–433

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 fonte `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`. Pai B10 420–481; SHA256 trecho `7a6c814013d5eccf0fd0ccc9baa70cb579749b05df17fd7c156515f0f9c39d5f`.

`````text
    const trusted = config
      .entries()
      .pipe(Effect.map((entries) => ConfigTrust.isTrusted(entries, global.config, location.directory)))

    const trial = Effect.fn("Relay.trial")(function* (input: {
      readonly command: string
      readonly params?: Readonly<Record<string, string>>
    }) {
      if (!(yield* trusted)) return yield* new Untrusted({ directory: location.directory })
      const env = {
        ...Object.fromEntries(Object.entries(input.params ?? {}).filter((entry) => !STARTUP.has(entry[0]))),
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: global.home,
      }
`````

## R019 ← B10 — `packages/core/src/relay.ts` 491–501

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `25fb509203f933a2e8b0f311c3fc8f9476d53e16`; SHA256 fonte `446774386bf8020528bdc2138a066fd9dc4b214d3288dc069cb5da9d3cef2b2a`. Pai B10 491–515; SHA256 trecho `c9e2066fd654c9f00cd4d661a0d684db2526c41e425d1fa9f4e4580f959d8e2f`.

`````text
      evaluate: Effect.fn("Relay.evaluate")(function* (input: RelayArm.EvaluateInput) {
        if (!Schema.is(RelayArm.Token)(input.token)) return { outcome: "refused" as const, failing: [], ledgerSeq: -1 }
        // Bound progressive arms may only cross the guarded native settlement boundary; an API/CLI evaluate cannot
        // spend their retry budget or advance them. Missing/invalid arm data remains the existing engine's defect.
        const bound = yield* ArmLoad.arm(path.join(paths.arms, input.token)).pipe(Effect.option)
        if (Option.isSome(bound) && bound.value.meta.workflow)
          return { outcome: "refused" as const, failing: [], ledgerSeq: -1,
            reason: "WORKFLOW_NATIVE_SETTLEMENT_REQUIRED" }
        yield* recover(input.token).pipe(Effect.ignore)
        return yield* armed(ArmEvaluate.evaluate(input))
      }),
`````

## R020 ← B11 — `packages/core/src/relay-hook-install.ts` 219–239

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `df1a8ef2e1656d4f2a9a235447c3439fa25fa0f1`; SHA256 fonte `3663a7a5f1eedca77f66ce09229839aeec433440e2bd23d38fa36957d5e46833`. Pai B11 217–252; SHA256 trecho `f690f6bc2db567929c864515168032d8ce2de590073c3d3549aaa73ddcb7f575`.

`````text
 * `profile-invalid` (not UTF-8 or JSON, not an install list, or an install that no longer holds its sha256 or graph
 * rules) or as over the size cap is renamed aside to `hooks.json.corrupt-<ms>-<hex>` beside it, and an empty install
 * list is written in its place. Nothing is deleted. A valid file is never touched (`repair-not-needed`), and neither is
 * a symlink, a non-file, a file that changed while it was read or one that cannot be read (`repair-refused`): those are
 * not corruption the server can prove, so they stay for the owner to inspect.
 */
export const repair = Effect.fn("RelayHookInstall.repair")(function* (binding: Binding) {
  const fs = yield* FSUtil.Service
  const target = yield* locate(fs, binding)
  return yield* locks.withLock(target)(
    Effect.gen(function* () {
      const loaded = yield* load(fs, target).pipe(Effect.result)
      if (Result.isSuccess(loaded))
        return yield* refuse("repair-not-needed", "hooks.json is valid; there is nothing to repair.")
      const reason = loaded.failure.reason
      const refused = () => refuse("repair-refused", `hooks.json was left as it is: ${loaded.failure.message}`)
      if (reason !== "profile-invalid" && reason !== "profile-not-file-or-overflow") return yield* refused()
      // The cap refusal also covers a directory or a symlinked file; only a regular file reached directly is moved.
      const info = yield* fs.stat(target).pipe(Effect.option)
      const real = yield* fs.realPath(target).pipe(Effect.option)
      if (Option.isNone(info) || info.value.type !== "File" || !Option.contains(real, target)) return yield* refused()
`````

## R021 ← B11 — `packages/core/src/relay-hook-install.ts` 300–302

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `df1a8ef2e1656d4f2a9a235447c3439fa25fa0f1`; SHA256 fonte `3663a7a5f1eedca77f66ce09229839aeec433440e2bd23d38fa36957d5e46833`. Pai B11 300–410; SHA256 trecho `00315641cf1c3db04f4e9c71abced754c0ed57d7209f7bb045e40977a52ba919`.

`````text
// One writer per file in this process. Only the Orchestra server writes hooks.json (two servers on one data
// directory are out of scope), so an in-process lock with a synchronous release is enough.
const locks = KeyedMutex.makeUnsafe<string>()
`````

## R022 ← B11 — `packages/core/src/relay-hook-install.ts` 314–335

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `df1a8ef2e1656d4f2a9a235447c3439fa25fa0f1`; SHA256 fonte `3663a7a5f1eedca77f66ce09229839aeec433440e2bd23d38fa36957d5e46833`. Pai B11 300–410; SHA256 trecho `fe2684d4adb55d76ba201161d7a7d03269f6e0c7f45004f148b455da0c8750b0`.

`````text
const pin = Effect.fnUntraced(function* (snapshot: unknown, expected: string) {
  const text = yield* RelayJson.compact(snapshot).pipe(
    Effect.mapError(() => new Refused({ reason: "snapshot-invalid", message: "The snapshot is not JSON." })),
  )
  const parsed = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
    Effect.mapError(() => new Refused({ reason: "snapshot-invalid", message: "The snapshot is not JSON." })),
  )
  const hook = yield* Schema.decodeUnknownEffect(RelayHook.V1)(parsed, STRICT).pipe(
    Effect.mapError(
      (error) =>
        new Refused({
          reason: "snapshot-invalid",
          message: `The snapshot is not a relay.hook.v1 export: ${error.message}`,
        }),
    ),
  )
  const broken = violation(hook)
  if (broken) return yield* refuse("snapshot-invalid", broken)
  if (sha256(text) !== expected)
    return yield* refuse("sha256-mismatch", "The snapshot does not match the published sha256.")
  return parsed as RelayHook.V1
})
`````

## R023 ← B11 — `packages/core/src/relay-hook-install.ts` 454–474

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `df1a8ef2e1656d4f2a9a235447c3439fa25fa0f1`; SHA256 fonte `3663a7a5f1eedca77f66ce09229839aeec433440e2bd23d38fa36957d5e46833`. Pai B11 454–474; SHA256 trecho `bfb6fedc4e20189ff392d1bf9bc4c0be1fe87eee3eae00c35cabc62ed9853b5e`.

`````text
const write = Effect.fnUntraced(function* (fs: FSUtil.Interface, target: string, installs: RelayHook.Installs) {
  const text = JSON.stringify(installs)
  if (Buffer.byteLength(text) > MAX_BYTES)
    return yield* refuse("profile-overflow", `hooks.json would exceed ${MAX_BYTES} bytes.`)
  yield* parse(text)
  const failed = () => new Refused({ reason: "profile-write-acquisition", message: "Unable to write hooks.json." })
  const directory = path.dirname(target)
  yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 }).pipe(Effect.mapError(failed))
  if ((yield* fs.realPath(directory).pipe(Effect.mapError(failed))) !== directory)
    return yield* refuse("profile-symlink-denied", "The profile directory resolves through a symlink.")
  const temp = path.join(directory, `.hooks.json.${randomUUID()}.tmp`)
  yield* fs.writeFileString(temp, text, { flag: "wx", mode: 0o600 }).pipe(
    Effect.andThen(fs.rename(temp, target)),
    Effect.mapError(failed),
    // Synchronous: with effect 4.0.0-beta.83 an async finalizer is dropped when the fiber is interrupted. After a
    // successful rename the temporary file is gone, and `force` makes this a no-op.
    Effect.ensuring(
      Effect.try({ try: () => rmSync(temp, { force: true }), catch: () => undefined }).pipe(Effect.ignore),
    ),
  )
})
`````

## R024 ← B12 — `packages/core/src/relay-hook-install.ts` 254–273

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `df1a8ef2e1656d4f2a9a235447c3439fa25fa0f1`; SHA256 fonte `3663a7a5f1eedca77f66ce09229839aeec433440e2bd23d38fa36957d5e46833`. Pai B12 254–295; SHA256 trecho `e068c27e94273d9fdefa2c12b5c251462f71669f0550181098d80cb4586df604`.

`````text
/** The `compile_hook` rule a structurally valid export breaks, as its refusal message; undefined when none. */
function violation(hook: RelayHook.V1) {
  const nodes = new Map(hook.nodes.map((node) => [node.id, node]))
  if (hook.nodes.length > 1000) return "Nodes must be a list of at most 1000 steps"
  if (nodes.size !== hook.nodes.length || new Set(hook.nodes.map((node) => node.name)).size !== hook.nodes.length)
    return "Node IDs and names must be unique"
  if (
    !hook.nodes.some((node) => node.type !== RelayHook.NodeType.trigger && node.type !== RelayHook.NodeType.condition)
  )
    return "Add at least one action to the hook"
  const triggers = hook.nodes.filter((node) => node.type === RelayHook.NodeType.trigger)
  if (triggers.length !== 1) return "A hook needs exactly one event"
  const trigger = triggers[0]!
  if (hook.connections.some((edge) => !nodes.has(edge.from))) return "Invalid hook connection"
  if (hook.connections.some((edge) => edge.port >= RelayHook.Outputs[nodes.get(edge.from)!.type].length))
    return "Invalid output port for this action"
  // One next step per output: the evaluator reads the steps after a Verify as its Pass branch only.
  if (new Set(hook.connections.map((edge) => `${edge.from}\u0000${edge.port}`)).size !== hook.connections.length)
    return "A hook output accepts one next step"
  if (hook.connections.some((edge) => !nodes.has(edge.to))) return "Invalid hook target"
`````

## R025 ← B12 — `packages/core/src/relay-hook-install.ts` 283–295

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `df1a8ef2e1656d4f2a9a235447c3439fa25fa0f1`; SHA256 fonte `3663a7a5f1eedca77f66ce09229839aeec433440e2bd23d38fa36957d5e46833`. Pai B12 254–295; SHA256 trecho `8e52721febcf48e40a6e00fa4f97ccefe85f415e2c5caceef0c65d85bee05cc9`.

`````text
    visiting.delete(id)
    seen.add(id)
    return found
  }
  if (cyclic(trigger.id)) return "Hooks do not accept cycles"
  if (seen.size !== nodes.size) return "Connect the event to the next hook steps"
  if (
    trigger.parameters.timing !== "before" &&
    hook.nodes.some((node) => node.type === RelayHook.NodeType.block || node.type === RelayHook.NodeType.approve)
  )
    return "Block and approval need an event before the effect"
  return undefined
}
`````

## R026 ← B13 — `packages/core/src/relay-hook-recovery.ts` 34–47

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `dac90dd02db4e0382932576d7041bee5142d4067`; SHA256 fonte `370b5746163de1f543102b3872c76c28331d82084984b2178d2e03127a74cea9`. Pai B13 25–88; SHA256 trecho `4ca8c0cdd407ea249cfec40813221a71a1e8344bca17085843188aacc675572d`.

`````text
      recover: Effect.fn("RelayHookRecovery.recover")(function* (): Effect.fn.Return<Result> {
        if (location.workspaceID !== undefined)
          return { scope: "unsupported-workspace", attemptedSessions: 0, errors: 0 }
        const result = { scope: "implicit-local" as const, attemptedSessions: 0, errors: 0 }
        const failed = (cause: unknown) =>
          Effect.sync(() => result.errors++).pipe(
            Effect.andThen(Effect.logWarning("Relay hook recovery failed", { cause, directory: location.directory })),
            Effect.asVoid,
          )
        // Observe record errors before the shipper absorbs them, without replacing its locking or dedup.
        const recording = Relay.Service.of({
          ...relay,
          record: (installID, body) => relay.record(installID, body).pipe(Effect.tapCause(failed)),
        })
`````

## R027 ← B13 — `packages/core/src/relay-hook-recovery.ts` 50–64

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `dac90dd02db4e0382932576d7041bee5142d4067`; SHA256 fonte `370b5746163de1f543102b3872c76c28331d82084984b2178d2e03127a74cea9`. Pai B13 25–88; SHA256 trecho `b0d762c34c311a673d11ecb736f55a90056c72a439af7b6f289a6bb6d737afc4`.

`````text
          const rows = yield* database.db
            .selectDistinct({ id: SessionTable.id })
            .from(SessionTable)
            .innerJoin(EventTable, eq(SessionTable.id, EventTable.aggregate_id))
            .where(
              and(
                eq(EventTable.type, versionedType(RelayHook.Decided.type, 1)),
                eq(SessionTable.project_id, location.project.id),
                eq(SessionTable.directory, location.directory),
                isNull(SessionTable.workspace_id),
                cursor === undefined ? undefined : gt(SessionTable.id, cursor),
              ),
            )
            .orderBy(asc(SessionTable.id))
            .limit(64)
`````

## R028 ← B14 — `packages/core/src/relay-hook-shipper.ts` 39–54

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ab87545ec4552ec2fb5a4f2c1b586e98313ed92a`; SHA256 fonte `6ce3c6f822f5fa17d8d5f2c1880e0e085365c913db24cd59a4ad2b51b0c6437c`. Pai B14 26–65; SHA256 trecho `ac0a4368313daf9ef4554603c932eb45c9661538912a163be20e7491f451c582`.

`````text
  const decisions = rows.flatMap((row) => Option.toArray(decode(row.data)))
  const end = decisions.findIndex((decision) => decision.decisionID === input.current)
  // A decision still on its way to its own receipt is not late; its own call ships it.
  const due = decisions
    .slice(0, end === -1 ? decisions.length : end + 1)
    .filter((decision) => decision.decisionID === input.current || !inFlight.has(decision.decisionID))
  yield* shipping.withPermit(
    Effect.forEach(
      Map.groupBy(due, (decision) => decision.installID).values(),
      (group) =>
        Effect.forEach(group, (decision) => receipt(input.relay, decision, decision.decisionID !== input.current), {
          discard: true,
        }).pipe(Effect.ignore),
      { discard: true },
    ),
  )
`````

## R029 ← B14 — `packages/core/src/relay-hook-shipper.ts` 101–120

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `ab87545ec4552ec2fb5a4f2c1b586e98313ed92a`; SHA256 fonte `6ce3c6f822f5fa17d8d5f2c1880e0e085365c913db24cd59a4ad2b51b0c6437c`. Pai B14 67–130; SHA256 trecho `55ac8cee62d7ad0321671da6898ef04b41e1e6e5e5219104f5338490391dab40`.

`````text
  const ledger = path.join(relay.paths.hooks, decision.installID, "ledger.jsonl")
  const ids = yield* recorded(ledger)
  if (ids.has(decision.decisionID)) return
  yield* relay.record(decision.installID, body(decision, deferred))
  ids.add(decision.decisionID)
  shipped.set(ledger, { stamp: yield* stamp(ledger), ids })
})

const recorded = Effect.fnUntraced(function* (ledger: string) {
  const current = yield* stamp(ledger)
  const cached = shipped.get(ledger)
  if (cached?.stamp === current) return cached.ids
  const entries = yield* LedgerRead.entries(ledger).pipe(
    Effect.catchTag("LedgerRead.Missing", () => Effect.succeed([])),
  )
  const ids = new Set(
    entries.flatMap((entry) =>
      entry.event === "hook-decision" && typeof entry.decision === "string" ? [entry.decision] : [],
    ),
  )
`````

## R030 ← B15 — `packages/core/src/relay-workflow-binding.ts` 50–61

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7149e276e0c214d70c2dafad90dadff5d2c21059`; SHA256 fonte `3174f65f835ea0c4ba64c6a597a2169902627b94673cbb1c54cc5e90a414e0e2`. Pai B15 50–75; SHA256 trecho `6b77d7505e389d1f7c3673acb018f6029db9c99344f74f60ce63ab599d3bdd1f`.

`````text
  if (input.port.projectID !== input.projectID)
    return yield* new Held({ reason: "WORKFLOW_PUBLICATION_PROJECT_MISMATCH" })
  return yield* input.port.use((store) => Effect.gen(function* () {
    const live = yield* store.get(input.documentID)
    if (live.id !== input.documentID)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_DOCUMENT_MISMATCH" })
    if (!live.active || !live.activeVersionId || live.isArchived)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_UNPUBLISHED" })
    const versionID = input.pinned?.activeVersionID ?? live.activeVersionId
    const version = yield* store.version(live.id, versionID)
    if (version.workflowId !== live.id || version.id !== live.id || version.versionId !== versionID)
      return yield* new Held({ reason: "WORKFLOW_PUBLICATION_VERSION_MISMATCH" })
`````

## R031 ← B15 — `packages/core/src/relay-workflow-binding.ts` 129–147

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7149e276e0c214d70c2dafad90dadff5d2c21059`; SHA256 fonte `3174f65f835ea0c4ba64c6a597a2169902627b94673cbb1c54cc5e90a414e0e2`. Pai B15 106–147; SHA256 trecho `1710252f9549c6fcd93155627e8c437cdea654ff20838a84062f27767f90ee90`.

`````text
export const revalidate = Effect.fn("RelayWorkflowBinding.revalidate")(function* (
  port: PublicationPort,
  expected: RelayArm.WorkflowDefinition,
) {
  const author = expected.knowledge?.[0]?.authorSessionID
  if (expected.knowledge?.some((anchor) => anchor.authorSessionID !== author))
    return yield* new Held({ reason: "WORKFLOW_KNOWLEDGE_AUTHOR_MISMATCH" })
  // A bound run keeps its immutable published version: draft saves and later publishes do not hold it, unpublishing does.
  const current = yield* acquire({ port, projectID: expected.publication.projectID,
    documentID: expected.publication.documentID, parameters: expected.parameters, writePaths: expected.writePaths,
    authorSessionID: author, pinned: expected.publication })
  if (!isDeepStrictEqual(current.definition.resolvedSkills, expected.resolvedSkills))
    return yield* new Held({ reason: "WORKFLOW_SKILL_DRIFT" })
  if (!isDeepStrictEqual(current.definition.materialization, expected.materialization))
    return yield* new Held({ reason: "WORKFLOW_MATERIALIZATION_DRIFT" })
  if (!isDeepStrictEqual(current.definition.knowledge, expected.knowledge))
    return yield* new Held({ reason: "WORKFLOW_KNOWLEDGE_DRIFT" })
  return current
})
`````

## R032 ← B16 — `packages/core/src/relay-workflow-binding.ts` 223–256

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7149e276e0c214d70c2dafad90dadff5d2c21059`; SHA256 fonte `3174f65f835ea0c4ba64c6a597a2169902627b94673cbb1c54cc5e90a414e0e2`. Pai B16 149–261; SHA256 trecho `812d4693000b800603e1f4c0fb0149972e621143de8c7171f0d4fa1c6049b825`.

`````text
  const references = knowledgeReferences(input.sprint)
  if (references.length > AtlasKnowledge.MAX_UNITS)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_LIMIT" })
  if (references.length && !input.knowledge)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_BINDING_MISSING" })
  if (references.length && !input.authorSessionID)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_AUTHOR_MISSING" })
  const decoded = Schema.decodeUnknownOption(Schema.Array(AtlasKnowledge.Anchor))(
    input.knowledge ?? [], { onExcessProperty: "error" })
  if (Option.isNone(decoded)) return new Held({ reason: "WORKFLOW_KNOWLEDGE_INVALID" })
  const anchors = decoded.value
  if (anchors.length !== references.length || new Set(anchors.map((anchor) => anchor.reference)).size !== anchors.length)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_MISMATCH" })
  const checked = anchors.map((anchor) => {
    if (anchor.projectID !== input.projectID)
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_PROJECT_MISMATCH" })
    if (anchor.authorSessionID !== input.authorSessionID)
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_AUTHOR_MISMATCH" })
    if (!references.includes(anchor.reference))
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_REFERENCE_MISMATCH" })
    if (new Set(anchor.units.map((unit) => unit.unit)).size !== anchor.units.length)
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_UNIT_DUPLICATE" })
    if (anchor.units.some((unit) => digest(Buffer.from(unit.content, "utf8")) !== unit.bodyHash))
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_BODY_MISMATCH" })
    if (knowledgeReference(anchor) !== anchor.reference)
      return new Held({ reason: "WORKFLOW_KNOWLEDGE_DIGEST_MISMATCH" })
    return anchor
  })
  const held = checked.find((anchor) => anchor instanceof Held)
  if (held instanceof Held) return held
  if (anchors.reduce((total, anchor) => total + anchor.units.reduce(
    (bytes, unit) => bytes + Buffer.byteLength(unit.content, "utf8"), 0), 0) > AtlasKnowledge.MAX_BYTES)
    return new Held({ reason: "WORKFLOW_KNOWLEDGE_CONTENT_LIMIT" })
  return anchors
`````

## R033 ← B17 — `packages/core/src/relay-workflow-currentstep.ts` 38–48

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c34249dde50c821e405128a148f015775095ac62`; SHA256 fonte `00b948197cb77d072629820bc844f9ddae0527561e04b4cab9922dd2460e6a22`. Pai B17 38–90; SHA256 trecho `38cafef22637ca0fd22aa098659a91f2301f8701b40c936261f60aa450a41030`.

`````text
// Pure view: no position migration, run-lock recovery, macro markers, entered_at or retry writes. In particular,
// ArmState.position is deliberately not used: it writes legacy migration state even on a nominal read.
export const read = Effect.fn("RelayWorkflowCurrentStep.read")(function* (
  token: RelayArm.Token,
  binding: RelayArm.WorkflowBinding,
) {
  const arm = yield* ArmState.dir(token)
  const loaded = yield* ArmLoad.arm(arm)
  if (!isDeepStrictEqual(loaded.meta.workflow, binding) ||
    loaded.meta.project_id !== binding.definition.publication.projectID ||
    loaded.meta.session_id !== binding.executionSessionID ||
`````

## R034 ← B17 — `packages/core/src/relay-workflow-currentstep.ts` 69–90

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c34249dde50c821e405128a148f015775095ac62`; SHA256 fonte `00b948197cb77d072629820bc844f9ddae0527561e04b4cab9922dd2460e6a22`. Pai B17 38–90; SHA256 trecho `cba6fdadbd7213b0b1c3e91922a30c6fd8d7c4757c4237806d7353c08aa7a9b9`.

`````text
    onNone: () => Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_POSITION_INVALID" })),
    onSome: Effect.succeed,
  })
  const wp = loaded.sprint.work_packages[index]
  const storedRetry = yield* ArmState.read(arm, `retry_${ArmState.safe(wp.id)}`)
  const retry = Option.getOrElse(Option.isSome(storedRetry) ? storedRetry
    : yield* ArmState.read(arm, `retry_${index}`), () => "0").trim()
  const regression = Option.getOrElse(yield* ArmState.read(arm, RelayArm.Files.regRetry), () => "0").trim()
  if (![retry, regression].every((value) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) ||
    !Number.isSafeInteger(Number(retry) + Number(regression)))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ATTEMPT_INVALID" })
  const entries = yield* LedgerRead.entries(path.join(arm, RelayArm.Files.ledger)).pipe(
    Effect.catchTag("LedgerRead.Missing", () => Effect.succeed([])),
  )
  const seq = entries.at(-1)?.seq ?? -1
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < -1)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_LEDGER_INVALID" })
  const stored = state === "active" ? yield* ArmState.read(arm, `feedback_${ArmState.safe(wp.id)}`) : Option.none<string>()
  // Only the attempt that just failed is shown; a missing, stale or unreadable file adds nothing.
  const feedback = Option.filter(Option.flatMap(stored, decodeFeedback),
    (note) => note.attempt === Number(retry) + Number(regression) && note.controls.length > 0)
  const macro = wp.macro ? loaded.sprint.macros?.find((macro) => macro.id === wp.macro)?.instructions : undefined
`````

## R035 ← B18 — `packages/core/src/relay-workflow-session.ts` 51–68

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `fc006686eb25e96aa55cd8b93fc60994ebdd9dfd`; SHA256 fonte `c5aefaf53fcd61059a68ee2b0411e587f4d125a42fae8169f8846c4d37c70221`. Pai B18 31–96; SHA256 trecho `c311a0febde4327fd4e676d6810bb41489c82eaed923f2e29fdb069938b73286`.

`````text
export const current = Effect.fn("RelayWorkflowSession.current")(function* (sessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, sessionID),
    eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1)))).limit(2).all().pipe(Effect.orDie)
  if (!rows.length) return
  if (rows.length !== 1) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_AMBIGUOUS" })
  const bound = yield* Schema.decodeUnknownEffect(MaestroEvent.Task.WorkflowBound.data)(rows[0].data).pipe(
    Effect.mapError(() => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })),
  )
  if (bound.executionSessionID !== sessionID || bound.binding.executionSessionID !== sessionID)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_LINEAGE_MISMATCH" })
  const host = yield* nativeHost
  if (!host) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
  const result = yield* host.current(bound)
  if (result.view.state === "awaiting-human" && !result.view.pending)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_PARKED" })
  return result
})
`````

## R036 ← B18 — `packages/core/src/relay-workflow-session.ts` 82–96

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `fc006686eb25e96aa55cd8b93fc60994ebdd9dfd`; SHA256 fonte `c5aefaf53fcd61059a68ee2b0411e587f4d125a42fae8169f8846c4d37c70221`. Pai B18 31–96; SHA256 trecho `5b0ac6c3d8e6688cb50b416c9cc80e7511351abdcdb665942a698708f9e45650`.

`````text
}) {
  if (!input.succeeded) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ASSISTANT_NOT_SETTLED" })
  const host = yield* nativeHost
  if (!host) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
  const evaluation = yield* host.settle(input.current, { assistantMessageID: input.assistantMessageID,
    expected: { position: input.current.view.position, attempt: input.current.view.attempt, ledgerSeq: input.current.view.ledgerSeq } })
  return yield* continues(evaluation)
})

// An advance or a failing check continues the Session; a failing check keeps the step, which then shows its output.
// A finished chain stops, and every other outcome holds.
const continues = (evaluation: RelayArm.Evaluation) =>
  evaluation.outcome === "complete" ? Effect.succeed(false)
    : ["advance", "gate-fail", "regression-fail"].includes(evaluation.outcome) ? Effect.succeed(true)
    : Effect.fail(new RelayWorkflowBinding.Held({ reason: `WORKFLOW_TRANSITION_${evaluation.outcome.toUpperCase().replaceAll("-", "_")}` }))
`````

## R037 ← B19 — `packages/core/src/relay-workflow-transition.ts` 67–91

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `a200d327a4e1f9f7c3b0e7c986f6a848608f6d6b`; SHA256 fonte `25e53b33dcccd86354775369126f63fcfee5fc89c324d3b7c1e00bd84b0ea28c`. Pai B19 35–99; SHA256 trecho `d0346ca3922a4368c709cd6a685f08c4a3213b66b88f1667f5d1dcd7dcc316b7`.

`````text
    // Any pending settlement of this arm blocks a different assistant. It cannot evaluate a partially settled cursor.
    const pending = yield* read(arm, "workflow_pending.json")
    if (pending) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_PENDING" })
    const view = yield* RelayWorkflowCurrentStep.read(input.token, input.binding).pipe(Effect.mapError(held))
    if (view.state !== "active")
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_NOT_ACTIVE" })
    if (!isDeepStrictEqual({ position: view.position, attempt: view.attempt, ledgerSeq: view.ledgerSeq }, input.settlement.expected))
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_POSITION_MISMATCH" })
    const next = { binding: input.binding, settlement: input.settlement, phase: "pending" as const }
    // Fence first. If writing the identity receipt fails, a new assistant still cannot grade this arm.
    yield* write(arm, "workflow_pending.json", next)
    yield* write(arm, file, next)
  }, Effect.provideService(ArmState.Store, store))
  const after = Effect.fn("RelayWorkflowTransition.after")(function* (evaluation: RelayArm.Evaluation) {
    yield* write(arm, file, { binding: input.binding, settlement: input.settlement, phase: "settled", evaluation })
    yield* clearPending(arm, { binding: input.binding, settlement: input.settlement, phase: "settled", evaluation })
  })
  return yield* evaluator.evaluate({
    ...input,
    revisionGuard: true, blockCap: 0, mode: "step", params: input.binding.definition.parameters,
  }, { before, after })
})

// Checkpoint writes are atomic replacements. A receipt's assistant ID is the existing durable message identity, not
// a new run/drain identity. Disk durability has the same filesystem guarantees as the existing arm state writes.
`````

## R038 ← B20 — `packages/core/src/relay-workflow-evaluator.ts` 50–70

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `898d949b03a82453955e1100335c2150fa51a881`; SHA256 fonte `eb9862b86f9aa64e34e8f52ae25ac079c6d464da9599433dd34625e620c5138c`. Pai B20 29–125; SHA256 trecho `2ff8a57462a151e60efc1aabc7e0a7dde405cd4254859fe7c0fe5ccb482de405`.

`````text
        yield* signed(ledger, key, true)
        const saved = yield* boundary.before()
        if (saved !== undefined) {
          const receipts = yield* LedgerRead.entries(ledger)
          const authenticated = receipts.some((entry) => {
            const receipt = Schema.decodeUnknownOption(Receipt)(entry)
            return Option.isSome(receipt) && sameIdentity(receipt.value.checkpoint, identity) &&
              isDeepStrictEqual(receipt.value.evaluation, saved)
          })
          if (!authenticated) return yield* hold("WORKFLOW_SETTLEMENT_EVIDENCE_MISSING")
          return saved
        }
        const fence = yield* pending(arm)
        const receipt = yield* pending(arm,
          `workflow_${RelayWorkflowBinding.digest(Buffer.from(identity.settlement.assistantMessageID))}.json`)
        if (!sameIdentity(fence, identity) || !sameIdentity(receipt, identity))
          return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
        const view = yield* RelayWorkflowCurrentStep.read(input.token, identity.binding)
        if (view.state !== "active" || !isDeepStrictEqual({ position: view.position, attempt: view.attempt,
          ledgerSeq: view.ledgerSeq }, identity.settlement.expected))
          return yield* hold("WORKFLOW_SETTLEMENT_POSITION_MISMATCH")
`````

## R039 ← B20 — `packages/core/src/relay-workflow-evaluator.ts` 106–125

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `898d949b03a82453955e1100335c2150fa51a881`; SHA256 fonte `eb9862b86f9aa64e34e8f52ae25ac079c6d464da9599433dd34625e620c5138c`. Pai B20 29–125; SHA256 trecho `4c9f97a397d330691d0eecca0ad6b5eb2b803c43b4599edbfcb6585cde2053eb`.

`````text
    const arm = yield* ArmState.dir(input.token)
    if (!ArmState.held(arm)) return yield* hold("WORKFLOW_SETTLEMENT_LOCK_REQUIRED")
    yield* input.revalidate()
    if (checkpoint.phase !== "pending" || !isDeepStrictEqual(checkpoint.binding, input.binding) ||
      !isDeepStrictEqual(checkpoint.settlement, input.settlement))
      return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
    const fence = yield* pending(arm)
    if (!isDeepStrictEqual(fence, checkpoint)) return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
    const loaded = yield* ArmLoad.arm(arm)
    if (!isDeepStrictEqual(loaded.meta.workflow, input.binding) ||
      loaded.meta.project_id !== input.binding.definition.publication.projectID ||
      loaded.meta.session_id !== input.binding.executionSessionID ||
      RelayWorkflowBinding.digest(loaded.sprintBytes) !== input.binding.definition.materialization.digest ||
      loaded.sprintBytes.length !== input.binding.definition.materialization.byteLength)
      return yield* hold("WORKFLOW_MATERIALIZATION_DRIFT")
    const store = yield* ArmState.Store
    const receipt = yield* evidence(arm, input.token, checkpoint, yield* requireKey(store.ledgerKey))
    yield* ArmEvaluate.repair(arm, receipt.writes)
    return receipt.evaluation
  }).pipe(Effect.mapError(held), Effect.catchDefect(() => hold("WORKFLOW_SETTLEMENT_ACQUISITION"))),
`````

## R040 ← B20 — `packages/core/src/relay-workflow-evaluator.ts` 133–149

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `898d949b03a82453955e1100335c2150fa51a881`; SHA256 fonte `eb9862b86f9aa64e34e8f52ae25ac079c6d464da9599433dd34625e620c5138c`. Pai B20 130–208; SHA256 trecho `c6526b1b1508c6face996eedb24fb6de36f207f3f3a88a3b48d713fd5bfdf8d9`.

`````text
// A whole signed repair receipt, not an ordinary old PASS or unsigned checkpoint JSON. Its source disposition and
// cursor/attempt identity are anchored after expected ledger seq. An interrupted earlier stage holds permanently.
const evidence = (arm: string, token: RelayArm.Token, checkpoint: RelayArm.WorkflowCheckpoint, key: Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    if (!ArmState.held(arm)) return yield* hold("WORKFLOW_SETTLEMENT_LOCK_REQUIRED")
    const ledger = path.join(arm, RelayArm.Files.ledger)
    yield* signed(ledger, key, true)
    const entries = yield* LedgerRead.entries(ledger).pipe(
      Effect.catchTag("LedgerRead.Missing", () => hold("WORKFLOW_SETTLEMENT_EVIDENCE_MISSING")),
    )
    const receipt = Schema.decodeUnknownOption(Receipt)(entries.at(-1))
    if (Option.isNone(receipt)) return yield* hold("WORKFLOW_SETTLEMENT_EVIDENCE_MISSING")
    const value = receipt.value
    if (value.arm !== token || !isDeepStrictEqual(value.checkpoint, checkpoint) ||
      value.seq !== value.evaluation.ledgerSeq || value.sourceSeq !== value.seq - 1 ||
      value.sourceSeq <= checkpoint.settlement.expected.ledgerSeq)
      return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
`````

## R041 ← B20 — `packages/core/src/relay-workflow-evaluator.ts` 170–193

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `898d949b03a82453955e1100335c2150fa51a881`; SHA256 fonte `eb9862b86f9aa64e34e8f52ae25ac079c6d464da9599433dd34625e620c5138c`. Pai B20 130–208; SHA256 trecho `f6b605ccca60d026a3d6080e749d7f40b7e528ceb76fab19b660b6bcd4c82f36`.

`````text
    const safe = ArmState.safe(wp.id)
    const required = value.evaluation.outcome === "advance" || value.evaluation.outcome === "complete"
      ? [`round_${safe}`, `repeat_${safe}`, RelayArm.Files.regRetry, RelayArm.Files.counter,
          value.evaluation.outcome === "advance" ? RelayArm.Files.position : RelayArm.Files.state,
          ...(value.evaluation.outcome === "advance" && next && source.base_ref ? [`base_${ArmState.safe(next.id)}`] : [])]
      : [`round_${safe}`, `repeat_${safe}`,
          ...(value.evaluation.outcome === "escalate" ? [RelayArm.Files.state, RelayArm.Files.counter]
            : [value.evaluation.outcome === "regression-fail" ? RelayArm.Files.regRetry : `retry_${safe}`])]
    if (!value.writes.length || value.writes.some((write) => !names.has(write.name)) ||
      new Set(value.writes.map((write) => write.name)).size !== value.writes.length ||
      required.some((name) => !value.writes.some((write) => write.name === name)) ||
      (value.evaluation.outcome === "advance" && (!next || value.evaluation.next !== next.id)))
      return yield* hold("WORKFLOW_SETTLEMENT_DISPOSITION_UNKNOWN")
    return value
  })

const signed = (ledger: string, key: Redacted.Redacted<string>, missing = false) => Effect.gen(function* () {
  const result = yield* LedgerVerify.verify(ledger, key)
  if (result.exit !== 0 && !(missing && result.exit === 2)) return yield* hold("WORKFLOW_LEDGER_INVALID")
})

function requireKey(key: Option.Option<Redacted.Redacted<string>>) {
  return Option.isSome(key) && Redacted.value(key.value) !== ""
    ? Effect.succeed(key.value) : hold("WORKFLOW_LEDGER_KEY_MISSING")
`````

# Necessidade de revisão: `bodies/support.md`

Corpo deve ser lido integralmente; os trechos abaixo sustentam ramos decisivos e limites.

## R042 ← S01 — `packages/core/README.md` 1–27

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `742921238462659e1a5a314f2e0238102c6e9f3a`; SHA256 fonte `e74885e18e96297fd931989505937559ecbdce42c595cf8846411d4f0c4de324`. Pai S01 1–46; SHA256 trecho `1d4c069166cb530621c4bf35ad166fe05996dcb54e58431a8e36d6f26e0fbe5e`.

`````text
# @orchestra/core

Platform and domain services for Orchestra: v2 Session admission, storage and local execution; Location-scoped capabilities; provider, tool, configuration and plugin services; and the SQLite database with its migrations. Server exposes these services over HTTP, and the CLI, desktop app and product modules compose them. See [architecture](../../docs/guides/architecture.md) for the product-level picture.

Dependencies run Schema -> Core and Protocol -> Server. Core never imports Client or Server.

## Who uses it

`packages/server` (handlers), `packages/app-shell`, `apps/cli`, `apps/desktop`, `packages/tui`, `packages/session-ui`, `packages/sdk-next`, and the `modules/maestro`, `modules/continuity` and `modules/engine-adapters` packages.

## Entry points

There is no bare `@orchestra/core` export and no wildcard: every public subpath is an explicit key in `package.json`. Add one with `bun run script/explicit-exports.ts core --write` from the repository root when a new subpath gains a consumer. Common subpaths:

- `@orchestra/core/effect/layer-node`, `@orchestra/core/effect/app-node`: service graph building blocks.
- `@orchestra/core/session/runner`: the serialized Session runner.
- `@orchestra/core/system-context`: System Context registry and built-ins.
- `@orchestra/core/backend-toolkit`: backend toolkit packs.

Where things live:

- `src/session/` (see its `README.md`): Session storage, event projection, durable input admission, history, context epochs.
- `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`: Location identity and scoped services.
- `src/provider.ts`, `src/model.ts`, `src/tool/`, `src/config/`, `src/plugin/`: provider, model, tool, configuration and plugin services.
- `src/host.ts` and `src/host/`: `Host.Contribution`, how product modules add services to the process.
- `src/database/` (see its `README.md`): SQLite setup, generated schema, ordered TypeScript migrations in `src/database/migration/`, registered by `migration.gen.ts`.
- `src/agent/prompt/` and `src/plugin/command/`: bundled prompt and command text, kept beside their owners.
`````

## R043 ← S01 — `packages/core/README.md` 48–62

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `742921238462659e1a5a314f2e0238102c6e9f3a`; SHA256 fonte `e74885e18e96297fd931989505937559ecbdce42c595cf8846411d4f0c4de324`. Pai S01 48–88; SHA256 trecho `83c0452c7a83b6ec2e2462325060ad5d5bb582a114c32716f6ff6f4a2466a0c6`.

`````text
<!-- module-contract:start (generated by script/module-readme.ts from script/module-architecture.json; do not edit) -->
## Module contract
- Package: `@orchestra/core` at `packages/core` (alias `core`)
- Summary: Reusable platform and domain services for the application and server layers, including the V2 Session core.
- Layer: `platform`; may depend on: `foundation`, `native`, `library`, `contract`, `extension-api`, `module:platformLibrary`
- Status: `canonical`
- Owner: core platform maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: `packages/core/src/github-copilot` (vendored)
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.

### Domains
- `atlas` — platform — `src/atlas.ts` — packages/core
- `session` — platform — `src/session/`, `src/session.ts`, `src/session-process.ts` — packages/core
- `agent` — platform — `src/agent/`, `src/agent.ts` — packages/core
`````

## R044 ← S02 — `packages/core/package.json` 1–22

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `8ee8ebb666051c9b5ee0fcd4a54bceb3a2cb3c43`; SHA256 fonte `1c58faa263c2bb931b9789722342645e94cb30f0b91613b9093aa2ed422c8385`. Pai S02 1–22; SHA256 trecho `63b49e189893202b209c0c4406a32483d1b641a7a12c888378d0f6bfb4eae4e3`.

`````text
{
  "$schema": "https://json.schemastore.org/package.json",
  "version": "1.18.27",
  "name": "@orchestra/core",
  "type": "module",
  "license": "MIT",
  "private": true,
  "scripts": {
    "db": "bun drizzle-kit",
    "migration": "bun run script/migration.ts",
    "fix-node-pty": "bun run script/fix-node-pty.ts",
    "test": "bun test --timeout 30000 --only-failures",
    "typecheck": "tsgo --noEmit"
  },
  "exports": {
    "./account": "./src/account.ts",
    "./account/sql": "./src/account/sql.ts",
    "./actions": "./src/actions.ts",
    "./actions/contract": "./src/actions/contract.ts",
    "./actions/error": "./src/actions/error.ts",
    "./actions/operations": "./src/actions/operations.ts",
    "./actions/operations/sql": "./src/actions/operations/sql.ts",
`````

## R045 ← S03 — `packages/core/bunfig.toml` 1–2

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `73901b177ab7f2ddb0ed6ab75802cf6904698649`; SHA256 fonte `bc68812446e4beefbffc44973ea98521f9d95ea9096849ff2d2ac30fa1ad4ca2`. Pai S03 1–2; SHA256 trecho `bc68812446e4beefbffc44973ea98521f9d95ea9096849ff2d2ac30fa1ad4ca2`.

`````text
[test]
preload = ["../../script/test-guard.ts", "../../script/test-omni-control.ts", "./test/preload.ts"]
`````

## R046 ← S04 — `packages/core/test/preload.ts` 4–11

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `d23f2798fbbcf7fec5d91544e99907907f91f566`; SHA256 fonte `8ee7e50f9fb549aa4d76a9adbff3064be26e18fc3c5dec196d058908bf7166f3`. Pai S04 1–11; SHA256 trecho `87f85c05405dccc8eff327b7b22ef016f6e597f5b9124e22d71eeccb4aa3b4e6`.

`````text
process.env.ORCHESTRA_DB = ":memory:"
// Tests never read the user's release database. This preload leaves XDG at
// the real data dir, so inheritance must be off even for file databases.
process.env.ORCHESTRA_INHERIT_CREDENTIALS = "0"
// Stored credentials are sealed with a key from this file, so tests never read or write the OS keychain.
process.env.ORCHESTRA_CREDENTIAL_KEY_FILE ??= path.join(os.tmpdir(), `orchestra-test-credential-${process.pid}.key`)
process.env.ORCHESTRA_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.ORCHESTRA_DISABLE_MODELS_FETCH = "true"
`````

## R047 ← S05 — `packages/core/script/migration.ts` 37–58

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e0d10349f7352be10dda179324fc39a7dbbe1ba7`; SHA256 fonte `256a4dd869d0d482986e8ff44b02a377053389eeee034f944deca2deeaaddcc7`. Pai S05 14–90; SHA256 trecho `67cb9b784dbea632e49e95e4ba23e162219e18fb6acb1477b6125e56d2cb2df4`.

`````text
    await fs.copyFile(snapshot, path.join(incremental, "baseline/snapshot.json"))
    await drizzle(temporary, incremental, args.values.name)

    const generated = await generatedMigrations(incremental)
    if (generated.length > 1) throw new Error(`Expected one generated migration, found ${generated.length}.`)
    const name = generated[0]
    if (name) {
      const target = path.join(tsDir, `${name}.ts`)
      if (await Bun.file(target).exists()) throw new Error(`Database migration already exists: ${name}`)
      await Bun.write(
        target,
        await formatTypescript(
          renderMigration(name, await Bun.file(path.join(incremental, name, "migration.sql")).text()),
        ),
      )
      await fs.copyFile(path.join(incremental, name, "snapshot.json"), snapshot)
    }

    await fs.mkdir(full)
    await drizzle(temporary, full, "schema")
    await Bun.write(schema, await formatTypescript(renderSchema(await generatedSql(full))))
    await Bun.write(registry, await formatTypescript(renderRegistry(await typescriptMigrations())))
`````

## R048 ← S05 — `packages/core/script/migration.ts` 71–88

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e0d10349f7352be10dda179324fc39a7dbbe1ba7`; SHA256 fonte `256a4dd869d0d482986e8ff44b02a377053389eeee034f944deca2deeaaddcc7`. Pai S05 14–90; SHA256 trecho `5e5fe1d38508707f85bc88b608df7ddb8b456af9a1c0dfd22bdcd391816bd8a3`.

`````text
    await fs.copyFile(snapshot, path.join(incremental, "baseline/snapshot.json"))
    await drizzle(temporary, incremental)
    if ((await generatedMigrations(incremental)).length > 0) {
      throw new Error(
        "Core schema has ungenerated database migrations. Run `bun script/migration.ts` from packages/core.",
      )
    }

    await fs.mkdir(full)
    await drizzle(temporary, full, "schema")
    if ((await Bun.file(schema).text()) !== (await formatTypescript(renderSchema(await generatedSql(full))))) {
      throw new Error("Current database schema is stale. Run `bun script/migration.ts` from packages/core.")
    }

    const migrations = await typescriptMigrations()
    if ((await Bun.file(registry).text()) !== (await formatTypescript(renderRegistry(migrations)))) {
      throw new Error("Database migration registry is stale. Run `bun script/migration.ts` from packages/core.")
    }
`````

## R049 ← S06 — `packages/core/script/toolkit-pack.ts` 1–15

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c77e95e4fa8228bea806a29f66ed4d28c6abeac3`; SHA256 fonte `cc01627f1823cd53a45f3d4a1b87fbef9de1349440dec721ccc1dd036286a308`. Pai S06 1–29; SHA256 trecho `b8ae9793c3d04bbe4f6908fa3200793f6a0d9175596873ec1e52ede789f9b839`.

`````text
#!/usr/bin/env bun
// Backend toolkit pack scaffold (ruling M6-1). From packages/core:
//   bun script/toolkit-pack.ts add <id> --kind <binary|npm|pip|jar|go-source|cargo-source> --upstream <owner/repo|npm-name|pypi-name>
//     --version <v> --group <schema|sql|kube|code> [--asset '<target>=<glob>' ...] [--role generator|check] [--input <text>]
//     [--skill <entry-skill> ...]
//   bun script/toolkit-pack.ts bump <id> <version>
//   bun script/toolkit-pack.ts skills         (derive the closed entry-skill type from packaged skill directories)
// `add` writes packs/<id>.ts, a recipe node backend-codegen/<group>/<id>/SKILL.md with the card headings, the barrel
// import and entry; the skill tool lists the group's engines from the nodes themselves. `binary` pins each
// target to the GitHub release asset matching its --asset glob (sha256 from the release API's digest); `npm` reads
// license, bin and dist.integrity from the registry and writes the lock with `npm install --package-lock-only`.
// `bump` moves the version in the pack and its recipe and refills those pins the same way. Every pin it cannot fill
// becomes TODO-PIN, which test/backend-toolkit-packs.test.ts rejects.
// Then: check the entry layout against a downloaded sample, record the host `floor` that
// `bun script/toolkit-floors.ts --engine <id>` prints, finish the recipe, run bun typecheck and the toolkit tests.
`````

## R050 ← S06 — `packages/core/script/toolkit-pack.ts` 345–360

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `c77e95e4fa8228bea806a29f66ed4d28c6abeac3`; SHA256 fonte `cc01627f1823cd53a45f3d4a1b87fbef9de1349440dec721ccc1dd036286a308`. Pai S06 345–360; SHA256 trecho `f8498e7a54b8f6da483e9c3af1e03b3a8fa9b741f54b1abfb73a63eea2bd625f`.

`````text
function sri(digest: string) {
  const [algorithm, hex] = digest.split(":")
  return `${algorithm}-${Buffer.from(hex, "hex").toString("base64")}`
}

function auth(): Record<string, string> {
  return process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}
}

type Release = { assets: Array<{ name: string; digest?: string; browser_download_url: string }> }
type NpmVersion = {
  license?: string
  bin?: string | Record<string, string>
  repository?: { url?: string }
  dist?: { integrity?: string }
}
`````

## R051 ← S07 — `packages/core/script/toolkit-floors.ts` 1–17

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bcb3e1f747870448172525b1b402ca3310ecf2f0`; SHA256 fonte `fe962720c76ab7cc5a84c98cd373f73ec5baaf6f951b111df87d7883e2b8b424`. Pai S07 1–28; SHA256 trecho `adb80283ddc6d935d68fab9068e5198a146a636ec3e2e40fd3d03db77c408fe7`.

`````text
#!/usr/bin/env bun
// Static OS floors of the pinned backend toolkit artifacts (F5.4). From packages/core:
//   bun script/toolkit-floors.ts [--engine <id> ...] [--runtime <id> ...] [--target <target> ...] [--json] [--files] [--check] [--cache <dir>]
// With no selection it measures every pack and runtime on every target. Each artifact is downloaded, checked against its
// pinned digest, unpacked, and every executable or shared object it installs is read without being run:
//   ELF    the highest GLIBC_x.y of its version needs, plus GLIBCXX and the ELF interpreter (musl is flagged).
//   Mach-O the minimum macOS (LC_BUILD_VERSION or LC_VERSION_MIN_MACOSX) of every slice.
//   PE     the highest Windows build among the imports that exist only on newer Windows (`NEWER_WINDOWS` below).
// The printed `floor` is what packs/*.ts and runtimes/*.ts record; `--check` exits 1 when a measurement differs from it. `source` engines are built by the host's own
// toolchain, so the binary they produce never leaves the machine that built it; their floor is the runtime's.
// A hosted engine records only what its install adds to its runtime: esbuild's binary for orval, the compiled wheels of
// datamodel-codegen. `script/toolkit-pack.ts bump` runs `--check` for the bumped pack.

import { $ } from "bun"
import { createHash } from "crypto"
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "fs/promises"
import os from "os"
`````

## R052 ← S08 — `packages/core/vendor/README.md` 1–22

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `40d0c2b0a8e54790420010d8b2a7d75990a5c091`; SHA256 fonte `7a9db9610c6d43bedcf630e4dfe3e831cf31128adf88b165337750923db0351f`. Pai S08 1–43; SHA256 trecho `608743a6ac169ad6040bc2f399e0d6af6d6c993369c79539cbb952855d4f5e85`.

`````text
# Pinned Lean backend dependency

Native integration consumes the published HuGR-Lean 0.4.0 package (Lean 2.0
summarize mode plus the lossless profile engine and the local raw store). This is an
ordinary bundled dependency, not a parser fork or release.

- Package: `hugr-lean@0.4.0`; backend imports only `hugr-lean/core` and `hugr-lean/raw`.
- Donor repository: https://github.com/gustavomhss/HuGR-Lean.
- Source commit: `0660c2b5dc9249816330603160aadfaeb33e5fc7` (tag `v0.4.0`, release PR #161).
- Source tree: `af1e9f1bd9781588fde339737e6c006886c64a4f`.
- Artifact: `hugr-lean-0.4.0-0660c2b5dc92.tgz`, 205370 bytes, the exact npm registry tarball
  `https://registry.npmjs.org/hugr-lean/-/hugr-lean-0.4.0.tgz`.
- SHA-256: `5ff983c58aa056d82059d5edd5b428478dda50a7683a201b7d844949aa1712a3`
  (equals the GitHub release asset `hugr-lean-0.4.0.tgz.sha256` of release `v0.4.0`;
  the release `.tgz` asset is byte-identical to the npm tarball).
- SHA-512 (npm `dist.integrity`): `sha512-mN7VGI6MBXiswd5ye0zJZML5loxhdrL3/HJbzvvXT8Cv6kMTyYsR7YorNYk6REdwEE4E4BfiwnuzZljOCDlkew==`;
  npm `dist.shasum` `5acd3ab1c9b31b3e6f07508b24fc8201d5e32fc7`.
- Provenance: npm SLSA v1 attestation (`https://registry.npmjs.org/-/npm/v1/attestations/hugr-lean@0.4.0`)
  binds the same SHA-512 subject to `refs/tags/v0.4.0` at commit `0660c2b5…` built by
  `.github/workflows/release.yml`, run https://github.com/gustavomhss/HuGR-Lean/actions/runs/38402476737.
- License: MIT, copyright 2026 gmhelmold. The package includes its complete
  LICENSE, NOTICE and donor license materials (52 notice files: LICENSE, NOTICE,
`````

## R053 ← S08 — `packages/core/vendor/README.md` 28–43

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `40d0c2b0a8e54790420010d8b2a7d75990a5c091`; SHA256 fonte `7a9db9610c6d43bedcf630e4dfe3e831cf31128adf88b165337750923db0351f`. Pai S08 1–43; SHA256 trecho `d3e91ac5fc12cc7425b959e7e86281a89448f3ecc0174f639b3fd8a439bfb6f1`.

`````text
Verification performed when vendoring (reproducible):

```sh
npm view hugr-lean@0.4.0 dist --json          # integrity, shasum, attestations URL
curl -sSfLO https://registry.npmjs.org/hugr-lean/-/hugr-lean-0.4.0.tgz
openssl dgst -sha512 -binary hugr-lean-0.4.0.tgz | base64   # == dist.integrity
gh release download v0.4.0 -R gustavomhss/HuGR-Lean -p '*'   # .tgz identical, .sha256 matches
```

`getProfiles()`, `tokenizeCommand()`, `filter()`, `summarize()`, `recoveryLine()` and
`RawStore`/`recallLines()` come from this actual archive. Classifier prefix evidence
lives at `fixtures/profiles/*/cases.json` in the pinned MIT source; identification is
attribution, not proof that every command grammar reduces. Playwright's witnessed Node
CLI path contains `@`, rejected by the frozen tokenizer: those invocations remain
unattributed. Previous engine stamps (`hugr-lean@0.2.0:*`) stay decodable so saved
profile history keeps counting after the upgrade.
`````

## R054 ← S09 — `docs/architecture/phase-plans/70-90-briefs/EXP-CORE.md` 49–56

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `adf16afadce8fb596d1b43f890b431e9cfbdadd0`; SHA256 fonte `7411448199a18fc3bcc62ca857abaf67bc785cdf4d438f731bc34862a3745e3a`. Pai S09 39–56; SHA256 trecho `e9d2b43a633e3a27ce97ea428a1a5ae68fe353b655c0809cbd53e840bc8a39c6`.

`````text

## Acceptance (run after the commit; each must print the expected value)

A1. `bun run script/explicit-exports.ts core --check` -> exit 0, prints `explicit-exports: core is explicit`.
A2. `bun run script/explicit-exports.ts core --verify-resolution $BASE` -> prints `checked=300 same=300 changed=0 lost=0 ignored=7` and exits 0.
A3. `node -e 'const e=require("./packages/core/package.json").exports;const w=Object.keys(e).filter(k=>k.includes("*"));console.log(w.length,w.join(" "))'` -> prints `0`.
A4. `node -e 'console.log(Object.keys(require("./packages/core/package.json").exports).length)'` -> prints `300`.
A5. `node -e 'const a=JSON.parse(require("child_process").execSync("git show '$BASE':packages/core/package.json"));const b=require("./packages/core/package.json");delete a.exports;delete b.exports;console.log(JSON.stringify(a)===JSON.stringify(b)?"same":"DIFF")'` -> prints `same`.
`````

## R055 ← S10 — `docs/specs/runtime-closure/PRODUCER-BOUNDARY.md` 1–21

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `dd51f4e3a9792319db46bbeb5872443b95cbd80c`; SHA256 fonte `5479651c8149f5e54e448906f2262f5d248545d3c6a17e2c79f731cd45dc9015`. Pai S10 1–29; SHA256 trecho `3e7b36ff1a1b15b4d81a0d0aeadcea70bc205a8223db4afe4bd55870930a9829`.

`````text
# Owned artifact producer: controlled-build boundary

<!-- producer-scope-exception:begin -->

## PUB-NS-001 — declared human-authorized scope exception

This changes the two hostile-writer gates' acceptance scope. It is an explicit
owner-authorized exception, not a fix for the POSIX source-name race or an
implicit claim that descriptor checks provide inode/name compare-and-swap.

Authorized by the human owner on 2026-10-08 through the lead's question tool.
The question was:

> Achei expansão de escopo: dois testes exigem proteção contra processo malicioso com mesmo usuário, capaz de trocar pastas durante export. Contrato original cobre artefatos em diretório de build controlado. POSIX não oferece rename/unlink condicionado ao inode; proteção contra esse atacante exige isolamento adicional. Confirmo diretório de build controlado como limite, documentando exclusão de mutação maliciosa pelo mesmo usuário?

Exact owner answer:

> Build controlado (Recommended)

The owner authorizes the original owned-build namespace limit: malicious same-UID
mutation is excluded; a privileged publisher capability is not required.
`````

## R056 ← S11 — `docs/specs/runtime-closure/CHECKPOINT.md` 39–56

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `58ca3cb34b0dd742debebd45c9f45f48bfd8919d`; SHA256 fonte `86b0d5d026816d72f4c25c895e3c38c6353c3e3d1e8671a5baf21ab4c2cb3338`. Pai S11 39–56; SHA256 trecho `f9825b4497f2fd8dbb3cf2ae042c83fb35c67d7dd7d57a83ee57eefc6fc066ea`.

`````text
| Input | Git blob |
|---|---|
| `bun.lock` | `38f67e0d610caa1488ba51cf647be72d2368b7de` |
| `packages/core/package.json` | `8b7e3eb2e047dbd893b5741715b4549236cdf440` |
| `packages/desktop/package.json` | `0a4f0b5fc12becbacab634d5fac36c866a78d4ce` |
| `packages/cli/package.json` | `40777cd14a5443f8b36eaef4c746251c0efaecd9` |

Core declares `jose: "6.2.3"`; Desktop declares Electron `42.3.3`. These manifest/lock inputs match the published integration base. The Nix owner received a coordination update; final hash/build capture still requires the final clean source revision and actual platform builds.

## Closure blockers and remaining evidence

- A08: real consent displaying Orchestra, entitled inference and real refresh/re-login. DigitalOcean registration exists, but scope and OAuth-bearer inference eligibility remain unproved. ChatGPT needs real OSS consent to issue its account-bound registration. Copilot/xAI owned registration and provider approval remain outstanding.
- A02–A04: full matching-OS/CPU compiled CLI and desktop matrix, actual Linux-producer/Windows-consumer artifact handoff, and real Windows/WSL guest transport/authenticated health. Staging fixtures do not prove those executions.
- A05–A06: final exact-head composition/qualification of resolver cold/warm and foreign-footprint checks. The previously missing successful prepared Bun, Node ESM bundle, compiled Bun, supported require and real OpenTUI matrix now passes on Linux/Windows in `37877015907`; the counted Bun registration mutation fails inside the same run. This does not turn unrelated historical resolver runs into exact-head milestone evidence.
- A10–A11: deterministic dependency output hashes and real CLI/Desktop Nix builds on all four declared systems, matching Electron and executable artifacts.
- A12: final committed/generated tree, remaining integration evidence, exact-head full applicable epic CI, and the single milestone PR/merge.

No required operational or platform item becomes complete from the focused results above.
`````

## R057 ← S12 — `docs/specs/runtime-closure/ARCHIE-QUALIFICATION.md` 52–76

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `050df1281a0c0c4822b58652ccc42d095fa7b36a`; SHA256 fonte `97b14dbfa1311df0d78d5e79c680d00baaa43098c60a8cbc4a07b01294c6b85d`. Pai S12 52–76; SHA256 trecho `b38dc0822be2732f0e0947a3b37258248eac6e4cd4492566ab0ffe08bc1cddc0`.

`````text

| Check | Actual Actions run | Result and reach |
|---|---|---|
| Legacy consumer hooks/transport | [38016351540](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38016351540) | Linux/Windows: 32 tests, 0 failures, 315 assertions each; exact consumer/test blobs retained in the authoring candidate |
| Renamed Orchestra consumers | [38018528560](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38018528560) | Linux/Windows: 186 tests, 0 failures, 1806 assertions each across 14 affected files |
| Renamed Core guards/receipts | [38019106393](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38019106393) | Linux/Windows: 66 tests, 0 failures, 764 assertions each across four affected files |
| Repaired ordinary-authoring prompt/playbook pins | [38024190713](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38024190713) | Linux/Windows: 23 tests, 0 failures, 151 assertions each |
| Legacy consumer mutation | [38019869958](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38019869958) | Removing pro-option filtering and output-cap omission made all three selected tests fail; implementation restored |
| Native authorship mutation | [38025092625](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38025092625) | Removing actual assistant-agent equality made old/generic-author rejection fail while two controls passed; implementation restored |
| Attribution schema counterexample | [38019106475](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38019106475) | Linux/Windows: 32 pass, seven failures; explicit `undefined` got schema type error instead of required `UPSTREAM_ATTRIBUTION_MISSING` |
| Attribution schema repair | [38028673763](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38028673763) | Linux/Windows: 40 tests, 0 failures, 227 assertions each; reviewed schema/test blobs copied unchanged into `175187aef14bc75580245a6ce4560644f95beb37` |

Package `bun typecheck` completed for Orchestra, Core and Schema on composed renamed source and after the attribution repair. Supported generators ran through `packages/client`'s `bun run generate` and `./packages/sdk/js/script/build.ts`; both completed without a tracked output diff. Atlas Boundary `bun typecheck` and `bun run check:generated` completed. These scoped checks do not become full-milestone or every-descendant CI evidence.

The Godfile gate first failed on the observer test at 758 nonblank LOC. The reviewed repair removed eight comments and one blank line without changing executable fixtures or assertions. `GODFILE_BASE_REF=fork/dev bun run check:godfile` then inspected 4029 source files with 325 warnings and zero errors; the observer fixture is exactly 750 nonblank LOC. No waiver or gate change was added.

The original Maestro prompt demanded model-side inspection unavailable in the actual tool surface. Actual inference returned HOLD. The repaired prompt delegates workflow/completion observation to the existing native Task gate; no runtime gate, known HOLD, governed lifecycle or approval requirement was removed. An earlier Task attempt failed on a final-LF request mismatch; exact rendered assignment corrected that failure. Earlier failed attempts remain failed receipts.

## Remaining acceptance and landing

- Independent host review accepted the successful foreground receipt. Independent Archie domain judgment of the proposal remains separate and pending.
- Seven Schema named-refusal failures and the observer fixture's Godfile over-cap finding are corrected at `175187aef14bc75580245a6ce4560644f95beb37`. Schema repair changes only explicit-undefined decoding/encoding and preserves strict attribution refusals; observer executable fixtures remain unchanged.
- Later Maestro text accurately describes V3 host-observed upstream attribution while retaining V1/V2 sources. The successful run remains attributed to its original source head.
- This proves ordinary native authoring through V1 message/part storage. It does not prove dual-view/V2 delivery, governed W6, same-Session resume, exact retry, background delivery, Nix distribution, Desktop/WSL or operational Orchestra OAuth consent.
- The Runtime branch's diff from `fork/dev` contains broader unlanded work. PR scope, required evidence and independent landing review must be reconciled before merging; this receipt does not qualify that broader work automatically.
`````

## R058 ← S13 — `docs/specs/v2/api.html` 919–925

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5801d1746e78c3ab79ec4ab8584610fcd5dd7a2c`; SHA256 fonte `de6f923e2e9d31cec28e133cfce8612b9523f0924bffd2f3d30a66201f036c7c`. Pai S13 906–936; SHA256 trecho `0dc9b2d572db698486503d79f5c06985f9d6cd813451701b9de6557eeb7a7cd9`.

`````text
              </tr>
              <tr>
                <td class="operation"><code>session.prompt</code></td>
                <td class="body">
                  <code>{ sessionID: SessionID prompt: Prompt delivery?: "immediate" | "deferred" }</code>
                </td>
                <td><span class="context-tag session">session</span></td>
`````

## R059 ← S14 — `docs/specs/v2/todo.md` 56–74

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `f26aa7588fa30832c48b3cabcff88e0ccae625de`; SHA256 fonte `99dcc36b5b6c314442643ef7d2732156fb68000ab669daeab9dcdbab0011d475`. Pai S14 56–74; SHA256 trecho `aae64b83c19d85d938b0bfd00c1afdbbc90859dd2a0f3eb72dbb0e8eabd39097`.

`````text
### Deferred durable continuation recovery

Do not infer that ambiguous provider work is safe to retry from an advisory wake.
The first inbox-driven runner intentionally omits outer provider-attempt markers
until they have a concrete consumer and a complete recovery policy.

Design post-crash continuation recovery as one explicit slice. It should model:

- promoted input and projected-history state
- queued-input promotion and steering assignment
- provider-attempt preparation versus provider-dispatch ambiguity
- required post-tool continuation across process loss
- explicit `retry` and `abandon` decisions for unknown outcomes
- bounded automatic retry only where provider and tool idempotency make it safe
- retry budget, backoff, visible recovery status, startup discovery, and future
  clustered ownership fencing

Do not introduce an enclosing durable execution identity solely to group these
facts; a process-local Session drain has no durable transcript boundary.
`````

## R060 ← S15 — `packages/core/test/fixture/omni-expect.ts` 1–7

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `067fbf7a21e008caacfab46a2eaeb878ac7bcaac`; SHA256 fonte `33272d6488f070f4ca10fbaa5e9c113e4ed9eabd4c2d148dbd2321b6dc4d4ab9`. Pai S15 1–28; SHA256 trecho `b74576f4f2676cf6f3e92342cb80aded095a63df731fbdbde448f68a18035221`.

`````text
// Test-only expectations for the omni positive control (script/test-omni-control.ts, D-L1).
//
// A test that must spawn through omni calls expectSpawn(import.meta.path) inside its body, before it spawns. The
// control's global afterEach then settles that test: the omni spawns counted since the call are this test's own, so a
// spawn made by any other test or file cannot satisfy it. A test that never ran (a -t filter, skipIf, skip) never
// called expectSpawn and expects nothing. The preload and the tests import this same file, so they share this
// module's one list; it lives under test/ because nothing in the product needs it.
`````

## R061 ← S15 — `packages/core/test/fixture/omni-expect.ts` 13–27

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `067fbf7a21e008caacfab46a2eaeb878ac7bcaac`; SHA256 fonte `33272d6488f070f4ca10fbaa5e9c113e4ed9eabd4c2d148dbd2321b6dc4d4ab9`. Pai S15 1–28; SHA256 trecho `07c0e7573fde3edd8b0f03142f5cf065ba60f5bdc3adb0a5e2e9602b60e5fc0b`.

`````text
/** Called inside a test that must spawn through omni; a second call in the same test keeps the first start. */
export function expectSpawn(file: string) {
  open ??= { file, start: Omni.snapshot().spawns }
}

/** The control's afterEach: records the open expectation, if this test made one, with its own spawn count. */
export function settle() {
  if (!open) return
  settled.push({ file: open.file, spawns: Omni.snapshot().spawns - open.start })
  open = undefined
}

/** Every settled expectation of this process, in test order. */
export function results() {
  return [...settled]
`````

## R062 ← S16 — `packages/core/test/fixture/actions-transport.ts` 55–67

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `b8eb249ded98ce2d8fa3aa32922dd645bf724f8a`; SHA256 fonte `5b475ea84f3f0f8af22f5df1b747168b7338b2c40581dfa77d674bf2d935584f`. Pai S16 55–67; SHA256 trecho `ca8fd0d63f34a480badc8b39a7f33da1823a2d982f37e3b4cea4dc97cee1adef`.

`````text
  const proc = yield* AppProcess.Service
  const handles: ChildProcessHandle[] = []
  const commands: import("effect/unstable/process/ChildProcess").Command[] = []
  const service = yield* ActionsTransport.make({ directory: root }).pipe(Effect.provideService(AppProcess.Service, {
    ...proc,
    spawn: (command) => proc.spawn(command).pipe(Effect.tap((handle) => Effect.sync(() => {
      if (command._tag === "StandardCommand" && ["version", "config"].includes(command.args[0])) return
      handles.push(handle)
      commands.push(command)
    }))),
    run: () => Effect.die("Transport must use inherited raw spawner, never run collection"),
    runStream: () => Stream.die("Transport must not use line-decoded runStream"),
  }))
`````

## R063 ← S17 — `packages/core/test/fixture/board-queue.ts` 27–38

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7aae79dd6d22b26fa281e52ced58c7dd529e1823`; SHA256 fonte `a40f86b4e3a4e55dbef08f1ce7e7c9319211746f2d590d04d92e38987987a449`. Pai S17 27–49; SHA256 trecho `16e67e208d307b0382d06b62515be67dcf872fa1dc67a61db8f397eb86d8d2e5`.

`````text
// GitHub is a fake keyed by repo name that reads PR heads from each test's bare origin; git itself is real.
// `seeded` branches make a PR's full gate fail when every one of them is in its head; `baseRuns` is the base commit's check-runs.
type Remote = {
  origin: string
  pulls: Map<number, string>
  bodies: Map<number, string>
  conclusion: string
  seeded: ReadonlyArray<string>
  /** Branches whose full gate comes back CANCELLED (infrastructure, not code) on its first `infraAttempts` attempts. */
  cancelled: ReadonlyArray<string>
  infraAttempts: number
  /** Each PR's run attempt; a PR's gate is one Actions run numbered like the PR, and `gh run rerun` adds an attempt. */
`````

## R064 ← S17 — `packages/core/test/fixture/board-queue.ts` 132–147

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7aae79dd6d22b26fa281e52ced58c7dd529e1823`; SHA256 fonte `a40f86b4e3a4e55dbef08f1ce7e7c9319211746f2d590d04d92e38987987a449`. Pai S17 124–151; SHA256 trecho `e16afd0b04ffa9d1aa18af13f38b9cb52590e30df08456f40e2c03b56381ba27`.

`````text
// Stands in for Atlas's renderer: the bodies are the records themselves, so the test reads what the host filled in.
const RENDER: BoardRecord.Port = {
  pr: (record) => JSON.stringify(record),
  bundle: (record) => JSON.stringify(record),
  trailer: (trailer) => `WP: ${trailer.WP}\nAttempt: ${trailer.Attempt}`,
}

const build = (env?: NodeJS.ProcessEnv) =>
  testEffect(
    AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
      [
        Board.node,
        makeGlobalNode({
          service: Board.Service,
          layer: Board.layerWith({ gh, record: RENDER, env }),
          deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node],
`````

## R065 ← S17 — `packages/core/test/fixture/board-queue.ts` 333–351

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `7aae79dd6d22b26fa281e52ced58c7dd529e1823`; SHA256 fonte `a40f86b4e3a4e55dbef08f1ce7e7c9319211746f2d590d04d92e38987987a449`. Pai S17 333–355; SHA256 trecho `0eabf0e1481d7703a3b65df865b537f9dab38a9fe0b45fb5b8be0e45d8c23531`.

`````text
// A scoped pass on the card's head tree, which `queue` requires when the contract has `scoped.tests`.
export function passed(repo: Repo, number: number) {
  return Effect.gen(function* () {
    const tree = yield* Effect.promise(async () => (await Bun.$`git -C ${repo.directory} rev-parse card-${number}^{tree}`.quiet().text()).trim())
    const found = yield* row(repo, number)
    const database = yield* Database.Service
    yield* database.db
      .insert(BoardCheckTable)
      .values({
        id: CheckID.create(),
        issue_id: found.issue.id,
        attempt: 1,
        kind: "scoped",
        command: "bun test a",
        tree_sha: tree,
        outcome: "pass",
        failing: [],
        started_at: 0,
        ended_at: 120_000,
`````

## R066 ← S18 — `packages/core/test/fixture/capability-schedule.ts` 37–52

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bd376bd299100cca1f8ebda844518ec0190d8652`; SHA256 fonte `68302e3706d5ed9895422a5e620167b8d2e3ee1a8546320fb4449d12141a9855`. Pai S18 37–52; SHA256 trecho `5fb24b30119eb80629e0d98c9b731843b96209af31b78739500f7640d98220ce`.

`````text
export const tmp = await tmpdir()
const placement = location(Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }))
const execution = Layer.succeed(SessionExecution.Service, SessionExecution.Service.of({
  active: Effect.succeed(new Set()), resume: () => Effect.void, interrupt: () => Effect.void, wake: () => Effect.void,
  exclusive: (_, effect) => Effect.asSome(effect), withRunner: () => Effect.die("No Session runner in this fixture") }))
const projects = Layer.succeed(ProjectV2.Service, ProjectV2.Service.of({
  resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
  directories: () => Effect.succeed([]), list: () => Effect.succeed([]), commit: () => Effect.void }))
export const layer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node,
  SessionStore.node, SessionV2.node, ScheduledTask.node, ScheduledTaskPort.node, PermissionV2.node, PermissionSaved.node, AgentV2.node,
  Location.node, ToolRegistry.node]), [
  [Database.node, Database.layerFromPath(join(tmp.path, "schedule.sqlite"))],
  [Location.node, Layer.succeed(Location.Service, Location.Service.of(placement))],
  [ProjectV2.node, projects],
  [SessionExecution.node, execution],
])
`````

## R067 ← S18 — `packages/core/test/fixture/capability-schedule.ts` 72–85

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `bd376bd299100cca1f8ebda844518ec0190d8652`; SHA256 fonte `68302e3706d5ed9895422a5e620167b8d2e3ee1a8546320fb4449d12141a9855`. Pai S18 65–89; SHA256 trecho `8e976db28ec43fe70fd733a7687388658232dde9f4751da039e4fcea9ea3276d`.

`````text
    // Through ToolRegistry, so permission ask/deny and settlement run exactly as for a model call.
    // `callID` replays an earlier call ID, as a retried settlement of the same tool call would.
    const call = (input: Schema.Json, callID?: string) => Effect.gen(function* () {
      const toolCallID = callID ?? `call-${++counter.n}`
      if (!callID) yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID,
        assistantMessageID: context.assistantMessageID, callID: toolCallID, name: CapabilitySchedule.name,
        timestamp: DateTime.makeUnsafe(1) })
      const owner = { projectID: placement.project.id, location: { directory: placement.directory },
        sessionID: context.sessionID, agentID: context.agent }
      return yield* CapabilityInvocation.withContext({ issuer: "core", owner, invocation: { sessionID: context.sessionID,
        agentID: context.agent, assistantMessageID: context.assistantMessageID, callID: toolCallID },
      rootToolName: CapabilitySchedule.name, effectiveRules: allow, nativeDenyFloor: [] },
      registry.materialize(allow).pipe(Effect.flatMap((materialized) => materialized.settle({ ...context,
        call: { type: "tool-call", id: toolCallID, name: CapabilitySchedule.name, input } }))))
`````

## R068 ← S19 — `packages/core/test/fixture/capability-connection-management.ts` 34–41

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5aaaf333f8c639ab10eaa9df57f5cecde6279687`; SHA256 fonte `0cd350dfa0921677665e1dadd81b907de0704305ca0174e5b9c5c419910caffa`. Pai S19 29–41; SHA256 trecho `1281e9e410eb39c570436ee31fb0a9b2f96476523a4309d1c5688b01e5de66ab`.

`````text
// Load the actual factory after Store integration. Missing implementation fails, never skips
// or substitutes a fake Store. The frozen-contract checkpoint must still typecheck beforehand.
const storeFactory = Effect.promise(async () => {
  const { CapabilityConnectionStore }: { CapabilityConnectionStore: {
    make: Effect.Effect<CapabilityConnectionStoreContract.Interface, CapabilityConnectionStoreContract.Error>
  } } = await import(new URL("../../src/capability/connection/store.ts", import.meta.url).href)
  return CapabilityConnectionStore.make
})
`````

## R069 ← S20 — `packages/core/test/distribution-bundle-execution.test.ts` 13–26

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `185cc0e06fd075b1030f046f024c5d4c7390a1e9`; SHA256 fonte `c0e70fadb08efab5a37e88a1950657b3b2fd18a9575537c7fc111c5103023343`. Pai S20 13–34; SHA256 trecho `a3f4f2c76131279922f02cca875c11730dd7e2f72b21d319ed68f928ebc7e73d`.

`````text
// ORCHESTRATION-ONLY: fake Bun at the shell command boundary, never native omni qualification.
// The host AppProcess/omni spawn is real; the existing preload judges that separately.
const it = testEffect(LayerNode.compile(AppProcess.node))
const nonce = "0123456789abcdef0123456789abcdef"
const log = (verdict: string) => `omni positive control [${nonce}]: ${verdict}\nomni control nonce: ${nonce}\n`
const declaration = 'printf \'omni control nonce: %s\\n\' "$nonce" >> ../../distribution-logs/run.log'

for (const pkg of ["core", "cli"] as const) {
  for (const exitCode of [0, 17]) {
    it.live(`ORCHESTRATION-ONLY ${pkg}: actual producer, shell argv, child exit ${exitCode}, log and control`, () => Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const box = yield* fixture(pkg)
      yield* admit(box)
      yield* observe(box, run, exitCode)
`````

## R070 ← S21 — `packages/core/test/distribution-bundle-boundaries.test.ts` 13–23

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `77584b66723a615e0ce9a81cdec431dcca647673`; SHA256 fonte `f09c87bcc0ea5d1561d508e98a284d088f8c643d8ab92752838537cc2b04e393`. Pai S21 12–23; SHA256 trecho `9b5992aeb4b74a766d3bb2c256533406908f4814b4a5b8bd90df849f46c495b7`.

`````text
const cargoOutput = `ORCHESTRATION-ONLY: synthetic cargo; never native qualification
running 1 test
test ${nativeJobTest} ... native Job lifetime control: stop passed
native Job lifetime control: natural passed
native Job lifetime control: descendant passed
native Job lifetime control: unknown passed
native Job mutation control: original owned handle stayed valid; OS oracle rejected it
ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 3 filtered out; finished in 0.10s
`
`````

## R071 ← S22 — `packages/core/test/fixture/github-read.ts` 27–32

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `71c70d38d6ef2b3b0a1d9101cec0543c8c83a958`; SHA256 fonte `a9e2595868a0bf25d17fb6d2347274a45218c62f7ff1f6caad77ca0131a7cbdc`. Pai S22 19–32; SHA256 trecho `64d9962c1a649ca65d5e1ae2ac5e4ccde443c9b7bf87c67ad579fef6aa8d6069`.

`````text
// Native wire-shape recordings derived from official response examples, sanitized
// for this fixture. They are not a live-provider compatibility claim.
// https://docs.github.com/en/rest/actions/workflows#list-repository-workflows
export const workflow = { id: 161335, node_id: "W_fixture", name: "CI", path: ".github/workflows/build.yml", state: "active",
  created_at: "2020-01-08T23:48:37Z", updated_at: "2020-01-08T23:50:21Z",
  url: "https://api.github.com/repos/acme/renamed/actions/workflows/161335",
`````

## R072 ← S23 — `packages/core/test/fixture/process-tree.ts` 1–9

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `5e4121f21d19e2eacf9441ca57288ad0fb9a125d`; SHA256 fonte `0faac770f6bea7ac1e47d43b2b900eaa4d4f5e0effa209f3d0237d34ba2ac5e8`. Pai S23 1–21; SHA256 trecho `cf8d286443d0466cc35041dea6b46696d89322844e95f3dc5820f06c29ab0b40`.

`````text
// The shared nonce tree (integration plan §4): a root that starts a chain of descendants, every one of them carrying
// the tree's nonce in argv, plus the oracles that tell whether any of them is still alive. Tests identify processes
// by the nonce and by a recorded start time, never by a bare pid: pids are reused on CI.
//
// Every fixture process runs `process.execPath -e <script>`, so the tree works under Bun and Node on every OS. Each
// one writes {pid, nonce, startTime} to <tmpdir>/<nonce>/<pid>.json before it starts its child; the leaf then prints
// `ready <nonce>`, which every ancestor forwards to its stdout. Seeing that line means every record is written.
//
// This file must also load under Node with --experimental-strip-types, so it uses node: builtins only.
`````

## R073 ← S24 — `packages/core/test/windows-process-query.hosted.ts` 9–23

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `76605fa025e9d7b388a6e6ebc99fff8ad7d20db3`; SHA256 fonte `5f27857477bcdf5cbd93d305dcfe488895f4249de5aac689300dfa2a859a2f17`. Pai S24 1–24; SHA256 trecho `a4fb28ac7cd5a25c9a8c5400c34f793dcce28f981a308c1341c7077f53f8e1ae`.

`````text
const decoder = new URL("../../../native/omni/campaign/windows-inventory.ts", import.meta.url).href
beforeAll(() => { expect(process.env.CI).toBeTruthy() })

test("real native Node receives request and config; files survive until close", async () => {
  const result = JSON.parse(await WindowsProcessQuery.invoke(`
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(import.meta.filename + '.config', 'utf8'));
console.log(JSON.stringify({config, request: JSON.parse(process.argv[2]), file: import.meta.filename,
  native: !process.versions.bun && process.release.name === 'node', executable: fs.realpathSync(process.execPath)}));
`, decoder, [process.pid]))
  expect(result.native).toBe(true)
  expect(result.executable).toBe(WindowsProcessQuery.nodeExecutable())
  expect(result.config).toEqual({ node: result.executable, decoder })
  expect(result.request).toEqual([process.pid])
  expect(existsSync(path.dirname(result.file))).toBe(false)
`````

## R074 ← S25 — `packages/core/test/lib/effect.ts` 41–60

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `4e9a5c195d29d621f96f326041fa1d8a52be7147`; SHA256 fonte `835060b44a2229edd851c34a7f648f062d54aea2babb4f1e3e63197a48402d6f`. Pai S25 41–60; SHA256 trecho `b4fb05ecf3b4ddb316c7c7f3e7eb65ceae8273045b4245d4fb43417273a3087e`.

`````text
  // Counted as skipped by the runner when the condition holds, instead of passing with an early return.
  effect.skipIf = (condition: boolean) => <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.skipIf(condition)(name, () => run(value, testLayer), opts)

  live.skipIf = (condition: boolean) => <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.skipIf(condition)(name, () => run(value, liveLayer), opts)

  return { effect, live }
}

// Test environment with TestClock and TestConsole
const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())

// Live environment - uses real clock, but keeps TestConsole for output capture
const liveEnv = TestConsole.layer

export const it = make(testEnv, liveEnv)

export const testEffect = <R, E>(layer: Layer.Layer<R, E>) =>
  make(Layer.provideMerge(layer, testEnv), Layer.provideMerge(layer, liveEnv))
`````

## R075 ← S26 — `packages/core/test/lib/sandbox-host.ts` 5–17

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `6d9c7b9de5bbd336f8f7e2c07e5d0d5aebf544b5`; SHA256 fonte `5d18fdea9e71de604d225a3f5ed71dcba1fdcd416813d7970c019a566800e01d`. Pai S26 1–17; SHA256 trecho `706009731422d25b3a422649b0611340fe32aa14472a8b40a3412b7ad12eb077`.

`````text
/**
 * The jail this host gives a sandbox-bound command: seatbelt, srt, or none and why. A Linux host with bubblewrap fetches
 * its sandbox runtime first, so its srt jail is tested rather than reported as not acquired yet. Tests branch on this:
 * the jailed behaviour where there is a jail, the named HOLD or documented fallback where there is none.
 */
export const sandboxHost = await Effect.runPromise(
  ToolSafetySandboxRuntime.ready().pipe(Effect.andThen(ToolSafetySandbox.status())),
)

// Windows' AppContainer confines pwsh and cmd only (tool-safety-appcontainer.test.ts), so the node-based probes that branch
// on `jail` treat it as no jail and take their named-HOLD path.
export const jail = sandboxHost.shellWrites === "enforced" && sandboxHost.shellSandbox.kind !== "appcontainer"
  ? sandboxHost.shellSandbox.kind : undefined
`````

## R076 ← S27 — `packages/core/test/upstream-settlement-preservation.test.ts` 29–40

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `12fee3da08fdac660d5952099920599509a25ffc`; SHA256 fonte `caaa5e5990d40c1964578ce79e5795d62bb87f20f177627c27aa24b10b505c41`. Pai S27 25–45; SHA256 trecho `771a340bd67f929022ccd306ffe56272d3e6b6ea03bdd982c29c356168071b35`.

`````text
// Prepared source cases, not executed. These exercise the actual receipt helpers and production updater.
const it = testEffect(Layer.empty)
const sessionID = SessionSchema.ID.make("ses_authority")
const messageID = SessionMessage.ID.make("msg_authority")
const input = { subagent_type: "archie", task_id: "ses_child", prompt: "Return the proposal" }
const owner = { sessionID, messageID, callID: "task-call", tool: "task", input }
const workResult = {
  schema: "upstream-work-result-v1",
  taskId: "tsk_proposal",
  card: { parsed: true, messageID: "msg_returned" },
  author: { memberId: "archie", executionSessionID: "ses_child", messageID: "msg_returned" },
  outcome: "done",
`````

## R077 ← S28 — `packages/core/test/fixture/packaged-skills.ts` 9–18

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; blob `e69c2361d0a4dec7e900e48ed8e5eeadb75aea1f`; SHA256 fonte `3ee1d07bc4a68bcf9c0591def412f90904c8c0fb25216c07c9610c2a7b3177a3`. Pai S28 9–27; SHA256 trecho `fc8119756b4ce970c44d0e984bc54558ad88b42079654a18c2d6dc2270fe8dce`.

`````text
export const trees = {
  backend: {
    "backend-implement/SKILL.md": "---\nname: backend-implement\n---\nRead references/deep/contract.md.\n",
    "backend-implement/references/deep/contract.md": "Exact UTF-8: café, 日本語\n",
    "backend-implement/references/empty.md": "",
  },
  archie: {
    "archie-design/SKILL.md": "---\nname: archie-design\n---\nRead references/architecture.md.\n",
    "archie-design/references/architecture.md": "Design contract\r\n",
  },
`````

## I01 — confronto de autoridade documental

Input obrigatório fornecido, não nova captura GitHub. AGENTS.md linhas 207–217; SHA256 fonte `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`; trecho `405cd0b08a53f053f88de7fd615712564267b65a3cfcdaafd0b86a7e177fb1c1`.

`````text
## V2 Session Core

- Keep durable prompt admission separate from model execution. `SessionV2.prompt(...)` admits one durable `session_input` row before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. The serialized runner promotes admitted inputs into visible user messages at safe boundaries.
- Reusing a Session ID adopts the existing Session. Reusing a prompt message ID reconciles an exact retry only when Session, prompt, and delivery mode match; conflicting reuse fails. Historical projected prompts lazily synthesize promoted inbox records during exact retry.
- Keep `SessionExecution` process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement through `SessionStore` plus `LocationServiceMap.get(session.location)` only when a drain starts; no layer should take a Session ID. V2 interruption targets the active process-local ownership chain for that Session; idle or missing interruption is a no-op.
- Keep `SessionRunner`, model resolution, tool registry, permissions, and filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
- Preserve one explicit `llm.stream(request)` call per provider turn and reload projected history before durable continuation. Do not bridge through legacy `SessionPrompt.loop(...)` or delegate orchestration to an in-memory tool loop. The one exception is an agent whose `engine` names a registered `ExecutionHost` (today only `claude-code`): its single `ExecutionHost.stream(turn)` call is that provider turn, its internal tool calls persist as provider-executed events, Orchestra tools it invokes settle through the runner's `turn.execute`, and its `query()` always keeps the `claude_code` system prompt preset.
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
- Keep delivery vocabulary explicit. Prompts steer by default and promote at the next safe provider-turn boundary while the current drain requires continuation. An explicit `queue` input remains pending until the Session would otherwise become idle; promote one queued input at that boundary, then reevaluate continuation before promoting another. Promoting any new user input resets the selected agent's provider-turn allowance; a batch of steers resets it once.
- Keep EventV2 replay owner claims separate from clustered Session execution ownership.
- Keep the System Context algebra, registry, and built-ins in `packages/core/src/system-context`; keep Context Source producers with their observed domains, and keep Session History selection plus Context Epoch persistence Session-owned.
`````

## S29 — identidade de observações estruturais

Estes valores são resultados de parsing/hash determinísticos, **não excertos literais e não PASS**. Para conferir o manifesto completo, solicitar `packages/core/package.json`; a fonte está integral no arquivo capturado. Para arquivo vendorizado, pedir README e metadata do membro; o código interno não foi declarado integralmente entendido.

- Exports contados: 437; bare: False; wildcard: False.
- Snapshot SQLite: 63 entidades tables na lista ddl.
- Tarball: 205370 bytes, SHA256 `5ff983c58aa056d82059d5edd5b428478dda50a7683a201b7d844949aa1712a3`.
- Corpo histórico s1.core.entry: 7.312 bytes, SHA256 `6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c`, preservado em `history/entry.md`.

# Necessidade de revisão: `union-navigation-proposal.md`

Corpo deve ser lido integralmente; os trechos abaixo sustentam ramos decisivos e limites.

## R078 ← K01 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/partition.json` 11–51

Commit `70234d541a9a3539935ef16f19e33c8f2d5f30ec`; blob `b834eb19daea27f173afb1dd011a19f77b491f24`; SHA256 fonte `959a3c024337c8082625082cba4fad6ceea3243690fb0850634546dc33f2684c`. Pai K01 1–127; SHA256 trecho `cf3a1bb7cc656f9f124f923520212a7758f2983959251a0e7bf83a7a4eae6fff`.

`````text
  "allocation": "Exact legacy artifact_key -> owner; sources.jsonl is exhaustive, not a prefix heuristic.",
  "primary_source_ownership": {
    "s1.core.session-admission": "S1-01",
    "s1.core.session-execution": "S1-01",
    "s1.core.persistence": "S1-01",
    "s1.core.context": "S1-01",
    "s1.core.configuration": "S1-01",
    "s1.core.project": "S1-01",
    "s1.core.models": "S1-01",
    "s1.core.economy": "S1-01",
    "s1.core.runtime": "S1-01",
    "s1.core.tools": "S1-02",
    "s1.core.security": "S1-02",
    "s1.core.extensions": "S1-02",
    "s1.core.capability": "S1-02",
    "s1.core.automation": "S1-03",
    "s1.core.research": "S1-03",
    "s1.core.boundaries": "S1-03",
    "s1.core.entry": "S1-03",
    "s1.api.boundaries": "S1-04",
    "s1.api.schema-contracts": "S1-04",
    "s1.api.session-contract": "S1-04",
    "s1.api.server-edge": "S1-04",
    "s1.api.stream-contract": "S1-04",
    "s1.api.client-projection": "S1-04",
    "s1.api.codegen": "S1-04",
    "s1.api.sdk-composition": "S1-04",
    "s1.api.surface-disposition": "S1-04",
    "s1.runtime.llm_turns.l1": "S1-05",
    "s1.runtime.llm_providers.l1": "S1-05",
    "s1.runtime.llm_recording.l1": "S1-05",
    "s1.runtime.plugin.l1": "S1-05",
    "s1.runtime.codemode.l1": "S1-05",
    "s1.runtime.codemode_openapi.l1": "S1-05",
    "s1.runtime.effect_sqlite.l1": "S1-05",
    "s1.runtime.http_recorder.l1": "S1-05",
    "s1.runtime.guides_intent.l1": "S1-05",
    "s1.runtime.maintenance_intent.l1": "S1-05"
  },
  "expected_sources": 2236,
  "expected_legacy_artifacts": 36,
`````

## R079 ← K02 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/dependencies.json` 1–9

Commit `70234d541a9a3539935ef16f19e33c8f2d5f30ec`; blob `a65c72a33599afec662649c8ebf86808c99e320b`; SHA256 fonte `83dfbbe0a1f585dc548643dc04f5f85eb2d4c1531d176a068582829e80375ee9`. Pai K02 1–103; SHA256 trecho `6026d8a3dbf6ae17e5e2d81b6b7d11d026a7864edb8f2b76606a941bc1c8e174`.

`````text
{
  "schema": "genesis-s1-subdivision-dependencies/v1",
  "kind": "obligation-routing-not-build-graph",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "rules": [
    "Cada source path e chave L1 histórica tem um dono primário; leitura cruzada é permitida.",
    "Roteamento de obrigação não cria automaticamente uma build_dependency. Somente vínculos semanticamente necessários e aceitos entram no pacote.",
    "Ler fontes pinadas para avançar a parte independente; não afirmar aceite de artefato alheio ainda ausente.",
    "Não converter lacuna local em complemento global apenas para declarar conclusão."
`````

## R080 ← K02 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/dependencies.json` 55–98

Commit `70234d541a9a3539935ef16f19e33c8f2d5f30ec`; blob `a65c72a33599afec662649c8ebf86808c99e320b`; SHA256 fonte `83dfbbe0a1f585dc548643dc04f5f85eb2d4c1531d176a068582829e80375ee9`. Pai K02 1–103; SHA256 trecho `0b4c3783474f8376f7f4280231814e2c69137dbc43ec282b9a801cb1d4aef9c8`.

`````text
      "id": "automation-admission",
      "supplier": "S1-01",
      "consumer": "S1-03",
      "subject": "Admissão versus execução/conclusão e cancelamento em Actions/agendamento/Board."
    },
    {
      "id": "core-entry",
      "supplier": "S1-03",
      "consumer": "S1_COORDINATION",
      "subject": "Contribuição concreta à entrada/navegação geral, sem aceitar os outros grupos antecipadamente."
    },
    {
      "id": "oversized-inputs",
      "supplier": "S4",
      "consumer": [
        "S1-04",
        "S1-05"
      ],
      "subject": "Capacidade comprovada de observação de fontes grandes quando exigidas; manter os bytes e a lacuna até solução válida."
    },
    {
      "id": "runtime-and-package-closure",
      "supplier": "S4",
      "consumer": [
        "S1-01",
        "S1-02",
        "S1-03",
        "S1-04",
        "S1-05",
        "S1_COORDINATION"
      ],
      "subject": "Release e código exatos; limites cross-package e por-capacidade devem ser respeitados, sem criar novo Atlas."
    },
    {
      "id": "external-boundaries",
      "supplier": [
        "S3",
        "S4",
        "S5"
      ],
      "consumer": "S1-03",
      "subject": "Garantias do lado externo Relay/Atlas/Omni: ler fontes exatas e consumir evidência aceita quando uma alegação integrada depender dela."
    }
  ],
`````

## R081 ← K02 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/dependencies.json` 160–202

Commit `70234d541a9a3539935ef16f19e33c8f2d5f30ec`; blob `a65c72a33599afec662649c8ebf86808c99e320b`; SHA256 fonte `83dfbbe0a1f585dc548643dc04f5f85eb2d4c1531d176a068582829e80375ee9`. Pai K02 160–202; SHA256 trecho `c207f5967d5b8f36290f031148d6486efa4a71f0b4856ea65915d5a298e74693`.

`````text
  "union": {
    "owner": "S1_COORDINATION",
    "owner_description": "Coordenação da conversa que preparou este kit",
    "target_branch": "genesis-fresh-s1",
    "inputs": [
      {
        "subslice_id": "S1-01",
        "branch": "genesis-s1-sessions",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/01-sessions/handoff.json"
      },
      {
        "subslice_id": "S1-02",
        "branch": "genesis-s1-tools",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/02-tools/handoff.json"
      },
      {
        "subslice_id": "S1-03",
        "branch": "genesis-s1-automation",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation/handoff.json"
      },
      {
        "subslice_id": "S1-04",
        "branch": "genesis-s1-api",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/04-api/handoff.json"
      },
      {
        "subslice_id": "S1-05",
        "branch": "genesis-s1-libraries",
        "handoff_path": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/05-libraries/handoff.json"
      }
    ],
    "required": [
      "Reconciliar os cinco payloads e alterações de produto sem sobrescrever avanços.",
      "Conferir a união das 2236 fontes e das necessidades locais, mantendo exclusões justificadas e gaps.",
      "Selecionar corpos/receitas/dependências/roots e o índice geral do Core, com closure compatível com Atlas.",
      "Provar os fluxos cruzados relevantes de API, Session, LLM, tools, persistência, automação e bibliotecas.",
      "Reconciliar versões, aceites e bindings; obter revisão independente da união S1 e seus gates.",
      "Entregar S1 ao ROOT global sem declarar encerrada a campanha S1–S5."
    ],
    "global_owner": "ROOT",
    "global_branch": "genesis-fresh-final"
  }
}
`````

## R082 ← K08 — `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/roster.json` 69–129

Commit `70234d541a9a3539935ef16f19e33c8f2d5f30ec`; blob `da798691e3188fe2a829ec63f16619b915e4409e`; SHA256 fonte `ab510007f67999f77b6ccebfad549fee011d656f3c58853fbe7db41a7c7d473f`. Pai K08 69–129; SHA256 trecho `2525420f903c88de98c93d070957c6e3bf3a863c257148dccc165bd0873d1de7`.

`````text
    "DOD-7"
  ],
  "branches_created_by": "coordination",
  "new_execution_id_policy": "Generate on actual start; no historical handle is claimed.",
  "subslices": [
    {
      "id": "S1-01",
      "title": "Sessões, estado e infraestrutura de execução",
      "branch": "genesis-s1-sessions",
      "source_count": 555,
      "owned_legacy_artifact_count": 9,
      "mission": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/01-sessions/mission.json",
      "sources": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/01-sessions/sources.jsonl",
      "inputs": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/01-sessions/inputs.json",
      "output_prefix": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/01-sessions"
    },
    {
      "id": "S1-02",
      "title": "Ferramentas, segurança, extensões e capacidades",
      "branch": "genesis-s1-tools",
      "source_count": 424,
      "owned_legacy_artifact_count": 4,
      "mission": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/02-tools/mission.json",
      "sources": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/02-tools/sources.jsonl",
      "inputs": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/02-tools/inputs.json",
      "output_prefix": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/02-tools"
    },
    {
      "id": "S1-03",
      "title": "Automação, pesquisa e fronteiras do Core",
      "branch": "genesis-s1-automation",
      "source_count": 462,
      "owned_legacy_artifact_count": 4,
      "mission": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/03-automation/mission.json",
      "sources": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/03-automation/sources.jsonl",
      "inputs": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/03-automation/inputs.json",
      "output_prefix": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation"
    },
    {
      "id": "S1-04",
      "title": "Schema, contratos públicos, APIs, clientes e SDKs",
      "branch": "genesis-s1-api",
      "source_count": 472,
      "owned_legacy_artifact_count": 9,
      "mission": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/04-api/mission.json",
      "sources": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/04-api/sources.jsonl",
      "inputs": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/04-api/inputs.json",
      "output_prefix": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/04-api"
    },
    {
      "id": "S1-05",
      "title": "LLM, plugins, CodeMode, SQLite e gravação",
      "branch": "genesis-s1-libraries",
      "source_count": 323,
      "owned_legacy_artifact_count": 10,
      "mission": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/05-libraries/mission.json",
      "sources": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/05-libraries/sources.jsonl",
      "inputs": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/05-libraries/inputs.json",
      "output_prefix": "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/05-libraries"
    }
  ],
`````
