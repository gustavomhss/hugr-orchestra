const { ipcRenderer } = require("electron")

window.__testIpcInvoke = (channel, args) => ipcRenderer.invoke(channel, ...args)
