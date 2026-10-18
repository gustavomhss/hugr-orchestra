// Compiled CLI only: load hugr-omni before the command graph, so a binary shipped without its addon and supervisor
// fails at once. Omni.locate() resolves them (HUGR_OMNI_*, next to the binary, then ../omni for the desktop's CLI).
// OMNI_ENABLED=false (a target without an omni build) and the flag off stay lazy.
declare const OMNI_ENABLED: boolean | undefined

if (
  typeof OMNI_ENABLED !== "undefined" &&
  OMNI_ENABLED &&
  (process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === undefined ||
    process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "1" ||
    process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "strict")
) {
  try {
    const { Omni } = await import("@orchestra/core/omni")
    await Omni.load()
  } catch (error) {
    console.error(
      `hugr-omni CLI preflight failed: ${error instanceof Error ? error.message : String(error)}\nReinstall this CLI with its addon and supervisor, or set HUGR_OMNI_ADDON and HUGR_OMNI_SUPERVISOR to matching files.`,
    )
    process.exit(1)
  }
}

await import("./index")
