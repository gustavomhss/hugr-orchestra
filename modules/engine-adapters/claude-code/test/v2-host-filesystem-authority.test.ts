import path from "node:path"
import fs from "node:fs/promises"
import { expect } from "bun:test"
import { Effect, Fiber } from "effect"
import { PermissionV2 } from "@orchestra/core/permission"
import { HostFilesystem } from "./fixture/host-filesystem"

const filesystem = HostFilesystem.make()

for (const tool of ["Read", "Write", "Glob", "Grep"]) {
  filesystem.it.live(`${tool} refuses a relative escape even when external and action permissions allow`, () =>
    Effect.gen(function* () {
      yield* filesystem.setup()
      const target =
        tool === "Glob" || tool === "Grep" ? path.join("..", "outside") : path.join("..", "outside", "sentinel.txt")
      const args =
        tool === "Glob" || tool === "Grep" ? { pattern: "*", path: target } : filesystem.fileInput(tool, target)
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool,
          args: Object.freeze(args),
          id: "relative-escape",
          effect:
            tool === "Read"
              ? filesystem.read(filesystem.paths.outsideFile)
              : tool === "Write"
                ? filesystem.write(filesystem.paths.outsideFile)
                : filesystem.search(filesystem.paths.outside),
        })
      }
      yield* filesystem.run
      filesystem.allRefused()
      expect(yield* Effect.promise(() => Bun.file(filesystem.paths.outsideFile).text())).toBe("OUTSIDE SENTINEL")
    }),
  )
}
for (const tool of ["Read", "Write"]) {
  filesystem.it.live(`${tool} refuses a physically external target hidden by an internal directory alias`, () =>
    Effect.gen(function* () {
      yield* filesystem.setup()
      const alias = path.join(filesystem.paths.inside, `alias-outside-${tool}`)
      yield* Effect.promise(() =>
        fs.symlink(filesystem.paths.outside, alias, process.platform === "win32" ? "junction" : "dir"),
      )
      const target = path.join(alias, "sentinel.txt")
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool,
          args: Object.freeze(filesystem.fileInput(tool, target)),
          id: "outside-alias",
          effect: tool === "Read" ? filesystem.read(target) : filesystem.write(target),
        })
      }
      yield* filesystem.run
      filesystem.allRefused()
      expect(filesystem.state.observed).toEqual([])
      expect(yield* Effect.promise(() => Bun.file(filesystem.paths.outsideFile).text())).toBe("OUTSIDE SENTINEL")
    }),
  )
}
filesystem.it.live("an internal file alias cannot bypass a deny on the canonical action resource", () =>
  Effect.gen(function* () {
    yield* filesystem.setup([...filesystem.allow, { action: "edit", resource: "restricted.txt", effect: "deny" }])
    const alias = path.join(filesystem.paths.inside, "alias-restricted.txt")
    yield* Effect.promise(() => fs.symlink(filesystem.paths.restricted, alias, "file"))
    filesystem.state.during = async (options) => {
      await filesystem.gates(options, {
        tool: "Write",
        args: Object.freeze(filesystem.fileInput("Write", alias)),
        id: "canonical-deny",
        effect: filesystem.write(alias),
      })
    }
    yield* filesystem.run
    filesystem.allRefused()
    expect(yield* Effect.promise(() => Bun.file(filesystem.paths.restricted).text())).toBe("RESTRICTED")
  }),
)
filesystem.it.live("a dangling internal directory alias cannot authorize creation below its outside target", () =>
  Effect.gen(function* () {
    yield* filesystem.setup()
    const missing = path.join(filesystem.paths.outside, "missing-parent")
    const alias = path.join(filesystem.paths.inside, "dangling-outside")
    yield* Effect.promise(() => fs.symlink(missing, alias, process.platform === "win32" ? "junction" : "dir"))
    filesystem.state.during = async (options) => {
      await filesystem.gates(options, {
        tool: "Write",
        args: Object.freeze(filesystem.fileInput("Write", path.join(alias, "new.txt"))),
        id: "dangling-alias",
        effect: async () => {
          await fs.mkdir(missing)
          await Bun.write(path.join(missing, "new.txt"), "SDK EFFECT")
        },
      })
    }
    yield* filesystem.run
    filesystem.allRefused()
    expect(yield* Effect.promise(() => Bun.file(path.join(missing, "new.txt")).exists())).toBe(false)
  }),
)
filesystem.it.live("a valid internal '..cache' name is not confused with a relative escape", () =>
  Effect.gen(function* () {
    yield* filesystem.setup(filesystem.denyExternal)
    const target = path.join(filesystem.paths.inside, "..cache", "valid.txt")
    yield* Effect.promise(async () => {
      await fs.mkdir(path.dirname(target))
      await Bun.write(target, "CACHE")
    })
    filesystem.state.during = async (options) => {
      await filesystem.gates(options, {
        tool: "Read",
        args: Object.freeze(filesystem.fileInput("Read", target)),
        id: "dot-cache",
        effect: filesystem.read(target),
      })
    }
    yield* filesystem.run
    expect(filesystem.state.effects).toBe(1)
    expect(filesystem.state.observed).toEqual(["CACHE"])
  }),
)

for (const missing of [false, true]) {
  filesystem.it.live(
    `external Write remains possible with both permissions allowed (${missing ? "missing file under real ancestor" : "existing file"})`,
    () =>
      Effect.gen(function* () {
        yield* filesystem.setup()
        const target = missing ? path.join(filesystem.paths.outside, "created.txt") : filesystem.paths.outsideFile
        filesystem.state.during = async (options) => {
          await filesystem.gates(options, {
            tool: "Write",
            args: Object.freeze(filesystem.fileInput("Write", target)),
            id: "external-allow",
            effect: filesystem.write(target),
          })
        }
        yield* filesystem.run
        expect(filesystem.state.effects).toBe(1)
        expect(yield* Effect.promise(() => Bun.file(target).text())).toBe("SDK EFFECT")
      }),
  )
}
filesystem.it.live("Read on an existing outside directory asks for that directory before allowing the real read", () =>
  Effect.gen(function* () {
    yield* filesystem.setup([...filesystem.allow, { action: "external_directory", resource: "*", effect: "ask" }])
    const queue = yield* filesystem.requests
    filesystem.state.during = async (options) => {
      await filesystem.gates(options, {
        tool: "Read",
        args: Object.freeze(filesystem.fileInput("Read", filesystem.paths.outside)),
        id: "directory-read",
        effect: filesystem.search(filesystem.paths.outside),
      })
    }
    const running = yield* filesystem.run.pipe(Effect.forkScoped)
    const request = yield* filesystem.nextRequest(queue, running)
    expect(request.action).toBe("external_directory")
    expect(request.resources).toEqual([filesystem.externalResource])
    const permission = yield* PermissionV2.Service
    yield* permission.reply({ requestID: request.id, reply: "once" })
    yield* Fiber.join(running)
    expect(filesystem.state.effects).toBe(1)
    expect(filesystem.state.observed).toContain("sentinel.txt")
  }),
)
for (const mapping of filesystem.searchTools) {
  filesystem.it.live(`${mapping.tool} retains its original pattern action resource after external root approval`, () =>
    Effect.gen(function* () {
      yield* filesystem.setup([
        ...filesystem.allow,
        { action: mapping.action, resource: "*", effect: "deny" },
        { action: mapping.action, resource: mapping.pattern, effect: "allow" },
      ])
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool: mapping.tool,
          args: Object.freeze({ pattern: mapping.pattern, path: filesystem.paths.outside }),
          id: "external-pattern",
          effect: filesystem.search(filesystem.paths.outside),
        })
      }
      yield* filesystem.run
      expect(filesystem.state.results[0].allow).toBe(true)
      expect(filesystem.state.effects).toBe(1)
      expect(filesystem.state.inputs[0].resources).toEqual([mapping.pattern])
    }),
  )
}

for (const tool of ["Read", "Write"]) {
  filesystem.it.live(`${tool} action deny still wins after external access is approved`, () =>
    Effect.gen(function* () {
      yield* filesystem.setup([
        ...filesystem.allow,
        { action: tool === "Read" ? "read" : "edit", resource: "*", effect: "deny" },
      ])
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool,
          args: Object.freeze(filesystem.fileInput(tool, filesystem.paths.outsideFile)),
          id: "action-deny",
          effect:
            tool === "Read"
              ? filesystem.read(filesystem.paths.outsideFile)
              : filesystem.write(filesystem.paths.outsideFile),
        })
      }
      yield* filesystem.run
      filesystem.allRefused()
      expect(yield* Effect.promise(() => Bun.file(filesystem.paths.outsideFile).text())).toBe("OUTSIDE SENTINEL")
    }),
  )
}
filesystem.it.live("a fresh Session edit deny wins over the agent's external/action allow", () =>
  Effect.gen(function* () {
    yield* filesystem.setup(filesystem.allow, [{ action: "edit", resource: "*", effect: "deny" }])
    filesystem.state.during = async (options) => {
      await filesystem.gates(options, {
        tool: "Write",
        args: Object.freeze(filesystem.fileInput("Write", filesystem.paths.outsideFile)),
        id: "session-deny",
        effect: filesystem.write(filesystem.paths.outsideFile),
      })
    }
    yield* filesystem.run
    filesystem.allRefused()
    expect(yield* Effect.promise(() => Bun.file(filesystem.paths.outsideFile).text())).toBe("OUTSIDE SENTINEL")
  }),
)
filesystem.it.live(
  "the actual Location ToolSafety profile still denies an outside write after both permissions allow",
  () =>
    Effect.gen(function* () {
      yield* filesystem.setup(filesystem.allow, [], { writeRoots: [filesystem.paths.inside] })
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool: "Write",
          args: Object.freeze(filesystem.fileInput("Write", filesystem.paths.outsideFile)),
          id: "profile-deny",
          effect: filesystem.write(filesystem.paths.outsideFile),
        })
      }
      yield* filesystem.run
      filesystem.allRefused()
      expect(yield* Effect.promise(() => Bun.file(filesystem.paths.outsideFile).text())).toBe("OUTSIDE SENTINEL")
    }),
)
filesystem.it.live(
  "typed real filesystem failure denies before SDK effect without exposing the path or raw cause",
  () =>
    Effect.gen(function* () {
      yield* filesystem.setup()
      const blocker = path.join(filesystem.paths.inside, "file-as-ancestor")
      yield* Effect.promise(() => Bun.write(blocker, "REGULAR FILE"))
      const target = path.join(blocker, "PRIVATE_FAILURE_DETAIL.txt")
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool: "Write",
          args: Object.freeze(filesystem.fileInput("Write", target)),
          id: "typed-fs-error",
          effect: filesystem.write(filesystem.paths.outsideFile),
        })
      }
      yield* filesystem.run
      filesystem.allRefused()
      expect(JSON.stringify(filesystem.state.results)).toContain("hosted-filesystem-path")
      expect(JSON.stringify(filesystem.state.results)).not.toMatch(
        /PRIVATE_FAILURE_DETAIL|ENOTDIR|non_directory_ancestor/,
      )
      expect(yield* Effect.promise(() => Bun.file(filesystem.paths.outsideFile).text())).toBe("OUTSIDE SENTINEL")
    }),
)
