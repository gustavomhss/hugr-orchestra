import { onMount } from "solid-js"
import type { JanitorReport } from "@/utils/janitor-report"

export function JanitorPocketChat(props: { report: JanitorReport; onSessionID?: (sessionID: string) => void }) {
  onMount(() => props.onSessionID?.("story-session"))
  return (
    <div class="flex min-h-0 flex-col border-t border-v2-border-border-base">
      <div class="flex max-h-[360px] min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3">
        <div class="flex items-start gap-2.5">
          <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-v2-background-bg-layer-03 text-[11px] text-v2-text-text-muted">
            J
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-1 text-[12px] leading-4 text-v2-text-text-faint">Janitor</div>
            <div class="rounded-[6px] bg-v2-background-bg-layer-02 px-3 py-2.5 text-[13px] leading-5 text-v2-text-text-base">
              I found {props.report.findings.length} things worth checking. Ask me what to clean first.
              <div class="mt-2 border-t border-v2-border-border-base pt-2">
                Disk pressure is urgent. Inspect caches before removal.
              </div>
            </div>
          </div>
        </div>
        <div class="flex items-start justify-end gap-2.5">
          <div class="max-w-[85%] rounded-[6px] bg-v2-background-bg-layer-03 px-3 py-2.5 text-[13px] leading-5 text-v2-text-text-base">
            What is safe to clean now?
          </div>
        </div>
        <details class="rounded-[6px] border border-v2-border-border-base">
          <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-[530] uppercase tracking-[0.05px] text-v2-text-text-faint">
            <span>Report context</span>
            <span>{props.report.findings.length} findings</span>
          </summary>
          <div class="flex flex-col gap-1.5 border-t border-v2-border-border-base p-2">
            {props.report.findings.map((finding) => (
              <div class="flex items-start gap-2 rounded-[6px] bg-v2-background-bg-layer-02 px-3 py-2">
                <span
                  classList={{
                    "mt-1 size-1.5 shrink-0 rounded-full": true,
                    "bg-icon-critical-base": finding.severity === "urgent",
                    "bg-icon-warning-base": finding.severity === "attention",
                    "bg-icon-success-base": finding.severity === "ok",
                  }}
                />
                <span class="min-w-0 text-[12px] leading-4 text-v2-text-text-muted">{finding.summary}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
      <div class="border-t border-v2-border-border-base px-4 py-3">
        <div class="rounded-[6px] border border-v2-border-border-base bg-v2-background-bg-base px-3 py-2">
          <div class="text-[13px] leading-5 text-v2-text-text-faint">Ask about this report...</div>
          <div class="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              class="h-7 cursor-pointer rounded-[4px] bg-v2-background-bg-layer-03 px-2.5 text-[11px] text-v2-text-text-muted"
            >
              + Attach
            </button>
            <button
              type="button"
              class="h-7 cursor-pointer rounded-[4px] bg-v2-background-bg-layer-03 px-2.5 text-[11px] text-v2-text-text-muted"
            >
              Context
            </button>
            <button
              type="button"
              class="h-7 cursor-pointer rounded-[4px] bg-v2-background-bg-layer-03 px-2.5 text-[11px] text-v2-text-text-muted"
            >
              Thinking
            </button>
          </div>
          <div class="mt-3 flex items-center justify-between border-t border-v2-border-border-base pt-2">
            <div class="flex items-center gap-2">
              <button type="button" class="h-7 cursor-pointer text-[12px] text-v2-text-text-muted">
                Claude 3.7 Sonnet <span class="text-[11px] text-v2-text-text-faint">▾</span>
              </button>
            </div>
            <button
              type="button"
              class="h-7 cursor-pointer rounded-[4px] bg-v2-background-bg-layer-03 px-3 text-[12px] font-[530] text-v2-text-text-base"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
