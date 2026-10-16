import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { Accordion } from "@orchestra/ui/accordion"
import { DiffChanges } from "@orchestra/ui/diff-changes"
import { Icon } from "@orchestra/ui/icon"
import { StickyAccordionHeader } from "@orchestra/ui/sticky-accordion-header"
import { getDirectory, getFilename } from "@orchestra/core/util/path"
import { normalize } from "@orchestra/session-ui/session-diff"
import { useFileComponent } from "@orchestra/ui/context/file"
import { useLanguage } from "@/context/language"
import type { SummaryDiff } from "./rows"

export function TimelineDiffSummaryRow(props: { diffs: SummaryDiff[] }) {
  const language = useLanguage()
  const maxFiles = 10
  const [state, setState] = createStore({
    showAll: false,
    expanded: [] as string[],
  })
  const showAll = () => state.showAll
  const expanded = () => state.expanded
  const overflow = createMemo(() => Math.max(0, props.diffs.length - maxFiles))
  const visible = createMemo(() => (showAll() ? props.diffs : props.diffs.slice(0, maxFiles)))

  return (
    <div
      data-slot="session-turn-diffs"
      data-component="session-turn-diffs-group"
      data-show-all={showAll() || undefined}
    >
      <div data-slot="session-turn-diffs-header">
        <span data-slot="session-turn-diffs-label">
          {language.plural("ui.sessionTurn.diffs.changed", props.diffs.length)}
        </span>
        <DiffChanges changes={props.diffs} />
        <Show when={overflow() > 0}>
          <button
            type="button"
            aria-expanded={showAll()}
            class="focus-visible:opacity-100!"
            data-slot="session-turn-diffs-toggle"
            onClick={() => setState("showAll", !showAll())}
          >
            {showAll() ? language.t("ui.sessionTurn.diffs.showLess") : language.t("ui.sessionTurn.diffs.showAll")}
          </button>
        </Show>
      </div>
      <div data-component="session-turn-diffs-content">
        <Accordion
          multiple
          style={{ "--sticky-accordion-offset": "44px" }}
          value={expanded()}
          onChange={(value) => setState("expanded", Array.isArray(value) ? value : value ? [value] : [])}
        >
          <For each={visible()}>
            {(diff) => {
              const opened = createMemo(() => expanded().includes(diff.file))

              return (
                <Accordion.Item value={diff.file}>
                  <StickyAccordionHeader>
                    <Accordion.Trigger>
                      <div data-slot="session-turn-diff-trigger">
                        <span data-slot="session-turn-diff-path">
                          <Show when={diff.file.includes("/")}>
                            <span data-slot="session-turn-diff-directory">{`\u202A${getDirectory(diff.file)}\u202C`}</span>
                          </Show>
                          <span data-slot="session-turn-diff-filename">{getFilename(diff.file)}</span>
                        </span>
                        <div data-slot="session-turn-diff-meta">
                          <span data-slot="session-turn-diff-changes">
                            <DiffChanges changes={diff} />
                          </span>
                          <span data-slot="session-turn-diff-chevron">
                            <Icon name="chevron-down" size="small" />
                          </span>
                        </div>
                      </div>
                    </Accordion.Trigger>
                  </StickyAccordionHeader>
                  <Accordion.Content>
                    <Show when={opened()}>
                      <TimelineDiffView diff={diff} />
                    </Show>
                  </Accordion.Content>
                </Accordion.Item>
              )
            }}
          </For>
        </Accordion>
        <Show when={!showAll() && overflow() > 0}>
          <button
            type="button"
            class="w-full text-start"
            aria-expanded={false}
            data-slot="session-turn-diffs-more"
            onClick={() => setState("showAll", true)}
          >
            {language.t("ui.sessionTurn.diffs.more", { count: String(overflow()) })}
          </button>
        </Show>
      </div>
    </div>
  )
}

function TimelineDiffView(props: { diff: SummaryDiff }) {
  const fileComponent = useFileComponent()
  const view = normalize(props.diff)

  return (
    <div data-slot="session-turn-diff-view" data-scrollable>
      <Dynamic component={fileComponent} mode="diff" virtualize={false} fileDiff={view.fileDiff} />
    </div>
  )
}
