// Teeth for check.mjs: a small package in a temp directory, one planted defect per test, and the check must exit
// non-zero and name the thing. The clean tree must pass, so a check that fires on everything fails here too.
//
//   node --test scripts/skill-check/check.test.mjs      (or: node scripts/skill-check/check.test.mjs)

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

const DESCRIPTION = "Runs things. Use when something must run.";
const skill = (front, body) => `---\n${front}\n---\n\n# Demo\n\n## When to use\n\n- now\n\n## When not to use\n\n- later\n${body}`;
const BODY = `
## Map

Set \`timeoutMs\` or \`inheritEnv: false\`; read \`NOT_FOUND\`; compare with \`killSignal\`; a word like \`stop\` or
\`child.droppedBytes\` is not looked at. See [the guide](../../docs/guide.md#2-reading), [more](references/more.md),
[the map](#map), [the second map](#map-1), [the docs folder](../../docs) and [a site](https://example.com/x#y).

## Map

\`\`\`ts
const wrongButFenced = { timeoutMS: 1 }; // [not a link](nowhere.md) \`NOT_A_CODE\`
\`\`\`

Inline code hides links too: \`[x](missing.md)\`.
`;

const CLEAN = {
  "bindings/node/index.d.ts": `export function run(command: string, options?: RunOptions): Promise<number>;
export interface RunOptions { timeoutMs?: number; inheritEnv?: boolean; }
export interface Child { readonly droppedBytes: { stdout: number }; stop(options?: { graceMs?: number }): Promise<void>; }
export class OmniError extends Error {
  readonly code: "NOT_FOUND" | "IO";
}
`,
  "docs/guide.md": "# Guide\n\n## 1. Running\n\ntext\n\n## 2. Reading\n\ntext\n",
  "scripts/skill-check/foreign.txt": "# ledger\nkillSignal   # node:child_process option\n",
  ".claude-plugin/plugin.json": JSON.stringify({ name: "demo-plugin", version: "0.1.0" }),
  "skills/demo/SKILL.md": skill(`name: demo\ndescription: "${DESCRIPTION}"`, BODY),
  "skills/demo/references/more.md": "# More\n\nBack to [the skill](../SKILL.md#when-to-use).\n",
  "skills/other/SKILL.md": skill(`name: other\ndescription: ${DESCRIPTION}`, "\nNothing else.\n"),
};

function tree(edits = {}) {
  const root = mkdtempSync(join(tmpdir(), "skill-check-"));
  made.push(root);
  const files = { ...CLEAN };
  for (const [path, edit] of Object.entries(edits)) {
    if (edit === null) delete files[path];
    else files[path] = typeof edit === "string" ? edit : edit(files[path] ?? "");
  }
  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith("/")) mkdirSync(join(root, path), { recursive: true }); // an empty folder
    else {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  }
  return root;
}

function run(edits, args) {
  const root = tree(edits);
  const r = spawnSync(process.execPath, [script, ...(args ?? ["--root", root])], { encoding: "utf8" });
  return { code: r.status, text: `${r.stdout}${r.stderr}` };
}

function expects(got, code, ...names) {
  assert.equal(got.code, code, `want exit ${code}, got ${got.code}:\n${got.text}`);
  for (const n of names) assert.ok(got.text.includes(n), `the output must name ${JSON.stringify(n)}:\n${got.text}`);
}

const demo = (from, to) => ({ "skills/demo/SKILL.md": (t) => t.replace(from, to) });

test("the clean tree passes; fenced code, inline-code links, external links and plain words are not looked at", () => {
  expects(run(), 0, "OK", "2 skills", "1 declared foreign");
});

test("frontmatter: missing, unclosed, or a value YAML would read differently", () => {
  expects(run({ "skills/demo/SKILL.md": (t) => t.replace(/^---\n[\s\S]*?\n---\n/, "") }), 1, "skills/demo/SKILL.md", "no frontmatter");
  expects(run({ "skills/demo/SKILL.md": (t) => t.replace("\n---\n\n# Demo", "\n\n# Demo") }), 1, "never closed");
  expects(run({ "skills/other/SKILL.md": (t) => t.replace(`description: ${DESCRIPTION}`, "description: Use when: always") }), 1, "skills/other/SKILL.md:3", "quote it");
  expects(run({ "skills/other/SKILL.md": (t) => t.replace(`description: ${DESCRIPTION}`, "description: |\n  Use when x") }), 1, "YAML syntax", "not a one-line");
  expects(run(demo("name: demo\n", "name: demo\nname: demo\n")), 1, "`name` is given twice");
});

test("name: equal to the folder, and [a-z0-9-]{1,64}", () => {
  expects(run(demo("name: demo", "name: dem0")), 1, 'name "dem0" is not the folder\'s name "demo"');
  expects(run({ "skills/Bad_Name/SKILL.md": skill(`name: Bad_Name\ndescription: ${DESCRIPTION}`, "") }), 1, 'name "Bad_Name" must match');
  expects(run(demo("name: demo\n", "")), 1, "has no `name`");
});

test("description: present, at most 1024 characters, says Use when, no angle brackets", () => {
  expects(run(demo(`description: "${DESCRIPTION}"`, "")), 1, "has no `description`");
  expects(run(demo(DESCRIPTION, `${"x".repeat(1020)} Use when x`)), 1, "the limit is 1024");
  expects(run(demo("Use when", "Used when")), 1, 'must say "Use when');
  expects(run(demo("Runs things.", "Runs <things>.")), 1, "must not contain < or >");
});

test("an unknown frontmatter key is refused", () => {
  expects(run(demo("name: demo\n", "name: demo\nversion: 1\n")), 1, "unknown frontmatter key `version`");
});

test("the body: at most 500 lines, with both When headings", () => {
  expects(run({ "skills/other/SKILL.md": (t) => t.replace("Nothing", `${"line\n".repeat(500)}Nothing`) }), 1, "skills/other/SKILL.md: the body has", "the limit is 500");
  expects(run({ "skills/other/SKILL.md": (t) => t.replace("## When not to use", "## When not") }), 1, 'has no "## When not to use" heading');
});

test("a link to a missing file, a missing anchor, or outside the package fails and names it", () => {
  expects(run(demo("docs/guide.md#2-reading", "docs/guides.md#2-reading")), 1, "skills/demo/SKILL.md:19", "docs/guides.md, which does not exist");
  expects(run(demo("docs/guide.md#2-reading", "docs/guide.md#3-reading")), 1, "has no heading with the anchor #3-reading");
  expects(run(demo("(#map-1)", "(#map-2)")), 1, "skills/demo/SKILL.md has no heading with the anchor #map-2");
  expects(run(demo("(../../docs)", "(../../docs#x)")), 1, "is not a Markdown file");
  expects(run(demo("(../../docs)", "(../../../elsewhere.md)")), 1, "leaves this package");
  expects(run({ "skills/demo/references/more.md": (t) => t.replace("#when-to-use", "#when-to-run") }), 1, "skills/demo/references/more.md:3", "#when-to-run");
});

test("a fence never closed is reported (the rest of the file would be code)", () => {
  expects(run({ "skills/other/SKILL.md": (t) => `${t}\n\`\`\`ts\nconst x = 1;\n` }), 1, "never closed");
});

test("an option-shaped or code-shaped identifier omni does not have fails, unless declared foreign", () => {
  expects(run(demo("`timeoutMs`", "`timeoutMS`")), 1, "`timeoutMS` is not a name of bindings/node/index.d.ts");
  expects(run(demo("`inheritEnv: false`", "`inheritEnvs: false`")), 1, "`inheritEnvs` is not a name");
  expects(run(demo("`NOT_FOUND`", "`NOT_FUND`")), 1, "`NOT_FUND` is not an `OmniError` code");
  expects(run(demo("`killSignal`", "`killSignals`")), 1, "`killSignals` is not a name", "`killSignal` is used by no skill");
  expects(run({ "skills/demo/references/more.md": (t) => `${t}\nSee \`graceMS\`.\n` }), 1, "skills/demo/references/more.md:5", "`graceMS`");
});

test("the foreign ledger cannot rot: omni's own name, unused, duplicate, unshaped, or without a reason", () => {
  const ledger = (text) => ({ "scripts/skill-check/foreign.txt": (t) => `${t}${text}\n` });
  expects(run(ledger("timeoutMs   # mine")), 1, "`timeoutMs` is omni's own");
  expects(run(ledger("unusedThing   # nobody")), 1, "`unusedThing` is used by no skill");
  expects(run(ledger("killSignal   # again")), 1, "listed twice");
  expects(run(ledger("plain   # word")), 1, '"plain" has neither the option nor the code shape');
  expects(run({ "scripts/skill-check/foreign.txt": "killSignal\n" }), 1, "says no reason");
});

test("the skill folder: SKILL.md and references/ of .md files only, each reference linked", () => {
  expects(run({ "skills/demo/notes.txt": "x" }), 1, "skills/demo/notes.txt: a skill folder holds SKILL.md and references/ only");
  expects(run({ "skills/demo/references/deep/x.md": "# x\n" }), 1, "skills/demo/references/deep", "one level deep");
  expects(run({ "skills/demo/references/orphan.md": "# Orphan\n" }), 1, "skills/demo/references/orphan.md: no link from skills/demo/SKILL.md");
  expects(run({ "skills/empty/references/x.md": "# x\n" }), 1, "skills/empty: has no SKILL.md");
  expects(run({ "skills/README.md": "# x\n" }), 1, "skills/README.md: skills/ holds skill folders only");
});

test("the plugin manifest: present, valid JSON, kebab-case name, existing skills paths", () => {
  expects(run({ ".claude-plugin/plugin.json": null }), 1, ".claude-plugin/plugin.json: cannot be read");
  expects(run({ ".claude-plugin/plugin.json": "{ name: x" }), 1, "not valid JSON");
  expects(run({ ".claude-plugin/plugin.json": JSON.stringify({ name: "Demo Plugin" }) }), 1, "`name` must be a kebab-case string");
  expects(run({ ".claude-plugin/plugin.json": JSON.stringify({ name: "demo", skills: ["./nowhere"] }) }), 1, 'the skills path "./nowhere"');
  expects(run({ ".claude-plugin/plugin.json": JSON.stringify({ name: "demo", skills: "./skills" }) }), 0, "OK");
});

test("an input that cannot be read exits 2 and names it", () => {
  expects(run({ "skills/demo/SKILL.md": null, "skills/demo/references/more.md": null, "skills/other/SKILL.md": null, "skills/": "" }), 2, "EMPTY");
  expects(run({ "skills/demo/SKILL.md": null, "skills/demo/references/more.md": null, "skills/other/SKILL.md": null }), 2, "skills: cannot be listed");
  expects(run({ "bindings/node/index.d.ts": null }), 2, "bindings/node/index.d.ts");
  expects(run({ "bindings/node/index.d.ts": (t) => t.replace(/export class OmniError[\s\S]*$/, "") }), 2, "OmniError");
  expects(run({ "scripts/skill-check/foreign.txt": null }), 2, "foreign.txt");
});

test("an argument the check does not know, or --root without a directory, exits 2", () => {
  const root = tree();
  for (const args of [["--rot", root], ["--root"], ["--root", root, "--extra"], [root]]) {
    const got = run({}, [...args]);
    assert.equal(got.code, 2, `${args.join(" ")}: ${got.text}`);
    assert.ok(got.text.includes("unknown or incomplete arguments"), got.text);
  }
});
