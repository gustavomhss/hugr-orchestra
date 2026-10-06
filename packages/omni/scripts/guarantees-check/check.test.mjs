// Teeth for check.mjs: a small repository in a temp directory, one planted defect per test, and the check must exit
// non-zero and name the thing. The clean tree must pass, so a check that fires on everything fails here too.
//
//   node --test scripts/guarantees-check/check.test.mjs

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "check.mjs");
const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

const GUARANTEES = `# Guarantees

| Not | The | Table |
|---|---|---|
| this | one | skip |

## Containment tiers (ADR-0005)

| | Linux | macOS | Windows |
|---|---|---|---|
| Kill unit | the session | the session | the Job |

## Promises

| Item | Linux | macOS | Windows | Evidence |
|---|---|---|---|---|
| C-RUN-01 run is complete | planned | planned | planned | scenario |
| C-IO-01..02 output | planned | planned | green (https://ci.example/run/1) | scenarios + K5 |
| C-HOST-01 host exit | planned | planned | planned | idiom tests + K1 |
| ConPTY leak | – | – | declared: 1 handle per terminal | W12w, windows.yml run 123 (CONPTY) |
`;

const CLEAN = {
  "GUARANTEES.md": GUARANTEES,
  "docs/acceptance.md": "## KPIs\n\n| ID | Target |\n|---|---|\n| K1 orphans | 0 |\n| K5 output | 0 |\n",
  "PLAN.md": "#### W12w · ConPTY\n- x\n",
  "conformance/scenarios/C-RUN-01.result.json": "{}",
  "conformance/scenarios/C-IO-01.live.json": "{}",
  "conformance/scenarios/C-IO-02.paused.json": "{}",
  "crates/hugr-omni/src/process/tests/host.rs": "// C-HOST-01 lives here\n",
  "crates/hugr-omni/tests/contract.rs": "//! contract\n",
  "bindings/node/test/idioms.mjs": "// C-TS-01\n",
};

function tree(edits = {}) {
  const root = mkdtempSync(join(tmpdir(), "guarantees-check-"));
  made.push(root);
  const files = { ...CLEAN };
  for (const [path, edit] of Object.entries(edits)) {
    if (edit === null) delete files[path];
    else files[path] = typeof edit === "string" ? edit : edit(files[path] ?? "");
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function run(edits) {
  const r = spawnSync(process.execPath, [script, "--root", tree(edits)], { encoding: "utf8" });
  return { code: r.status, text: `${r.stdout}${r.stderr}` };
}

function expects(got, code, ...names) {
  assert.equal(got.code, code, `want exit ${code}, got ${got.code}:\n${got.text}`);
  for (const n of names) assert.ok(got.text.includes(n), `the output must name ${JSON.stringify(n)}:\n${got.text}`);
}

const row = (from, to) => ({ "GUARANTEES.md": (t) => t.replace(from, to) });

test("the clean tree passes, and a table outside the Promises section is not looked at", () => {
  expects(run(), 0, "OK");
});

test("a scenario link with no scenario file fails and names the item", () => {
  expects(run(row("C-RUN-01 run is complete", "C-RUN-02 run is complete")), 1, "C-RUN-02 has no scenario file conformance/scenarios/C-RUN-02.*.json");
});

test("a range names every item in it", () => {
  expects(run(row("C-IO-01..02", "C-IO-01..03")), 1, "C-IO-03 has no scenario file");
});

test("a missing or unknown per-OS status fails and names the row and the OS", () => {
  expects(run(row("| planned | planned | planned | scenario |", "| planned | planned |  | scenario |")), 1, "C-RUN-01", "Windows status");
  expects(run(row("| planned | planned | planned | scenario |", "| maybe | planned | planned | scenario |")), 1, "Linux status \"maybe\"");
});

test("green needs a link to the run", () => {
  expects(run(row("green (https://ci.example/run/1)", "green")), 1, "Windows status \"green\"");
  expects(run(row("green (https://ci.example/run/1)", "green, run 9")), 0);
});

test("an evidence word the check cannot resolve fails and names it", () => {
  expects(run(row("| scenario |", "| trust me |")), 1, 'evidence "trust me"');
  expects(run(row("| scenario |", "|  |")), 1, "no evidence");
});

test("a KPI or work package that does not exist fails and names it", () => {
  expects(run(row("scenarios + K5", "scenarios + K99")), 1, "K99 is not a KPI");
  expects(run(row("W12w,", "W99,")), 1, "W99 is not a work package");
});

test("an idiom-test link needs a test source that names the item", () => {
  expects(run({ "crates/hugr-omni/src/process/tests/host.rs": "// nothing\n" }), 1, "C-HOST-01 has no test source naming it");
});

test("a scenario file whose item no row lists fails and names the file", () => {
  expects(run({ "conformance/scenarios/C-KILL-01.tree.json": "{}" }), 1, "C-KILL-01.tree.json", "C-KILL-01");
  expects(run({ "conformance/scenarios/notes.json": "{}" }), 1, "notes.json");
});

test("a tier row without text for an OS fails", () => {
  expects(run(row("| the session | the session | the Job |", "| the session |  | the Job |")), 1, 'tier row "Kill unit"');
});

test("evidence kinds that name a scenario need a C- item in the row", () => {
  expects(run(row("| ConPTY leak | – | – | declared: 1 handle per terminal | W12w", "| ConPTY leak | – | – | declared: 1 handle per terminal | scenario, W12w")), 1, "lists no C- item");
});

test("an input that cannot be read exits 2 and names it", () => {
  expects(run({ "GUARANTEES.md": null }), 2, "GUARANTEES.md");
  expects(run({ "GUARANTEES.md": (t) => t.replace("## Promises", "## Promised") }), 2, '"## Promises" section is missing');
  expects(run(row("| Item | Linux | macOS | Windows | Evidence |", "| Item | Linux | macOS | Windows |")), 2, "header under");
  expects(run({ "GUARANTEES.md": (t) => t.slice(0, t.indexOf("| C-RUN-01")) }), 2, "EMPTY");
  expects(run({ "docs/acceptance.md": "no kpis\n" }), 2, "KPI");
  expects(run({ "PLAN.md": "nothing\n" }), 2, "PLAN.md");
  expects(run({ "conformance/scenarios/C-RUN-01.result.json": null, "conformance/scenarios/C-IO-01.live.json": null, "conformance/scenarios/C-IO-02.paused.json": null }), 2, "conformance/scenarios");
  expects(run({ "bindings/node/test/idioms.mjs": null, "crates/hugr-omni/tests/contract.rs": null }), 2, "crates/hugr-omni/tests");
});

test("a row after a blank line is not silently dropped, in either table", () => {
  expects(run({ "GUARANTEES.md": (t) => `${t}\nSome prose.\n\n| C-RUN-02 stray | planned | planned | planned | scenario |\n` }), 1, "GUARANTEES.md:", "after the table ended");
  expects(run(row("| Kill unit | the session | the session | the Job |\n", "| Kill unit | the session | the session | the Job |\n\n| Extra | a | b | c |\n")), 1, "after the table ended");
});

test("a row GFM renders is checked like any other, with no leading pipe or with a space before it", () => {
  const append = (line) => ({ "GUARANTEES.md": (t) => `${t}${line}\n` });
  expects(run(append("C-PROC-02 nothing escapes | green | green | green | trust me")), 1, 'Linux status "green"', 'evidence "trust me"');
  expects(run(append("  | C-PROC-02 nothing escapes | green | green | green | trust me |")), 1, 'evidence "trust me"');
  expects(run(append("Some prose right under the table.")), 1, "has 1 cells, the header has 5");
  expects(run(append("C-IO-01 fine without pipes | planned | planned | planned | scenario")), 0);
});

test("an item list in shorthand is refused: the items it hides would go unchecked", () => {
  expects(run(row("C-IO-01..02 output", "C-IO-01/02 output")), 1, "shorthand");
  expects(run(row("C-IO-01..02 output", "C-IO-01-02 output")), 1, "shorthand");
  expects(run(row("C-IO-01..02 output", "C-IO-01, 02 output")), 1, "shorthand");
});

test("a scenario file that is not .json is refused, not ignored", () => {
  expects(run({ "conformance/scenarios/C-RUN-02.extra.yaml": "id: x\n" }), 1, "C-RUN-02.extra.yaml", "not a .json scenario");
});

test("an argument the check does not know, or --root without a directory, exits 2", () => {
  const root = tree();
  for (const args of [["--rot", root], ["--root"], ["--root", root, "--extra"], [root]]) {
    const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
    assert.ok(r.stderr.includes("unknown or incomplete arguments"), r.stderr);
  }
});
