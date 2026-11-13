// Turning auto-accept on writes the flag first. The list is only the prompts already on screen.
// A failed list leaves the flag on, so a later permission event can still be answered. It must not
// look like those prompts were answered.
export async function answerPendingAfterEnable<T>(input: {
  list: () => Promise<readonly T[]>
  current: () => boolean
  respond: (permission: T) => void
  report: (error: unknown) => void
}) {
  let permissions: readonly T[]
  try {
    permissions = await input.list()
  } catch (error) {
    console.error(error)
    input.report(error)
    return
  }
  if (!input.current()) return
  for (const permission of permissions) input.respond(permission)
}
