export function wslServerIdsToStartOnInitialize(servers: { id: string }[]) {
  return servers.map((server) => server.id)
}

export const pendingRestartAfterWslInstall = (runtime: { available: boolean }) => !runtime.available

export async function checkWslAuthentication(url: string, password: string, signal?: AbortSignal) {
  const request = (value: string) => fetch(new URL("/api/health", url), {
    headers: { authorization: `Basic ${Buffer.from(`orchestra:${value}`).toString("base64")}` },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
  })
  const allowed = await request(password)
  const denied = await request(`${password}-invalid`)
  const healthy: unknown = allowed.ok ? await allowed.json() : null
  return !!healthy && typeof healthy === "object" && "healthy" in healthy && healthy.healthy === true && denied.status === 401
}

export async function pollWslHealth(check: () => Promise<boolean>, signal: AbortSignal, interval = 100) {
  while (!signal.aborted) {
    if (await check()) return
    await abortableDelay(interval, signal)
  }
}

function abortableDelay(duration: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timeout)
      signal.removeEventListener("abort", done)
      resolve()
    }
    const timeout = setTimeout(done, duration)
    signal.addEventListener("abort", done, { once: true })
  })
}
