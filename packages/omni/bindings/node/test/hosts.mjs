// The parent side of the host idioms: runs `host.mjs` under this runtime and gives a test its markers and its end.

import { spawn as launch } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMarker } from "./markers.mjs";
import { hostCommand } from "./support.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "host.mjs");
const live = new Set();
process.on("exit", () => live.forEach((proc) => proc.kill("SIGKILL"))); // a host must not outlive a run that gave up on it

/** The line of a crash report that says what happened. */
const gist = (err) => {
  const lines = err.trim().split("\n");
  return lines.find((l) => /^(\w*Error|error)\b/.test(l)) ?? lines.at(-1) ?? "no stderr";
};

/** Resolves with `check()`'s result once it is not `undefined`, re-checking whenever `poke`d; rejects after `ms`. */
function until(watchers, ms, what, check) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what()}: not within ${ms} ms`)), ms);
    const look = () => {
      const got = check();
      if (got === undefined) return;
      clearTimeout(timer);
      watchers.delete(look);
      got instanceof Error ? reject(got) : resolve(got);
    };
    watchers.add(look);
    look();
  });
}

/** `body(host, release)` with `host.mjs` started in `mode` (`release`: a file whose first line lets its child go). */
export async function withHost(mode, body, { gc = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "omni-host-"));
  const release = join(dir, "release");
  writeFileSync(release, "");
  const [command, args] = hostCommand(script, [mode, release], { gc });
  const proc = launch(command, args, { stdio: ["pipe", "pipe", "pipe"] });
  proc.stdin.on("error", () => {}); // a host that is already gone is not a failure of the write
  live.add(proc);
  let out = "";
  let err = "";
  let ended = null; // { code, signal, at } once the host is gone
  const known = []; // every pid the host reported
  const watchers = new Set();
  const poke = () => [...watchers].forEach((look) => look());
  proc.stdout.on("data", (d) => { out += d; poke(); });
  proc.stderr.on("data", (d) => { err += d; });
  proc.on("close", (code, signal) => { ended = { code, signal, at: performance.now() }; poke(); });
  const host = {
    /** The `count` pids of the host's `HOST-<name>` line; fails, with what the host said, if the host ends first. */
    marker: (name, count, ms = 15_000) =>
      until(watchers, ms, () => `no HOST-${name} from the host (${gist(err)})`, () => {
        const pids = parseMarker(out, name, count);
        if (pids === undefined && ended !== null) return new Error(`the host ended (${JSON.stringify(ended)}) before HOST-${name}: ${gist(err)}`);
        if (Array.isArray(pids)) known.push(...pids);
        return pids;
      }),
    /** Tells a host in mode `exit` or `throw` to go ahead and end (it waits for this line). */
    go: () => proc.stdin.write("go\n"),
    /** How the host ended: `{ code, signal, at }`; `hint` says what a host that does not end is getting wrong. */
    end: (ms = 10_000, hint = "") => until(watchers, ms, () => `the host did not end${hint && ` (${hint})`}`, () => ended ?? undefined),
    get ended() {
      return ended;
    },
    kill: (signal) => proc.kill(signal),
  };
  let passed = false;
  try {
    await body(host, release);
    passed = true;
  } finally {
    proc.kill("SIGKILL");
    live.delete(proc);
    if (!passed) for (const pid of known) try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    rmSync(dir, { recursive: true, force: true });
  }
}
