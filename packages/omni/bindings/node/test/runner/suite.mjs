// The suite: every scenario file of a directory meant for this OS and for TS, judged against the pending ledger.
// A product failure of a pending item is `pending`; a harness failure always fails (`expect.mjs`: `Fail`).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { asFail, harness } from "./expect.mjs";
import { Ledger, item } from "./ledger.mjs";
import { OS } from "./os.mjs";
import { Scenario } from "./scenario.mjs";
import { runScenario } from "./steps.mjs";

/**
 * Runs the `*.json` scenarios of `dir` with `fixture` as `${FIXTURE}` through `api`, `log`ging one line per scenario.
 * Returns `{ passed, pending, ran, other, files, errors }`: only `errors` fail the suite.
 */
export async function suite({ dir, ledgerText, fixture, api, log = console.log }) {
  const ledger = new Ledger(ledgerText);
  const names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
  if (names.length === 0) throw new Error(`no scenarios in ${dir}`);
  const sum = { passed: 0, pending: 0, ran: 0, other: 0, files: names.length, errors: [...ledger.errors] };
  const known = new Set();
  const items = new Map(); // item -> whether every scenario of it run here passed
  for (const file of names) {
    const stem = file.slice(0, -".json".length);
    const id = item(stem);
    known.add(id);
    const started = Date.now();
    let failure = null;
    let scenario;
    try {
      scenario = new Scenario(readFileSync(join(dir, file), "utf8"), stem);
    } catch (e) {
      failure = harness(`bad scenario: ${e.message}`);
    }
    if (scenario !== undefined && !scenario.applies(OS, "ts")) {
      sum.other++;
      continue;
    }
    if (scenario !== undefined) {
      try {
        await runScenario(api, scenario, fixture, sum.ran + 1);
      } catch (e) {
        failure = asFail(e);
      }
    }
    sum.ran++;
    items.set(id, (items.get(id) ?? true) && failure === null);
    if (failure === null) {
      sum.passed++;
      log(`ok      ${stem} (${Date.now() - started} ms)`);
    } else if (failure.kind === "product" && ledger.pending(id)) {
      sum.pending++;
      log(`pending ${stem}: ${failure.message}`);
    } else {
      sum.errors.push(`${stem}: ${failure.kind === "harness" ? "harness: " : ""}${failure.message}`);
    }
  }
  if (sum.ran === 0) sum.errors.push("no scenario ran: every file was classified as meant for another OS or language");
  sum.errors.push(...ledger.check(known, items));
  for (const e of sum.errors) log(`FAIL    ${e}`);
  return sum;
}
