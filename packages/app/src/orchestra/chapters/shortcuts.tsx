import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxPage } from "./kit"

// Placeholder registered by the shared base; the shortcuts screen replaces this file.
export default function ShortcutsPage(_props: ChapterPageProps) {
  return (
    <MxPage id="orchestra-shortcuts" title="Shortcuts" description="">
      <div class="mx-empty">Shortcuts</div>
    </MxPage>
  )
}
