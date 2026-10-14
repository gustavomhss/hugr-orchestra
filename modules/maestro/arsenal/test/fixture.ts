import { mkdtemp, mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { type ArsenalContext } from "../src/contract.ts";
export async function fixture(files: Record<string, string> = {}, authorize?: ArsenalContext["authorize"]) {
  const base = await realpath(await mkdtemp(join(process.env.MAESTRO_TEST_TMP ?? tmpdir(), "arsenal-acquire-")));
  const directory = join(base, "repo");
  await mkdir(directory);
  for (const [path, source] of Object.entries(files)) {
    await mkdir(join(directory, path, ".."), { recursive: true });
    await writeFile(join(directory, path), source);
  }
  const requests: Parameters<ArsenalContext["authorize"]>[0][] = [];
  const context: ArsenalContext = { directory, stateDirectory: join(base, "state"), projectID: "project-a", async authorize(request) { requests.push(request); await authorize?.(request); } };
  return { base, context, requests, cleanup: () => rm(base, { recursive: true, force: true }) };
}
export async function git(directory: string, ...args: string[]) {
  const process = Bun.spawn(["git", "--no-optional-locks", "-C", directory, ...args], { stdout: "pipe", stderr: "pipe" });
  const stderr = await new Response(process.stderr).text();
  const stdout = await new Response(process.stdout).text();
  if (await process.exited) throw new Error(stderr);
  return stdout;
}
