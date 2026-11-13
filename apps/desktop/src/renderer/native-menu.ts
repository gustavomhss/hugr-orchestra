// A language change updates renderer copy, then writes the native menu bundle.
// A failed write leaves those menus stale. It must not look like the change landed.
export async function publishNativeTranslations(input: {
  write: () => Promise<void>
  report: (error: unknown) => void
}) {
  try {
    await input.write()
  } catch (error) {
    console.error(error)
    input.report(error)
  }
}
