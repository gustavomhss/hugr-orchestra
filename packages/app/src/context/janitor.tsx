import { createSimpleContext } from "@opencode-ai/ui/context"
import { createStore } from "solid-js/store"
import { createEffect, onCleanup, onMount } from "solid-js"
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

function init(props: { initial?: JanitorReport | null; expanded?: boolean }) {
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const [store, setStore] = createStore<Store>({
    report: props.initial ?? null,
    source: null,
    expanded: props.expanded ?? false,
  })

  const activeSource = () => server.key
  const apply = (event: { report: string; notify: boolean; source: string | null }) => {
    if (event.source !== null && event.source !== activeSource()) return
    const parsed = parseJanitorReport(event.report)
    if (!parsed) return
    const report = usefulJanitorReport(parsed)
    if (!report || report.findings.length === 0) {
      setStore({ report: null, source: null, expanded: false })
      return
    }
    setStore({ report, source: event.source, expanded: false })
    if (!event.notify) return
    void platform.notify(
      language.plural("janitor.notify.title", report.findings.length),
      report.findings[0]?.summary ?? "",
      () => setStore("expanded", true),
    )
  }

  onMount(() => {
    const api = window.api?.janitor
    if (!api) {
      onCleanup(onJanitorReport(apply))
      return
    }
    void api
      .getReport()
      .then((stored) => {
        if (!stored || (stored.source !== null && stored.source !== activeSource())) return
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

  createEffect(() => {
    const source = activeSource()
    if (store.source !== null && store.source !== source) setStore({ report: null, source: null, expanded: false })
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
