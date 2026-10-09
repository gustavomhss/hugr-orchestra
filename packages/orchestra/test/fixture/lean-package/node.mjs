import { writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import assert from "node:assert/strict"

const artifact = await import(pathToFileURL(process.argv[2]).href)
assert.equal(process.versions.bun, undefined, "Node proof must use Node")
assert.equal(typeof artifact.Server.listen, "function")
assert.equal(typeof artifact.Config, "object")
assert.equal(typeof artifact.bootstrap, "function")
const listener = await artifact.Server.listen({ hostname: "127.0.0.1", port: 0, mdns: false })
await writeFile(process.argv[3], listener.url.href)
const deadline = setTimeout(() => { console.error("Node listener lifetime exceeded"); process.exit(1) }, 180000)
process.once("SIGTERM", async () => {
  try {
    await listener.stop(true)
    clearTimeout(deadline)
    process.exit(0)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
})
