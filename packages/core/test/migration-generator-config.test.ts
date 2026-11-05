import { expect, test } from "bun:test"
import config from "../drizzle.config"

test("generator config default is sqlite, pinned schema globs, migration out, and in-memory credentials", () => {
  expect(config).toMatchObject({
    dialect: "sqlite",
    out: "./migration",
    dbCredentials: { url: ":memory:" },
  })
  expect(config.schema).toEqual(["./src/**/*.sql.ts", "./src/**/sql.ts"])
})
