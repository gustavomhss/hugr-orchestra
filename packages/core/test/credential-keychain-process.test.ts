import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createDecipheriv } from "node:crypto"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../src/process"
import { LayerNode } from "../src/effect/layer-node"
import { CredentialCipher } from "../src/credential/cipher"
import { expectSpawn } from "./fixture/omni-expect"

const source = `
  import { CredentialKeychain } from ${JSON.stringify(path.join(import.meta.dir, "../src/credential/keychain.ts"))};
  import { CredentialCipher } from ${JSON.stringify(path.join(import.meta.dir, "../src/credential/cipher.ts"))};
  import fs from "node:fs/promises";
  const [backing, ready, resume, contended, role] = process.argv.slice(1);
  const key = await CredentialKeychain.load({
    store: {
      get: () => fs.readFile(backing, "utf8").catch(e => { if(e.code === "ENOENT") return null; throw e }),
      set: value => fs.writeFile(backing, value),
    },
    beforeCreate: async () => {
      if(role !== "first" && role !== "crash") return;
      await fs.writeFile(ready, "ready");
      while(!(await Bun.file(resume).exists())) await Bun.sleep(10);
      if(role === "crash") process.exit(17);
    },
    onWait: () => fs.writeFile(contended, "wait"),
  });
  console.log(JSON.stringify({ identity: CredentialKeychain.identity, text: CredentialCipher.seal(role, key) }));
`

async function wait(file: string) {
  const deadline = performance.now() + 15_000
  while (!(await Bun.file(file).exists())) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${file}`)
    await Bun.sleep(10)
  }
}

for (const role of ["first", "crash"] as const) {
  test(`independent profiles share a paused SQLite owner; ${role === "crash" ? "process death releases it" : "both ciphertexts survive"}`, async () => {
    expectSpawn(import.meta.path)
    const root = await mkdtemp(path.join(os.tmpdir(), "credential-process-"))
    const home = path.join(root, "home")
    await mkdir(home)
    const backing = path.join(root, "fake-service")
    const ready = path.join(root, "ready")
    const resume = path.join(root, "resume")
    const contended = path.join(root, "contended")
    const controllers: AbortController[] = []
    const start = (role: string) => {
      const controller = new AbortController()
      controllers.push(controller)
      return Effect.runPromise(Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        return yield* processes.run(ChildProcess.make(process.execPath,
          ["-e", source, backing, ready, resume, contended, role], {
            env: { ...process.env, HOME: home, USERPROFILE: home, XDG_DATA_HOME: path.join(root, role) },
          }), { signal: controller.signal })
      }).pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
        .then(result => ({ result }), error => ({ error }))
    }
    const first = start(role)
    let second: ReturnType<typeof start> | undefined
    try {
      await wait(ready)
      second = start("second")
      await wait(contended)
      // The competing process acknowledges SQLITE_BUSY while the first remains paused inside initialization.
      expect(await Bun.file(backing).exists()).toBe(false)
      await writeFile(resume, "go")
      const results = await Promise.all([first, second])
      for (const outcome of results) if ("error" in outcome) throw outcome.error
      const values = results.flatMap(outcome => "result" in outcome ? [outcome.result] : [])
      expect(values.map(value => value.exitCode)).toEqual([role === "crash" ? 17 : 0, 0])
      const successful = values.filter(value => value.exitCode === 0).map(value => JSON.parse(value.stdout.toString().trim()))
      expect(successful.every(value => value.identity.file === path.join(home, ".orchestra", "locks", "credential-key.sqlite"))).toBe(true)
      const key = Buffer.from(await readFile(backing, "utf8"), "base64")
      expect(successful.map(value => {
        const raw = Buffer.from(value.text.slice(CredentialCipher.PREFIX.length), "base64")
        const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
        decipher.setAuthTag(raw.subarray(12, 28))
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
      })).toEqual(role === "crash" ? ["second"] : ["first", "second"])
      const reload = await start("reload")
      if ("error" in reload) throw reload.error
      expect(reload.result.exitCode).toBe(0)
      expect(await readFile(backing, "utf8")).toBe(key.toString("base64"))
    } finally {
      controllers.forEach(controller => controller.abort())
      await Promise.all([first, ...(second ? [second] : [])])
      await rm(root, { recursive: true, force: true, maxRetries: 5 })
    }
  }, 60_000)
}
