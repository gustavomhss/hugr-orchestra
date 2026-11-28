import { createHash } from "node:crypto"
import { strict as assert } from "node:assert"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Stream } from "effect"
import { ActionsError } from "../../src/actions/error"
import { ActionsGitHubRead } from "../../src/actions/github"
import { ActionsOutput } from "../../src/actions/output"
import { ActionsTransport } from "../../src/actions/transport"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"

// This proves the real GitHub output metadata and byte path through gh and AppProcess.
// The server-owned binding below deliberately excludes binding creation, HTTP and desktop UI.
const binding = Actions.Binding.make({
  id: Actions.BindingID.make("ab_liveproof"), revision: 1, remote: "origin", directory: process.cwd(),
  projectID: "1405035578", projectPath: "gustavomhss/hugr-orchestra", account: "github-actions[bot]",
  provider: { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" },
})
const selection = { kind: "artifact", id: "15249793535", runID: "46112064971" } as const
const digest = "sha256:4ab62dfbaae7c8c53274edcc1f85870857918f8d3f14d418191ec30b261da040"

const proof = Effect.scoped(Effect.gen(function* () {
  const transport = yield* ActionsTransport.make({ directory: process.cwd() })
  const reader = ActionsGitHubRead.make({ transport })
  const output = ActionsOutput.make({ transport, reader })
  const report = (stage: string) => Effect.tapError((error: unknown) => Effect.sync(() => {
    const allowed = ["not_authenticated", "permission_denied", "not_found", "rate_limited", "transport_failed",
      "transfer_failed", "binding_stale", "invalid_input", "capability_unavailable", "metadata_truncated", "host_mismatch"]
    console.error(`proof stage ${stage}: ${error instanceof ActionsError && allowed.includes(error.kind) ? error.kind : "other"}`)
  }))
  console.log("proof stage repository")
  yield* transport.request(binding, { method: "GET", path: `repositories/${binding.projectID}` }).pipe(report("repository"))
  console.log("proof stage run")
  yield* reader.run(binding, selection.runID).pipe(report("run"))
  console.log("proof stage metadata")
  const info = yield* output.info(binding, selection).pipe(report("metadata"))
  console.log("proof stage metadata assertions")
  assert.equal(info.filename, "test-scope.zip")
  assert.equal(info.contentType, "application/zip")
  assert.equal(info.size, 226)
  assert.equal(info.digest, digest)
  const chunks: Uint8Array[] = []
  const size = { value: 0 }
  console.log("proof stage transfer")
  yield* output.read(binding, selection).pipe(Stream.runForEach((chunk) => Effect.sync(() => {
    size.value += chunk.byteLength
    assert.ok(size.value <= 64 * 1024, "artifact exceeds proof limit")
    chunks.push(chunk)
  })), report("transfer"))
  console.log("proof stage archive assertions")
  const archive = Buffer.concat(chunks)
  console.log(`proof bytes: ${archive.length}`)
  assert.equal(archive.length, 226)
  assert.equal(archive.subarray(0, 4).toString("hex"), "504b0304")
  assert.equal(`sha256:${createHash("sha256").update(archive).digest("hex")}`, digest)
}))

// Do not print native errors: they may contain transport diagnostics or signed URLs.
await Effect.runPromise(proof.pipe(Effect.provide(LayerNode.compile(LayerNode.group([AppProcess.node])))))
  .then(() => console.log("GitHub Actions production output metadata and bounded ZIP: pass"))
  .catch(() => { console.error("GitHub Actions production output proof failed"); process.exitCode = 1 })
