import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { isAtlasEmpty } from "../atlas-api"
import { useAtlas } from "../atlas-context"
import { Btn } from "../kit/controls"
import { num } from "../kit/format"

// D41: the empty state's setup. Install creates the store and a policy granting the person every scope, git ignores
// the store, then Orchestra indexes the code. The frame leaves the empty state on its own once the store reads back;
// the toast reports the index, or why setup did not happen.
const REFUSED = {
  "already-installed": "orchestra.atlas.frame.setup.refused.already-installed",
  "no-git": "orchestra.atlas.frame.setup.refused.no-git",
  "no-actor": "orchestra.atlas.frame.setup.refused.no-actor",
} as const

export function AtlasSetup() {
  const atlas = useAtlas()
  const language = useLanguage()
  const pending = () => atlas.controller.state.pending.includes("setup")
  const run = async () => {
    const out = await atlas.controller.setup()
    const installed = out.installed
    if (!installed) return
    if (!installed.installed) {
      atlas.toast(language.t(REFUSED[installed.refusal ?? "already-installed"]), "warning")
      return
    }
    const indexed = out.indexed
    if (!indexed || isAtlasEmpty(indexed)) return atlas.toast(language.t("orchestra.atlas.frame.setup.done"), "sparkle")
    if (!indexed.ran)
      return atlas.toast(language.t("orchestra.atlas.frame.setup.noIndex", { reason: indexed.message ?? "" }), "warning")
    if (indexed.exitCode !== 0)
      return atlas.toast(language.t("orchestra.atlas.frame.setup.indexFailed", { reason: indexed.message ?? "" }), "warning")
    atlas.toast(
      language.t("orchestra.atlas.frame.setup.indexed", { tool: indexed.tool ?? "", n: num(indexed.documents ?? 0) }),
      "sparkle",
    )
  }
  return (
    <div class="at-setup">
      <p class="mx-note">{language.t("orchestra.atlas.frame.setup.writes")}</p>
      <Btn
        primary
        label={language.t(pending() ? "orchestra.atlas.frame.setup.running" : "orchestra.atlas.frame.setup.action")}
        disabled={pending()}
        onClick={() => void run()}
      />
      <Show when={pending()}>
        <p class="muted" role="status">
          {language.t("orchestra.atlas.frame.setup.wait")}
        </p>
      </Show>
    </div>
  )
}
