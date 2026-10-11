// Polling with a deadline, shared by the campaign harness (re-exported by lib.ts).

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function until<T>(timeoutMs: number, what: string, probe: () => T | undefined | Promise<T | undefined>) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const left = deadline - Date.now()
    if (left <= 0) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    let timer: ReturnType<typeof setTimeout> | undefined
    const value = await Promise.race([
      Promise.resolve().then(probe),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)), left) }),
    ]).finally(() => clearTimeout(timer))
    if (Date.now() >= deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    if (value !== undefined) return value
    await sleep(Math.min(200, deadline - Date.now()))
  }
}
