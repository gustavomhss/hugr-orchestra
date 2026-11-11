import { describe, expect, test } from "bun:test"
import { current } from "../../src/review/catalog/entries"
import { languagesRest } from "../../src/review/catalog/languages-rest"

describe("remaining language catalog entries", () => {
  test("ids and nodes", () => {
    expect(languagesRest.map((language) => [language.id, language.node])).toEqual([
      ["rust", "team-stack-compiled-rust"],
      ["jvm", "team-stack-compiled-jvm"],
      ["native", "team-stack-compiled-native"],
      ["dotnet", "team-stack-compiled-dotnet"],
      ["swift", "team-stack-compiled-swift"],
    ])
  })

  test("the live catalog routes the remaining languages", () => {
    expect(current.languages.map((language) => language.id)).toEqual([
      "js-ts",
      "python",
      "go",
      "ruby",
      "php",
      "sql",
      "rust",
      "jvm",
      "native",
      "dotnet",
      "swift",
    ])
  })
})
