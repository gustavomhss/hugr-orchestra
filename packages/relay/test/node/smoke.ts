import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Layer, Redacted, Schema } from "effect"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { AuthoringStore } from "../../src/authoring/store"
import { GateCheck } from "../../src/gate/check"
import { GateShell } from "../../src/gate/shell"
import { HookEvaluate } from "../../src/hook/evaluate"
import { JudgeConfig } from "../../src/judge/config"
import { LedgerChain } from "../../src/ledger/chain"
import { LedgerVerify } from "../../src/ledger/verify"

// One pass over the engine paths the desktop server runs under Node: a keyed ledger append and verify, a store
// open/save/publish/reopen, a gate check that spawns bash, and a hook evaluation. node.test.ts runs it under Node
// (bundled as the desktop server is) and under Bun, and requires the same summary from both. Nothing in the summary
// depends on the runtime, a clock, a random ID or the directory.
export const smoke = (dir: string) =>
  Effect.gen(function* () {
    const ledger = path.join(dir, "run", "ledger.jsonl")
    mkdirSync(path.dirname(ledger), { recursive: true })
    const key = Redacted.make("smoke-key")
    const first = yield* LedgerChain.append({ ledger, body: `{"event":"wp-start","wp":"é"}`, gen: 1, key })
    const second = yield* LedgerChain.append({ ledger, body: `{"event":"note"}`, gen: 1, key })
    const verified = yield* LedgerVerify.verify(ledger, key)

    const data = path.join(dir, "data")
    const stored = yield* Effect.scoped(
      Effect.gen(function* () {
        const store = yield* AuthoringStore.open(data, "smoke")
        const saved = yield* store.save({ body: { name: "Smoke" } })
        const published = yield* store.publish(saved.id, saved.versionId, AuthoringStore.checksum(saved))
        return { saved, published, versions: (yield* store.versions(saved.id)).length }
      }),
    )
    const reopened = yield* Effect.scoped(
      Effect.flatMap(AuthoringStore.open(data, "smoke"), (store) => store.get(stored.saved.id)),
    )

    const work = path.join(dir, "work")
    mkdirSync(work, { recursive: true })
    writeFileSync(path.join(work, "marker"), "ok\n")
    const outcome = yield* GateCheck.check({
      sprint: {
        work_packages: [
          {
            id: "wp1",
            checklist: [
              { id: "A", cmd: `test "$(cat marker)" = ok` },
              { id: "B", cmd: "test -f missing" },
            ],
          },
        ],
      } as never,
      workdir: work,
      baseRef: "",
      params: {},
    }).pipe(Effect.provide(ports))

    const install = Schema.decodeUnknownSync(RelayHook.Install)({
      installID: "smoke",
      document: "doc-smoke",
      version: "v1",
      sha256: "0".repeat(64),
      order: 0,
      enabled: true,
      installedBy: "owner",
      installedAt: 0,
      snapshot: {
        schema: "relay.hook.v1",
        name: "smoke",
        nodes: [
          { id: "t", type: RelayHook.NodeType.trigger, parameters: { operation: "edit", timing: "before" } },
          {
            id: "c",
            type: RelayHook.NodeType.condition,
            parameters: { field: "path", pattern: "src/{generated,gen}/**" },
          },
          { id: "b", type: RelayHook.NodeType.block, parameters: { message: "generated" } },
          { id: "a", type: RelayHook.NodeType.allow, parameters: { message: "" } },
        ].map((node) => ({ ...node, name: node.id, position: [0, 0] })),
        connections: [
          { from: "t", port: 0, to: "c" },
          { from: "c", port: 0, to: "b" },
          { from: "c", port: 1, to: "a" },
        ],
        binding: "host-required",
        installed: false,
      },
    })
    const hook = (paths: ReadonlyArray<string>) =>
      HookEvaluate.plan([install], { operation: "edit", timing: "before", tool: "edit", paths }).map(
        (step) => `${step.nodeID}:${step.action}`,
      )

    return {
      ledger: { seq: [first.seq, second.seq], h: [first.h, second.h], verify: verified },
      store: {
        published: stored.published.active && stored.published.activeVersionId === stored.saved.versionId,
        versions: stored.versions,
        reopened: reopened.active && reopened.name === "Smoke",
      },
      check: outcome,
      hook: [hook(["src/gen/a/b.ts"]), hook(["src/a.ts"]), hook(["src/generated/.env"])],
    }
  })

// The process port core binds to AppProcess (WP10), as a plain Node spawn: the argv in the workdir, output discarded.
const ports = Layer.mergeAll(
  Layer.succeed(
    GateShell.Service,
    GateShell.Service.of({
      run: (input) =>
        Effect.callback<GateShell.RunResult, GateShell.Unavailable>((resume) => {
          const [command, ...args] = GateShell.argv(input.program)
          const child = spawn(command, args, {
            cwd: input.cwd,
            env: { PATH: process.env.PATH ?? "", ...input.env },
            stdio: "ignore",
          })
          child.once("error", () => resume(Effect.fail(new GateShell.Unavailable({ reason: "spawn" }))))
          child.once("exit", (code) => resume(Effect.succeed({ exitCode: code ?? 1 })))
        }),
    }),
  ),
  Layer.succeed(
    GateShell.Git,
    GateShell.Git.of({ run: () => Effect.fail(new GateShell.Unavailable({ reason: "missing" })) }),
  ),
  JudgeConfig.layer(JudgeConfig.defaults),
)
