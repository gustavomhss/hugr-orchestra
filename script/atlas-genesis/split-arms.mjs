// Split one `atlas mine` stdout into the per-arm files summary.mjs and the frontier gate already read.
//
// A default mine is one process (advisory + dependency + count) so the history probe is paid once. Its
// stdout is a union header, then `arm: <slot>` and that arm's body. summary.mjs wants one `arm-<slot>.txt`
// shaped like a single-arm render: a `genesis:` / `cost:` header plus the body, whose `site:` rows are the
// frontier. A single-arm render has no `arm:` heading and is copied as-is. A refusal (exit 2, no headings)
// is copied onto every requested arm so the artifact says why the run stopped.
//
// Usage: node script/atlas-genesis/split-arms.mjs <stdout> <out-dir> --code <n> --arms a,b
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const SLOTS = ["advisory", "dependency", "count", "definition"]

/** @param {string} stdout @param {{ code: number, arms: string[] }} opts */
export function splitArms(stdout, opts) {
  const text = stdout.endsWith("\n") || stdout.length === 0 ? stdout : `${stdout}\n`
  const headings = [...text.matchAll(/^arm: ([a-z]+)$/gm)].filter((h) => SLOTS.includes(h[1]))
  if (headings.length === 0) {
    return opts.arms.map((arm) => ({ arm, text, code: opts.code }))
  }
  const armsLine = /^mine: arms — (.+)$/m.exec(text)?.[1] ?? ""
  return headings.map((heading, i) => {
    const start = heading.index + heading[0].length + 1
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length
    const body = text.slice(start, end).replace(/^\n/, "")
    const seeded = new RegExp(`(?:^| · )${heading[1]} (\\d+)`).exec(armsLine)?.[1] ?? "0"
    const visited = body.split("\n").filter((line) => line.startsWith("site: ") && !line.includes('"outcome":"unvisited"')).length
    const incomplete = /^partial: /m.test(body) || /^staging: REFUSED/m.test(body)
    const code = opts.code >= 2 ? opts.code : incomplete ? 1 : 0
    const rendered = `genesis: seeded ${seeded} candidate fact(s); ratified 0\ncost: llmCalls ${visited} · budgetSpent ${visited}\n${body}`
    return { arm: heading[1], text: rendered.endsWith("\n") ? rendered : `${rendered}\n`, code }
  })
}

function arg(name) {
  const i = process.argv.indexOf(name)
  if (i === -1 || process.argv[i + 1] === undefined) {
    console.error(`usage: split-arms.mjs <stdout> <out-dir> --code <n> --arms a,b`)
    process.exit(1)
  }
  return process.argv[i + 1]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const stdout = readFileSync(process.argv[2], "utf8")
  const outDir = process.argv[3]
  const code = Number(arg("--code"))
  const arms = arg("--arms")
    .split(",")
    .map((arm) => arm.trim())
    .filter(Boolean)
  if (!Number.isInteger(code)) {
    console.error(`split-arms: --code must be an integer, got ${arg("--code")}`)
    process.exit(1)
  }
  for (const part of splitArms(stdout, { code, arms })) {
    writeFileSync(join(outDir, `arm-${part.arm}.txt`), part.text)
    writeFileSync(join(outDir, `arm-${part.arm}.code`), `${part.code}\n`)
  }
}
