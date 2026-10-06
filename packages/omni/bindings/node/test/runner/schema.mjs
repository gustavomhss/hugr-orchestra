// The full schema of a step, checked when the scenario loads, before anything runs: the action's value, every
// extra key, and every expectation and matcher. A scenario that breaks it is a harness failure, never pending.

import { pattern } from "./pattern.mjs";

const CODES = ["NOT_FOUND", "NOT_EXECUTABLE", "INVALID_CWD", "INVALID_ARGUMENT", "ABORTED", "OUTPUT_LIMIT", "CLOSED", "IO"];
const REASONS = ["exit", "signal", "killed", "timeout", "aborted"];
const EXIT = ["exitCode", "signal", "reason", "success"];
const STREAMS = ["stdout", "stderr", "pty"];

const show = (v) => JSON.stringify(v);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;
const fail = (msg) => {
  throw new Error(msg);
};

const object = (v) => (isObject(v) ? v : fail(`want an object, not ${show(v)}`));
const text = (v) => typeof v === "string" || fail(`want text, not ${show(v)}`);
const boolean = (v) => typeof v === "boolean" || fail(`want true or false, not ${show(v)}`);
const count = (v) => isCount(v) || fail(`want a whole number, not ${show(v)}`);
const oneOf = (v, allowed) => allowed.includes(v) || fail(`want one of ${show(allowed)}, not ${show(v)}`);
const regex = (re) => pattern(re);

/** Raw bytes of a hex string (whitespace ignored); a harness error when it is not hex. */
export function hexBytes(h) {
  const digits = h.replace(/\s/g, "");
  if (digits.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(digits)) fail(`bad hex ${show(h)}`);
  return Uint8Array.from(digits.match(/../g) ?? [], (p) => parseInt(p, 16));
}

/** Checks step `s`, whose action is `name` with value `target`. */
export function step(name, target, s) {
  if (name === "run" || name === "spawn") {
    if (!Array.isArray(target) || target.length === 0 || !target.every((x) => typeof x === "string")) {
      fail(`\`${name}\` takes [command, ...args] as strings`);
    }
  } else if (name === "os") {
    oneOf(target, ["alive", "dead"]);
  } else {
    text(target);
  }
  for (const [key, v] of Object.entries(s)) {
    if (key === name) continue;
    try {
      switch (key) {
        case "timeoutMs": case "withinMs": case "graceMs": case "cols": case "rows": count(v); break;
        case "as": text(v); break;
        case "capture":
          if (name === "processes") text(v);
          else Object.values(object(v)).forEach(regex);
          break;
        case "await": case "close": case "detach": case "lines": boolean(v); break;
        case "data": data(v); break;
        case "until": until(v); break;
        case "pids":
          if (typeof v === "string") break;
          if (!Array.isArray(v) || v.length === 0 || !v.every((p) => typeof p === "string" || isCount(p))) {
            fail("want a capture or a non-empty list of pids");
          }
          break;
        case "options": options(v); break;
        case "expect": expect(name, s, v); break;
        default: fail("unknown key");
      }
    } catch (e) {
      throw new Error(`${key}: ${e.message}`);
    }
  }
}

function expect(name, s, v) {
  const want = object(v);
  const lines = s.lines === true;
  for (const [key, w] of Object.entries(want)) {
    const allowed =
      key === "error" || key === "elapsedMs" ? true
      : key === "message" || key === "result" ? "error" in want
      : name === "run" || name === "wait" ? EXIT.includes(key) || key === "stdout" || key === "stderr"
      : name === "stop" ? EXIT.includes(key)
      : name === "read" && key === "pieces" ? lines
      : name === "read" ? STREAMS.includes(key) || ["chunks", "lostBefore", "continues", "droppedBytes"].includes(key)
      : name === "processes" && key === "entries";
    if (!allowed) fail(`\`${name}\` cannot expect \`${key}\` (here)`);
    try {
      if (key === "error") oneOf(w, CODES);
      else if (key === "message") {
        if (typeof w !== "string" && !(Array.isArray(w) && w.length > 0 && w.every((x) => typeof x === "string"))) {
          fail("want text or a list of texts");
        }
      } else if (key === "result") Object.entries(object(w)).forEach(([k, m]) => resultField(k, m));
      else if (key === "droppedBytes") {
        Object.entries(object(w)).forEach(([k, m]) => (["stdout", "stderr"].includes(k) ? number(m) : fail(`unknown stream ${k}`)));
      } else if (key === "pieces") Object.entries(object(w)).forEach(([k, list]) => pieces(k, list));
      else if (key === "entries") (Array.isArray(w) ? w : fail("want a list")).forEach(entry);
      else if (STREAMS.includes(key)) string(w);
      else resultField(key, w);
    } catch (e) {
      throw new Error(`${key}: ${e.message}`);
    }
  }
}

/** A field of an `Exit` or `RunResult` (or a numeric field of `read`). */
function resultField(key, w) {
  if (["exitCode", "chunks", "lostBefore", "continues", "elapsedMs"].includes(key)) number(w);
  else if (key === "signal" || key === "stdout" || key === "stderr") string(w);
  else if (key === "reason") oneOf(w, REASONS);
  else if (key === "success") boolean(w);
  else fail(`unknown field ${key}`);
}

function pieces(stream, list) {
  if (!STREAMS.includes(stream)) fail(`unknown stream ${stream}`);
  for (const piece of Array.isArray(list) ? list : fail("want a list of pieces")) {
    const p = object(piece);
    if (Object.keys(p).length !== 2 || !isCount(p.bytes) || typeof p.continues !== "boolean") {
      fail(`a piece is {"bytes": n, "continues": bool}, not ${show(piece)}`);
    }
  }
}

function entry(e) {
  const ids = (w) => (Array.isArray(w) ? w.every((x) => typeof x === "string" || isCount(x)) : typeof w === "string" || isCount(w));
  for (const [k, w] of Object.entries(object(e))) {
    if (k === "pid" && ids(w)) continue;
    if (k === "parentPid" && (w === null || ids(w))) continue;
    if (k === "name") string(w);
    else fail(`bad entry key ${k}: ${show(w)}`);
  }
}

function options(v) {
  for (const [k, o] of Object.entries(object(v))) {
    try {
      if (k === "cwd") text(o);
      else if (k === "env") {
        if (!Object.values(object(o)).every((x) => typeof x === "string" || x === null)) fail("env values are text or null");
      } else if (["inheritEnv", "text", "mergeStderr"].includes(k)) boolean(o);
      else if (["timeoutMs", "graceMs", "maxOutputBytes"].includes(k)) {
        if (typeof o === "number") continue;
        if (!isObject(o) || Object.keys(o).length !== 1) fail('want a number or {"$number": ...}');
        oneOf(o.$number, ["NaN", "Infinity", "-Infinity"]);
      } else if (k === "input") data(o);
      else if (k === "stdin") oneOf(o, ["pipe", "closed"]);
      else if (k === "pty") {
        if (o === true) continue;
        for (const [d, n] of Object.entries(object(o))) if (!["cols", "rows"].includes(d) || typeof n !== "number") fail(`bad pty ${d}: ${show(n)}`);
      } else fail("unknown option");
    } catch (e) {
      throw new Error(`${k}: ${e.message}`);
    }
  }
}

function until(v) {
  if (v === "end") return;
  const u = object(v);
  const okCount = u.count === undefined || (isCount(u.count) && u.count > 0);
  if (u.match === undefined || !okCount || !Object.keys(u).every((k) => k === "match" || k === "count")) {
    fail(`want "end" or {"match", "count" > 0}, not ${show(v)}`);
  }
  regex(u.match);
}

/** A string matcher: text, or exactly one of `contains`, `regex`, `length`, `hex`; or null. */
function string(w) {
  if (w === null || typeof w === "string") return;
  const [k, val] = isObject(w) && Object.keys(w).length === 1 ? Object.entries(w)[0] : [];
  if (k === "contains" && typeof val === "string") return;
  if (k === "regex") return void regex(val);
  if (k === "length" && isCount(val)) return;
  if (k === "hex" && typeof val === "string") return void hexBytes(val);
  fail(`bad string matcher ${show(w)}`);
}

/** A number matcher: a number, null, or a non-empty `{lt, lte, gt, gte}` of numbers. */
function number(w) {
  if (w === null || typeof w === "number") return;
  const ops = isObject(w) ? Object.entries(w) : [];
  if (ops.length === 0 || !ops.every(([k, n]) => ["lt", "lte", "gt", "gte"].includes(k) && typeof n === "number")) {
    fail(`bad number matcher ${show(w)}`);
  }
}

function data(v) {
  if (typeof v === "string") return;
  if (isObject(v) && Object.keys(v).length === 1 && typeof v.hex === "string") return void hexBytes(v.hex);
  fail(`want text or {"hex"}, not ${show(v)}`);
}
