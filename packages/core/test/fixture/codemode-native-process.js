import { realpathSync } from "node:fs"

process.stdout.write(JSON.stringify({
  type: "COMPILED_ENTRY",
  pid: process.pid,
  bun: process.versions.bun,
  execPath: process.execPath,
  realExecPath: realpathSync(process.execPath),
  hostileEnv: process.env.E10_HOSTILE_DOTENV !== undefined,
}) + "\n")
