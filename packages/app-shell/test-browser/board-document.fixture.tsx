import { render } from "solid-js/web"
import { LanguageProvider } from "@/context/language"
import { PlatformProvider } from "@/context/platform"
import { IssueDiscussion } from "@/orchestra/chapters/board/discussion"
import "@/orchestra/theme.css"

/** External context only: Playwright exercises the real reader, parser and sanitizer in Chromium, not happy-dom. */
export function mount(root: HTMLElement, body: string) {
  return render(() => <PlatformProvider value={{
    platform: "web",
    openExternal(url) {
      root.dataset.external = url
      root.dataset.externalCount = String(Number(root.dataset.externalCount ?? 0) + 1)
    },
    async restart() {},
    async notify() {},
  }}><LanguageProvider locale="en"><IssueDiscussion issueID="DOC-1" channel="execution" time={String}
    notes={[{ id: "doc", issue: 1, author: "backend", kind: "brief", attempt: 1, body, timeCreated: 1 }]} />
  </LanguageProvider></PlatformProvider>, root)
}
