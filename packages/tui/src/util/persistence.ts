import path from "path"
import { appendFile, mkdir, open, rename, rm } from "fs/promises"

export function readText(filePath: string) {
  return Bun.file(filePath).text()
}

export function readJson<T>(filePath: string) {
  return Bun.file(filePath).json() as Promise<T>
}

export async function writeText(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await Bun.write(filePath, content)
}

export async function appendText(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await appendFile(filePath, content)
}

export async function writeJsonAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  await writeAndCloseTemporary(temporary, JSON.stringify(value))
  await rename(temporary, filePath).catch(async (error) => {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  })
}

async function writeAndCloseTemporary(temporary: string, content: string) {
  const file = await open(temporary, "wx", 0o600)
  const write = await Promise.allSettled([Promise.resolve().then(() => file.writeFile(content, "utf8"))])
  const close = await Promise.allSettled([Promise.resolve().then(() => file.close())])
  const failures: unknown[] = [...write, ...close]
    .flatMap((result) => result.status === "rejected" ? [result.reason] : [])
  if (failures.length === 0) return
  await rm(temporary, { force: true }).catch(() => undefined)
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, "Failed to write and close temporary JSON file")
}
