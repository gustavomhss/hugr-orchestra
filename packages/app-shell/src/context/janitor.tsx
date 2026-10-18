import { createSimpleContext } from "@orchestra/ui/context"
import { createStore, unwrap } from "solid-js/store"
import { createEffect, onCleanup, untrack, type Accessor } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { onJanitorReport } from "@/context/server-sync"
import { parseJanitorReport, usefulJanitorReport, type JanitorReport } from "@/utils/janitor-report"

const SnoozeMinutes = 24 * 60

type Store = {
  report: JanitorReport | null
  source: string | null
  expanded: boolean
}

function init(props: { initial?: JanitorReport | null; expanded?: boolean; enabled?: Accessor<boolean> }) {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const [store, setStore] = createStore<Store>({
    report: props.initial ?? null,
    source: null,
    expanded: props.expanded ?? false,
  })

  const activeSource = () => server.key
  const enabled = () => props.enabled?.() ?? props.initial !== undefined
  const apply = (event: { report: string; notify: boolean; source: string | null }) => {
    if (!enabled()) return
    if (event.source !== null && event.source !== activeSource()) return
    const parsed = parseJanitorReport(event.report)
    if (!parsed) return
    const report = usefulJanitorReport(parsed)
    if (!report || report.findings.length === 0) {
      setStore({ report: null, source: null, expanded: false })
      return
    }
    if (store.source === event.source && JSON.stringify(store.report) === JSON.stringify(report)) return
    setStore({ report, source: event.source, expanded: false })
    if (!event.notify) return
    void platform.notify(
      language.plural("janitor.notify.title", report.findings.length),
      report.findings[0]?.summary ?? "",
      () => {
        if (!enabled() || unwrap(store.report) !== report) return
        if (event.source !== null && event.source !== activeSource()) return
        setStore("expanded", true)
      },
    )
  }

  createEffect(() => {
    const source = activeSource()
    if (!enabled()) {
      setStore({ report: null, source: null, expanded: false })
      return
    }
    if (untrack(() => store.source !== null && store.source !== source))
      setStore({ report: null, source: null, expanded: false })
    const life = { active: true }
    onCleanup(() => {
      life.active = false
    })
    const api = window.api?.janitor
    if (!api) {
      onCleanup(onJanitorReport(apply))
      return
    }
    void api
      .getReport()
      .then((stored) => {
        if (!life.active || !enabled() || source !== activeSource()) return
        if (!stored || (stored.source !== null && stored.source !== source)) return
        const parsed = parseJanitorReport(stored.report)
        const report = parsed ? usefulJanitorReport(parsed) : null
        setStore({
          report: report && report.findings.length > 0 ? report : null,
          source: report && report.findings.length > 0 ? stored.source : null,
        })
      })
      .catch(() => undefined)
    onCleanup(api.onReport(apply))
  })

  return {
    store,
    expand() {
      setStore("expanded", true)
    },
    collapse() {
      setStore("expanded", false)
    },
    dismiss() {
      const source = store.source
      setStore({ report: null, source: null, expanded: false })
      const api = window.api?.janitor
      if (api) void api.dismiss(source).catch(() => undefined)
    },
    snooze() {
      const source = store.source
      setStore({ report: null, source: null, expanded: false })
      const api = window.api?.janitor
      if (api) void api.snooze(SnoozeMinutes, source).catch(() => undefined)
    },
  }
}

export const { use: useJanitor, provider: JanitorProvider } = createSimpleContext({
  name: "Janitor",
  init,
})
