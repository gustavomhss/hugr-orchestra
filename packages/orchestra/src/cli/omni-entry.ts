// Compiled CLI only: validate shipped files before loading the command graph. Flag-off remains lazy.
import { realpathSync } from "node:fs"
import path from "node:path"

declare const OMNI_ENABLED: boolean | undefined

if (
  typeof OMNI_ENABLED !== "undefined" &&
  OMNI_ENABLED &&
  (process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "1" ||
    process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "strict")
) {
  try {
    const { Omni } = await import("@orchestra/core/omni")
    const addon =
      process.env.HUGR_OMNI_ADDON ?? path.join(path.dirname(realpathSync(process.execPath)), "hugr_omni.node")
    Omni.configure({
      addon,
      supervisor:
        process.env.HUGR_OMNI_SUPERVISOR ??
        path.join(path.dirname(addon), `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`),
    })
    await Omni.load()
  } catch (error) {
    console.error(
      `hugr-omni CLI preflight failed: ${error instanceof Error ? error.message : String(error)}\nReinstall this CLI with its addon and supervisor, or set HUGR_OMNI_ADDON and HUGR_OMNI_SUPERVISOR to matching files.`,
    )
    process.exit(1)
  }
}

await import("../index")
