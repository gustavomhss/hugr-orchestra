// JSON calls against a running Orchestra server (re-exported by lib.ts).

/** JSON calls against an Orchestra server for one project directory. */
export function client(url: string, directory: string) {
  const call = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, url), {
      method,
      signal: AbortSignal.timeout(120_000),
      headers: { "content-type": "application/json", "x-orchestra-directory": encodeURIComponent(directory) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${route} answered ${response.status}: ${text.slice(0, 500)}`)
    return text ? JSON.parse(text) : undefined
  }
  return {
    get: (route: string) => call("GET", route),
    post: (route: string, body?: unknown) => call("POST", route, body ?? {}),
    put: (route: string, body: unknown) => call("PUT", route, body),
    del: (route: string) => call("DELETE", route),
  }
}
