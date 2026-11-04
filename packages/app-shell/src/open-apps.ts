// Pure data, kept free of UI imports: the desktop main process imports it to learn which "open in" apps the
// renderer may name, so a renderer cannot ask main to run an arbitrary executable.
export const OPEN_APPS = [
  "vscode",
  "cursor",
  "zed",
  "textmate",
  "antigravity",
  "finder",
  "terminal",
  "iterm2",
  "ghostty",
  "warp",
  "xcode",
  "android-studio",
  "powershell",
  "sublime-text",
] as const

export type OpenApp = (typeof OPEN_APPS)[number]
export type OpenAppOS = "macos" | "windows" | "linux" | "unknown"

export const MAC_OPEN_APPS = [
  {
    id: "vscode",
    label: "session.header.open.app.vscode",
    icon: "vscode",
    openWith: "Visual Studio Code",
  },
  { id: "cursor", label: "session.header.open.app.cursor", icon: "cursor", openWith: "Cursor" },
  { id: "zed", label: "session.header.open.app.zed", icon: "zed", openWith: "Zed" },
  { id: "textmate", label: "session.header.open.app.textmate", icon: "textmate", openWith: "TextMate" },
  {
    id: "antigravity",
    label: "session.header.open.app.antigravity",
    icon: "antigravity",
    openWith: "Antigravity",
  },
  { id: "terminal", label: "session.header.open.app.terminal", icon: "terminal", openWith: "Terminal" },
  { id: "iterm2", label: "session.header.open.app.iterm2", icon: "iterm2", openWith: "iTerm" },
  { id: "ghostty", label: "session.header.open.app.ghostty", icon: "ghostty", openWith: "Ghostty" },
  { id: "warp", label: "session.header.open.app.warp", icon: "warp", openWith: "Warp" },
  { id: "xcode", label: "session.header.open.app.xcode", icon: "xcode", openWith: "Xcode" },
  {
    id: "android-studio",
    label: "session.header.open.app.androidStudio",
    icon: "android-studio",
    openWith: "Android Studio",
  },
  {
    id: "sublime-text",
    label: "session.header.open.app.sublimeText",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

export const WINDOWS_OPEN_APPS = [
  { id: "vscode", label: "session.header.open.app.vscode", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "session.header.open.app.cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "session.header.open.app.zed", icon: "zed", openWith: "zed" },
  {
    id: "powershell",
    label: "session.header.open.app.powershell",
    icon: "powershell",
    openWith: "powershell",
  },
  {
    id: "sublime-text",
    label: "session.header.open.app.sublimeText",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

export const LINUX_OPEN_APPS = [
  { id: "vscode", label: "session.header.open.app.vscode", icon: "vscode", openWith: "code" },
  { id: "cursor", label: "session.header.open.app.cursor", icon: "cursor", openWith: "cursor" },
  { id: "zed", label: "session.header.open.app.zed", icon: "zed", openWith: "zed" },
  {
    id: "sublime-text",
    label: "session.header.open.app.sublimeText",
    icon: "sublime-text",
    openWith: "Sublime Text",
  },
] as const

export function openAppsForOS(os: OpenAppOS) {
  if (os === "macos") return MAC_OPEN_APPS
  if (os === "windows") return WINDOWS_OPEN_APPS
  return LINUX_OPEN_APPS
}
