const diagnostic = (phase) =>
  process.stderr.write(
    `${JSON.stringify({ phase, argv: process.argv, electronVersion: process.versions.electron, pid: process.pid })}\n`,
  )
diagnostic("entry")
const startupWatchdog = setTimeout(() => {
  diagnostic("startup-timeout")
  process.exit(1)
}, 15_000)
diagnostic("before-import-electron")
const { app } = require("electron")
diagnostic("after-import-electron")
diagnostic("before-whenReady")
const ready = app
  .whenReady()
  .then(() => {
    diagnostic("after-whenReady")
    clearTimeout(startupWatchdog)
    if (process.argv.includes("--startup-only")) app.exit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
if (!process.argv.includes("--startup-only")) {
  process.env.APP_DOCK_TEST_PRELOAD = require("node:path").join(__dirname, "app-dock-security.preload.cjs")
  app.on("window-all-closed", (event) => event.preventDefault())
  require(process.argv[2])
}
