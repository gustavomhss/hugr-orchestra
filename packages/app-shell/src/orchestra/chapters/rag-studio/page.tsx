import { useLanguage } from "@/context/language"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxPage } from "../kit"
import { Files } from "./files"
import { Maintain } from "./maintain"
import { Question } from "./question"

export default function RagStudioPage(props: ChapterPageProps) {
  const language = useLanguage()
  return (
    <MxPage
      id="rag-studio"
      eyebrow={language.t("orchestra.nav.ragStudio")}
      title={language.t("orchestra.ragStudio.title")}
      description={language.t("orchestra.ragStudio.description")}
    >
      <Files server={props.server} directory={props.directory} />
      <Question server={props.server} directory={props.directory} />
      <Maintain server={props.server} directory={props.directory} />
    </MxPage>
  )
}
