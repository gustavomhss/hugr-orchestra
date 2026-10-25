import { createMemo, type Accessor } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerProtocol } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { resolveDefaultModel } from "@/hooks/provider-catalog"
import { useProviders } from "@/hooks/use-providers"
import { showToast } from "@/utils/toast"

type ModelKey = { providerID: string; modelID: string }

// New turns start on the configured default model (`config.model`, "provider/model").
export function createDefaultModelController(directory: Accessor<string | null | undefined>) {
  const language = useLanguage()
  const serverSync = useServerSync()
  const protocol = useServerProtocol()
  const providers = useProviders(directory)
  const project = () => {
    const value = directory()
    return value ? serverSync().child(value) : undefined
  }
  // The directory config already merges the global one.
  const current = createMemo(() =>
    resolveDefaultModel(providers.defaultModel(), project()?.[0].config.model ?? serverSync().data.config.model),
  )

  return {
    // The model is written into the global config document once the server answers.
    writable: () => protocol() !== undefined,
    isDefault: (key: ModelKey) => current()?.providerID === key.providerID && current()?.modelID === key.modelID,
    set: (key: ModelKey) => {
      const model = `${key.providerID}/${key.modelID}`
      const before = { global: serverSync().data.config.model, project: project()?.[0].config.model }
      serverSync().set("config", "model", model)
      project()?.[1]("config", "model", model)
      serverSync()
        .updateConfig({ model })
        .catch((err: unknown) => {
          serverSync().set("config", "model", before.global)
          project()?.[1]("config", "model", before.project)
          showToast({
            title: language.t("common.requestFailed"),
            description: err instanceof Error ? err.message : String(err),
          })
        })
    },
  }
}
