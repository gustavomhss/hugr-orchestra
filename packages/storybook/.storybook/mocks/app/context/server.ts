export const ServerConnection = {
  key: (conn: { type: string; http?: { url: string } }) =>
    (conn.type === "http" && conn.http ? conn.http.url : conn.type) as string,
}

export function serverName(conn?: { displayName?: string; http: { url: string } }) {
  if (!conn) return ""
  if (conn.displayName) return conn.displayName
  return conn.http.url.replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

export function normalizeServerUrl(input: string) {
  try {
    return new URL(input).toString()
  } catch {
    return undefined
  }
}

export function useServer() {
  return { key: "mock-server" }
}

export function ServerProvider(props: { children: unknown }) {
  return props.children
}
