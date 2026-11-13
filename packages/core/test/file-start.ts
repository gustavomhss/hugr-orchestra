import { writeSync } from "node:fs"
import { plugin } from "bun"

// bun test --only-failures prints no file header until a test fails. A hang before that
// leaves the 8-minute step with no file name (run 43258630212, windows core 3/9).
// writeSync to fd 2 is not that block buffer: the path is on the pipe before the file body runs.
// onLoad must not handle the file. Returning undefined from onLoad swallowed it and the test never started.
const started = new Set<string>()
plugin({
  name: "file-start",
  setup(build) {
    build.onResolve({ filter: /\.test\.ts$/ }, (args) => {
      if (started.has(args.path)) return undefined
      started.add(args.path)
      writeSync(2, `shard file starts ${args.path}\n`)
      return undefined
    })
  },
})
