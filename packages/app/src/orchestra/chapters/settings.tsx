import { SettingsView } from "@/components/settings-v2/view/settings-view"
import type { ChapterPageProps } from "@/orchestra/chapter-route"

// Routed Settings view (`/orchestra/settings?section=<id>`), registered in chapterPages by the shell.
export default function SettingsPage(props: ChapterPageProps) {
  return <SettingsView server={props.server} directory={props.directory} />
}
