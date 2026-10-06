export type LinuxApp = { id: string; name: string }

export type LinuxError = "unavailable" | "failed" | "invalid-package" | "architecture-mismatch"

export type LinuxState = {
  phase: "stopped" | "starting" | "ready" | "installing" | "error"
  apps: LinuxApp[]
  error?: LinuxError
}

export type LinuxTab = { tabID: string; generation: number; url: "appdock://linux" }

export type LinuxOpenResult = { status: "opened"; tab: LinuxTab } | { status: "failed"; code: LinuxError }
export type LinuxInstallResult =
  | { status: "installed"; apps: LinuxApp[] }
  | { status: "cancelled" }
  | { status: "failed"; code: LinuxError }
export type LinuxLaunchResult = { status: "launched" } | { status: "failed"; code: LinuxError }

export type LinuxWindow = { id: number; title: string; minimized: boolean; focused: boolean }
export type LinuxWindowsResult =
  | { status: "ready"; windows: LinuxWindow[] }
  | { status: "failed"; code: LinuxError }
export type LinuxFocusResult = { status: "focused" } | { status: "failed"; code: LinuxError }

export type AppDockLinuxAPI = {
  appDockLinuxOpen: (
    bounds: { x: number; y: number; width: number; height: number },
    profile?: string,
  ) => Promise<LinuxOpenResult>
  appDockLinuxList: () => Promise<LinuxState>
  appDockLinuxInstall: () => Promise<LinuxInstallResult>
  appDockLinuxLaunch: (appID: string) => Promise<LinuxLaunchResult>
  appDockLinuxWindows: (tabID: string, generation: number) => Promise<LinuxWindowsResult>
  appDockLinuxFocus: (tabID: string, generation: number, windowID: number) => Promise<LinuxFocusResult>
}
