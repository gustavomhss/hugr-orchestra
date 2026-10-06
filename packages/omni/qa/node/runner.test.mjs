// The TS runner's K5 count on the Rust runner's table (qa/src/rust/mod.rs): `node --test qa/node/runner.test.mjs`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { lost } from "./runner.mjs";

test("lost counts missing, altered and extra bytes", () => {
  for (const [want, got, n] of [
    ["abc", "abc", 0],
    ["abc", "ab", 1],
    ["abc", "", 3],
    ["abc", "aXc", 1],
    ["x", "xCORRUPTION", 10],
    ["abc", "XbcD", 2],
  ]) {
    assert.equal(lost(Buffer.from(want), Buffer.from(got)), n, `want ${want}, got ${got}`);
  }
});
