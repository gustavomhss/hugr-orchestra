// @atlas/adapter-io — src/repo-visibility.ts  (is this repository public?)
//
// A public repository travels redacted (repo-layout design §6, owner ruling 2026-10-28), and public or private is read
// from the remote host, never configured. Today the host is GitHub: the `origin` remote names `owner/repo`, and the
// GitHub API answers `private`. Anything this cannot settle (no remote, another host, no network, an unexpected status)
// answers `public`, so a doubt costs free text, never a leak.
//
// Without a token a private repository answers 404, which is read as private: the API only hides what is not public.

import { runGit } from "./run-git.js"

export type Visibility = "public" | "private"

/** The one HTTP call, injectable so a test can answer it. Defaults to the global `fetch`. */
export type GetJson = (url: string, headers: Record<string, string>) => Promise<{ readonly status: number; json(): Promise<unknown> }>

export async function repoVisibility(repoPath: string, get: GetJson = (url, headers) => fetch(url, { headers })): Promise<Visibility> {
  const slug = githubSlug(originUrl(repoPath))
  if (slug === undefined) return "public"
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    ...(token === undefined || token === "" ? {} : { authorization: `Bearer ${token}` }),
  }
  const response = await get(`https://api.github.com/repos/${slug}`, headers).catch(() => undefined)
  if (response === undefined) return "public"
  if (response.status === 404) return "private"
  if (response.status !== 200) return "public"
  const body = (await response.json().catch(() => undefined)) as { private?: unknown } | undefined
  return body?.private === true ? "private" : "public"
}

/** `owner/repo` from a GitHub remote URL (https, ssh or scp form), else undefined. */
export function githubSlug(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  const match = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
    url.trim(),
  )
  return match === null ? undefined : `${match[1]}/${match[2]}`
}

function originUrl(repoPath: string): string | undefined {
  try {
    return runGit(repoPath, ["remote", "get-url", "origin"]).trim()
  } catch {
    return undefined
  }
}
