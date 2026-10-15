// The smallest test harness (no framework) for `idioms.mjs` and `teeth.mjs`: register tests, run each under a deadline,
// print one line per test and a summary, and exit non-zero when any failed. A timeout is a failure.

import { OS } from "./runner/os.mjs";
import { finish, runtime } from "./support.mjs";

const tests = [];

export const test = (name, fn) => tests.push([name, fn]);

/** Runs every registered test; ends the process with the summary `<title>: N passed, M failed (...)`. */
export async function runTests(title, ms = 20_000) {
  let failed = 0;
  for (const [name, fn] of tests) {
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
      });
      await Promise.race([fn(), deadline]);
      console.log(`ok      ${name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL    ${name}: ${e instanceof Error ? e.message : e}`);
    } finally {
      clearTimeout(timer);
    }
  }
  finish(`${title}: ${tests.length - failed} passed, ${failed} failed (${tests.length} tests on ${OS}/ts-${runtime})`, failed === 0 ? 0 : 1);
}
