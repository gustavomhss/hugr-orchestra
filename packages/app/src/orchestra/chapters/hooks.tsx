import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxPage } from "./kit"

// Placeholder registered by the shared base; the hooks screen replaces this file.
export default function HooksPage(_props: ChapterPageProps) {
  return (
    <MxPage id="orchestra-hooks" title="Hooks" description="">
      <div class="mx-empty">Hooks</div>
    </MxPage>
  )
}
