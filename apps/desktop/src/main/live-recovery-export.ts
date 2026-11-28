import { randomUUID } from "node:crypto"
import { open, rename, unlink } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import type { LiveRecoveryAction } from "@orchestra/app/live"
import type { DeliveryExport } from "./live-delivery-contract"

export async function exportLiveRecovery(data: DeliveryExport, options: {
  readonly signal: AbortSignal
  readonly choose: () => Promise<string | undefined>
}): Promise<LiveRecoveryAction> {
  try {
    const destination = await chooseOwned(options.signal, options.choose)
    if (destination === undefined || options.signal.aborted) return { ok: false, reason: "cancelled" }
    const bytes = JSON.stringify(data) + "\n"
    return await writeOwned(destination, bytes, options.signal) ? { ok: true } : { ok: false, reason: "cancelled" }
  } catch {
    return { ok: false, reason: options.signal.aborted ? "cancelled" : "storage" }
  }
}

function chooseOwned(signal: AbortSignal, choose: () => Promise<string | undefined>): Promise<string | undefined> {
  if (signal.aborted) return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (body: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", abort)
      body()
    }
    const abort = () => finish(() => resolve(undefined))
    signal.addEventListener("abort", abort, { once: true })
    // Both settlements remain observed after abort; neither can admit late file work.
    Promise.resolve().then(() => signal.aborted ? undefined : choose()).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
    if (signal.aborted) abort()
  })
}

async function writeOwned(destination: string, bytes: string, signal: AbortSignal): Promise<boolean> {
  const temporary = join(dirname(destination), `.${basename(destination)}.${randomUUID()}.tmp`)
  let file: FileHandle | undefined
  let owned = false
  const failures: unknown[] = []
  try {
    if (signal.aborted) return false
    file = await open(temporary, "wx", 0o600)
    owned = true
    await file.writeFile(bytes, "utf8")
    await file.sync()
    await file.close()
    file = undefined
    if (signal.aborted) return false
    await rename(temporary, destination)
    owned = false
    return true
  } catch (error) { failures.push(error) }
  finally {
    if (file) { try { await file.close() } catch (error) { failures.push(error) } }
    // Never unlink a UUID collision we did not create, or the committed destination.
    if (owned) { try { await unlink(temporary) } catch (error) { failures.push(error) } }
    if (failures.length) throw new AggregateError(failures, "Live recovery export failed")
  }
  return false
}
