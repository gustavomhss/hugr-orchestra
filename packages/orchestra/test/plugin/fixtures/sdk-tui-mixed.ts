import { tool } from "@orchestra/plugin"

export { tool }
export { tool as subpathTool } from "@orchestra/plugin/tool"
export { define as effectDefine } from "@orchestra/plugin/v2/effect"
export { define as pluginDefine } from "@orchestra/plugin/v2/effect/plugin"
export { define as promiseDefine } from "@orchestra/plugin/v2/promise"
export { createBindingLookup } from "@orchestra/plugin/tui"

export const greet = tool({
  description: "Greets someone",
  args: { name: tool.schema.string() },
  execute: async (args) => `hello ${args.name}`,
})
