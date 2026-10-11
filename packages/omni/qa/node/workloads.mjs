// QA-A..E for the TS runner, task for task the Rust runner's (qa/src/rust/{suites,term,misbehave,agent}.rs): the same
// programs, options, bounds and checks. The workload data is shared: qa/workloads/{shells,agent}.json.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, spawn, spawnPty } from "./arm.mjs";
import { lost, setup } from "./runner.mjs";

const SLACK = 10_000;
const tail = (text) => text.split("\n").slice(-8).join("\n");
const ok = (r) => r.how === "exit" && r.code === 0;
const text = (r) => r.out.toString() + r.err.toString();

/** QA-A: semver's `cargo test` and commander's `npm test`, each to the end and cut by a timeout midway. */
export async function tests(runner) {
  const SUITE = 180_000;
  const suites = [
    ["cargo-test", "cargo", ["test", "--offline", "--locked", "-q"], 500, "test result: ok", "semver"],
    ["npm-test", "npm", ["test"], 3000, "Tests:", "commander"],
  ];
  // --quick runs the whole suites through omni only (they take most of its time); --full through both arms.
  const both = runner.arm === "omni" || process.env.HUGR_QA_MODE === "full";
  for (let rep = 0; rep < setup.sizes.reps; rep++) {
    for (const [name, program, args, cut, passed, dir] of suites) {
      const runs = [[name, SUITE], [`${name}-cut`, cut]].filter(([, t]) => both || t !== SUITE);
      for (const [task, timeoutMs] of runs) {
        const ctx = runner.ctx();
        const spec = ctx.spec(program, args, { cwd: join(setup.cache, dir), timeoutMs });
        const body = async () => {
          const r = await run(runner.arm, spec, ctx);
          if (timeoutMs === SUITE && (!ok(r) || !text(r).includes(passed))) {
            process.stderr.write(`${task} failed; its whole output:\n${text(r)}\n`);
            throw new Error(`the suite failed: ${r.how} ${r.code}: ${tail(text(r))}`);
          }
          return {};
        };
        await runner.task("QA-A", { name: task, ctx, boundMs: timeoutMs + SLACK, body });
      }
    }
  }
}

/** QA-B: Vite through `npm run dev`, up until it serves, then stopped. */
export async function devServer(runner) {
  const base = runner.arm === "omni" ? 41500 : 41700;
  for (let round = 0; round < setup.sizes.rounds; round++) {
    const ctx = runner.ctx();
    const port = String(base + round);
    const args = ["run", "dev", "--", "--host", "127.0.0.1", "--port", port, "--strictPort"];
    const spec = ctx.spec("npm", args, { cwd: join(setup.cache, "vite") });
    const graceMs = 2000;
    const body = async () => {
      const server = spawn(runner.arm, spec, ctx);
      await server.expect("ready in", 60_000);
      const got = await fetch(`http://127.0.0.1:${port}/@vite/client`);
      await got.arrayBuffer();
      if (got.status !== 200) throw new Error(`the dev server answered ${got.status}`);
      return { stopMs: await server.stop(graceMs), graceMs, keep: server };
    };
    await runner.task("QA-B", { name: `vite-${round}`, ctx, boundMs: 60_000 + graceMs + SLACK, body });
  }
}

/** QA-C (omni only): shells and REPLs in a terminal: a command, Ctrl-C on a long one, `exit`. */
export async function shells(runner) {
  if (runner.arm !== "omni") throw new Error("QA-C has no std arm: the stdlib has no terminal");
  const STEP = 20_000;
  const all = JSON.parse(readFileSync(join(setup.root, "qa/workloads/shells.json"), "utf8")).shells;
  for (const shell of all.filter((s) => s.os.includes(setup.os))) {
    const ctx = runner.ctx();
    const body = async () => {
      const sh = spawnPty(ctx.spec(shell.program, shell.args, { env: { ...ctx.env, ...shell.env } }), ctx);
      if (sh === null) return { skip: `${shell.program} is not installed` };
      await sh.expect(shell.prompt, STEP);
      await sh.write(shell.say);
      await sh.expect(shell.said, STEP);
      await sh.expect(shell.prompt, STEP);
      await sh.write(shell.long.replaceAll("${FIXTURE}", setup.fixture));
      await sh.expect(shell.longing, STEP);
      await sh.write("\x03");
      await sh.expect(shell.prompt, STEP).catch((e) => Promise.reject(new Error(`Ctrl-C: ${e.message}`)));
      await sh.write(shell.exit);
      const code = await sh.wait(STEP);
      await sh.stop(1000);
      if (code !== 0) throw new Error(`${shell.name} exited ${code}`);
      return { keep: sh };
    };
    await runner.task("QA-C", { name: shell.name, ctx, boundMs: STEP * 8, body });
  }
}

/** QA-D: a process left holding the output, a tree that ignores the polite stop, floods, an editor, a prompt. */
export async function misbehave(runner) {
  const TIMEOUT = 3000;
  const GRACE = 500;
  const FLOOD = 32 << 20;
  const LINES = 100_000;
  const arm = runner.arm;
  const omniEnds = (r) => {
    if (arm === "omni" && r.how !== "exit") throw new Error(`ended as ${r.how}, not by the root's exit`);
    return {};
  };
  const tasks = {
    daemon: async (ctx) => omniEnds(await run(arm, ctx.fixture(["out=up\\n", "tree=1", "exit=0"], { timeoutMs: TIMEOUT, graceMs: GRACE }), ctx)),
    "ignore-term": async (ctx) => {
      const proc = spawn(arm, ctx.fixture(["ignore-term", "tree=2:resist", "hang"]), ctx);
      await proc.expect("PID 2 ", 10_000);
      return { stopMs: await proc.stop(GRACE), graceMs: GRACE, keep: proc };
    },
    flood: async (ctx) => {
      const r = await run(arm, ctx.fixture([`bytes=stdout:${FLOOD}`, "exit=0"], { maxOutputBytes: 2 * FLOOD, timeoutMs: 60_000 }), ctx);
      if (r.how !== "exit") throw new Error(`ended as ${r.how}`);
      const want = Buffer.alloc(FLOOD);
      for (let i = 0; i < FLOOD; i++) want[i] = 97 + (i % 26);
      return { lost: lost(want, r.out) };
    },
    lines: async (ctx) => {
      const proc = spawn(arm, ctx.fixture([`lines=stdout:${LINES}`, "exit=0"]), ctx);
      const got = await proc.rest(60_000);
      let want = "";
      for (let i = 1; i <= LINES; i++) want += `line ${i}\n`;
      await proc.wait(10_000);
      return { lost: lost(Buffer.from(want), Buffer.from(got)) };
    },
    editor: async (ctx) => {
      const repo = scratchRepo(ctx.tag);
      try {
        const fixture = setup.fixture.replaceAll("\\", "/"); // the editor goes through git's sh
        const env = { ...ctx.env, ...gitEnv(repo), GIT_EDITOR: `"${fixture}" read-line argv` };
        return omniEnds(await run(arm, ctx.spec("git", ["commit"], { cwd: repo, env, timeoutMs: TIMEOUT, graceMs: GRACE }), ctx));
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    },
    prompt: async (ctx) => {
      const proc = spawn(arm, ctx.fixture(["prompt=Name? ", "exit=0"], { stdinPipe: true }), ctx);
      await proc.expect("Name? ", 10_000);
      await proc.write("qa\n");
      await proc.expect("GOT qa", 10_000);
      const code = await proc.wait(10_000);
      if (code !== 0) throw new Error(`the prompt exited ${code}`);
      return {};
    },
  };
  for (let rep = 0; rep < setup.sizes.reps; rep++) {
    for (const [name, task] of Object.entries(tasks)) {
      const ctx = runner.ctx();
      await runner.task("QA-D", { name, ctx, boundMs: TIMEOUT + GRACE + SLACK, body: () => task(ctx) });
    }
    // A batch of two: a tree stopped at once whose descendant (`hold`) would outlive a root-only stop by 2 s, next to
    // a task that runs 4 s. The short-lived leftover must be counted when its own task returns.
    const [short, long] = [runner.ctx(), runner.ctx()];
    const boundMs = 4000 + TIMEOUT + SLACK;
    await runner.batch("QA-D", [
      {
        name: "short-leftover",
        ctx: short,
        boundMs,
        body: async () => {
          const proc = spawn(arm, short.fixture(["hold=2000", "ready", "hang"]), short);
          await proc.expect("READY", 10_000);
          return { stopMs: await proc.stop(GRACE), graceMs: GRACE, keep: proc };
        },
      },
      {
        name: "beside-a-long-task",
        ctx: long,
        boundMs,
        body: async () => {
          const r = await run(arm, long.fixture(["sleep=4000", "exit=0"]), long);
          if (!ok(r)) throw new Error(`ended as ${r.how} ${r.code}`);
          return {};
        },
      },
    ]);
  }
}

/** A repository with one staged file, configured only by its own files (no user or system git config). */
function scratchRepo(tag) {
  const repo = join(tmpdir(), `omni-qa-${tag}`);
  mkdirSync(repo, { recursive: true });
  writeFileSync(join(repo, "a.txt"), "a\n");
  for (const args of [["init", "-q"], ["add", "a.txt"]]) {
    execFileSync("git", args, { cwd: repo, env: { ...process.env, ...gitEnv(repo) }, stdio: "ignore" });
  }
  return repo;
}

function gitEnv(repo) {
  const config = join(repo, ".git-qa-config");
  writeFileSync(config, "[user]\n\tname = qa\n\temail = qa@example.invalid\n");
  return { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: config };
}

/** QA-E: an agent's loop of real commands with cancellations at arbitrary moments (qa/workloads/agent.json). */
export async function agentLoop(runner) {
  const plan = JSON.parse(readFileSync(join(setup.root, "qa/workloads/agent.json"), "utf8"));
  const spread = (i) => (i * 2654435761) % 2 ** 32;
  for (let start = 0; start < setup.sizes.commands; start += plan.concurrency) {
    const tasks = [];
    const scratch = [];
    for (let i = start; i < Math.min(start + plan.concurrency, setup.sizes.commands); i++) {
      const cmd = plan.commands[i % plan.commands.length];
      const ctx = runner.ctx();
      let cwd = join(setup.cache, cmd.cwd);
      if (cmd.cwd === "@tmp") {
        cwd = join(tmpdir(), `omni-qa-${ctx.tag}`);
        mkdirSync(cwd, { recursive: true });
        writeFileSync(join(cwd, "package.json"), "{}\n");
        scratch.push(cwd);
      }
      const cancelled = i % plan.cancelEvery === plan.cancelEvery - 1;
      const spec = ctx.spec(cmd.program, cmd.args, { cwd, timeoutMs: plan.timeoutMs });
      if (cancelled) spec.cancelAfterMs = spread(i) % plan.cancelWithinMs;
      const body = async () => {
        const r = await run(runner.arm, spec, ctx);
        if (!cancelled && !ok(r)) throw new Error(`${r.how} ${r.code}: ${tail(text(r))}`);
        if (cancelled && runner.arm === "omni" && !(ok(r) || r.how === "aborted")) {
          throw new Error(`cancelled, it ended as ${r.how} ${r.code}`);
        }
        return {};
      };
      tasks.push({ name: `${cmd.name}${cancelled ? "-cancelled" : ""}`, ctx, boundMs: plan.timeoutMs + SLACK, body });
    }
    await runner.batch("QA-E", tasks);
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
  }
}
