import { spawnSync } from "node:child_process"

const seconds = Number(process.argv[2])
const cwd = process.argv[3]
const command = process.argv[4]
if (process.env.GITLAB_CI && process.platform === "linux" && process.getuid() === 0) {
  throw new Error("Linux validation must run as an unprivileged user; root skips filesystem permission coverage.")
}
if (!Number.isSafeInteger(seconds) || seconds <= 0 || !cwd || !command) {
  throw new Error("Usage: node .gitlab/run.mjs <timeout-seconds> <cwd> <command> [args...]")
}
const result = spawnSync(command, process.argv.slice(5), { cwd, stdio: "inherit", timeout: seconds * 1000 })
if (result.error) console.error(result.error)
if (result.signal) console.error(`${command} terminated by ${result.signal}`)
process.exit(result.status ?? 1)
