import type { OpenPathResult } from "../main/apps"

export async function openRendererPath(input: {
  path: string
  app?: string
  open: (path: string, app?: string) => Promise<OpenPathResult>
  message: (code: "app-unavailable" | "open-failed") => Promise<string>
}) {
  const result = await input
    .open(input.path, input.app)
    .catch((error: unknown) => ({ status: "failed", code: "open-failed", detail: String(error) }) as const)
  if (result.status !== "failed") return
  throw new Error(await input.message(result.code), { cause: result })
}
