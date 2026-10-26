import { useNavigate, useParams } from "@solidjs/router"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import type { ChapterPageProps } from "../../chapter-route"
import { MxPage } from "../kit"
import "./flight-engineer.css"
import { devMeetings } from "./dev"
import { MeetingDetail } from "./detail"
import { MeetingList } from "./meetings"
import { Note } from "./parts"
import { useFlight } from "./run"
import { Session } from "./session"
import { FlightSettings } from "./settings"
import { serverMeetings } from "./source"

const base = "/orchestra/flight-engineer"
const views = ["", "meetings", "settings"] as const

// The live-meeting seat: start a meeting, read the ones that ended, set the seat up.
export default function FlightEngineer(props: ChapterPageProps) {
  const language = useLanguage()
  const t = language.t
  const navigate = useNavigate()
  const params = useParams<{ rest?: string }>()
  const sdk = useServerSDK()
  const flight = useFlight()

  const path = () => (params.rest ?? "").split("/").filter(Boolean)
  const view = () => (path()[0] === "meetings" ? (path()[1] ? "detail" : "meetings") : path()[0] === "settings" ? "settings" : "session")
  const meetings = createMemo(() => devMeetings() ?? (props.directory ? serverMeetings(sdk, props.directory) : undefined))
  const go = (to: string) => navigate(`${base}${to}`)
  const current = () => (view() === "detail" ? "meetings" : view() === "session" ? "" : view())

  return (
    <MxPage
      id="flight-engineer"
      eyebrow={t("orchestra.flightEngineer.eyebrow")}
      title={t("orchestra.flightEngineer.title")}
      description={t("orchestra.flightEngineer.description")}
    >
      <Show when={flight.available()} fallback={<Note>{t("orchestra.flightEngineer.desktopOnly")}</Note>}>
        <nav class="fe-nav" aria-label={t("orchestra.flightEngineer.title")}>
          <For each={views}>
            {(item) => (
              <button type="button" aria-current={current() === item ? "page" : undefined} onClick={() => go(item ? `/${item}` : "")}>
                {t(`orchestra.flightEngineer.nav.${item || "meeting"}` as "orchestra.flightEngineer.nav.meeting")}
                <Show when={item === "" && flight.store.run.running}>
                  <i class="fe-dot" aria-hidden="true" />
                </Show>
              </button>
            )}
          </For>
        </nav>
        <Switch>
          <Match when={view() === "session"}>
            <Session flight={flight} openSettings={() => go("/settings")} />
          </Match>
          <Match when={view() === "meetings"}>
            <MeetingList meetings={meetings()} flight={flight} open={(id) => go(`/meetings/${encodeURIComponent(id)}`)} />
          </Match>
          <Match when={view() === "detail"}>
            <MeetingDetail meetings={meetings()} id={decodeURIComponent(path()[1] ?? "")} back={() => go("/meetings")} />
          </Match>
          <Match when={view() === "settings"}>
            <FlightSettings flight={flight} />
          </Match>
        </Switch>
      </Show>
    </MxPage>
  )
}
