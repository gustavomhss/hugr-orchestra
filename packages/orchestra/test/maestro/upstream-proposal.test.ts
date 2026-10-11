import { describe, expect, test } from "bun:test"
import { once } from "node:events"
import { Worker } from "node:worker_threads"
import { UpstreamProposal } from "../../src/maestro/upstream-proposal"

const compact = '{"brief":"café","work_packages":[]}'
const spaced = '{\r\n  "work_packages": [],\r\n  "brief": "caf\\u00e9"\r\n}\r\n'
// Fixed SHA-256 goldens calculated independently with Python hashlib over UTF-8 bytes.
const compactDigest = "db86ed4b1f1538cfbb45dffc78bbdde1b1546a7614346fd9ae7851c68ce8358a"
const spacedDigest = "eba684f08f14b57a5e201424355934dc5f96644932eba83a66e528321055c892"

describe("UpstreamProposal.inspect", () => {
  test("hashes exact bytes despite equal decoded JSON semantics", () => {
    const first = UpstreamProposal.inspect(new TextEncoder().encode(compact))
    const second = UpstreamProposal.inspect(new TextEncoder().encode(spaced))
    expect(first).toEqual({
      schemaIdentifier: "RelaySprint.Sprint",
      digest: compactDigest,
      byteLength: 36,
      sprint: { brief: "café", work_packages: [] },
    })
    expect(second.sprint).toEqual(first.sprint)
    expect(second.byteLength).toBe(54)
    expect(second.digest).toBe(spacedDigest)
    expect(second.digest).not.toBe(first.digest)
  })

  test("inspects only the supplied Buffer view and leaves caller bytes untouched", () => {
    const buffer = Buffer.from("outside" + compact + "outside")
    const bytes = buffer.subarray(7, buffer.byteLength - 7)
    const inspection = UpstreamProposal.inspect(bytes)
    expect(inspection.digest).toBe(compactDigest)
    expect(inspection.byteLength).toBe(36)
    expect(inspection.sprint).toEqual({ brief: "café", work_packages: [] })
    expect(buffer).toEqual(Buffer.from("outside" + compact + "outside"))
    bytes.fill(0)
    expect(inspection.sprint).toEqual({ brief: "café", work_packages: [] })
    expect(inspection.digest).toBe(compactDigest)
  })

  test("keeps decode and digest consistent while one shared ASCII byte changes in flight", async () => {
    const bytes = new Uint8Array(new SharedArrayBuffer(8 * 1024 * 1024))
    bytes.fill(0x20)
    bytes.set(new TextEncoder().encode('{"brief":"A","work_packages":[]}'))
    // Independent hashlib goldens: each 32-byte header followed by spaces to exactly 8 MiB.
    const oracles = [
      { brief: "A", byte: 0x41, digest: "794c70f238b31c5396fce5d0c127ae8e1f3c4f47113023708d4e0a0164974f0a" },
      { brief: "B", byte: 0x42, digest: "db00920cd390c609e81714a242cfe209cb5bf907db8de41b0210270ff742addb" },
    ]
    oracles.forEach((oracle) => {
      Atomics.store(bytes, 10, oracle.byte)
      expect(UpstreamProposal.inspect(bytes)).toEqual({
        schemaIdentifier: "RelaySprint.Sprint",
        digest: oracle.digest,
        byteLength: bytes.byteLength,
        sprint: { brief: oracle.brief, work_packages: [] },
      })
    })

    const control = new Int32Array(new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT))
    const errors: Error[] = []
    await using active = {
      worker: new Worker(
        `
          const { parentPort, workerData } = require("node:worker_threads")
          const bytes = new Uint8Array(workerData.bytes)
          const control = new Int32Array(workerData.control)
          const deadline = performance.now() + 20_000
          parentPort.postMessage("ready")
          while (Atomics.load(control, 0) === 0 && performance.now() < deadline) {
            Atomics.xor(bytes, 10, 0x03)
            Atomics.add(control, 1, 1)
          }
          parentPort.close()
        `,
        { eval: true, workerData: { bytes: bytes.buffer, control: control.buffer } },
      ),
      async [Symbol.asyncDispose]() {
        Atomics.store(control, 0, 1)
        await this.worker.terminate()
      },
    }
    active.worker.on("error", (error) => errors.push(error))
    expect(await once(active.worker, "message", { signal: AbortSignal.timeout(10_000) })).toEqual(["ready"])

    // Only byte 10 changes, atomically: every copy is exactly A or B. This does not promise
    // a transactional snapshot of arbitrary multi-byte writes. Overlap is scheduling-dependent.
    const overlapping: number[] = []
    Array.from({ length: 128 }, (_, trial) => trial).forEach((trial) => {
      const before = Atomics.load(control, 1)
      const inspection = UpstreamProposal.inspect(bytes)
      if (Atomics.load(control, 1) > before) overlapping.push(trial)
      expect(oracles.map((oracle) => oracle.brief)).toContain(inspection.sprint.brief ?? "")
      expect({ trial, brief: inspection.sprint.brief, digest: inspection.digest }).toEqual({
        trial,
        brief: inspection.sprint.brief,
        digest: inspection.sprint.brief === "A" ? oracles[0].digest : oracles[1].digest,
      })
      expect(inspection.byteLength).toBe(bytes.byteLength)
    })
    expect(overlapping.length).toBeGreaterThan(0)
    await Bun.sleep(0)
    expect(errors).toEqual([])
    console.info(`shared-byte probe: ${overlapping.length}/128 inspections overlapped worker writes`)
  }, 60_000)

  test.each([
    { bytes: [0xff] },
    { bytes: [0x80] },
    { bytes: [0xc0, 0xaf] },
    { bytes: [0xe2, 0x82] },
    { bytes: [0xed, 0xa0, 0x80] },
    { bytes: [0xf4, 0x90, 0x80, 0x80] },
  ])("rejects malformed UTF-8 without replacement: %j", (invalid) => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('{"brief":"'),
      ...invalid.bytes,
      ...new TextEncoder().encode('","work_packages":[]}'),
    ])
    expect(() => UpstreamProposal.inspect(bytes)).toThrow(TypeError)
  })

  test("does not strip a leading BOM or normalize Unicode inside metadata", () => {
    expect(() => UpstreamProposal.inspect(new TextEncoder().encode("\uFEFF" + compact))).toThrow()
    const text = '{"brief":"\uFEFFe\u0301","work_packages":[]}'
    expect(UpstreamProposal.inspect(new TextEncoder().encode(text)).sprint.brief).toBe("\uFEFFe\u0301")
  })

  test.each([
    { text: "" },
    { text: "{" },
    { text: '{"work_packages":[],}' },
    { text: '{"work_packages":[]} trailing' },
  ])("rejects malformed JSON: %j", (input) => {
    expect(() => UpstreamProposal.inspect(new TextEncoder().encode(input.text))).toThrow()
  })

  test.each([
    { value: null },
    { value: [] },
    { value: {} },
    { value: { work_packages: null } },
    { value: { work_packages: [{ id: "" }] } },
    { value: { work_packages: [{ id: "wp\u0000bad" }] } },
    { value: { work_packages: [{ id: "wp", kind: "unsupported" }] } },
    { value: { work_packages: [{ id: "wp", checklist: [{ id: "" }] }] } },
    { value: { work_packages: [{ id: "wp", checklist: [{ id: "check", cmd: 42 }] }] } },
    { value: { work_packages: [], gen: "1" } },
    { value: { work_packages: [], retry_budget: 0.5 } },
  ])("rejects native RelaySprint schema violations: %j", (input) => {
    expect(() => UpstreamProposal.inspect(new TextEncoder().encode(JSON.stringify(input.value)))).toThrow()
  })

  test("preserves authored step order and unknown metadata at every native struct level", () => {
    const sprint = {
      brief: "Proposal",
      gen: -1.5,
      type: "worker-supplied",
      source: { author: "claimed-upstream", verified: true },
      approval: "claimed-approved",
      macros: [{ id: "macro", metadata: { notes: ["retain", "order"] } }],
      work_packages: [
        {
          id: "z-first",
          kind: "execute",
          model: "worker-model",
          output_contract: { paths: ["proposal.json"] },
          checklist: [
            { id: "z-check", cmd: "echo proposal", rubric: { weight: 2 } },
            { id: "a-check", judge: "Inspect", metadata: ["claimed"] },
          ],
          dod: [{ cmd: "legacy", metadata: { ignoredByRuntime: true } }],
        },
        { id: "a-second", kind: "review", unknown: { nested: [1, { keep: true }] } },
      ],
    } as const
    const inspection = UpstreamProposal.inspect(new TextEncoder().encode(JSON.stringify(sprint)))
    expect(inspection.sprint).toEqual(sprint)
    expect(inspection.sprint.work_packages.map((step) => step.id)).toEqual(["z-first", "a-second"])
    expect(inspection.sprint.work_packages[0].checklist?.map((control) => control.id)).toEqual(["z-check", "a-check"])
    expect(inspection.schemaIdentifier).toBe("RelaySprint.Sprint")
    expect(inspection.sprint.gen).toBe(-1.5)
    expect(Object.keys(inspection).sort()).toEqual(["byteLength", "digest", "schemaIdentifier", "sprint"])
  })

  test("accepts structural-only empty controls, unsupported human kind and runtime-invalid commands", () => {
    const sprint = {
      work_packages: [
        { id: "empty", checklist: [] },
        { id: "missing" },
        { id: "null", checklist: null },
        { id: "human", kind: "human", checklist: [] },
        {
          id: "invalid-command",
          checklist: [
            { id: "nul", cmd: "echo\u0000invalid" },
            { id: "null", cmd: null },
          ],
        },
      ],
    } as const
    const inspection = UpstreamProposal.inspect(new TextEncoder().encode(JSON.stringify(sprint)))
    expect(inspection.sprint).toEqual(sprint)
    expect(Object.keys(inspection).sort()).toEqual(["byteLength", "digest", "schemaIdentifier", "sprint"])
  })
})
