// expect(promise).rejects waits in a nested event loop, and on Windows Bun 1.3.14 can spin there forever when the
// promise needs a timer to settle. Awaiting these instead keeps each assertion and its failure meaning.

// The rejection reason; a promise that resolves fails the test instead.
export function rejection(promise: unknown) {
  return Promise.resolve(promise).then(
    (value) => {
      throw new Error("Expected promise to reject", { cause: value })
    },
    (error: unknown) => error,
  )
}

// Outside .rejects, toThrow only accepts a function, so this hands it one that throws the rejection reason.
export function rethrow(promise: unknown) {
  return rejection(promise).then((error) => () => {
    throw error
  })
}
