// Fenced code blocks of the docs, and the rules about them that need no execution (C-DOC-01).
//
// Scope: these checks catch honest drift by our own contributors (a renamed option, a forgotten README update, a binding
// that starts spawning), not an adversary deliberately evading them.
//
// Fences follow CommonMark (what GitHub renders): an opening fence is three or more backticks or tildes with at most three
// spaces of indentation and an info string (for backticks, without a backtick): `ts`, `rust`, `sh`, `toml` or `text`, then
// optionally `quickstart`. The closing fence uses the same character, is at least as long as the opening one and has at
// most three spaces of indentation; a fence never closed runs to the end of the document (and is a violation here).
// `ts`, `rust` and `sh` blocks are run by run.mjs; `text` (sample output) is listed, not run; a `toml` block gives the
// `[dependencies]` of the `rust` blocks after it (the nearest one before each), which run.mjs builds them with, swapping
// the `git` URL of hugr-omni for the local checkout. A fence with no language, or another one, is a violation: a block
// must say what it is, so none hides from the runner.
//
// A `sh` block holds simple commands, one per line (`program arg arg`, optional `# comment`): no shell is involved, so no
// pipe, variable, quote or redirect. It is checked here and run by run.mjs, with one exception, which the lead removes at
// the release: the install line(s) of the `## Install` block of README.md and bindings/node/README.md may stay
// unexecuted while the package is not published (PRE_RELEASE_INSTALL, matched literally; any other line in that block
// makes the whole block run).
//
// So that every fence-shaped line of a document is accounted for, a line that looks like a fence is either an extracted
// opener, an extracted closer, or a violation: outside a block, one that is not a valid opener (in a blockquote or on a
// list-item line, indented four or more spaces or with a tab, with a backtick in its info string); inside a block, any
// fence-shaped line that is not the closer (a nested fence would hide what follows). An indented code block (four spaces
// or a tab after a blank line) and an HTML `<pre>` are violations too.

export const RUNNABLE = new Set(["ts", "rust"]);
const LANGS = new Set(["ts", "rust", "sh", "toml", "text"]);
export const QUICKSTART_LINES = 10;
/** The only `sh` lines allowed not to run (README.md, under `## Install`) until the release publishes the package. */
export const PRE_RELEASE_INSTALL = ["npm install hugr-omni", "bun add hugr-omni", "deno add npm:hugr-omni"];

/** The commands of a `sh` block: each non-blank line without its `# comment`, as `{ line, argv }`; `argv` is null when
 *  the line is not a simple command (it holds a character a shell would interpret). */
export function commands(code) {
  return code
    .split("\n")
    .map((raw) => raw.replace(/(^|\s)#.*$/, "").trim())
    .filter((line) => line !== "")
    .map((line) => {
      const argv = line.split(/\s+/);
      const simple = /^[A-Za-z0-9_./:@+-]+$/.test(argv[0]) && argv.every((a) => /^[A-Za-z0-9_./:@+=,-]+$/.test(a));
      return { line, argv: simple ? argv : null };
    });
}

/** Is `b` the pre-release install block: README.md or bindings/node/README.md, under `## Install`, with no line but the literal install lines? */
export function isPreReleaseInstall(b) {
  const readme = b.file === "README.md" || b.file === "bindings/node/README.md";
  const lines = b.lang === "sh" ? commands(b.code) : [];
  return readme && b.heading === "Install" && lines.length > 0 && lines.every((c) => PRE_RELEASE_INSTALL.includes(c.line));
}

/** The blocks run.mjs runs: `ts`, `rust`, and every `sh` block that is not the pre-release install. */
export const isRun = (b) => RUNNABLE.has(b.lang) || (b.lang === "sh" && !isPreReleaseInstall(b));

const OPENER = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CLOSER = /^ {0,3}(`{3,}|~{3,}) *$/;
/** What a fence looks like once blockquote markers, list markers, spaces and tabs are set aside. */
const SHAPED = /^(?:[ \t]|>|(?:[-*+]|\d+[.)])(?=[ \t]))*(`{3,}|~{3,})/;

/** The fenced blocks of `text` (the contents of `file`): `{ file, line, lang, attrs, heading, code, deps }`, `line` of the opening fence; `deps` (rust blocks) is the code of the nearest `toml` block before it, or null. */
export function extract(text, file) {
  const blocks = [];
  const violations = [];
  let open = null;
  let heading = null;
  let blank = true;
  text.replace(/\r\n/g, "\n").split("\n").forEach((raw, i) => {
    const where = `${file}:${i + 1}`;
    if (open === null) {
      const fence = OPENER.exec(raw);
      if (fence && !(fence[1][0] === "`" && fence[2].includes("`"))) {
        const [lang = "", ...attrs] = fence[2].trim().split(/\s+/).filter(Boolean);
        open = { file, line: i + 1, lang, attrs, heading, indent: /^ */.exec(raw)[0].length, marker: fence[1], code: [] };
      } else {
        if (SHAPED.test(raw)) {
          violations.push(`${where}: a fence inside a blockquote, on a list-item line, indented with a tab or four or more spaces, or with a backtick in its info string, is not a fence this reader extracts (it would not be run); put it on its own lines, indented three spaces at most`);
        }
        const h = /^## (.+?)\s*$/.exec(raw);
        if (h) heading = h[1];
        if (blank && /^(\t| {4})/.test(raw) && raw.trim() !== "") violations.push(`${where}: an indented code block is not supported (it would not be run); use a fence`);
        if (/<pre[\s>]/i.test(raw)) violations.push(`${where}: an HTML <pre> block is not supported (it would not be run); use a fence`);
      }
      blank = raw.trim() === "";
    } else {
      const close = CLOSER.exec(raw);
      if (close && close[1][0] === open.marker[0] && close[1].length >= open.marker.length) {
        blocks.push({ file, line: open.line, lang: open.lang, attrs: open.attrs, heading: open.heading, code: open.code.join("\n") });
        open = null;
        blank = false;
      } else {
        if (SHAPED.test(raw)) violations.push(`${where}: a fence-shaped line inside the code block opened at line ${open.line}; nested fences are not supported (they would hide what follows)`);
        open.code.push(raw.startsWith(" ".repeat(open.indent)) ? raw.slice(open.indent) : raw);
      }
    }
  });
  if (open !== null) violations.push(`${file}:${open.line}: the code block is never closed (a fence runs to the end of the document)`);
  let toml = null;
  for (const b of blocks) {
    if (b.lang === "toml") toml = b.code;
    if (b.lang === "rust") b.deps = toml;
  }
  return { blocks, violations };
}

/** What is wrong with the `[dependencies]` a `toml` block gives a `rust` block (nothing when it is fine); `repository` is the canonical git URL. */
function dependencyProblems(toml, repository) {
  const lines = toml.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
  const out = [];
  if (lines[0] !== "[dependencies]") out.push("must start with `[dependencies]`");
  if (lines.some((l, i) => i > 0 && l.startsWith("["))) out.push("must hold only the `[dependencies]` table");
  const dep = /^hugr-omni\s*=\s*\{[^}\n]*\bgit\s*=\s*"([^"\n]+)"[^}\n]*\}$/m.exec(toml.replace(/^[ \t]+/gm, ""));
  if (!dep) out.push('must give hugr-omni as one inline table with a git URL: `hugr-omni = { git = "https://..." }`');
  else if (dep[1] !== repository) out.push(`names the git URL ${dep[1]}, not the repository of Cargo.toml (${repository})`);
  return out;
}

/**
 * The rules that need no execution. `readme` is the path of the root README: it must hold exactly one `ts quickstart`
 * and one `rust quickstart`; in every file the first `ts` or `rust` block is TypeScript (the docs lead with it).
 * `repository` is the `repository` of the root Cargo.toml: the git URL the `toml` blocks must name.
 */
export function validate(blocks, files, readme, repository) {
  const out = [];
  for (const b of blocks) {
    const where = `${b.file}:${b.line}`;
    if (!LANGS.has(b.lang)) out.push(`${where}: the code block says "${b.lang}", not one of ${[...LANGS].join(", ")}`);
    for (const a of b.attrs) {
      if (a !== "quickstart") out.push(`${where}: unknown attribute "${a}" after the language`);
      else if (!RUNNABLE.has(b.lang)) out.push(`${where}: only a ts or rust block can be a quickstart`);
    }
    if (b.code.trim() === "") out.push(`${where}: the code block is empty`);
    const lines = b.code.split("\n").length;
    if (b.attrs.includes("quickstart") && lines > QUICKSTART_LINES) out.push(`${where}: the ${b.lang} quickstart has ${lines} lines; the limit is ${QUICKSTART_LINES}`);
    if (b.lang === "rust") {
      if (b.deps === null || b.deps === undefined) out.push(`${where}: a rust block needs a toml block before it that gives its [dependencies]`);
      else for (const problem of dependencyProblems(b.deps, repository)) out.push(`${where}: the toml block before it ${problem}`);
    }
    if (b.lang === "sh" && !isPreReleaseInstall(b)) {
      for (const c of commands(b.code)) {
        if (c.argv === null) out.push(`${where}: \`${c.line}\` is not a simple command; a sh block runs one \`program arg arg\` per line, with no shell`);
      }
    }
  }
  for (const file of files) {
    const first = blocks.find((b) => b.file === file && RUNNABLE.has(b.lang));
    if (first && first.lang !== "ts") out.push(`${file}:${first.line}: the first runnable block is ${first.lang}; the docs lead with TypeScript`);
    if (file === readme) {
      for (const lang of ["ts", "rust"]) {
        const n = blocks.filter((b) => b.file === file && b.lang === lang && b.attrs.includes("quickstart")).length;
        if (n !== 1) out.push(`${file}: has ${n} \`${lang} quickstart\` blocks; it needs exactly one`);
      }
    }
  }
  return out;
}
