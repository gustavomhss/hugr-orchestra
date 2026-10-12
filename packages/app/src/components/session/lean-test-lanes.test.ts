import { expect, test } from "bun:test"

test("Lean DOM test helpers live in the browser lane", async () => {
  for (const file of ["lean-dom.test-helper.ts", "solid-dom.ts"]) {
    expect(await Bun.file(`${import.meta.dir}/../../../test-browser/${file}`).exists()).toBe(true)
    expect(await Bun.file(`${import.meta.dir}/${file}`).exists()).toBe(false)
  }
})
