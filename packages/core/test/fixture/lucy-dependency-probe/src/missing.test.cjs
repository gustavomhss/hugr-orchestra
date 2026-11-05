const { test } = require("bun:test")
const live = require("@lucy/only-live")
test("live only", () => {
  console.log("ONLY_LIVE=" + live.value)
})
