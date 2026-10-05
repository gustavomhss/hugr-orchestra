// @ts-nocheck
import { JanitorProvider } from "@/context/janitor"
import { ServerProvider } from "@/context/server"
import { JanitorWidget } from "@/components/janitor-widget"
import type { JanitorReport } from "@/utils/janitor-report"

const report: JanitorReport = {
  createdAt: "2026-09-08T02:00:00.000Z",
  findings: [
    {
      kind: "disk",
      severity: "urgent",
      summary: "Disco / em 93%",
      evidence: "/dev/disk3 100 93 7 93% /",
      suggestion: "Ver culpados: docker volumes, target/, node_modules órfão, cache.",
    },
    {
      kind: "process",
      severity: "attention",
      summary: "bun pid 1234 cpu 12% idade 02:15:00",
      evidence: "1234 02:15:00 12.0 bun",
      suggestion: "Candidato pendurado. Confirmar e encerrar.",
    },
    {
      kind: "port",
      severity: "attention",
      summary: "2 dev servers presos em porta conhecida",
      evidence: "node 1234 ... TCP *:3000 (LISTEN)\nbun 5678 ... TCP *:5173 (LISTEN)",
      suggestion: "Liberar porta após confirmar dono.",
    },
  ],
}

function Frame(props: { children: unknown }) {
  return (
    <div class="relative h-[480px] w-full">
      <div class="absolute inset-0 p-10">
        <h1 class="mb-4">Página simulada</h1>
        <p>Widget aparece no canto inferior direito.</p>
      </div>
      {props.children}
    </div>
  )
}

export default {
  title: "App/JanitorWidget",
  id: "app-janitor-widget",
  component: JanitorWidget,
  parameters: {
    themes: {
      themeOverride: "dark",
    },
  },
}

export const Collapsed = {
  render: () => (
    <Frame>
      <ServerProvider defaultServer="local">
        <JanitorProvider initial={report}>
          <JanitorWidget />
        </JanitorProvider>
      </ServerProvider>
    </Frame>
  ),
}

export const Expanded = {
  render: () => (
    <Frame>
      <ServerProvider defaultServer="local">
        <JanitorProvider initial={report} expanded>
          <JanitorWidget />
        </JanitorProvider>
      </ServerProvider>
    </Frame>
  ),
}
