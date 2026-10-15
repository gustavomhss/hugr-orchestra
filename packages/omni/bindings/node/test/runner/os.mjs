// What the runner asks the OS, never the library: is a pid alive, and a fresh `${TMP}`.

import { execFile } from "node:child_process";
import { mkdirSync, realpathSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harness, product } from "./expect.mjs";

/** The scenario's OS name: `linux`, `macos` or `windows`. */
export const OS = { darwin: "macos", win32: "windows", linux: "linux" }[process.platform] ?? process.platform;

const dead = { state: "dead" };
const alive = { state: "alive" };
const unknown = (why) => ({ state: "unknown", why });

/**
 * What the OS says about a pid: `{ state: "alive" | "dead" }`, or `{ state: "unknown", why }`. Only a confirmed
 * absence or a zombie/dead state is `dead`; anything the oracle cannot establish is `unknown`, which fails the suite
 * (never counted as dead or alive).
 */
export function life(pid) {
  if (OS === "linux") return procStat(pid);
  return OS === "windows" ? tasklist(pid) : ps(pid);
}

/** Linux: `/proc/<pid>/stat` is `<pid> (<comm>) <state> ...`; no such file means no such process. */
async function procStat(pid) {
  try {
    return statLife(pid, await readFile(`/proc/${pid}/stat`, "utf8"));
  } catch (e) {
    // ENOENT: no such process; ESRCH: it exited while its stat file was being read. Both confirm absence.
    return e.code === "ENOENT" || e.code === "ESRCH" ? dead : unknown(`/proc/${pid}/stat: ${e.message}`);
  }
}

export function statLife(pid, text) {
  const id = text.slice(0, Math.max(text.indexOf(" "), 0));
  const state = text.slice(text.lastIndexOf(")") + 1).trimStart()[0];
  if (id !== String(pid) || state === undefined) return unknown(`/proc/${pid}/stat unreadable: ${JSON.stringify(text)}`);
  if ("ZX".includes(state)) return dead;
  return "RSDTtWPIK".includes(state) ? alive : unknown(`/proc/${pid}/stat has the state ${state}`);
}

const run = (file, args) =>
  new Promise((resolve) =>
    execFile(file, args, { encoding: "utf8", windowsHide: true }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr: stderr ?? "" }),
    ),
  );

/** macOS (and other Unix): `ps -o pid=,stat= -p <pid>` prints `<pid> <stat>`, or nothing and exits 1 when there is no such process. */
const ps = async (pid) => psLife(pid, await run("ps", ["-o", "pid=,stat=", "-p", String(pid)]));

export function psLife(pid, { code, stdout, stderr }) {
  const fields = stdout.split(/\s+/).filter(Boolean);
  if (code === 1 && fields.length === 0 && stderr.trim() === "") return dead;
  if (code === 0 && fields.length === 2 && fields[0] === String(pid)) return fields[1].startsWith("Z") ? dead : alive;
  return unknown(`ps for ${pid}: exit ${code} ${JSON.stringify(stdout)} ${JSON.stringify(stderr)}`);
}

/**
 * Windows: `tasklist /FI "PID eq <pid>" /NH /FO CSV` lists `"<image>","<pid>",...`, or only an INFO line when no
 * process has that pid (an exited process is not listed, even while handles to it are open).
 */
const tasklist = async (pid) => tasklistLife(pid, await run("tasklist", ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"]));

export function tasklistLife(pid, { code, stdout }) {
  if (code !== 0) return unknown(`tasklist for ${pid}: exit ${code} ${JSON.stringify(stdout)}`);
  // Every CSV row must carry a pid field; a row without one is unparsable output.
  const pids = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('"')).map((l) => l.split('","')[1]);
  if (pids.includes(String(pid))) return alive;
  return pids.length === 0 && stdout.includes("INFO:") ? dead : unknown(`tasklist for ${pid}: unexpected output ${JSON.stringify(stdout)}`);
}

/**
 * The `os` step: every pid is alive (or dead) per the OS, now or within `withinMs`. A mismatch is the product's; an
 * oracle that cannot tell is the harness's.
 */
export async function expectLife(pids, wantAlive, withinMs) {
  const deadline = Date.now() + withinMs;
  const wanted = wantAlive ? "alive" : "dead";
  for (;;) {
    const lives = await Promise.all(pids.map(async (pid) => [pid, await life(pid)]));
    const blind = lives.find(([, l]) => l.state === "unknown");
    if (blind) throw harness(`the OS cannot tell whether ${blind[0]} is alive: ${blind[1].why}`);
    const wrong = lives.filter(([, l]) => l.state !== wanted).map(([pid]) => pid);
    if (wrong.length === 0) return;
    if (Date.now() >= deadline) throw product(`expected ${wanted} per the OS, but not: ${JSON.stringify(wrong)}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** A fresh, canonical directory for one scenario (macOS: `/private/var/...`; Windows: no `\\?\` prefix), so a child's `cwd` prints exactly `${TMP}`. */
export function tmp(seq) {
  const dir = join(tmpdir(), `omni-contract-${process.pid}-${seq}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir).replace(/^\\\\\?\\/, "");
}
