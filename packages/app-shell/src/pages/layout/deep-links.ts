export const deepLinkEvent = "orchestra:deep-link"

const parseUrl = (input: string) => {
  if (!input.startsWith("orchestra://")) return
  if (typeof URL.canParse === "function" && !URL.canParse(input)) return
  try {
    return new URL(input)
  } catch {
    return
  }
}

export const parseDeepLink = (input: string) => {
  const url = parseUrl(input)
  if (!url) return
  if (url.hostname !== "open-project") return
  const directory = url.searchParams.get("directory")
  if (!directory) return
  return directory
}

export const parseNewSessionDeepLink = (input: string) => {
  const url = parseUrl(input)
  if (!url) return
  if (url.hostname !== "new-session") return
  const directory = url.searchParams.get("directory")
  if (!directory) return
  const prompt = url.searchParams.get("prompt") || undefined
  if (!prompt) return { directory }
  return { directory, prompt }
}

// The live tray opens the Flight Engineer, or one meeting when it names it.
export const parseLiveDeepLink = (input: string) => {
  const url = parseUrl(input)
  if (!url) return
  if (url.hostname !== "live") return
  const meeting = url.searchParams.get("meeting") || undefined
  if (!meeting) return {}
  return { meeting }
}

export const collectOpenProjectDeepLinks = (urls: string[]) =>
  urls.map(parseDeepLink).filter((directory): directory is string => !!directory)

export const collectNewSessionDeepLinks = (urls: string[]) =>
  urls.map(parseNewSessionDeepLink).filter((link): link is { directory: string; prompt?: string } => !!link)

type OrchestraWindow = Window & {
  __ORCHESTRA__?: {
    deepLinks?: string[]
  }
}

export const drainPendingDeepLinks = (target: OrchestraWindow) => {
  const pending = target.__ORCHESTRA__?.deepLinks ?? []
  if (pending.length === 0) return []
  if (target.__ORCHESTRA__) target.__ORCHESTRA__.deepLinks = []
  return pending
}

// Both shells use this ingress. A cancelable event acknowledges ownership to the desktop bridge.
export function listenDeepLinks(target: OrchestraWindow, handle: (urls: string[]) => void) {
  const listener = (event: Event) => {
    const urls = (event as CustomEvent<{ urls?: unknown }>).detail?.urls
    if (!Array.isArray(urls) || !urls.every((url) => typeof url === "string") || event.defaultPrevented) return
    event.preventDefault()
    handle(urls)
  }
  target.addEventListener(deepLinkEvent, listener)
  handle(drainPendingDeepLinks(target))
  target.dispatchEvent(new CustomEvent("orchestra:deep-link-ready"))
  return () => target.removeEventListener(deepLinkEvent, listener)
}
