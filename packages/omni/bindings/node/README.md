# hugr-omni

Run processes and terminals from TypeScript (Node, Bun, Deno) with the same, tested behavior on Windows, macOS and
Linux. No shell, ever; `npm` resolves the same way everywhere; and the **whole process tree** is stopped on stop,
timeout, cancel or scope exit. Built for AI agents and developer tools.

## Install

```sh
npm install hugr-omni     # Node
bun add hugr-omni         # Bun
deno add npm:hugr-omni    # Deno
```

In a fresh Node project, run `npm pkg set type=module` (or use `.mts` files) for top-level `await`, and
`npm i -D @types/node` if you type-check with TypeScript.

Node 22+, Bun or Deno; prebuilt for Windows x64, macOS (arm64, x64) and Linux (x64, arm64, glibc). Nothing is compiled
or downloaded at install time.

## Quickstart

In a project that has an `npm run dev`:

```ts quickstart
import { run, spawn } from "hugr-omni";

const r = await run("git", ["status", "--short"], { timeoutMs: 10_000 });
console.log(r.success, r.stdout);

await using server = spawn("npm", ["run", "dev"]);
for await (const line of server.lines()) if (line.text.includes("ready")) break;
console.log(await server.processes()); // every process the server started, with parent links
// leaving the scope stops the server and everything it started
```

CommonJS works too: `const { run, spawn } = require("hugr-omni")`. `await using` needs Node 24+, Bun, Deno, or TypeScript
5.2+ compiling for Node 22; elsewhere write `try { ... } finally { await server.stop(); }`.

## More

- Source, issues and the Rust core: https://github.com/gustavomhss/hugr-omni
- Recipes for agents (dev server, tests with a timeout, interactive terminal, cleanup; `env`, `inheritEnv`, `cwd`,
  `stdin`, `mergeStderr`, reading a result, a shell): https://github.com/gustavomhss/hugr-omni/blob/main/docs/guide/recipes.md
- Every function, option and result field: https://github.com/gustavomhss/hugr-omni/blob/main/docs/api-contract.md
- What holds on each OS, and the evidence: https://github.com/gustavomhss/hugr-omni/blob/main/GUARANTEES.md

Licensed under either of Apache License 2.0 or MIT, at your option.
