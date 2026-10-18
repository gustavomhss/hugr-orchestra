type Input = {
  type: string
  key: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
  isAutoRepeat?: boolean
}

export function appDockShortcut(input: Input, platform = process.platform) {
  if (input.type !== "keyDown" || input.alt || input.shift || input.isAutoRepeat) return
  if (platform === "darwin" ? !input.meta || input.control : !input.control || input.meta) return
  const key = input.key.toLowerCase()
  if (key === "l") return "address" as const
  if (key === "t") return "new-tab" as const
  if (key === "w") return "close-tab" as const
}
