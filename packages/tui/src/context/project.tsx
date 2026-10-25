import { batch } from "solid-js"
import type { Path } from "../compat/schema"
import { createStore, reconcile } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { useSDK } from "./sdk"
import { useTuiPaths } from "./runtime"

export const { use: useProject, provider: ProjectProvider } = createSimpleContext({
  name: "Project",
  init: () => {
    const sdk = useSDK()
    const paths = useTuiPaths()

    const defaultPath = {
      home: paths.home,
      state: paths.state,
      config: "",
      worktree: "",
      directory: sdk.directory ?? "",
    } satisfies Path

    const [store, setStore] = createStore({
      project: {
        id: undefined as string | undefined,
        worktree: undefined as string | undefined,
        mainDir: undefined as string | undefined,
      },
      instance: {
        path: defaultPath,
      },
      workspace: {
        current: undefined as string | undefined,
      },
    })

    async function sync() {
      const location = await sdk.catalog.location({ directory: sdk.directory, workspace: store.workspace.current })
      const directories = await sdk.catalog.directories(location.project.id)
      batch(() => {
        // V2 serves no path route; home and state are this process's own, and the config directory has no
        // TUI reader.
        setStore(
          "instance",
          "path",
          reconcile({ ...defaultPath, worktree: location.project.directory, directory: location.directory }),
        )
        setStore("project", "id", location.project.id)
        setStore("project", "worktree", location.project.directory)
        setStore("project", "mainDir", directories.findLast((item) => item.strategy === undefined)?.directory)
      })
    }

    return {
      data: store,
      project() {
        return store.project.id
      },
      instance: {
        path() {
          return store.instance.path
        },
        directory() {
          return store.instance.path.directory
        },
      },
      workspace: {
        current() {
          return store.workspace.current
        },
        set(next?: string | null) {
          const workspace = next ?? undefined
          if (store.workspace.current === workspace) return
          setStore("workspace", "current", workspace)
        },
      },
      sync,
    }
  },
})
