// A scenario file (DSL: conformance/SPEC.md), parsed and fully validated before it runs, so a mistake fails loudly,
// never vacuously and never hidden behind a product failure: the schema of every step (`schema.mjs`) and what the
// steps require of each other (handles and `${variables}` defined before use, valid combinations per action).

import { pattern } from "./pattern.mjs";
import { step as checkStep } from "./schema.mjs";

/** The 10 actions and the extra keys each accepts (every step may also set `timeoutMs`). */
const ACTIONS = {
  run: ["options", "as", "await", "expect"],
  spawn: ["options", "as", "expect"],
  write: ["data", "close", "expect"],
  read: ["lines", "until", "detach", "capture", "expect"],
  wait: ["expect"],
  stop: ["graceMs", "expect"],
  abort: [],
  resize: ["cols", "rows", "expect"],
  processes: ["capture", "expect"],
  os: ["pids", "withinMs"],
};
const OSES = ["linux", "macos", "windows"];
const LANGS = ["rust", "ts", "py"];
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** The step's action name and value; any other key must be one this action accepts. */
export function action(step) {
  if (!isObject(step)) throw new Error("a step must be an object");
  const found = Object.keys(step).filter((k) => Object.hasOwn(ACTIONS, k));
  if (found.length !== 1) throw new Error("a step needs exactly one action");
  const [name] = found;
  const stray = Object.keys(step).find((k) => k !== name && k !== "timeoutMs" && !ACTIONS[name].includes(k));
  if (stray !== undefined) throw new Error(`\`${name}\` does not take \`${stray}\``);
  return [name, step[name]];
}

/** A parsed, validated scenario: `json` is the file, `applies(os, lang)` whether it is meant for this OS and language. */
export class Scenario {
  /** Parses and validates `text`; `stem` is its file name without `.json`, which must equal the id. Throws a message. */
  constructor(text, stem) {
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`bad JSON: ${e.message}`);
    }
    if (!isObject(json)) throw new Error("bad JSON: a scenario is an object");
    const stray = Object.keys(json).find((k) => !["id", "os", "langs", "files", "steps"].includes(k));
    if (stray !== undefined) throw new Error(`unknown key ${stray}`);
    if (typeof json.id !== "string") throw new Error("missing id");
    if (json.id !== stem || !pattern("^C-[A-Z]+-\\d\\d\\.[a-z0-9-]+$").test(json.id)) {
      throw new Error(`id ${JSON.stringify(json.id)} must be \`<item>.<name>\` and equal the file name`);
    }
    for (const [key, allowed] of [["os", OSES], ["langs", LANGS]]) {
      const list = json[key];
      if (list === undefined) continue;
      if (!Array.isArray(list)) throw new Error(`${key} must be a list`);
      if (list.length === 0 || !list.every((x) => allowed.includes(x))) {
        throw new Error(`${key} must list some of ${JSON.stringify(allowed)}`);
      }
    }
    const names = new Names();
    names.files(json.files);
    if (!Array.isArray(json.steps) || json.steps.length === 0) throw new Error("missing steps");
    json.steps.forEach((s, i) => {
      let name;
      try {
        let target;
        [name, target] = action(s);
        names.step(name, target, s);
      } catch (e) {
        throw new Error(`step ${i}${name ? ` (${name})` : ""}: ${e.message}`);
      }
    });
    this.json = json;
  }

  applies(os, lang) {
    const has = (key, me) => this.json[key] === undefined || this.json[key].includes(me);
    return has("os", os) && has("langs", lang);
  }

  /** `files`: name -> text, created under `${TMP}` before the first step. */
  files() {
    return Object.entries(this.json.files ?? {});
  }

  steps() {
    return this.json.steps;
  }
}

/** The handles and variables defined so far, and what each step requires of the earlier ones. */
class Names {
  constructor() {
    this.handles = new Map(); // name -> "pipe" | "pty" | "run" (a `run` with `await: false`: only `wait` takes it)
    this.vars = new Set(["FIXTURE", "TMP", "EXE"]);
  }

  /** `files`: name -> text, both may use only the built-in variables (they exist before step 0). */
  files(files) {
    if (files === undefined) return;
    if (!isObject(files)) throw new Error("`files` must be an object of name -> text");
    for (const [name, content] of Object.entries(files)) {
      if (name === "" || typeof content !== "string") {
        throw new Error(`files: ${JSON.stringify(name)} must be a non-empty name with text, not ${JSON.stringify(content)}`);
      }
      this.varsIn(name);
      this.varsIn(content);
    }
  }

  /** Checks step `s` (action `name`, value `target`) against the earlier steps, then records what it defines. */
  step(name, target, s) {
    checkStep(name, target, s);
    const has = (k) => k in s;
    const kind = typeof target === "string" ? this.handles.get(target) : undefined;
    const child = kind === "pipe" || kind === "pty";
    const closes = s.close ?? !has("data");
    const required =
      name === "run" && has("as") !== (s.await === false) ? "`as` goes with `await: false`, and only with it"
      : name === "write" && !child ? "needs an earlier spawned child"
      // SPEC: `write` without `data` only closes stdin.
      : name === "write" && !has("data") && s.close === false ? "without `data` it closes stdin"
      : name === "write" && closes && kind === "pty" ? "closes stdin, which a terminal does not have"
      : ["read", "stop", "processes"].includes(name) && !child ? "needs an earlier spawned child"
      : name === "read" && !has("until") ? "needs `until`"
      : name === "wait" && kind === undefined ? "needs an earlier spawned child or `run` with `await: false`"
      : name === "resize" && kind !== "pty" ? "needs an earlier spawned terminal child (`pty`)"
      : name === "resize" && (!has("cols") || !has("rows")) ? "needs `cols` and `rows`"
      : name === "resize" && (s.cols > 65535 || s.rows > 65535) ? "`cols` and `rows` must fit 16 bits"
      : name === "os" && !has("pids") ? "needs `pids`"
      : undefined;
    if (required !== undefined) throw new Error(`\`${name}\` ${required}`);
    for (const [key, v] of Object.entries(s)) {
      if (key === "expect") continue;
      try {
        this.varsIn(v);
      } catch (e) {
        throw new Error(`${key}: ${e.message}`);
      }
    }
    this.define(name, s);
    try {
      if (has("expect")) this.varsIn(s.expect);
    } catch (e) {
      throw new Error(`expect: ${e.message}`);
    }
  }

  define(name, s) {
    if (typeof s.as === "string") {
      const kind = name === "run" ? "run" : s.options?.pty !== undefined && s.options.pty !== false ? "pty" : "pipe";
      this.handles.set(s.as, kind);
      if (kind !== "run") this.vars.add(`${s.as}.pid`);
    }
    if (typeof s.capture === "string") this.vars.add(s.capture);
    else if (isObject(s.capture)) Object.keys(s.capture).forEach((k) => this.vars.add(k));
  }

  /** Every `${name}` in `v` names a variable defined so far. */
  varsIn(v) {
    if (typeof v === "string") {
      for (const m of v.matchAll(/\$\{([^}]*)\}/g)) {
        if (!this.vars.has(m[1])) throw new Error(`\${${m[1]}} is not defined by an earlier step`);
      }
      if (/\$\{[^}]*$/.test(v)) throw new Error(`unclosed \${ in ${JSON.stringify(v)}`);
    } else if (Array.isArray(v)) {
      v.forEach((x) => this.varsIn(x));
    } else if (isObject(v)) {
      Object.values(v).forEach((x) => this.varsIn(x));
    }
  }
}
