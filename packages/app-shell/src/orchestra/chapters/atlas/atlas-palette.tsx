import { makeEventListener } from "@solid-primitives/event-listener"
import { createMemo, For, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useAtlas } from "./atlas-context"
import type { AtlasMemberId } from "./atlas-model"
import { atlasHref } from "./atlas-route"
import { Icon } from "./kit/chips"
import { AtDialog } from "./kit/dialog"
import { seatName } from "./kit/format"
import type { AtlasIconName } from "./kit/icons"

// Search, the keyboard and the shortcuts sheet, ported from specs/atlas-ui/mock/app.js:598-686. ⌘K stays the app's
// command palette; inside Atlas, `/` opens this search (or focuses the list search when the view has one).

type Entry = { group: string; label: string; hint: string; icon: AtlasIconName; run: () => void }
const MEMBERS: AtlasMemberId[] = ["backend", "jimmy", "archie", "maestro"]
const CHORDS: Record<string, string | undefined> = {
  o: atlasHref("overview"),
  e: atlasHref("explore"),
  n: atlasHref("genesis"),
  w: atlasHref("how"),
  k: atlasHref("explore"),
  r: atlasHref("review"),
  a: atlasHref("activity"),
  h: atlasHref("overview", "", { show: "health" }),
  y: atlasHref("memory", "backend"),
}

export function AtlasPalette(props: { prefix: string; onClose: () => void }) {
  const atlas = useAtlas()
  const language = useLanguage()
  const [state, setState] = createStore({ text: props.prefix, index: 0 })
  let input!: HTMLInputElement
  let list!: HTMLDivElement
  onMount(() => input.focus())
  const everything = (words: string[]): Entry[] => {
    const model = atlas.model()
    const go = (href: string) => () => atlas.go(href)
    const pages: Entry[] = (
      [
        ["orchestra.atlas.frame.palette.page.home", atlasHref("overview"), "home"],
        ["orchestra.atlas.frame.palette.page.graph", atlasHref("explore"), "graph"],
        ["orchestra.atlas.frame.palette.page.map", atlasHref("explore", "", { view: "map" }), "stack"],
        ["orchestra.atlas.frame.palette.page.list", atlasHref("explore", "", { view: "list" }), "list"],
        ["orchestra.atlas.frame.palette.page.genesis", atlasHref("genesis"), "sparkle"],
        ["orchestra.atlas.frame.palette.page.architecture", atlasHref("architecture"), "stack"],
        ["orchestra.atlas.frame.palette.page.ownership", atlasHref("ownership"), "territory"],
        ["orchestra.atlas.frame.palette.page.how", atlasHref("how"), "fact"],
        ["orchestra.atlas.frame.palette.page.changed", atlasHref("review", "", { tab: "changed" }), "drift"],
        ["orchestra.atlas.frame.palette.page.mined", atlasHref("review", "", { tab: "mined" }), "sparkle"],
        ["orchestra.atlas.frame.palette.page.ratify", atlasHref("review", "", { tab: "ratify" }), "shield"],
        ["orchestra.atlas.frame.palette.page.activity", atlasHref("activity"), "history"],
        ["orchestra.atlas.frame.palette.page.health", atlasHref("overview", "", { show: "health" }), "health"],
      ] as const
    ).map((page) => ({ group: language.t("orchestra.atlas.frame.palette.group.goto"), label: language.t(page[0]), hint: "", icon: page[2], run: go(page[1]) }))
    const units: Entry[] = (model?.units() ?? []).map((unit) => ({
      group: language.t("orchestra.atlas.frame.palette.group.units"),
      label: unit.id,
      hint: language.t("orchestra.atlas.frame.palette.unitFacts", { count: unit.facts }),
      icon: "stack",
      run: go(atlasHref("unit", unit.id)),
    }))
    const files: Entry[] = [...new Set((model?.live() ?? []).map((fact) => fact.file))].map((file) => ({
      group: language.t("orchestra.atlas.frame.palette.group.files"),
      label: file,
      hint: "",
      icon: "code",
      run: go(atlasHref("unit", file)),
    }))
    const facts: Entry[] = (model?.live() ?? []).map((fact) => ({
      group: language.t("orchestra.atlas.frame.palette.group.facts"),
      label: fact.claim,
      hint: fact.file.split("/").at(-1) ?? "",
      icon: "fact",
      run: () =>
        ["unit", "review"].includes(atlas.route().view)
          ? atlas.open(fact.key)
          : atlas.go(atlasHref("unit", model?.unitOf(fact.file) ?? "", { fact: fact.key })),
    }))
    const memory: Entry[] = MEMBERS.map((id) => ({
      group: language.t("orchestra.atlas.frame.palette.group.memory"),
      label: language.t("orchestra.atlas.frame.palette.memory", { name: seatName(id) }),
      hint: "",
      icon: "memory",
      run: go(atlasHref("memory", id)),
    }))
    const actions: Entry[] = [
      {
        group: language.t("orchestra.atlas.frame.palette.group.actions"),
        label: language.t("orchestra.atlas.frame.palette.shortcuts"),
        hint: "",
        icon: "keyboard",
        run: () => atlas.shortcuts(),
      },
    ]
    const match = (entry: Entry) => words.every((word) => `${entry.label} ${entry.hint} ${entry.group}`.toLowerCase().includes(word))
    return [...pages, ...units, ...memory, ...actions]
      .filter(match)
      .concat(words.length ? files.filter(match).slice(0, 8) : [], words.length ? facts.filter(match).slice(0, 12) : [])
  }
  const found = createMemo(() => everything(state.text.toLowerCase().split(/\s+/).filter(Boolean)).slice(0, 40))
  const groups = createMemo(() => [...new Set(found().map((entry) => entry.group))])
  const select = (index: number) => {
    setState("index", index)
    list.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest" })
  }
  const run = (index: number) => {
    const entry = found()[index]
    props.onClose()
    entry?.run()
  }
  return (
    <div class="at-palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div class="at-palette" role="dialog" aria-label={language.t("orchestra.atlas.frame.palette.aria")}>
        <div class="at-palette-input">
          <Icon name="search" />
          <input
            ref={input}
            placeholder={language.t("orchestra.atlas.frame.palette.placeholder")}
            aria-label={language.t("orchestra.atlas.frame.palette.aria")}
            autocomplete="off"
            value={state.text}
            onInput={(event) => setState({ text: event.currentTarget.value, index: 0 })}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                return props.onClose()
              }
              if (event.key === "ArrowDown") {
                event.preventDefault()
                return select(Math.min(found().length - 1, state.index + 1))
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                return select(Math.max(0, state.index - 1))
              }
              if (event.key === "Enter") {
                event.preventDefault()
                run(state.index)
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div class="at-palette-list" role="listbox" ref={list}>
          <Show
            when={found().length}
            fallback={<div class="at-palette-empty">{language.t("orchestra.atlas.frame.palette.empty", { query: state.text })}</div>}
          >
            <For each={groups()}>
              {(name) => (
                <>
                  <div class="at-palette-group">{name}</div>
                  <For each={found()}>
                    {(entry, index) => (
                      <Show when={entry.group === name}>
                        <button
                          type="button"
                          class="at-palette-item"
                          role="option"
                          data-i={index()}
                          aria-selected={index() === state.index}
                          onMouseMove={() => setState("index", index())}
                          onClick={() => run(index())}
                        >
                          <Icon name={entry.icon} />
                          <span class="grow">{entry.label}</span>
                          <code>{entry.hint}</code>
                        </button>
                      </Show>
                    )}
                  </For>
                </>
              )}
            </For>
          </Show>
        </div>
        <div class="at-palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {language.t("orchestra.atlas.frame.palette.move")}
          </span>
          <span>
            <kbd>↵</kbd> {language.t("orchestra.atlas.frame.palette.open")}
          </span>
          <span>
            <kbd>esc</kbd> {language.t("orchestra.atlas.frame.palette.close")}
          </span>
        </div>
      </div>
    </div>
  )
}

export function AtlasShortcuts(props: { onClose: () => void }) {
  const language = useLanguage()
  const row = (label: string, keys: string[]) => (
    <div>
      {label}
      <span>
        <For each={keys}>{(key) => <kbd>{key}</kbd>}</For>
      </span>
    </div>
  )
  return (
    <AtDialog
      title={language.t("orchestra.atlas.frame.keys.title")}
      wide
      onClose={props.onClose}
      footer={
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn primary" onClick={() => props.onClose()}>
            {language.t("orchestra.atlas.frame.keys.done")}
          </button>
        </footer>
      }
    >
      <div class="at-keys">
        <h5>{language.t("orchestra.atlas.frame.keys.anywhere")}</h5>
        {row(language.t("orchestra.atlas.frame.keys.search"), ["/"])}
        {row(language.t("orchestra.atlas.frame.keys.shortcuts"), ["?"])}
        {row(language.t("orchestra.atlas.frame.keys.close"), ["esc"])}
        <div />
        <h5>{language.t("orchestra.atlas.frame.keys.lists")}</h5>
        {row(language.t("orchestra.atlas.frame.keys.next"), ["j"])}
        {row(language.t("orchestra.atlas.frame.keys.previous"), ["k"])}
        {row(language.t("orchestra.atlas.frame.keys.open"), ["↵"])}
        <div />
        <h5>{language.t("orchestra.atlas.frame.keys.goto")}</h5>
        {row(language.t("orchestra.atlas.frame.keys.overview"), ["g", "o"])}
        {row(language.t("orchestra.atlas.frame.keys.knowledge"), ["g", "k"])}
        {row(language.t("orchestra.atlas.frame.keys.review"), ["g", "r"])}
        {row(language.t("orchestra.atlas.frame.keys.activity"), ["g", "a"])}
        {row(language.t("orchestra.atlas.frame.keys.health"), ["g", "h"])}
        {row(language.t("orchestra.atlas.frame.keys.memory"), ["g", "y"])}
      </div>
    </AtDialog>
  )
}

// The page keyboard (mock app.js:601-631), active while the Atlas page is mounted. Modified keys stay the app's.
// It renders nothing; it sits inside the Atlas context so it can navigate.
export function AtlasKeys(options: { main: () => HTMLElement | undefined; blocked: () => boolean }) {
  const atlas = useAtlas()
  const chord = { armed: false }
  const step = (delta: number) => {
    const main = options.main()
    if (!main) return
    const list = [
      ...new Set(
        [...main.querySelectorAll<HTMLElement>('[data-action="open"][data-value]')].map((element) => element.dataset.value ?? ""),
      ),
    ]
    if (!list.length) return
    const at = list.indexOf(atlas.route().query.fact ?? "")
    atlas.open(list[Math.max(0, Math.min(list.length - 1, at < 0 ? 0 : at + delta))])
  }
  makeEventListener(document, "keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (options.blocked()) return
    const target = event.target instanceof HTMLElement ? event.target : undefined
    const typing = !!target?.matches("input, textarea, select")
    if (event.key === "Escape") {
      if (typing) return target?.blur()
      if (atlas.route().query.fact) return atlas.close()
    }
    if (typing) return
    if (chord.armed) {
      chord.armed = false
      const href = CHORDS[event.key]
      if (href) {
        event.preventDefault()
        return atlas.go(href)
      }
    }
    if (event.key === "g") {
      chord.armed = true
      return
    }
    if (event.key === "/") {
      event.preventDefault()
      const search = options.main()?.querySelector<HTMLElement>("#list-search")
      if (search) return search.focus()
      return atlas.palette()
    }
    if (event.key === "?") return atlas.shortcuts()
    if (event.key === "j" || event.key === "k") {
      event.preventDefault()
      if (atlas.route().query.fact) return step(event.key === "j" ? 1 : -1)
      const rows = [...(options.main()?.querySelectorAll<HTMLElement>("[data-action][tabindex]") ?? [])]
      const active = document.activeElement instanceof HTMLElement ? rows.indexOf(document.activeElement) : -1
      rows[Math.max(0, Math.min(rows.length - 1, active + (event.key === "j" ? 1 : -1)))]?.focus()
      return
    }
    if ((event.key === "Enter" || event.key === " ") && target?.matches("[data-action][tabindex]")) {
      event.preventDefault()
      target.click()
    }
  })
  return null
}
