// @ts-nocheck

import { Orchestra } from "@orchestra/core"
import { ReadTool } from "@orchestra/core/tools"

const orchestra = Orchestra.make({})

orchestra.tool.add(ReadTool)

orchestra.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

orchestra.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

orchestra.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await orchestra.session.create({
  agent: "build",
})

orchestra.subscribe((event) => {
  console.log(event)
})

await orchestra.session.prompt({
  sessionID,
  text: "hey what is up",
})

await orchestra.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await orchestra.session.wait()

console.log(await orchestra.session.messages(sessionID))
