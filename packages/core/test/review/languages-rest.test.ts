import { describe, expect, test } from "bun:test"
import { languagesRest } from "../../src/review/catalog/languages-rest"

describe("remaining language catalog entries", () => {
  test("ids and nodes", () => {
    expect(languagesRest.map((language) => [language.id, language.node])).toEqual([
      ["rust", "team-stack-compiled-rust"],
      ["jvm", "team-stack-compiled-jvm"],
      ["native", "team-stack-compiled-native"],
    ])
  })
})
