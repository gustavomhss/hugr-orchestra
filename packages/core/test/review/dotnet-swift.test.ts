import { describe, expect, test } from "bun:test"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"

const request: ReviewRoute.Request = { stage: "code", settings: { acceptedUnavailable: [] } }
const languages = (files: string[]) => ReviewRoute.route(request, { files }, {
  files,
  changes: [{ path: "docs/change.md", added: [{ line: 1, text: "changed" }], removed: 0 }],
}, ReviewCatalog.current).languages.filter((language) => language.id === "dotnet" || language.id === "swift")

describe("qualified dotnet and Swift project detection", () => {
  test.each([
    ["src/App/App.csproj", "dotnet", "App.csproj"],
    ["src/App/App.fsproj", "dotnet", "App.fsproj"],
    ["src/App/App.vbproj", "dotnet", "App.vbproj"],
    ["Lib/Foo.csproj", "dotnet", "Foo.csproj"],
    ["Package.swift", "swift", "Package.swift"],
    ["packages/nested/Package.swift", "swift", "Package.swift"],
  ])("routes %s without requiring the manifest to change", (file, id, signal) => {
    expect(languages([file])).toEqual([{ id, source: "path", signal }])
  })

  test.each([
    "src/App.cs", "src/App.fs", "src/App.vb", "Sources/App/App.swift", "Tests/AppTests/App.swift",
    "App.sln", "App.slnx", "App.slnf", "global.json", "Directory.Build.props", "project.assets.json",
    "Package.resolved", "App.xcodeproj/project.pbxproj", "App.xcworkspace/contents.xcworkspacedata",
    "App.CSPROJ", "App.Csproj", "src/App.csproj.backup", "src/App.vcxproj", "src/App.dbproj", "Package.Swift", "package.swift",
  ])("does not infer a supported language from %s alone", (file) => {
    const record = ReviewRoute.route(request, { files: [file] }, {
      files: [file], changes: [{ path: file, added: [{ line: 1, text: "changed" }], removed: 0 }],
    }, ReviewCatalog.current)
    expect(record.languages.filter((language) => language.id === "dotnet" || language.id === "swift")).toEqual([])
  })

  test("manifest admission uses the qualified basename forms", () => {
    expect(ReviewCatalog.current.languages.find((language) => language.id === "dotnet")?.detection.manifests)
      .toEqual(["*.csproj", "*.fsproj", "*.vbproj"])
    expect(ReviewCatalog.current.languages.find((language) => language.id === "swift")?.detection.manifests)
      .toEqual(["Package.swift"])
  })

  test("mixed repositories route both existing skill nodes deterministically", () => {
    const files = ["nested/Z.csproj", "Package.swift", "other/A.csproj", "other/Other.fsproj", "package.json"]
    expect(languages(files)).toEqual(languages(files.toReversed()))
    expect(languages(files)).toEqual([
      { id: "dotnet", source: "path", signal: "A.csproj" },
      { id: "swift", source: "path", signal: "Package.swift" },
    ])
    expect(ReviewRoute.route(request, { files }, { files, changes: [] }, ReviewCatalog.current).languages)
      .toContainEqual({ id: "js-ts", source: "path", signal: "package.json" })
    expect(ReviewCatalog.current.languages.filter((language) => language.id === "dotnet" || language.id === "swift").map((language) => language.node))
      .toEqual(["team-stack-compiled-dotnet", "team-stack-compiled-swift"])
  })
})
