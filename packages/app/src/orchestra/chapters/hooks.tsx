import type { ChapterPageProps } from "../chapter-route"
import { RelayChapter } from "../relay/chapter"

export default function Hooks(props: ChapterPageProps) {
  return <RelayChapter server={props.server} directory={props.directory} kind="hook" />
}
