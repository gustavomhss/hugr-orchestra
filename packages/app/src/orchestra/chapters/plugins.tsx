import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxPage } from "./kit"

// Placeholder registered by the shared base; the plugins screen replaces this file.
export default function PluginsPage(_props: ChapterPageProps) {
  return (
    <MxPage id="orchestra-plugins" title="Plugins" description="">
      <div class="mx-empty">Plugins</div>
    </MxPage>
  )
}
