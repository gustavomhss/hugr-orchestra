import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxPage } from "./kit"

// Placeholder registered by the shared base; the providers screen replaces this file.
export default function ProvidersPage(_props: ChapterPageProps) {
  return (
    <MxPage id="orchestra-providers" title="Providers" description="">
      <div class="mx-empty">Providers</div>
    </MxPage>
  )
}
