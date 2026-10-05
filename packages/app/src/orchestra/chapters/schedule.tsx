import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxPage } from "./kit"

// Placeholder registered by the shared base; the schedule screen replaces this file.
export default function SchedulePage(_props: ChapterPageProps) {
  return (
    <MxPage id="orchestra-schedule" title="Schedule" description="">
      <div class="mx-empty">Schedule</div>
    </MxPage>
  )
}
