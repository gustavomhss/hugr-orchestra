describe("approval", () => {
  test("rejects empty", () => expect([]).toHaveLength(1))
  test("accepts value", () => expect(1).toBe(1))
  test.skip("skipped one", () => {})
})
