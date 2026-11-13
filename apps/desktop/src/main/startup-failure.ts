import { nativeT } from "./native-translations"

// Last-resort dialog. English bytes stay the source; a loaded bundle can replace them.
export function startupFailureDialog(reason: string, logs: string) {
  return {
    title: nativeT("desktop.startup.failed"),
    message: nativeT("desktop.startup.failed.detail", {
      reason: reason.split("\n")[0] ?? "",
      logs,
    }),
  }
}
