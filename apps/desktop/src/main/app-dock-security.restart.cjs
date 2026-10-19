const { isAbsolute, join } = require("node:path")
const [modulePath, stage] = process.argv.slice(2)
const userData = process.env.APP_DOCK_RESTART_USER_DATA

const fail = (message) => {
  console.error(JSON.stringify({ phase: "restart-launcher-failure", message, argv: process.argv }))
  process.exit(1)
}

if (!modulePath || !isAbsolute(modulePath)) fail("Invalid compiled test module path")
if (!stage) fail("Invalid restart stage")
if (!userData || !isAbsolute(userData)) fail("Invalid restart user data path")

const { app } = require("electron")
app.setPath("userData", userData)
app.setPath("sessionData", join(userData, "session-data"))
app.on("window-all-closed", (event) => event.preventDefault())
process.env.APP_DOCK_RESTART_STAGE = stage
process.env.APP_DOCK_TEST_PRELOAD = join(__dirname, "app-dock-security.preload.cjs")
process.argv.push("--app-dock-electron-child")
require(modulePath)
