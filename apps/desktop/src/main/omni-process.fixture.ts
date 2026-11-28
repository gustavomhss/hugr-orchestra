export async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 15_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("condition not met in 15s")
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
