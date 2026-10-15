// C-DOC-01: every code block of the docs runs, and the docs lead with TypeScript.
//
// Scope: these checks catch honest drift by our own contributors (a renamed option, a forgotten README update, a binding
// that starts spawning), not an adversary deliberately evading them.
//
// Reads README.md, bindings/node/README.md (the npm package's page) and every .md under docs/guide (or the files named on
// the command line), extracts their fenced blocks (blocks.mjs),
// checks the rules that need no execution (each block names its language, each quickstart is at most 10 lines, the README
// has one `ts quickstart` and one `rust quickstart`, the first `ts` or `rust` block of every file is TypeScript, a `sh`
// block holds only simple commands, no unsupported fence form) and, unless `--static`, runs every `ts`, `rust` and `sh`
// block (run.mjs). Not run: `text` blocks (sample output) and, until the release publishes the package, exactly the
// install line(s) of the Install block of the two READMEs (PRE_RELEASE_INSTALL), each printed as "not run (pre-release install)".
//
//   node scripts/readme-check/check.mjs [--root <where the docs are>] [--repo <the checkout they run against>]
//        [--timeout-ms <per block, default 120000>] [--static] [files...]
// `--root` (default: this repository) is where README.md, docs/guide and relative file names are; `--repo` (default:
// this repository) holds bindings/node, crates/ and target/, which the blocks run against.
//
// Needs for the run: Node 22+, npm and network once (TypeScript and @types/node are cached), cargo and the repository's toolchain, git,
// and the repository built: `cargo build --workspace --bins` and `cargo build -p hugr-omni-node`.
// Only the two READMEs above and docs/guide are checked: the other READMEs (qa/, bindings/node/npm/) are maintainers' build notes whose
// commands are the CI's own. An unknown flag, or a flag without its value, is refused.
// Exit: 0 every block ran · 1 a rule or a block failed (each names file:line) · 2 an input or a tool is missing, or a bad argument.

import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commands, extract, isPreReleaseInstall, isRun, validate } from "./blocks.mjs";
import { Unrunnable, runBlocks } from "./run.mjs";

const here = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The command line, strictly: an unknown flag, or a flag without its value, is refused instead of ignored. */
function parseArgs(argv) {
  const opts = { root: here, repo: here, timeoutMs: 120_000, static: false, files: [] };
  const valued = { "--root": "root", "--repo": "repo", "--timeout-ms": "timeoutMs" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a in valued) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Unrunnable(`${a} needs a value`);
      opts[valued[a]] = a === "--timeout-ms" ? Number(v) : resolve(v);
    } else if (a === "--static") opts.static = true;
    else if (a.startsWith("--")) throw new Unrunnable(`unknown argument ${a} (known: ${[...Object.keys(valued), "--static"].join(", ")})`);
    else opts.files.push(a);
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) throw new Unrunnable("--timeout-ms must be a positive number");
  return opts;
}

/** The files under `dir` (relative to `root`): the `.md` docs, and a violation for each doc in a format this check does not read. */
function guideFiles(root, dir, violations) {
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch (e) {
    throw new Unrunnable(`${dir}: cannot be listed (${e.code ?? e.message})`);
  }
  const docs = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) docs.push(...guideFiles(root, path, violations));
    else if (e.name.endsWith(".md")) docs.push(path);
    else if (/\.(markdown|mdx|html?)$/i.test(e.name)) violations.push(`${path}: a doc in a format this check does not read; write it as .md`);
  }
  return docs;
}

/** The `repository` of `[workspace.package]` in the checkout's Cargo.toml: the git URL the docs' `toml` blocks must name. */
function repositoryUrl(repo) {
  let lines;
  try {
    lines = readFileSync(join(repo, "Cargo.toml"), "utf8").replace(/\r\n/g, "\n").split("\n");
  } catch (e) {
    throw new Unrunnable(`Cargo.toml: cannot be read (${e.code ?? e.message})`);
  }
  const start = lines.findIndex((l) => l.trim() === "[workspace.package]");
  const end = lines.findIndex((l, i) => i > start && l.startsWith("["));
  const section = start < 0 ? "" : lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
  const url = /^repository\s*=\s*"([^"\n]+)"/m.exec(section)?.[1];
  if (!url) throw new Unrunnable("Cargo.toml: no `repository` under [workspace.package] (the git URL the docs' toml blocks must name)");
  return url;
}

function main() {
  const { root, repo, timeoutMs, files, static: staticOnly } = parseArgs(process.argv.slice(2));
  const violations = [];
  let docs = files;
  if (docs.length === 0) {
    const guide = guideFiles(root, "docs/guide", violations);
    if (guide.length === 0) throw new Unrunnable("docs/guide: no .md file found (the guide came back EMPTY)");
    docs = ["README.md", "bindings/node/README.md", ...guide];
  }
  const blocks = [];
  for (const doc of docs) {
    let text;
    try {
      text = readFileSync(isAbsolute(doc) ? doc : join(root, doc), "utf8");
    } catch (e) {
      throw new Unrunnable(`${doc}: cannot be read (${e.code ?? e.message})`);
    }
    const found = extract(text, doc);
    blocks.push(...found.blocks);
    violations.push(...found.violations);
  }
  if (blocks.length === 0) throw new Unrunnable(`${docs.join(", ")}: no code block found (the extraction came back EMPTY)`);
  violations.push(...validate(blocks, docs, "README.md", repositoryUrl(repo)));
  const toRun = blocks.filter(isRun);
  const skipped = blocks.filter(isPreReleaseInstall).flatMap((b) => commands(b.code).map((c) => c.line));
  const executed = violations.length === 0 && !staticOnly;
  if (executed) {
    violations.push(...runBlocks(toRun, { repo, timeoutMs, cache: process.env.HUGR_README_CHECK_CACHE ?? join(tmpdir(), "hugr-omni-readme-check-ts5") }));
  }
  const count = (lang) => toRun.filter((b) => b.lang === lang).length;
  const ran = executed ? `ts ${count("ts")}, rust ${count("rust")}, sh ${count("sh")}` : "none (static rules only)";
  const text = blocks.filter((b) => b.lang === "text").length;
  const toml = blocks.filter((b) => b.lang === "toml").length;
  const note = `${blocks.length} blocks in ${docs.length} files; ran: ${ran}; not run: text ${text}, toml ${toml} (the rust blocks' dependencies), pre-release install lines ${skipped.length}`;
  return { violations, note, skipped };
}

try {
  const { violations, note, skipped } = main();
  const show = violations.length > 0 ? console.error : console.log;
  if (violations.length > 0) {
    for (const v of violations) console.error(`readme-check: FAIL ${v}`);
    console.error(`readme-check: ${violations.length} failure(s); ${note}`);
  } else console.log(`readme-check: OK, ${note}`);
  for (const line of skipped) show(`readme-check: not run (pre-release install): ${line}`);
  if (violations.length > 0) process.exit(1);
} catch (e) {
  console.error(`readme-check: CANNOT RUN ${e instanceof Unrunnable ? e.message : (e?.stack ?? e)}`);
  process.exit(2);
}
