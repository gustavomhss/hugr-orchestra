import { Show } from "solid-js"
import { Button } from "@orchestra/ui/button"
import { Card } from "@orchestra/ui/card"
import { useDialog } from "@orchestra/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { baseID } from "@/orchestra/chapters/providers-data"

// A turn that failed on the provider's credentials offers to replace the key in place.
export function TimelineErrorCard(props: { text: string; providerID?: string }) {
  const language = useLanguage()
  const dialog = useDialog()
  const sdk = useSDK()
  const updateProviderKey = (providerID: string) =>
    void import("@/components/dialog-connect-provider").then((x) => {
      const controller = x.useProviderConnectController()
      controller.select(baseID(providerID))
      void dialog.show(() => <x.DialogConnectProvider controller={controller} directory={() => sdk().directory} />)
    })

  return (
    <Card variant="error" class="error-card">
      {props.text}
      <Show when={props.providerID}>
        {(providerID) => (
          <div class="mt-2">
            <Button size="small" variant="secondary" onClick={() => updateProviderKey(providerID())}>
              {language.t("orchestra.providers.connectDialog.updateKey")}
            </Button>
          </div>
        )}
      </Show>
    </Card>
  )
}
