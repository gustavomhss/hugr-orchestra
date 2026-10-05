// Maestro host-bound process acquisition: fixed callers, bounded output, named failures.
import { type ArsenalContext } from "../contract.ts";
import { AcquisitionError } from "./acquisition.ts";
export async function runProcess(command: string[], directory: string, context: ArsenalContext, input?: string) {
  const executable = Bun.which(command[0]) ?? command[0];
  const argv = [executable, ...command.slice(1)];
  // Paths are data resources. Fixed caller-selected executable/script assets belong
  // in the actual invocation encoding; E owns physical data fences and bash permission.
  await context.authorize({ effect: "process", paths: [directory], commands: [argv.map((arg) => JSON.stringify(arg)).join(" ")] });
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && !["NODE_OPTIONS", "NODE_PATH"].includes(key)));
  const child = await Promise.resolve().then(() => Bun.spawn(argv, { cwd: directory, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } })).catch((error: unknown) => {
    throw new AcquisitionError("PROCESS_LAUNCH_FAILED", error instanceof Error ? error.message : String(error));
  });
  const state = { timedOut: false };
  const timeout = setTimeout(() => { state.timedOut = true; child.kill(); }, 30000);
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
      if (state.bytes > 8_000_000) { kill(); throw new AcquisitionError("PROCESS_OUTPUT_CAP", "output exceeds 8MB"); }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}
