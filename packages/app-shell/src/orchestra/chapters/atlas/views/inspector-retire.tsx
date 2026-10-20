import { createMemo, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasFact } from "../atlas-model"
import { useAtlasWords } from "../kit/chips"
import { AtDialog, AtDialogFoot } from "../kit/dialog"
import { ChecksStrip, LockedNote, WritingAs } from "../sheets/parts"
import { writeFact } from "../sheets/write"

// Retire one fact (specs/atlas-ui/mock/app.js:387-394): a SUPERSEDED write drafted against the fact's anchor and
// emitted in its own group. Like every write it needs an approval key. Retired facts are still served today (R6).
export function InspectorRetire(props: { fact: AtlasFact; onClose: () => void }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  const [state, setState] = createStore({ token: "", busy: false })
  const checks = createMemo(() => atlas.model()?.checks(props.fact, { regrounds: true, token: state.token }))
  const confirm = async () => {
    setState("busy", true)
    const outcome = await writeFact(atlas.controller, {
      anchor: props.fact.anchor?.qualifiedPath ?? props.fact.file,
      slot: props.fact.slot ?? "",
      claim: props.fact.claim,
      token: state.token,
      supersede: true,
      scope: props.fact.scope,
    })
    setState("busy", false)
    if (outcome && !outcome.ok)
      return atlas.toast(language.t("orchestra.atlas.sheets.refused", { reason: words.refusal(outcome.reason) }), "xc")
    props.onClose()
    if (outcome) atlas.toast(language.t("orchestra.atlas.fact.retired"), "minusc")
  }
  return (
    <AtDialog
      title={language.t("orchestra.atlas.fact.retire")}
      text={props.fact.claim}
      onClose={() => props.onClose()}
      footer={
        <AtDialogFoot
          label={language.t("orchestra.atlas.fact.retire")}
          disabled={state.busy || !atlas.model()?.writable()}
          onConfirm={() => void confirm()}
          onCancel={() => props.onClose()}
        />
      }
    >
      <Show when={checks()}>{(current) => <ChecksStrip checks={current()} />}</Show>
      <WritingAs token={state.token} onToken={(value) => setState("token", value)} />
      <LockedNote />
      <p class="mx-note">{language.t("orchestra.atlas.kit.state.retired.tip")}</p>
    </AtDialog>
  )
}
