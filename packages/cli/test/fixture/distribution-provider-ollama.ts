import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { lstat, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { sandbox, sha256, successful, command } from "./distribution-native"

// Linux amd64 manifest, not a mutable tag or a multi-architecture index.
// Source: Docker Hub ollama/ollama:0.9.6 and Ollama registry qwen3:0.6b.
export const image = "ollama/ollama@sha256:41cac4de8913952adc161777b5a241eaed84d49f2663e0f280ed960198beb099"
export const model = "qwen3:0.6b"
export const modelDigest = "sha256:7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435"
const weightsDigest = "sha256:7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa"
const label = "org.orchestra.distribution-provider.owner"

function requireModelDigest(value: unknown) {
  // Ollama tags/ps use bare hex; OCI receipts use one sha256: prefix. No other
  // normalization (case, whitespace, repeated prefixes or alternate algorithms).
  const digest = typeof value === "string" && value.startsWith("sha256:") ? value.slice(7) : value
  if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("OLLAMA_MODEL_DIGEST_FORMAT_INVALID")
  if (digest !== modelDigest.slice(7)) throw new Error("OLLAMA_MODEL_DIGEST_MISMATCH")
  return digest
}

export async function ownedOllama(directory: string, evidence: string) {
  const box = await sandbox(join(directory, "ollama-owner"))
  const token = randomUUID()
  const name = `orchestra-provider-${token}`
  const cidfile = join(box.directory, "container.id")
  const state: { id?: string; endpoint?: string; imageID?: string; attempted: boolean; removed: boolean } = {
    attempted: false, removed: false,
  }
  const receipt = async (stage: string, data: unknown) => {
    await Bun.write(join(evidence, `ollama-${stage}.json`), JSON.stringify(data, null, 2) + "\n")
    console.error(`DISTRIBUTION_PROVIDER_OLLAMA_${stage.toUpperCase()} ${JSON.stringify(data)}`)
  }
  const inspect = async () => {
    if (!state.id) {
      const info = await lstat(cidfile).catch((error: unknown) => {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
        throw error
      })
      if (info) {
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error("OLLAMA_CIDFILE_NOT_OWNED")
        state.id = (await readFile(cidfile, "utf8")).trim()
      }
    }
    if (!state.id || !/^[a-f0-9]{64}$/.test(state.id)) throw new Error("OLLAMA_OWNED_CONTAINER_ID_MISSING")
    const rows = JSON.parse(await successful(["docker", "inspect", "--type", "container", state.id], box))
    expect(rows).toHaveLength(1)
    const current = rows[0]
    expect(current.Id).toBe(state.id)
    expect(current.Name).toBe(`/${name}`)
    expect(current.Config.Labels[label]).toBe(token)
    expect(current.Config.Image).toBe(image)
    if (state.imageID) expect(current.Image).toBe(state.imageID)
    expect(current.HostConfig.Privileged).toBe(false)
    expect(current.HostConfig.Devices ?? []).toEqual([])
    expect(current.HostConfig.DeviceRequests ?? []).toEqual([])
    expect(current.Mounts).toEqual([])
    return current
  }
  const request = async (route: string, body?: unknown, timeout = 180_000) => {
    if (!state.endpoint) throw new Error("OLLAMA_OWNED_ENDPOINT_MISSING")
    const response = await fetch(state.endpoint + route, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout), redirect: "error",
    })
    if (!response.ok) throw new Error(`OLLAMA_HTTP_FAILED: ${route} status=${response.status}`)
    return response.json()
  }
  return {
    async start() {
      if (state.attempted) throw new Error("OLLAMA_CREATE_ALREADY_ATTEMPTED")
      await mkdir(evidence, { recursive: true })
      const host = JSON.parse(await successful(["docker", "info", "--format", "{{json .}}"], box))
      expect(host.OSType).toBe("linux")
      expect(["x86_64", "amd64"]).toContain(host.Architecture)
      await successful(["docker", "pull", "--platform", "linux/amd64", image], box, 600_000)
      const images = JSON.parse(await successful(["docker", "image", "inspect", image], box))
      expect(images).toHaveLength(1)
      expect(images[0].Os).toBe("linux")
      expect(images[0].Architecture).toBe("amd64")
      expect(images[0].RepoDigests).toContain(image)
      state.imageID = images[0].Id
      state.attempted = true // Adopt before create: a failed command may still create the container.
      const id = await successful(["docker", "create", "--cidfile", cidfile, "--name", name,
        "--label", `${label}=${token}`, "--platform", "linux/amd64", "--cpus", "2", "--memory", "4g",
        "--publish", "127.0.0.1::11434", "--env", "OLLAMA_HOST=0.0.0.0:11434",
        "--env", "OLLAMA_NUM_PARALLEL=1", "--env", "OLLAMA_MAX_LOADED_MODELS=1",
        "--env", "OLLAMA_CONTEXT_LENGTH=8192", "--env", "CUDA_VISIBLE_DEVICES=-1",
        "--env", "HIP_VISIBLE_DEVICES=-1", "--env", "NVIDIA_VISIBLE_DEVICES=void", image], box)
      await inspect()
      expect(id).toBe(state.id!)
      await successful(["docker", "start", state.id!], box)
      const current = await inspect()
      expect(current.State.Running).toBe(true)
      const ports = current.NetworkSettings.Ports["11434/tcp"]
      expect(ports).toHaveLength(1)
      expect(ports[0].HostIp).toBe("127.0.0.1")
      expect(ports[0].HostPort).toMatch(/^\d+$/)
      state.endpoint = `http://127.0.0.1:${ports[0].HostPort}`
      const deadline = Date.now() + 60_000
      while (true) {
        const ready = await request("/api/version", undefined, 2_000).catch(() => undefined)
        if (ready) { expect(ready.version).toBe("0.9.6"); break }
        if (Date.now() >= deadline) throw new Error("OLLAMA_OWNED_CONTAINER_NOT_READY")
        await inspect()
        await Bun.sleep(200)
      }
      await receipt("container", { id: state.id, name, label, token, image, imageID: state.imageID,
        endpoint: state.endpoint, native: { host: host.Architecture, image: images[0].Architecture }, gpuDevices: [] })
      await request("/api/pull", { model, stream: false }, 600_000)
      const tags = await request("/api/tags")
      expect(tags.models).toHaveLength(1)
      expect(tags.models[0].name).toBe(model)
      requireModelDigest(tags.models[0].digest)
      const manifest = await successful(["docker", "exec", state.id!, "cat",
        "/root/.ollama/models/manifests/registry.ollama.ai/library/qwen3/0.6b"], box)
      expect(`sha256:${sha256(manifest)}`).toBe(modelDigest)
      const parsed = JSON.parse(manifest)
      expect(parsed.layers.find((layer: { mediaType: string }) => layer.mediaType === "application/vnd.ollama.image.model").digest)
        .toBe(weightsDigest)
      const weights = await successful(["docker", "exec", state.id!, "sha256sum",
        `/root/.ollama/models/blobs/${weightsDigest.replace(":", "-")}`], box)
      expect(weights.split(/\s+/)[0]).toBe(weightsDigest.slice(7))
      const show = await request("/api/show", { model })
      expect(show.capabilities).toContain("tools")
      await receipt("model", { model, modelDigest, reportedDigest: tags.models[0].digest, weightsDigest, manifest: parsed, capabilities: show.capabilities })
      const positive = await request("/api/chat", { model, stream: false, think: false,
        messages: [{ role: "user", content: "Reply with one short greeting." }],
        options: { num_gpu: 0, num_predict: 64, temperature: 0 }, keep_alive: "10m" })
      expect(positive.done).toBe(true)
      expect(positive.message.role).toBe("assistant")
      expect(positive.message.content.trim().length).toBeGreaterThan(0)
      expect(positive.eval_count).toBeGreaterThan(0)
      await this.cpu()
      await receipt("positive", positive)
    },
    endpoint() {
      if (!state.endpoint) throw new Error("OLLAMA_OWNED_ENDPOINT_MISSING")
      return state.endpoint
    },
    cleaned() { return !state.attempted || state.removed },
    async cpu() {
      await inspect()
      const ps = await request("/api/ps")
      expect(ps.models).toHaveLength(1)
      expect(ps.models[0].name).toBe(model)
      requireModelDigest(ps.models[0].digest)
      expect(ps.models[0].size_vram).toBe(0)
      await receipt("cpu", ps)
    },
    async stop() {
      if (!state.attempted || state.removed) return
      const failures: unknown[] = []
      const attempt = <A>(work: () => Promise<A>) => work().catch((error: unknown) => { failures.push(error); return undefined })
      await attempt(async () => {
        const current = await inspect()
        if (current.State.Running) await successful(["docker", "stop", "--time", "10", current.Id], box, 30_000)
        expect((await inspect()).State.Running).toBe(false)
      })
      // Diagnostics cannot short-circuit owned teardown, including a failed log
      // command or an unwritable evidence directory.
      await attempt(async () => {
        const current = await inspect()
        const logs = await command(["docker", "logs", current.Id], box)
        expect(logs.code).toBe(0)
        await Bun.write(join(evidence, "ollama-container.log"), logs.stdout + logs.stderr)
      })
      const list = ["docker", "ps", "--all", "--no-trunc", "--filter", `label=${label}=${token}`, "--format", "{{.ID}}"]
      const before = await attempt(() => successful(list, box))
      await attempt(async () => { expect(before).toBe(state.id) })
      await attempt(async () => {
        const current = await inspect() // Recheck exact ID/label/name/image immediately before removal.
        await successful(["docker", "rm", "--force", current.Id], box, 30_000)
      })
      // Always attempt this same query, even after stop/log/write/remove errors.
      const remaining = await attempt(() => successful(list, box))
      await attempt(async () => { expect(remaining).toBe("") })
      state.removed = before === state.id && remaining === "" && state.id !== undefined
      await attempt(() => receipt("cleanup", { id: state.id, label, token, before, remaining,
        removed: state.removed, failures: failures.map((error) => error instanceof Error ? error.message : String(error)) }))
      if (failures.length) throw new AggregateError(failures, "OLLAMA_OWNED_CLEANUP_FAILED")
    },
  }
}

export type OwnedOllama = Awaited<ReturnType<typeof ownedOllama>>
