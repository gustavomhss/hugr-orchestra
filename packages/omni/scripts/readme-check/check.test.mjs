// Teeth for check.mjs: docs with one planted defect each, and the check must exit non-zero and name file:line.
// The clean docs must pass, so a check that fires on everything fails here too.
//
// The first group runs the static rules on small docs in a temp repository (fast). The second runs real blocks (needs
// npm and network once for TypeScript, cargo for Rust, and the repository built, like check.mjs itself): a block that
// throws, a type error, a hang, a leftover process, a Rust panic and a Rust build error must each fail.
//
//   node --test scripts/readme-check/check.test.mjs

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { extract } from "./blocks.mjs";
import { isAlive, survivors } from "./run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "check.mjs");
const repo = join(here, "..", "..");
const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

const fence = (info, ...lines) => `\`\`\`${info}\n${lines.join("\n")}\n\`\`\`\n`;
const TS = fence("ts quickstart", 'import { run } from "hugr-omni";', 'console.log(typeof run);');
const RUST = fence("rust quickstart", "fn main() {}");
const GIT = "https://github.com/gustavomhss/hugr-omni";
const DEPS = fence("toml", "[dependencies]", `hugr-omni = { git = "${GIT}" }`, 'tokio = { version = "1", features = ["macros", "rt-multi-thread"] }');
const INSTALL = fence("sh", "npm install hugr-omni     # Node", "bun add hugr-omni");
const README = `# title\n\n${TS}\nprose\n\n${DEPS}\n${RUST}\n## Install\n\n${INSTALL}\n${fence("text", "sample output")}`;
const NODE_README = `# pkg\n\n## Install\n\n${INSTALL}\n${fence("ts quickstart", "console.log(1);")}`;
const GUIDE = `# guide\n\n${fence("ts", "console.log(1);")}`;

/** A repository in a temp directory holding `files`. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), "readme-check-"));
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function cli(args, options = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", ...options });
  return { code: r.status, text: `${r.stdout}${r.stderr}` };
}

function expects(got, code, ...names) {
  assert.equal(got.code, code, `want exit ${code}, got ${got.code}:\n${got.text}`);
  for (const n of names) assert.ok(got.text.includes(n), `the output must name ${JSON.stringify(n)}:\n${got.text}`);
}

/** The static rules on a temp repository with README.md and docs/guide/recipes.md (each replaceable). */
const NODE_BARE = `# pkg\n\n${fence("ts quickstart", "console.log(1);")}`;
const rules = (readme = README, guide = GUIDE, node = NODE_README) =>
  cli(["--static", "--root", tree({ "README.md": readme, "bindings/node/README.md": node, "docs/guide/recipes.md": guide })]);

test("static: clean docs pass, and the summary counts what was not run", () => {
  expects(rules(), 0, "OK", "not run: text 1, toml 1 (the rust blocks' dependencies), pre-release install lines 4");
});

test("static: only the READMEs' literal install lines under ## Install stay unexecuted, and each is printed", () => {
  const got = rules();
  expects(got, 0, "not run (pre-release install): npm install hugr-omni", "not run (pre-release install): bun add hugr-omni");
  // Any other line in the block, the same lines under another heading, or in a guide: the block is run, nothing is printed.
  const notExempt = (readme, node = NODE_BARE) => {
    const r = rules(readme, GUIDE, node);
    expects(r, 0, "pre-release install lines 0");
    assert.ok(!r.text.includes("not run (pre-release install)"), r.text);
  };
  notExempt(README.replace(INSTALL, fence("sh", "npm install hugr-omni", "npm install left-pad")));
  notExempt(README.replace("## Install", "## Setup"));
  notExempt(README.replace(INSTALL, fence("sh", "npm install hugr-omni extra")));
  notExempt(README.replace(INSTALL, ""), NODE_README.replace(INSTALL, fence("sh", "npm install left-pad")));
  expects(rules(README, `${GUIDE}\n## Install\n\n${INSTALL}`), 0, "pre-release install lines 4"); // only the two READMEs count
});

test("static: a rust block takes its dependencies from the toml block before it, which must name the git URL of hugr-omni", () => {
  expects(rules(README.replace(`git = "${GIT}"`, 'git = "https://github.com/gustavomhss/hugr-omin"')), 1, "names the git URL https://github.com/gustavomhss/hugr-omin", "repository of Cargo.toml (https://github.com/gustavomhss/hugr-omni)");
  expects(rules(README.replace(`git = "${GIT}"`, `git = "${GIT}.git"`)), 1, "not the repository of Cargo.toml");
  expects(rules(README.replace(DEPS, "")), 1, "a rust block needs a toml block before it");
  expects(rules(README.replace("[dependencies]", "[dev-dependencies]")), 1, "must start with `[dependencies]`");
  expects(rules(README.replace(`hugr-omni = { git = "${GIT}" }`, 'hugr-omni = "0.1"')), 1, "must give hugr-omni as one inline table with a git URL");
  expects(rules(README.replace(`hugr-omni = { git = "${GIT}" }`, `hugr-omni = { path = "../hugr-omni" }`)), 1, "git URL");
  expects(rules(README.replace(DEPS, `${DEPS}\n${fence("toml", "[dependencies]", `hugr-omni = { git = "${GIT}" }`)}`)), 0); // the nearest toml block before it is the one used
  expects(rules(README.replace(DEPS, fence("toml", "[dependencies]", `hugr-omni = { git = "${GIT}" }`, "[patch.crates-io]"))), 1, "must hold only the `[dependencies]` table");
});

test("static: a sh block holds simple commands only (no shell)", () => {
  expects(rules(`${README}\n${fence("sh", "echo hi | cat")}`), 1, "`echo hi | cat` is not a simple command");
  expects(rules(`${README}\n${fence("sh", 'echo "quoted"')}`), 1, "is not a simple command");
  expects(rules(`${README}\n${fence("sh", "FOO=bar node --version")}`), 1, "is not a simple command");
  expects(rules(`${README}\n${fence("sh", "node --version   # fine")}`), 0);
});

test("static: a tilde fence is extracted like a backtick one; forms the reader does not support fail", () => {
  expects(rules(`${README}\n~~~python\nx = 1\n~~~\n`), 1, 'says "python"');
  expects(rules(`${README}\n~~~ts\nconsole.log(1);\n`), 1, "never closed");
  expects(rules(`${README}\n\`\`\`\`ts\nconsole.log(1);\n\`\`\`\`\n`), 0); // a longer fence is a fence (CommonMark)
  expects(rules(`${README}\nA paragraph.\n\n    console.log("indented");\n`), 1, "an indented code block is not supported");
  expects(rules(`${README}\n<pre>\nconsole.log(1);\n</pre>\n`), 1, "an HTML <pre> block is not supported");
  expects(rules(`${README}\n- a list item\n  continues here\n`), 0);
});

test("static: a block with no language, or an unknown one, fails and names file:line", () => {
  expects(rules(`${README}\n${fence("", "x")}`), 1, "README.md:", 'says ""');
  expects(rules(`${README}\n${fence("python", "x = 1")}`), 1, 'says "python"');
});

test("static: a quickstart of 11 lines fails", () => {
  const long = fence("ts quickstart", ...Array.from({ length: 11 }, (_, i) => `console.log(${i});`));
  expects(rules(README.replace(TS, long)), 1, "quickstart has 11 lines; the limit is 10");
});

test("static: the README must lead with TypeScript, and have exactly one quickstart per language", () => {
  expects(rules(`# t\n\n${RUST}\n${TS}`), 1, "the first runnable block is rust");
  expects(rules(README.replace(RUST, "")), 1, "`rust quickstart` blocks; it needs exactly one");
  expects(rules(`${README}\n${TS}`), 1, "has 2 `ts quickstart` blocks");
});

test("static: the guide must lead with TypeScript too", () => {
  expects(rules(README, `# g\n\n${fence("rust", "fn main() {}")}`), 1, "docs/guide/recipes.md:3: the first runnable block is rust");
});

test("static: an unclosed fence, an unknown attribute and a quickstart on a shell block fail", () => {
  expects(rules(`${README}\n\`\`\`ts\nconsole.log(1);\n`), 1, "never closed");
  expects(rules(README.replace("ts quickstart", "ts quickstart skip")), 1, 'unknown attribute "skip"');
  expects(rules(`${README}\n${fence("sh quickstart", "ls")}`), 1, "only a ts or rust block can be a quickstart");
});

const kinds = (text) => extract(text, "x.md").blocks.map((b) => b.lang);

test("fences follow CommonMark: a closing fence may be longer, may not be indented four spaces or be of another character", () => {
  const ts = '```ts\nthrow new Error("boom");\n```\n';
  // The reviewer's case (a): a text block closed by four backticks must not swallow the ts block after it.
  const longer = extract(`\`\`\`text\ntimeout false\n\`\`\`\`\n\n${ts}`, "x.md");
  assert.deepEqual(longer.blocks.map((b) => b.lang), ["text", "ts"]);
  assert.deepEqual(longer.violations, []);
  assert.deepEqual(kinds(`\`\`\`\`text\nsample\n\`\`\`\`\n\n${ts}`), ["text", "ts"]);
  assert.deepEqual(kinds(`~~~text\nsample\n~~~~~\n${ts}`), ["text", "ts"]);
  assert.deepEqual(kinds(`\`\`\`text\nsample\n   \`\`\`\n${ts}`), ["text", "ts"]); // three spaces still close
  // A closer of another character, or too short, or indented four spaces, does not close: the block runs on (and is flagged).
  const tilde = extract(`\`\`\`text\nsample\n~~~\n${ts}`, "x.md");
  assert.ok(tilde.violations.length > 0, JSON.stringify(tilde)); // the ts fence that follows is swallowed, and flagged as nested
  const short = extract(`\`\`\`\`text\nsample\n\`\`\`\n${ts}`, "x.md");
  assert.ok(short.violations.some((v) => v.includes("fence-shaped line inside")), JSON.stringify(short));
  const indented = extract(`\`\`\`text\nsample\n    \`\`\`\n${ts}`, "x.md");
  assert.ok(indented.violations.length > 0, JSON.stringify(indented));
  // An unclosed fence runs to the end of the document, and is a violation, never a silent block.
  const open = extract(`\`\`\`text\nsample\n${ts.slice(0, -4)}`, "x.md");
  assert.deepEqual(open.blocks, []);
  assert.ok(open.violations.some((v) => v.includes("never closed")), JSON.stringify(open));
});

test("fences: a fence opener indented four spaces is not an opener, so it cannot swallow what follows, and is refused", () => {
  const ts = '```ts\nthrow new Error("boom");\n```\n';
  // The reviewer's case (b).
  const got = extract(`Some text.\n\n    \`\`\`text\n${ts}`, "x.md");
  assert.deepEqual(got.blocks.map((b) => b.lang), ["ts"]);
  assert.ok(got.violations.length >= 1, JSON.stringify(got));
  expects(rules(`${README}\n\n    ${"```"}text\n${ts}`), 1, "README.md:", "not a fence this reader extracts");
  // A backtick in the info string of a backtick fence makes it inline code, not an opener: a violation, not a block.
  const inline = extract("```ts``` is code\n", "x.md");
  assert.deepEqual(inline.blocks, []);
  assert.ok(inline.violations.length > 0);
});

test("fences: every fence-shaped line is an opener, a closer or a violation: a nested fence inside a block is refused", () => {
  expects(rules(`${README}\n${"```"}text\nsample\n${"```"}ts\nconsole.log(1);\n${"```"}\n${"```"}\n`), 1, "a fence-shaped line inside the code block");
  expects(rules(`${README}\n${"````"}text\nsample\n${"```"}ts\nconsole.log(1);\n${"```"}\n${"````"}\n`), 1, "nested fences are not supported");
  expects(rules(`${README}\n${"```"}text\na line with ${"```"} in the middle\n${"```"}\n`), 0);
});

test("static: a fence indented with a tab, in a list item or a blockquote, is refused, not skipped", () => {
  const throwing = 'throw new Error("boom");';
  expects(rules(`${README}\n- Clean up:\n\t${"```"}ts\n\t${throwing}\n\t${"```"}\n`), 1, "README.md:", "indented with a tab");
  expects(rules(`${README}\n>\t${"```"}ts\n>\t${throwing}\n>\t${"```"}\n`), 1, "inside a blockquote");
  expects(rules(`${README}\n  \t${"```"}ts\n`), 1, "indented with a tab");
  expects(rules(`${README}\n1.\t${"```"}ts\n`), 1, "on a list-item line");
  expects(rules(`${README}\n>  > ${"~~~"}ts\n`), 1, "inside a blockquote");
  expects(rules(`${README}\n\t${"```"}ts\n`), 1, "indented with a tab");
  expects(rules(`${README}\nText with a tab\tand ${"```"}inline${"```"} code.\n`), 0);
});

test("static: a fence inside a blockquote or on a list-item line is refused, not skipped", () => {
  const throwing = '> ```ts\n> throw new Error("boom");\n> ```\n';
  expects(rules(`${README}\n${throwing}`), 1, "README.md:", "a fence inside a blockquote, on a list-item line");
  expects(rules(`${README}\n> quoted\n>\n>~~~ts\n>throw new Error("boom");\n>~~~\n`), 1, "inside a blockquote");
  expects(rules(`${README}\n- ${"```"}ts\n`), 1, "on a list-item line");
  expects(rules(`${README}\n1. ${"```"}ts\n`), 1, "on a list-item line");
  expects(rules(`${README}\n> - ${"```"}ts\n`), 1, "inside a blockquote");
  expects(rules(`${README}\n- item\n\n  ${"```"}ts\n  console.log(1);\n  ${"```"}\n`), 0); // indented under a list item: extracted, fine
});

test("static: the guide is listed recursively, and a doc in another format is refused", () => {
  const root = (files) => tree({ "README.md": README, "bindings/node/README.md": NODE_README, "docs/guide/recipes.md": GUIDE, ...files });
  expects(cli(["--static", "--root", root({ "docs/guide/deeper/more.md": `# m\n\n${fence("python", "x = 1")}` })]), 1, "docs/guide/deeper/more.md:3", 'says "python"');
  expects(cli(["--static", "--root", root({ "docs/guide/extra.mdx": "# x\n" })]), 1, "docs/guide/extra.mdx", "does not read");
});

test("an argument the check does not know, or a flag without its value, exits 2", () => {
  expects(cli(["--staic", "--root", repo]), 2, "unknown argument --staic");
  expects(cli(["--static", "--root"]), 2, "--root needs a value");
  expects(cli(["--static", "--timeout-ms", "--root", repo]), 2, "--timeout-ms needs a value");
});

test("an input that cannot be read exits 2", () => {
  expects(cli(["--static", "--root", tree({ "docs/guide/recipes.md": GUIDE })]), 2, "README.md");
  expects(cli(["--static", "--root", tree({ "README.md": README })]), 2, "docs/guide");
  expects(cli(["--static", "--root", tree({ "README.md": README, "docs/guide/notes.txt": "x" })]), 2, "EMPTY");
  expects(cli(["--static", "--root", tree({ "README.md": "# no code\n", "bindings/node/README.md": "# none\n", "docs/guide/recipes.md": "# none\n" })]), 2, "no code block found");
  expects(cli(["--static", "--root", tree({ "README.md": README, "docs/guide/recipes.md": GUIDE })]), 2, "bindings/node/README.md");
  expects(cli(["--static", "--timeout-ms", "soon", "--root", repo]), 2, "--timeout-ms");
});

/** The blocks of `source` (a markdown string whose first block is TypeScript) run for real against this repository. */
const real = (source, timeoutMs = 60_000, env = process.env) => {
  const dir = tree({ "doc.md": source });
  return cli(["--root", repo, "--timeout-ms", String(timeoutMs), join(dir, "doc.md")], { timeout: 1_900_000, env });
};

test("run: blocks that pass do pass (hugr-omni resolves, `await using` compiles and disposes)", () => {
  const got = real(
    [
      fence("ts", 'import { run } from "hugr-omni";', 'const r = await run("node", ["-e", "console.log(6 * 7)"]);', "if (!r.success || String(r.stdout).trim() !== '42') throw new Error('bad');"),
      fence("ts", "let disposed = false;", "{ await using x = { async [Symbol.asyncDispose]() { disposed = true; } }; }", "if (!disposed) throw new Error('not disposed');"),
    ].join("\n"),
  );
  expects(got, 0, "OK", "ran: ts 2");
});

test("run: a block may use `process` and `node:*`, as in a reader's project (the Node types are installed)", () => {
  const got = real(fence("ts", 'import { tmpdir } from "node:os";', "const path: string | undefined = process.env.PATH;", "console.log(typeof path, tmpdir());"));
  expects(got, 0, "OK", "ran: ts 1");
});

test("run: a block that throws fails and names file:line", () => {
  expects(real(`# d\n\n${fence("ts", "console.log(1);", "throw new Error('boom');")}`), 1, "doc.md:3", "exited 1", "boom");
});

test("run: a type error fails and names the line of the code", () => {
  expects(real(`# d\n\n${fence("ts", "const n: number = 1;", 'const s: string = n;')}`), 1, "TypeScript refused", "doc.md:5");
});

test("run: a block that hangs fails by its deadline", () => {
  expects(real(fence("ts", "setInterval(() => {}, 1000);"), 3_000), 1, "did not finish in 3000 ms");
});

test("run: a block that leaves its dev server running fails and the leftover is ended", () => {
  const leaves = fence(
    "ts",
    'const { spawn } = await import("node:child_process" as string);',
    'const { existsSync, readFileSync } = await import("node:fs" as string);',
    'spawn(process.execPath, ["dev.js"], { stdio: "ignore", detached: true }).unref();',
    'while (!existsSync("dev.pid") || !readFileSync("dev.pid", "utf8").trim()) await new Promise((r) => setTimeout(r, 20));',
  ).replace("process.execPath", '(globalThis as any).process.execPath');
  expects(real(leaves), 1, "left running: dev.pid");
});

test("run: a Rust block that panics, and one that does not build, fail", () => {
  expects(real(`${fence("ts", "console.log(1);")}\n${DEPS}\n${fence("rust", "fn main() { panic!(\"boom\"); }")}`), 1, "doc.md:", "rust block exited 101");
  expects(real(`${fence("ts", "console.log(1);")}\n${DEPS}\n${fence("rust", "fn main() { let x: u8 = \"s\"; }")}`), 1, "the rust block does not build");
});

test("run: a tilde-fenced block is run like a backtick one, and its failure fails", () => {
  expects(real("# d\n\n~~~ts\nthrow new Error('boom');\n~~~\n"), 1, "doc.md:3", "exited 1", "boom");
});

test("run: a ts block after a text block closed by four backticks is extracted, run, and fails", () => {
  const doc = `# d\n\n${"```"}ts\nconsole.log(1);\n${"```"}\n\n${"```"}text\ntimeout false\n${"````"}\n\n${"```"}ts\nthrow new Error("boom");\n${"```"}\n`;
  expects(real(doc), 1, "doc.md:11", "exited 1", "boom");
});

test("run: every sh block runs: a failing command fails, a passing one passes, a missing program exits 2", () => {
  expects(real(fence("sh", "node --no-such-flag")), 1, "the sh block's `node --no-such-flag` exited");
  expects(real(fence("sh", "node --version", "node --version")), 0, "ran: ts 0, rust 0, sh 1");
  expects(real(fence("sh", "no-such-program-hugr --x")), 2, "no-such-program-hugr: cannot be started");
});

const exe = process.platform === "win32" ? ".exe" : "";
const HELLO = fence(
  "rust",
  "use hugr_omni::Command;",
  "#[tokio::main]",
  "async fn main() -> Result<(), hugr_omni::Error> {",
  '    let out = Command::new("node").args(["--version"]).run().await?;',
  "    assert!(out.exit.success());",
  "    Ok(())",
  "}",
);

test("run: the Rust example runs on the README's steps alone: with its supervisor build it passes, without it fails, whatever the environment says", () => {
  // The debug supervisor of this checkout is in the environment and in target/debug, and must not be used.
  const debug = join(process.env.CARGO_TARGET_DIR ?? join(repo, "target"), "debug", `hugr-omni-supervisor${exe}`);
  const env = { ...process.env, HUGR_OMNI_SUPERVISOR: debug };
  const ts = fence("ts", "console.log(1);");
  expects(real(`${ts}\n${DEPS}\n${fence("sh", "cargo build --release -p omni-supervisor")}\n${HELLO}`, 60_000, env), 0, "ran: ts 1, rust 1, sh 1");
  expects(real(`${ts}\n${DEPS}\n${HELLO}`, 60_000, env), 1, "the rust block exited", "no sh block of the docs built target/release/hugr-omni-supervisor");
});

test("run: the Rust example is built with the README's own tokio features, so one the README forgot fails the build", () => {
  const ts = fence("ts", "console.log(1);");
  const noMacros = fence("toml", "[dependencies]", `hugr-omni = { git = "${GIT}" }`, 'tokio = { version = "1", features = ["rt-multi-thread"] }');
  expects(real(`${ts}\n${noMacros}\n${HELLO}`), 1, "the rust block does not build");
});

test("run: a pid file that is not a pid cannot be proven gone, and fails", () => {
  const writes = fence("ts", 'const { writeFileSync } = await import("node:fs" as string);', 'writeFileSync("dev.pid", "banana");');
  expects(real(writes), 1, "cannot be proven that it left nothing running", "dev.pid (not a pid)");
});

test("survivors: a pid the inspection cannot answer for, or that is not a pid, is not proven gone", () => {
  const dir = tree({ "a.pid": "4242\n", "b.pid": "banana\n", "c.pid": "0\n" });
  const got = survivors(dir, () => {
    throw new Error("boom");
  });
  assert.deepEqual(got.running, []);
  assert.equal(got.unknown.length, 3, JSON.stringify(got));
  assert.ok(got.unknown.some((u) => u.includes("pid 4242: cannot be inspected: boom")), JSON.stringify(got));
  assert.ok(got.unknown.some((u) => u.includes("b.pid (not a pid)")) && got.unknown.some((u) => u.includes("c.pid (not a pid)")), JSON.stringify(got));
});

test("isAlive: a reaped pid is gone and this process is alive", () => {
  const reaped = spawnSync(process.execPath, ["-e", "0"]).pid;
  assert.equal(isAlive(reaped), false);
  assert.equal(isAlive(process.pid), true);
});

/** The `stat` of `pid` as `ps` prints it (empty when there is no such process). */
const stat = (pid) => spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();

test("survivors: a zombie is not a leak, a live process is", { skip: process.platform === "win32" && "Windows has no zombies" }, async () => {
  // `sh` forks `sleep 0`, then becomes `sleep 30`, which never reaps it: an exited, unreaped child.
  const parent = spawn("sh", ["-c", "sleep 0 & echo $!; exec sleep 30"], { stdio: ["ignore", "pipe", "ignore"] });
  try {
    const zombie = Number(await new Promise((resolve) => parent.stdout.once("data", (d) => resolve(String(d).trim()))));
    const deadline = Date.now() + 10_000;
    while (!stat(zombie).startsWith("Z")) {
      assert.ok(Date.now() < deadline, `pid ${zombie} never became a zombie (stat "${stat(zombie)}")`);
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.doesNotThrow(() => process.kill(zombie, 0), "kill(pid, 0) succeeds on a zombie: the false leak this guards against");
    assert.equal(isAlive(zombie), false);
    const dir = tree({ "zombie.pid": `${zombie}\n` });
    assert.deepEqual(survivors(dir), { running: [], unknown: [] });
    writeFileSync(join(dir, "live.pid"), `${parent.pid}\n`);
    const got = survivors(dir);
    assert.deepEqual(got.unknown, []);
    assert.equal(got.running.length, 1, JSON.stringify(got));
    assert.ok(got.running[0].includes(`pid ${parent.pid}`), JSON.stringify(got));
  } finally {
    parent.kill("SIGKILL");
  }
});
