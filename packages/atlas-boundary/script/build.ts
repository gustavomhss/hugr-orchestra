import path from "node:path"
import { generateDtsBundle } from "dts-bundle-generator"

const root = path.resolve(import.meta.dir, "../../..")
const output = path.resolve(import.meta.dir, "../src/generated")
const check = Bun.argv.includes("--check")
await Promise.all(
  (
    [
      ["boundary", "retrieval/src/host-context.ts"],
      ["materialize", "retrieval/src/own-snapshot.ts"],
      // F3 A3: the bound Memory header read only; recall, fold and write stay outside the installed boundary.
      ["native-header", "adapter-io/src/native-header.ts"],
    ] as const
  ).map(async ([name, file]) => {
    const entry = path.join(root, "foundation/atlas/packages", file)
    const result = await Bun.build({
      entrypoints: [entry],
      target: "node",
      format: "esm",
      // Bun's cross-module identifier minifier is nondeterministic: repeated builds of the same graph
      // occasionally permute short names, so check:generated flakes. Keep whitespace and syntax minification only.
      minify: { whitespace: true, syntax: true, identifiers: false },
      plugins: [
        {
          name: "canonical-atlas-build-boundary",
          setup(builder) {
            builder.onResolve({ filter: /^@atlas\// }, (args) => ({
              path: path.join(root, "foundation/atlas/packages", args.path.slice("@atlas/".length), "src/index.ts"),
            }))
            builder.onResolve({ filter: /^@noble\/hashes\// }, (args) => ({
              path: Bun.resolveSync(args.path, path.resolve(import.meta.dir, "..")),
            }))
          },
        },
      ],
    })
    if (!result.success || result.outputs.length !== 1)
      throw new Error(`Atlas boundary build failed: ${result.logs.join("\n")}`)
    const declarations = generateDtsBundle([{ filePath: entry, output: { exportReferencedTypes: false } }], {
      preferredConfigPath: path.join(import.meta.dir, "tsconfig.json"),
    })
    if (declarations.length !== 1 || !declarations[0]?.trim())
      throw new Error("Atlas boundary declaration build was empty")
    const generated = [
      { path: path.join(output, `${name}.js`), content: await result.outputs[0].text() },
      { path: path.join(output, `${name}.d.ts`), content: declarations[0] },
    ]
    await Promise.all(
      generated.map(async (file) => {
        if (!check) return Bun.write(file.path, file.content)
        if (!(await Bun.file(file.path).exists())) throw new Error(`Missing generated Atlas boundary: ${file.path}`)
        if ((await Bun.file(file.path).text()) !== file.content)
          throw new Error(`Stale generated Atlas boundary: ${file.path}`)
      }),
    )
  }),
)
