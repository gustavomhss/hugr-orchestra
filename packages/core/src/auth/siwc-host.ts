export * as SiwcHost from "./siwc-host"

import { randomUUID } from "node:crypto"
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { PrivateFile } from "../util/private-file"

/** Own app-defined host-ID file; never an installed app's credential file. */
export async function load(filename: string) {
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
  const scratch = await mkdtemp(join(dirname(filename), ".siwc-host-"))
  // Publish a complete owner-only file without overwriting another process's ID.
  // Exclusive open + write would expose an empty file to a concurrent reader.
  return writeFile(join(scratch, "host"), `urn:uuid:${randomUUID()}\n`, { mode: 0o600 })
    .then(() => PrivateFile.protect(join(scratch, "host")))
    .then(() => link(join(scratch, "host"), filename).catch((cause: unknown) => {
      if (cause instanceof Error && "code" in cause && cause.code === "EEXIST") return
      throw cause
    }))
    .then(() => PrivateFile.protect(filename))
    .then(() => readFile(filename, "utf8"))
    .then((value) => {
      const id = value.trim()
      if (!/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        throw new Error("Invalid persisted ChatGPT host ID")
      return id
    })
    .finally(() => rm(scratch, { recursive: true, force: true }))
}
