import { expect, test } from "bun:test"
import { jail, sandboxHost } from "./lib/sandbox-host"

// The sandbox escape suites run their live cases only when the host enforces a jail, so a broken srt acquisition
// would turn them into skips and the run would stay green. CI installs bubblewrap, so there the jail must be enforced.
test("a Linux CI host enforces its shell jail, so the sandbox escape suites do not skip", () => {
  if (process.platform !== "linux" || !process.env.CI) return
  expect(jail, `jail not enforced on Linux CI: ${JSON.stringify(sandboxHost)}`).toBeDefined()
})
