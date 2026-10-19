import { For, type JSX, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useAtlas } from "../atlas-context"
import type { AtlasChecks, AtlasFact, AtlasModel } from "../atlas-model"
import { Icon, useAtlasWords } from "../kit/chips"

// The parts the write sheets share (specs/atlas-ui/mock/app.js:174-181).
const GATE_WORDS = {
  shape: "orchestra.atlas.sheets.gate.shape",
  truth: "orchestra.atlas.sheets.gate.truth",
  authz: "orchestra.atlas.sheets.gate.authz",
  ratify: "orchestra.atlas.sheets.gate.ratify",
} as const

// Renders a sheet's body with the model and the fact it is about; nothing once the fact is gone.
export function WithFact(props: {
  factKey: string
  children: (model: () => AtlasModel, fact: () => AtlasFact) => JSX.Element
}) {
  const atlas = useAtlas()
  return (
    <Show when={atlas.model()}>
      {(model) => <Show when={model().byKey[props.factKey]}>{(fact) => props.children(model, fact)}</Show>}
    </Show>
  )
}

// The Checks strip: `atlas check` in four words, recomputed as the key is typed. It previews the gates from the
// model; the door's own verdict comes back when the write is sent.
export function ChecksStrip(props: { checks: AtlasChecks }) {
  const language = useLanguage()
  const words = useAtlasWords()
  return (
    <div class="at-checks-strip">
      <For each={props.checks.gates}>
        {(gate) => (
          <span
            class={`at-check ${gate.reached ? (gate.pass ? "good" : "bad") : "idle"}`}
            data-tip={gate.pass ? gate.gate : `${gate.gate} · ${gate.reason ?? ""} · ${words.remedy(gate)}`}
          >
            <Icon name={gate.reached ? (gate.pass ? "checkc" : "xc") : "minusc"} />
            {language.t(GATE_WORDS[gate.gate])}
          </span>
        )}
      </For>
    </div>
  )
}

// Who the write is judged as, and the approval key (the ratifier name for core) for this one write. The actor is
// the store's own (`health().actor`: ATLAS_ACTOR, else the git e-mail), read once when the sheet opens.
export function WritingAs(props: { core?: boolean; token: string; onToken: (value: string) => void }) {
  const atlas = useAtlas()
  const language = useLanguage()
  onMount(() => {
    if (!atlas.controller.state.health) void atlas.controller.health()
  })
  const actor = () => {
    const health = atlas.controller.state.health
    return health && "actor" in health ? health.actor : (atlas.model()?.actor ?? "")
  }
  return (
    <div class="mx-fields">
      <label class="mx-field">
        <span>{language.t("orchestra.atlas.sheets.writingAs")}</span>
        <input value={actor()} disabled />
      </label>
      <label class="mx-field">
        <span>{language.t(props.core ? "orchestra.atlas.sheets.ratifier" : "orchestra.atlas.sheets.approvalKey")}</span>
        <input
          type="password"
          autocomplete="off"
          value={props.token}
          placeholder={language.t(
            props.core ? "orchestra.atlas.sheets.ratifier.placeholder" : "orchestra.atlas.sheets.approvalKey.placeholder",
          )}
          onInput={(event) => props.onToken(event.currentTarget.value)}
        />
      </label>
    </div>
  )
}

// A store in git refuses every write (untrusted-store); the sheet says so before anything is sent.
export function LockedNote() {
  const atlas = useAtlas()
  const language = useLanguage()
  const words = useAtlasWords()
  return (
    <Show when={atlas.model() && !atlas.model()?.writable()}>
      <div class="ins-note">
        <Icon name="lock" />
        <span>{language.t("orchestra.atlas.sheets.locked", { reason: words.refusal("untrusted-store") })}</span>
      </div>
    </Show>
  )
}

// The footer of a sheet that only reports: optional actions, then Done.
export function DoneFoot(props: { onDone: () => void; children?: JSX.Element }) {
  const language = useLanguage()
  return (
    <footer class="mx-dialog-foot">
      <span class="grow" />
      {props.children}
      <button type="button" class="mx-btn primary" onClick={() => props.onDone()}>
        {language.t("orchestra.atlas.sheets.done")}
      </button>
    </footer>
  )
}

// Copies a command and says so (the mock's copy action).
export function useCopy() {
  const atlas = useAtlas()
  const language = useLanguage()
  return (text: string) => {
    const done = () => atlas.toast(language.t("orchestra.atlas.sheets.copied"), "copy")
    navigator.clipboard.writeText(text).then(done, done)
  }
}
