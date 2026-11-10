import { expect, test } from "bun:test"
import { applyDiskCacheCap, DISK_CACHE_BYTES } from "./disk-cache"

test("the disk cache cap is 256 MiB and is applied as a Chromium switch", async () => {
  const switches: Array<[string, string]> = []
  applyDiskCacheCap({ appendSwitch: (name, value) => void switches.push([name, value]) })
  expect(DISK_CACHE_BYTES).toBe(268435456)
  expect(switches).toEqual([["disk-cache-size", "268435456"]])
  const main = await Bun.file(new URL("./index.ts", import.meta.url)).text()
  const call = main.indexOf("applyDiskCacheCap(app.commandLine)")
  const ready = main.indexOf("app.whenReady()")
  expect(call).toBeGreaterThan(-1)
  expect(ready).toBeGreaterThan(call)
})
