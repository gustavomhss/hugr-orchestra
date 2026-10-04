test("Console", () => {
  console.log("diagnostic before failure")
  expect(false).toBe(true)
})
