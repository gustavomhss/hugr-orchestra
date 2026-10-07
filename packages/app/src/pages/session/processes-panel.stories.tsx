// @ts-nocheck
import { createStore } from "solid-js/store"
import { ProcessesList } from "@/pages/session/processes-panel"
import { createProcessStops } from "@/pages/session/processes-data"

export default {
  title: "Session/Background Processes",
  id: "session-background-processes",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `### Overview
Real \`ProcessesList\` from app code: the process trees a session's shell tool left running (O1(b)).

### Source path
- \`packages/app/src/pages/session/processes-panel.tsx\`

### Notes
- Stop resolves after 600 ms and removes the row; "fail-dev" rejects, to show the failed state and Retry.
- An empty list renders nothing.`,
      },
    },
  },
}

const output = Array.from({ length: 20 }, (_, index) => `[vite] hmr update /src/app.tsx (x${index + 1})`).join("\n")

const seed = () => [
  {
    id: "job_dev",
    pid: 48121,
    title: "npm run dev &",
    started: Date.now() - 90_000,
    processes: [
      { pid: 48121 },
      { pid: 48122, parentPid: 48121, name: "node" },
      { pid: 48130, parentPid: 48122, name: "esbuild" },
    ],
    output: `  VITE v5.4.0  ready in 412 ms\n\n  ➜  Local:   http://localhost:5173/\n${output}\n`,
    written: 4096,
  },
  {
    id: "fail-dev",
    pid: 48200,
    title: "python -m http.server 8000 &",
    started: Date.now() - 30_000,
    processes: [{ pid: 48200, name: "python3" }],
    output: "",
    written: 0,
  },
]

function Stage() {
  const [store, setStore] = createStore({ items: seed() })
  const stops = createProcessStops(
    (id) =>
      new Promise((resolve, reject) =>
        setTimeout(() => {
          if (id === "fail-dev") return reject(new Error("stop failed"))
          setStore("items", (items) => items.filter((item) => item.id !== id))
          resolve(undefined)
        }, 600),
      ),
  )
  return (
    <div style={{ width: "360px" }}>
      <ProcessesList items={store.items} stop={stops.state} onStop={stops.stop} />
      <button type="button" onClick={() => setStore("items", seed())}>
        Reset
      </button>
    </div>
  )
}

export const Default = {
  render: () => <Stage />,
}
