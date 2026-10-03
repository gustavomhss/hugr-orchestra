export * as ToolSafetyCommands from "./tool-safety-commands"

/** Closed raw forms: git push/commit/merge; gh release create/edit/delete;
 * npm/bun/pnpm/yarn publish; fly/flyctl/vercel/netlify/wrangler deploy;
 * rm/rmdir/remove-item delete (absolute/parent/home targets also removeexternal).
 * Native shell policy remains authoritative for every other spelling.
 */
export function actions(command: string) {
  return [
    ["push", /\bgit\b[^\n;&|]*\bpush\b/],
    ["commit", /\bgit\b[^\n;&|]*\bcommit\b/],
    ["merge", /\bgit\b[^\n;&|]*\bmerge\b/],
    ["release", /\bgh\s+release\s+(?:create|edit|delete)\b|\b(?:npm|bun|pnpm|yarn)\s+publish\b/],
    ["publish", /\b(?:npm|bun|pnpm|yarn)\s+publish\b/],
    ["deploy", /\b(?:fly|flyctl|vercel|netlify|wrangler)\s+deploy\b/],
    ["delete", /\b(?:rm|rmdir|remove-item)\b/i],
    ["removeexternal", /\b(?:rm|rmdir|remove-item)\b[^\n;&|]*(?:\s["']?\/|\s["']?\.\.\/|\s["']?~\/)/i],
  ].flatMap(([action, pattern]) => pattern instanceof RegExp && pattern.test(command) && typeof action === "string" ? [action] : [])
}


// Adapted raw known-form checks. No shell parsing, alias resolution or descendant confinement claim.
// Native shell permission owns all other spellings; scoped descendant writes require an actual process sandbox.
const bypass = [
  /\bgit\b.*--no-verify\b/,
  /\bgit\s+commit\b.*(?:^|\s)-[a-zA-Z]*n/,
  /\bHUSKY=0\b/,
  /--no-hooks\b/,
]
const destructive = [
  /\bgit\s+push\b.*(--force(?!-with-lease)\b|(?:^|\s)-[a-zA-Z]*f(?!\w))/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+filter-branch\b/,
  /\bgit\s+gc\b.*--prune=(?:now|all)\b/,
  /\bmkfs\b|\bdd\s+.*of=\/dev\//,
  /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
  /\bDELETE\s+FROM\s+\w+\s*(?:;|"|'|$)/i,
  /\bUPDATE\s+\w+\s+SET\b(?![^;"']*\bWHERE\b)/i,
  /\bterraform\s+destroy\b/,
  /\b(volumeDelete|deleteVolume|delete-volume|delete_database|deleteDatabase)\b/i,
  /\baws\s+s3\s+rb\b|\baws\s+\w+\s+delete-/,
  /\bgcloud\s+.*\bdelete\b|\baz\s+.*\bdelete\b/,
  /\bkubectl\s+delete\b/,
  /\bdropdb\b|\bDROP\s+OWNED\b/i,
  /\b(?:fly|flyctl)\s+.*\bdestroy\b|\bheroku\s+.*\bdestroy\b|\bsupabase\s+.*\bdelete\b|\bwrangler\s+.*\bdelete\b|\bvercel\s+.*\b(?:rm|remove)\b|\bgh\s+repo\s+delete\b|\brailway\s+.*\b(?:down|delete)\b/i,
  /\bnpm\s+unpublish\b/,
  /\bdocker\s+(?:system\s+prune\b.*--volumes|volume\s+rm\b|volume\s+prune\b)/,
  /\b(?:curl|wget|http)\b.*-X\s*DELETE\b.*\b(?:railway|amazonaws|googleapis|azure|fly\.io|herokuapp|supabase|cloudflare)\b/i,
]
const danger = /(?:[\s"'=]|^)(?:\/(?:\/?[\s"']|\/?$|\/\*)|\/\*|(?:\/etc|\/usr|\/bin|\/sbin|\/lib|\/boot|\/System|\/var|\/opt|\/private|\/dev)\b|(?:\/Users|\/home)(?:\/?[\s"']|\/?$|\/\*)|~(?:\/?[\s"']|\/?$|\/\*)|\$HOME\b|\.(?:\/?[\s"']|\/?$|\/\*)|\.\.(?:\/?[\s"']|\/?$|\/\*)|\*(?:[\s"']|$))/

export function reason(command: string) {
  if (bypass.some((pattern) => pattern.test(command))) return "known-gate-bypass"
  if (destructive.some((pattern) => pattern.test(command))) return "known-destructive-operation"
  const short = [...command.matchAll(/(?<!\S)-([a-zA-Z]+)/g)].map((match) => match[1]).join("")
  if (/\brm\b/.test(command) && (short.includes("r") || /--recursive\b|--dir\b/.test(command)) &&
    (short.includes("f") || /--force\b/.test(command)) && danger.test(command)) return "known-catastrophic-delete"
  if (/\bfind\b/.test(command) && /-delete\b|-exec\s+rm\b/.test(command) &&
    /\bfind\s+(?:-[a-zA-Z]+\s+\S*\s*)*(?:\/|~|\$HOME)(?:\s|\/|$)|\bfind\s+(?:\/etc|\/usr|\/bin|\/sbin|\/lib|\/boot|\/System|\/var|\/opt|\/private|\/dev|\/Users|\/home)\b/.test(command))
    return "known-catastrophic-find-delete"
  if (/\bgit\s+clean\b/.test(command)) {
    const tail = command.split("clean", 2)[1]
    const flags = [...tail.matchAll(/(?<!\S)-([a-zA-Z]+)/g)].map((match) => match[1]).join("")
    if (!flags.includes("n") && !/--dry-run\b/.test(tail) && (flags.includes("f") || /--force\b/.test(tail)) &&
      [..."dxX"].some((flag) => flags.includes(flag))) return "known-unrecoverable-git-clean"
  }
}
