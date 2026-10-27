/** Strips credentials from log text before it leaves the machine in a debug export. */
export function redactLog(text: string) {
  return text
    .replace(/(auth_token=)[^&\s"'\\]+/gi, "$1[redacted]")
    .replace(/(authorization["']?\s*[:=]\s*["']?)(?:(?:Basic|Bearer)\s+)?[^\s"',}\\]+/gi, "$1[redacted]")
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/=._~-]{8,}/g, "$1 [redacted]")
}

const TEXT = /\.(log|netlog|txt|json|jsonl)(\.\d+)?$/i

/** Whether an exported file is text a person can read, so it is redacted; crash dumps are left as they are. */
export const isRedactable = (name: string) => TEXT.test(name)
