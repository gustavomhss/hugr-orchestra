import { mock } from "bun:test"

// Bun keeps one module mock for the whole test process, and it freezes the mocked module's export NAMES the
// first time that module is linked: a later mock.module("electron") can replace the values of the names the
// first one declared, but it cannot introduce a name the first one left out. The Electron module only resolves
// inside the Electron runtime (its index.js exports the binary path, not the API), so every desktop test that
// touches Electron has to mock it, and every one of those mocks has to declare the same names.
//
// One shared surface does that: whichever test file the runner loads first freezes it, and the names the other
// files need are already in it. A test overrides only the part it drives.

// The desktop constructs these four Electron classes and reads no member off them, so a placeholder
// constructor serves each of them. A plain function keeps the mock free of an empty class, and it stays
// constructible and usable with instanceof, which the MCP Dock's view lookup relies on. They stay four
// distinct constructors, so a mock instance of one is never an instance of another.
function BrowserWindow() {}
function Menu() {}
function WebContentsView() {}
function Tray() {}

// The named exports the desktop's own sources import from "electron", with placeholder values. electron-mock.test.ts
// keeps this list equal to the imports the desktop actually makes.
export const electronMock = {
  app: {},
  BrowserWindow,
  Menu,
  WebContentsView,
  Tray,
  clipboard: {},
  contextBridge: {},
  crashReporter: {},
  desktopCapturer: {},
  dialog: {},
  globalShortcut: {},
  ipcMain: {},
  ipcRenderer: {},
  nativeImage: {},
  nativeTheme: {},
  net: {},
  netLog: {},
  protocol: {},
  safeStorage: {},
  screen: {},
  session: { fromPartition: () => ({}) },
  shell: {},
  systemPreferences: {},
  webContents: {},
  webUtils: {},
}

// The one way to mock Electron in a desktop test: the surface always declares every name, so the frozen module
// keeps them whatever order the runner loads the test files in.
export function mockElectron(overrides: Record<string, unknown> = {}) {
  const electron = { ...electronMock, ...overrides }
  mock.module("electron", () => ({ ...electron, default: electron }))
  return electron
}
