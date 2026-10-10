// `expect`: every listed field must match (SPEC "Expectations"); a field the step does not produce fails.
// A mismatch is a `product` failure; a malformed expectation is a `harness` failure.

import { hexBytes } from "./schema.mjs";
import { pattern } from "./pattern.mjs";

/**
 * Why a step failed. Only `product` (the library's outcome differs from the expectation) may count as pending; a
 * `harness` failure (malformed scenario, unknown variable, runner or OS-oracle error) always fails the suite. Anything
 * thrown that is not a `Fail` is treated as `harness` (see `kindOf`), so an unclassified failure fails closed.
 */
export class Fail extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }

  /** The same kind of failure, with `where` in front of the message. */
  at(where) {
    return new Fail(this.kind, `${where}: ${this.message}`);
  }
}
export const product = (message) => new Fail("product", message);
export const harness = (message) => new Fail("harness", message);

/** Any thrown value as a `Fail`: a plain `Error` is the runner's own message; any other error is a bug, with its stack. */
export const asFail = (e) => {
  if (e instanceof Fail) return e;
  return harness(e instanceof Error ? (e.constructor === Error ? e.message : (e.stack ?? e.message)) : String(e));
};

const utf8 = new TextEncoder();
const lossy = new TextDecoder("utf-8", { ignoreBOM: true });
export const bytesOf = (data) => (typeof data === "string" ? utf8.encode(data) : data);
const isBytes = (v) => v instanceof Uint8Array;
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The fields of an `Exit`, as the scenarios name them. */
export const exitFields = (e) => ({ exitCode: e.exitCode, signal: e.signal, reason: e.reason, success: e.success });
/** The fields of a `RunResult`. */
export const runFields = (r) => ({ ...exitFields(r), stdout: r.stdout, stderr: r.stderr });

/** `{ error }` for an `OmniError`, so a step can expect it; anything else thrown by the library is the product's failure. */
export function failure(api, e) {
  if (e instanceof api.OmniError) return { error: e };
  throw product(`the library threw ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}, not an OmniError`);
}

const describe = (e) => `${e.code} (${e.message})`;
const json = (v) => JSON.stringify(v, (_, x) => (isBytes(x) ? `<${x.length} bytes>` : x));

/** Checks `want` (the step's `expect`) against `outcome` (`{ fields }` or `{ error }`); `elapsedMs` is the step's own time. */
export function check(want, outcome, elapsedMs) {
  if (want === null || typeof want !== "object") throw harness("`expect` must be an object");
  if (outcome.error && !("error" in want)) throw product(`unexpected error ${describe(outcome.error)}`);
  if ("error" in want && !outcome.error) throw product(`expected error ${json(want.error)}, got success`);
  for (const [key, w] of Object.entries(want)) {
    if (key === "elapsedMs") {
      field("elapsedMs", w, elapsedMs);
    } else if (key === "error") {
      if (outcome.error.code !== w) throw product(`expected error ${w}, got ${describe(outcome.error)}`);
    } else if (key === "message") {
      const text = String(outcome.error.message);
      for (const part of Array.isArray(w) ? w : [w]) {
        if (!text.includes(part)) throw product(`message ${json(text)} lacks ${json(part)}`);
      }
    } else if (key === "result") {
      const r = outcome.error.result;
      if (r === undefined || r === null) throw product(`error ${describe(outcome.error)} carries no result`);
      fields(w, runFields(r), "result");
    } else {
      if (outcome.error) throw product(`${key} expected, got error ${describe(outcome.error)}`);
      if (!(key in outcome.fields)) throw harness(`${key}: not produced by this step`);
      field(key, w, outcome.fields[key]);
    }
  }
}

function fields(want, got, where) {
  for (const [key, w] of Object.entries(want)) {
    if (!(key in got)) throw harness(`${where}: ${key}: no such field`);
    try {
      field(key, w, got[key]);
    } catch (e) {
      throw e instanceof Fail ? e.at(where) : e;
    }
  }
}

const NUMERIC = ["lt", "lte", "gt", "gte"];
const TEXTUAL = ["contains", "regex", "length", "hex"];
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !isBytes(v);
const isText = (v) => typeof v === "string" || isBytes(v);
/** A matcher object: `{lt, lte, gt, gte}` (several may combine) or exactly one of `{contains, regex, length, hex}`. */
const isMatcher = (w) => {
  const ops = Object.keys(w);
  return (ops.length > 0 && ops.every((o) => NUMERIC.includes(o))) || (ops.length === 1 && TEXTUAL.includes(ops[0]));
};

/** One field: `w` is the matcher, `got` what the step produced (`undefined` matches nothing). */
function field(key, w, got) {
  const fail = () => product(`${key}: expected ${json(w)}, got ${isText(got) ? brief(got) : json(got)}`);
  if (Array.isArray(w)) {
    if (!Array.isArray(got) || !(key === "entries" ? entries(w, got) : pieces(w, got))) throw fail();
  } else if (isObject(w) && !isMatcher(w)) {
    if (!isObject(got)) throw fail();
    fields(w, got, key); // droppedBytes, pieces: per stream
  } else if (!matches(w, got)) {
    throw fail();
  }
}

/**
 * A scalar against its matcher. The expectation decides what it can match, and a value of any other kind never
 * does (a number is not `true`, and not `""`): null matches only null, a boolean or a number only itself, text or
 * `{contains, regex, length, hex}` only a string or bytes, `{lt, lte, gt, gte}` only a number.
 */
function matches(w, got) {
  if (w === null) return got === null;
  if (typeof w === "boolean" || typeof w === "number") return got === w;
  if (typeof w === "string") return isText(got) && sameBytes(utf8.encode(w), bytesOf(got));
  if (!isObject(w) || !isMatcher(w)) throw harness(`unknown matcher ${json(w)}`);
  if (Object.keys(w).every((o) => NUMERIC.includes(o))) return typeof got === "number" && bounds(w, got);
  return isText(got) && textual(Object.keys(w)[0], Object.values(w)[0], got);
}

/** `{ lt, lte, gt, gte }`: every bound holds. */
function bounds(w, got) {
  return Object.entries(w).every(([op, n]) => {
    if (typeof n !== "number") throw harness(`${op} wants a number, not ${json(n)}`);
    return op === "lt" ? got < n : op === "lte" ? got <= n : op === "gt" ? got > n : got >= n;
  });
}

/** `{contains}`, `{regex}`, `{length}` (characters of text, bytes of binary) or `{hex}` (raw bytes; UTF-8 for text). */
function textual(op, arg, got) {
  const text = typeof got === "string" ? got : lossy.decode(got);
  if (op === "contains") return text.includes(arg);
  if (op === "regex") return pattern(arg).test(text);
  if (op === "hex") return sameBytes(hexBytes(arg), bytesOf(got));
  let n = 0; // length
  if (typeof got === "string") for (const _ of text) n++;
  return arg === (typeof got === "string" ? n : got.length);
}

/** Long output shortened to what a reader can take in. */
function brief(got) {
  const text = typeof got === "string" ? got : lossy.decode(got);
  return text.length <= 300 ? json(text) : `${json(text.slice(0, 300))}... (${bytesOf(got).length} bytes)`;
}

/** `pieces` of one stream: the exact byte length and `continues` flag of every line item, in order. */
function pieces(w, got) {
  return w.length === got.length && w.every((p, i) => p.bytes === got[i].bytes && p.continues === got[i].continues);
}

/** Pids accepted by `pid`/`parentPid`: a number, a numeric string, or a list of them (a capture). */
const ids = (v) => (Array.isArray(v) ? v.flatMap(ids) : typeof v === "number" ? [v] : typeof v === "string" && /^\d+$/.test(v) ? [Number(v)] : []);

/** `entries`: an unordered list matched one to one. */
function entries(w, got) {
  const ok = w.map((e) => got.map((p) => entryMatches(e, p)));
  const used = new Array(got.length).fill(false);
  const assign = (i) => {
    if (i === ok.length) return true;
    for (let j = 0; j < got.length; j++) {
      if (ok[i][j] && !used[j]) {
        used[j] = true;
        if (assign(i + 1)) return true;
        used[j] = false;
      }
    }
    return false;
  };
  return w.length === got.length && assign(0);
}

function entryMatches(e, p) {
  return Object.entries(e).every(([key, w]) => {
    if (key === "pid") return ids(w).some((id) => id === p.pid);
    if (key === "parentPid") return w === null ? p.parentPid === null : ids(w).some((id) => id === p.parentPid);
    if (key === "name") return matches(w, p.name);
    throw harness(`unknown entry key ${key}`);
  });
}
