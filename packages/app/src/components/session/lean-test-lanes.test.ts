import { expect, test } from "bun:test"

test("Lean DOM test and JSX helper moved to the browser lane", async () => {
  for (const file of ["lean-project-metrics.test.ts", "lean-project-metrics.test-helper.ts"]) {
    expect(await Bun.file(`${import.meta.dir}/../../../test-browser/${file}`).exists()).toBe(true)
    expect(await Bun.file(`${import.meta.dir}/${file}`).exists()).toBe(false)
  }
})
