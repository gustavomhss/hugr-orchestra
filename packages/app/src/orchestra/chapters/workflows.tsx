import type { ChapterPageProps } from "../chapter-route"
import { RelayChapter } from "../relay/chapter"

export default function Workflows(props: ChapterPageProps) {
  return <RelayChapter server={props.server} directory={props.directory} kind="workflow" />
}
