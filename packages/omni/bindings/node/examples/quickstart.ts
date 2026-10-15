// README quickstart; type-checked against index.d.ts in CI (W00), run for real from W13 on.
import { run, spawn } from "hugr-omni";

const r = await run("git", ["status", "--short"], { timeoutMs: 10_000 });
console.log(r.success, r.stdout);

await using server = spawn("npm", ["run", "dev"]);
for await (const line of server.lines()) if (line.text.includes("ready")) break;
console.log(await server.processes());
