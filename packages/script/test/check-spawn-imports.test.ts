import { expect, test } from "bun:test"
import { hits } from "../src/spawn-imports.ts"

const name = ["Stdio", "Client", "Transport"].join("")

test("the stdio transport hit is code: import, identifier or element-access key, by any import spelling", () => {
  expect(hits("a.ts", `import { ${name} } from "@modelcontextprotocol/sdk/client/stdio.js"\nnew ${name}({})\n`)).toEqual([name])
  // An aliased or namespace import still names the module.
  expect(hits("a.ts", `import { ${name} as T } from "@modelcontextprotocol/sdk/client/stdio.js"\nnew T({})\n`)).toEqual([name])
  expect(hits("a.ts", 'const m = await import("@modelcontextprotocol/sdk/client/stdio")\nnew m.default()\n')).toEqual([name])
  expect(hits("a.mjs", `const m = require("x")\nnew m["${name}"]({})\n`)).toEqual([name])
  expect(hits("a.tsx", `const t: ${name} | undefined = undefined\nexport const v = <div>{String(t)}</div>\n`)).toEqual([name])
  expect(hits("a.ts", `import { spawn } from "node:child_process"\nnew ${name}({})\n`)).toEqual(["child_process", name])
})

test("a mention in a comment, a string or prose is not a use", () => {
  expect(hits("a.ts", `// uses ${name} for MCP\n/** ${name} */\nexport const x = 1\n`)).toEqual([])
  expect(hits("a.ts", `export const label = "${name}"\nexport const t = \`${name}\`\n`)).toEqual([])
  expect(hits("a.ts", "export const x = 1\n")).toEqual([])
})
