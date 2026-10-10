// The contract suite (C-TS-02): every scenario of `conformance/scenarios` meant for this OS and for TS, run through the
// public TS API of `bindings/node`, the same files and the same rules as the Rust runner (`crates/hugr-omni/tests/`).
// One line per scenario, then `contract: N passed, M pending, K failed`; only K > 0 fails (exit 1). Items listed in
// `conformance/pending.txt` cannot pass yet: their product failures are `pending`. `skipped` does not exist.
//
//   node bindings/node/test/contract.mjs        (Node 22+; no flags)
//   bun  bindings/node/test/contract.mjs
//   deno run -A bindings/node/test/contract.mjs
//
// Needs the fixture and the supervisor built first: `cargo build --workspace --bins`.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OS } from "./runner/os.mjs";
import { checkTable } from "./runner/pattern.mjs";
import { suite } from "./runner/suite.mjs";
import { binaries, finish, loadApi, root, runtime } from "./support.mjs";

async function main() {
  const conformance = join(root, "conformance");
  // The regex engine first: a runner that reads `until`/`capture` differently from the Rust one proves nothing.
  const table = checkTable(JSON.parse(readFileSync(join(conformance, "regex-table.json"), "utf8")));
  if (table.length > 0) {
    table.forEach((e) => console.log(`FAIL    ${e}`));
    return [`contract: ${table.length} failed (conformance/regex-table.json; no scenario was run)`, 1];
  }
  const { fixture } = binaries();
  // Warm-up, not synchronization: an OS may validate a freshly built executable on its first exec (seconds on macOS
  // under load), which must not eat into the first scenario's step timeout.
  const warm = spawnSync(fixture);
  if (warm.status !== 0) throw new Error(`${fixture} does not run: ${warm.error?.message ?? `exit ${warm.status}`}`);
  const sum = await suite({
    dir: join(conformance, "scenarios"),
    ledgerText: readFileSync(join(conformance, "pending.txt"), "utf8"),
    fixture,
    api: loadApi(),
  });
  const line =
    `contract: ${sum.passed} passed, ${sum.pending} pending, ${sum.errors.length} failed ` +
    `(${sum.ran} scenarios run on ${OS}/ts-${runtime}; ${sum.files} files, ${sum.other} for other OSes or languages)`;
  return [line, sum.errors.length === 0 ? 0 : 1];
}

main().then(
  ([line, code]) => finish(line, code),
  (e) => {
    console.log(`FAIL    ${e.stack ?? e}`);
    finish("contract: could not run", 1);
  },
);
