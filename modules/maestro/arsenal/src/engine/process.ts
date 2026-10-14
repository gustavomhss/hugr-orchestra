// Maestro host-bound process acquisition: fixed callers, bounded output, named failures.
import { type ArsenalContext } from "../contract.ts";
import { AcquisitionError } from "./acquisition.ts";
import { processRunner } from "../process-runner.ts";
const OUTPUT_CAP = 8_000_000;
const TIMEOUT_MS = 30000;
export async function runProcess(command: string[], directory: string, context: ArsenalContext, input?: string) {
  const executable = Bun.which(command[0]) ?? command[0];
  const argv = [executable, ...command.slice(1)];
  // Paths are data resources. Fixed caller-selected executable/script assets belong
  // in the actual invocation encoding; E owns physical data fences and bash permission.
  await context.authorize({ effect: "process", paths: [directory], commands: [argv.map((arg) => JSON.stringify(arg)).join(" ")] });
  const inherited = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith("GIT_") && !["NODE_OPTIONS", "NODE_PATH"].includes(entry[0])));
  const env = { ...inherited, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const runner = processRunner();
  if (runner) {
    // The host's runner (omni under the flag): the whole tree is stopped on timeout, overflow or exit.
    const result = await runner({ argv, cwd: directory, env, input, timeoutMs: TIMEOUT_MS, maxOutputBytes: OUTPUT_CAP }).catch((error: unknown) => {
      throw new AcquisitionError("PROCESS_LAUNCH_FAILED", error instanceof Error ? error.message : String(error));
    });
    if (result.overflow) throw new AcquisitionError("PROCESS_OUTPUT_CAP", "output exceeds 8MB");
    if (result.timedOut) throw new AcquisitionError("PROCESS_TIMEOUT", command[0]);
    return { stdout: Buffer.from(result.stdout).toString("utf8"), stderr: Buffer.from(result.stderr).toString("utf8"), exit: result.exitCode };
  }
  const child = await Promise.resolve().then(() => Bun.spawn(argv, { cwd: directory, stdin: "pipe", stdout: "pipe", stderr: "pipe", env })).catch((error: unknown) => {
    throw new AcquisitionError("PROCESS_LAUNCH_FAILED", error instanceof Error ? error.message : String(error));
  });
  const state = { timedOut: false };
  const timeout = setTimeout(() => { state.timedOut = true; child.kill(); }, TIMEOUT_MS);
  try {
    if (input) child.stdin.write(input);
    child.stdin.end();
    const [stdout, stderr, exit] = await Promise.all([readOutput(child.stdout, () => child.kill()), readOutput(child.stderr, () => child.kill()), child.exited]);
    if (state.timedOut) throw new AcquisitionError("PROCESS_TIMEOUT", command[0]);
    return { stdout, stderr, exit };
  } finally { clearTimeout(timeout); if (child.exitCode === null) child.kill(); }
}
async function readOutput(stream: ReadableStream<Uint8Array>, kill: () => void) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  const state = { bytes: 0 };
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      state.bytes += chunk.value.byteLength;
      if (state.bytes > OUTPUT_CAP) { kill(); throw new AcquisitionError("PROCESS_OUTPUT_CAP", "output exceeds 8MB"); }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}
