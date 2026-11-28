import { Tabs } from "@kobalte/core/tabs"
import { createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { MxPage } from "../kit"
import { Files } from "./files"
import { Maintain } from "./maintain"
import { Question } from "./question"
import { createRagRoster, RagRosterProvider } from "./roster"
import "./studio.css"

export default function RagStudioPage(props: ChapterPageProps) {
  const language = useLanguage()
  const [area, setArea] = createSignal("files")
  const roster = createRagRoster()
  let cockpit: HTMLDivElement | undefined

  return (
    <MxPage
      id="rag-studio"
      title={language.t("orchestra.ragStudio.title")}
      description={language.t("orchestra.ragStudio.description")}
    >
      <RagRosterProvider value={roster}>
        <Tabs
          class="rag-studio"
          ref={cockpit}
          value={area()}
          onChange={(next) => {
            setArea(next)
            cockpit?.closest(".mx-page")?.scrollTo({ top: 0 })
          }}
        >
          <Tabs.List class="rag-tabs" aria-label={language.t("orchestra.ragStudio.title")}>
            <Tabs.Trigger value="files">{language.t("orchestra.ragStudio.files")}</Tabs.Trigger>
            <Tabs.Trigger value="question">{language.t("orchestra.ragStudio.question")}</Tabs.Trigger>
            <Tabs.Trigger value="maintain">{language.t("orchestra.ragStudio.maintain")}</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content class="rag-panel" value="files" forceMount hidden={area() !== "files"}>
            <Files server={props.server} directory={props.directory} />
          </Tabs.Content>
          <Tabs.Content class="rag-panel" value="question" forceMount hidden={area() !== "question"}>
            <Question server={props.server} directory={props.directory} />
          </Tabs.Content>
          <Tabs.Content class="rag-panel" value="maintain" forceMount hidden={area() !== "maintain"}>
            <Maintain server={props.server} directory={props.directory} />
          </Tabs.Content>
        </Tabs>
      </RagRosterProvider>
    </MxPage>
  )
}
