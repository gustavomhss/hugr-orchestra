// Dedicated hosted setup: excluded from ordinary Bun suffix discovery, selected by its exact path as the first file of a
// `bun test` run, so the native seat shell tests named after it run confined instead of refused (see
// test/fixture/seat-sandbox.ts). Linux CI only: it relaxes the runner's AppArmor user-namespace restriction for
// bubblewrap and installs the tool sandbox's system dependencies. The sandbox runtime itself is fetched on first need.
import { expect, test } from "bun:test"
import { $ } from "bun"
import { seatShellRuns } from "./fixture/seat-sandbox"

if (process.platform !== "linux" || process.env.CI !== "true")
  throw new Error("the Linux tool sandbox setup requires its explicit Linux CI runner")

test("the Linux runner provides the tool sandbox's system dependencies", async () => {
  await $`sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.quiet()
  if (!Bun.which("bwrap") || !Bun.which("socat"))
    await $`sudo apt-get install -y --no-install-recommends bubblewrap socat`.quiet().catch(async () => {
      await $`sudo apt-get update -qq`.quiet()
      await $`sudo apt-get install -y --no-install-recommends bubblewrap socat`.quiet()
    })
  expect(seatShellRuns()).toBe(true)
}, 300_000)
