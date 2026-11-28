import { expect } from "bun:test"
import { Effect } from "effect"
import { HostFilesystem } from "./fixture/host-filesystem"

const filesystem = HostFilesystem.make()

filesystem.it.live(
  "non-filesystem Bash and Web calls retain their existing authorization without filesystem metadata",
  () =>
    Effect.gen(function* () {
      yield* filesystem.setup()
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool: "Bash",
          args: Object.freeze({ command: "echo fixture" }),
          id: "bash-unchanged",
        })
        await filesystem.gates(options, {
          tool: "WebSearch",
          args: Object.freeze({ query: "fixture" }),
          id: "search-unchanged",
        })
        await filesystem.gates(options, {
          tool: "WebFetch",
          args: Object.freeze({ url: "https://fixture.invalid" }),
          id: "fetch-unchanged",
        })
      }
      yield* filesystem.run
      expect(filesystem.state.effects).toBe(3)
      expect(filesystem.state.results.every((result) => result.allow)).toBe(true)
      expect(filesystem.state.inputs).toHaveLength(3)
      filesystem.state.inputs.forEach((input) => expect(Reflect.get(input, "filesystem")).toBeUndefined())
    }),
)

// These behavioral cases require only the existing actual gate APIs. No absent future field/import can mask them.
for (const mapping of filesystem.fileTools) {
  filesystem.it.live(`BEHAVIOR H4 ${mapping.tool}: external_directory deny wins over wildcard action allow`, () =>
    Effect.gen(function* () {
      yield* filesystem.setup(filesystem.denyExternal)
      const input = Object.freeze(filesystem.fileInput(mapping.tool, filesystem.paths.outsideFile))
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool: mapping.tool,
          args: input,
          id: "outside",
          effect:
            mapping.tool === "Read"
              ? filesystem.read(filesystem.paths.outsideFile)
              : filesystem.write(filesystem.paths.outsideFile),
        })
      }
      yield* filesystem.run
      expect(filesystem.state.inputs).toHaveLength(1)
      filesystem.allRefused()
      expect(filesystem.state.observed).toEqual([])
      expect(yield* Effect.promise(() => Bun.file(filesystem.paths.outsideFile).text())).toBe("OUTSIDE SENTINEL")
      expect(input).toEqual(filesystem.fileInput(mapping.tool, filesystem.paths.outsideFile))
    }),
  )
}
for (const mapping of filesystem.searchTools) {
  filesystem.it.live(`BEHAVIOR H4 ${mapping.tool}: explicit outside search root requires external_directory`, () =>
    Effect.gen(function* () {
      yield* filesystem.setup(filesystem.denyExternal)
      const input = Object.freeze({ pattern: mapping.pattern, path: filesystem.paths.outside })
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool: mapping.tool,
          args: input,
          id: "search-outside",
          effect: filesystem.search(filesystem.paths.outside),
        })
      }
      yield* filesystem.run
      expect(filesystem.state.inputs).toHaveLength(1)
      filesystem.allRefused()
      expect(filesystem.state.observed).toEqual([])
      expect(yield* Effect.promise(() => Bun.file(filesystem.paths.outsideFile).text())).toBe("OUTSIDE SENTINEL")
    }),
  )
}

filesystem.it.live("positive control: all seven mapped tools can execute inside the real Location", () =>
  Effect.gen(function* () {
    yield* filesystem.setup(filesystem.denyExternal)
    filesystem.state.during = async (options) => {
      for (const mapping of filesystem.fileTools)
        await filesystem.gates(options, {
          tool: mapping.tool,
          args: Object.freeze(filesystem.fileInput(mapping.tool, filesystem.paths.insideFile)),
          id: `inside-${mapping.tool}`,
          effect:
            mapping.tool === "Read"
              ? filesystem.read(filesystem.paths.insideFile)
              : filesystem.write(filesystem.paths.insideFile),
        })
      for (const mapping of filesystem.searchTools)
        await filesystem.gates(options, {
          tool: mapping.tool,
          args: Object.freeze({ pattern: mapping.pattern, path: filesystem.paths.inside }),
          id: `inside-${mapping.tool}`,
          effect: filesystem.search(filesystem.paths.inside),
        })
    }
    yield* filesystem.run
    expect(filesystem.state.effects).toBe(7)
    expect(filesystem.state.results.every((result) => result.allow)).toBe(true)
    expect(yield* Effect.promise(() => Bun.file(filesystem.paths.insideFile).text())).toBe("SDK EFFECT")
  }),
)

filesystem.it.live(
  "all seven mappings transport the original filesystem target, kind and resource mode without modifying SDK input",
  () =>
    Effect.gen(function* () {
      yield* filesystem.setup()
      const inputs = filesystem.fileTools.map((mapping) =>
        Object.freeze(filesystem.fileInput(mapping.tool, "inside.txt")),
      )
      filesystem.state.during = async (options) => {
        for (const [index, mapping] of filesystem.fileTools.entries())
          await filesystem.gates(options, {
            tool: mapping.tool,
            args: inputs[index],
            id: `transport-${mapping.tool}`,
          })
        for (const mapping of filesystem.searchTools)
          await filesystem.gates(options, {
            tool: mapping.tool,
            args: Object.freeze({ pattern: mapping.pattern }),
            id: `transport-${mapping.tool}`,
          })
      }
      yield* filesystem.run
      expect(filesystem.state.inputs).toHaveLength(7)
      for (const [index, mapping] of filesystem.fileTools.entries()) {
        const captured: unknown = filesystem.state.inputs[index]
        expect(captured).toMatchObject({
          action: mapping.action,
          filesystem: { path: "inside.txt", kind: mapping.kind, resource: "path" },
        })
        expect(inputs[index]).toEqual(filesystem.fileInput(mapping.tool, "inside.txt"))
        expect(filesystem.state.results[index].sdk).toEqual({ behavior: "allow", updatedInput: inputs[index] })
      }
      for (const [index, mapping] of filesystem.searchTools.entries()) {
        const captured: unknown = filesystem.state.inputs[index + 5]
        expect(captured).toMatchObject({
          action: mapping.action,
          resources: [mapping.pattern],
          filesystem: { path: ".", kind: "directory", resource: "pattern" },
        })
        expect(filesystem.state.results[index + 5].sdk).toEqual({
          behavior: "allow",
          updatedInput: { pattern: mapping.pattern },
        })
      }
    }),
)

for (const mapping of filesystem.fileTools) {
  filesystem.it.live(
    `${mapping.tool} rejects missing, nonstring and empty mandatory paths before the runner authorization port`,
    () =>
      Effect.gen(function* () {
        yield* filesystem.setup()
        filesystem.state.during = async (options) => {
          for (const [index, value] of [undefined, 17, ""].entries()) {
            const input = value === undefined ? {} : filesystem.fileInput(mapping.tool, value)
            await filesystem.gates(options, {
              tool: mapping.tool,
              args: Object.freeze(input),
              id: `invalid-${mapping.tool}-${index}`,
              effect: filesystem.write(filesystem.paths.outsideFile),
            })
          }
        }
        yield* filesystem.run
        filesystem.allRefused(3)
        expect(filesystem.state.inputs).toEqual([])
        expect(yield* Effect.promise(() => Bun.file(filesystem.paths.outsideFile).text())).toBe("OUTSIDE SENTINEL")
      }),
  )
}
for (const mapping of filesystem.searchTools) {
  filesystem.it.live(`${mapping.tool} rejects supplied invalid search paths before authorize`, () =>
    Effect.gen(function* () {
      yield* filesystem.setup()
      filesystem.state.during = async (options) => {
        for (const [index, value] of [17, ""].entries())
          await filesystem.gates(options, {
            tool: mapping.tool,
            args: Object.freeze({ pattern: mapping.pattern, path: value }),
            id: `invalid-${index}`,
            effect: filesystem.search(filesystem.paths.outside),
          })
      }
      yield* filesystem.run
      filesystem.allRefused(2)
      expect(filesystem.state.inputs).toEqual([])
    }),
  )
  filesystem.it.live(`${mapping.tool} defaults an omitted search root to the current Location`, () =>
    Effect.gen(function* () {
      yield* filesystem.setup(filesystem.denyExternal)
      filesystem.state.during = async (options) => {
        await filesystem.gates(options, {
          tool: mapping.tool,
          args: Object.freeze({ pattern: mapping.pattern }),
          id: "default-root",
          effect: filesystem.search(filesystem.paths.inside),
        })
      }
      yield* filesystem.run
      expect(filesystem.state.effects).toBe(1)
      expect(filesystem.state.results[0].allow).toBe(true)
      const captured: unknown = filesystem.state.inputs[0]
      expect(captured).toMatchObject({ filesystem: { path: ".", kind: "directory", resource: "pattern" } })
    }),
  )
}
