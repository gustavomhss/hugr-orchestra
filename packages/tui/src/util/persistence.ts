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
  await publishTemporary(temporary, filePath).catch(async (error) => {
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

async function publishTemporary(
  temporary: string,
  filePath: string,
  deadline = process.platform === "win32" ? performance.now() + 1000 : undefined,
  attempt = 1,
  lastError?: unknown,
): Promise<void> {
  // A delayed wake cannot admit another rename after this publication's original budget.
  if (attempt > 1 && deadline !== undefined && performance.now() >= deadline) throw lastError
  try {
    await rename(temporary, filePath)
  } catch (error) {
    if (
      deadline === undefined || attempt >= 64 || typeof error !== "object" || error === null ||
      !("code" in error) || typeof error.code !== "string" || !["EPERM", "EACCES", "EBUSY"].includes(error.code)
    ) throw error
    const remaining = deadline - performance.now()
    if (remaining <= 0) throw error
    await Bun.sleep(Math.min(16, remaining))
    return publishTemporary(temporary, filePath, deadline, attempt + 1, error)
  }
}
