import { mock } from "bun:test"

// Bun keeps one module mock for the whole test process, and it freezes the mocked module's export NAMES the
// first time that module is linked: a later mock.module("electron") can replace the values of the names the
// first one declared, but it cannot introduce a name the first one left out. The Electron module only resolves
// inside the Electron runtime (its index.js exports the binary path, not the API), so every desktop test that
// touches Electron has to mock it, and every one of those mocks has to declare the same names.
//
// One shared surface does that: whichever test file the runner loads first freezes it, and the names the other
// files need are already in it. A test overrides only the part it drives.

// The named exports the desktop's own sources import from "electron", with placeholder values. electron-mock.test.ts
// keeps this list equal to the imports the desktop actually makes.
export const electronMock = {
  app: {},
  BrowserWindow: class {},
  Menu: class {},
  WebContentsView: class {},
  clipboard: {},
  contextBridge: {},
  crashReporter: {},
  dialog: {},
  ipcMain: {},
  ipcRenderer: {},
  nativeImage: {},
  nativeTheme: {},
  net: {},
  netLog: {},
  protocol: {},
  screen: {},
  session: { fromPartition: () => ({}) },
  shell: {},
  utilityProcess: {},
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
