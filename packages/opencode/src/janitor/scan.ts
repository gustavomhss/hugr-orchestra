import { Duration, Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { existsSync } from "node:fs"
import { AppProcess } from "@opencode-ai/core/process"
import { Thresholds, type Severity } from "./thresholds"

// Read-only allowlist. No rm/kill/prune here. Actions happen only via explicit UI click.
const Allowlist = new Set(["ps", "df", "du", "lsof", "docker", "git", "vm_stat", "memory_pressure", "powershell.exe"])
const ScannerTimeout = Duration.seconds(5)
const ScannerOutputBytes = 256 * 1024
const WindowsDiskScript =
  "$ErrorActionPreference='Stop'; Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress"
const WindowsProcessScript =
  "$ErrorActionPreference='SilentlyContinue'; Get-Process | ForEach-Object { try { [pscustomobject]@{ Id=$_.Id; Name=$_.ProcessName; CPU=$_.CPU; StartTime=$_.StartTime.ToUniversalTime().ToString('o') } } catch {} } | ConvertTo-Json -Compress"
const WindowsPortScript =
  "$ErrorActionPreference='Stop'; Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress"

export const Finding = Schema.Struct({
  kind: Schema.String,
  severity: Schema.Union([Schema.Literal("ok"), Schema.Literal("attention"), Schema.Literal("urgent")]),
  summary: Schema.String,
  evidence: Schema.String,
  suggestion: Schema.String,
})
export type Finding = Schema.Schema.Type<typeof Finding>

export const Report = Schema.Struct({
  createdAt: Schema.String,
  findings: Schema.Array(Finding),
})
export type Report = Schema.Schema.Type<typeof Report>

export function severityRank(severity: Severity) {
  if (severity === "urgent") return 2
  if (severity === "attention") return 1
  return 0
}

export function summarize(findings: ReadonlyArray<Finding>): Report {
  const sorted = [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  return { createdAt: new Date().toISOString(), findings: sorted }
}

export function isUsefulFinding(finding: Finding) {
  return finding.severity !== "ok" && finding.kind !== "scanner"
}

// Pure parsers below. Keep system calls at edges so tests cover logic without spawning.

export function parseDfLine(line: string) {
  const parts = line.trim().split(/\s+/)
  if (parts.length < 5) return undefined
  const pct = parts[4]?.replace("%", "")
  const use = Number(pct) / 100
  if (!Number.isFinite(use)) return undefined
  return { mount: parts[5] ?? "", use }
}

export function diskSeverity(use: number): Severity {
  if (use >= Thresholds.diskUrgent) return "urgent"
  if (use >= Thresholds.diskWarn) return "attention"
  return "ok"
}

export function isUsefulMount(mount: string) {
  const normalized = mount.replaceAll("\\", "/")
  return ![
    "/dev",
    "/proc",
    "/sys",
    "/System/Volumes/VM",
    "/System/Volumes/Preboot",
    "/System/Volumes/Update",
    "/private/var/vm",
  ].includes(normalized)
}

export function parsePsLine(line: string) {
  const parts = line.trim().split(/\s+/)
  if (parts.length < 4) return undefined
  const pid = Number(parts[0])
  const etime = parts[1] ?? ""
  const pcpu = Number(parts[2])
  const comm = parts.slice(3).join(" ")
  if (!Number.isFinite(pid) || !Number.isFinite(pcpu)) return undefined
  return { pid, etime, pcpu, comm }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function jsonRows(text: string): Array<Record<string, unknown>> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    if (Array.isArray(value)) return value.filter(isRecord)
    if (isRecord(value)) return [value]
  } catch {
    return undefined
  }
  return []
}

export function parseWindowsDiskJson(text: string) {
  const rows = jsonRows(text)
  if (!rows) return undefined
  return rows.flatMap((row) => {
    const mount = typeof row.DeviceID === "string" ? row.DeviceID : ""
    const size = Number(row.Size)
    const free = Number(row.FreeSpace)
    if (!mount || !Number.isFinite(size) || !Number.isFinite(free) || size <= 0 || free < 0) return []
    return [{ mount, use: Math.min(1, Math.max(0, 1 - free / size)) }]
  })
}

export function parseWindowsProcessJson(text: string, now = Date.now()) {
  const rows = jsonRows(text)
  if (!rows) return undefined
  return rows.flatMap((row) => {
    const pid = Number(row.Id)
    const cpu = Number(row.CPU)
    const comm = typeof row.Name === "string" ? row.Name : ""
    const started = typeof row.StartTime === "string" ? Date.parse(row.StartTime) : Number.NaN
    if (!Number.isFinite(pid) || !Number.isFinite(cpu) || !comm || !Number.isFinite(started)) return []
    const ageMinutes = Math.max(0, now - started) / 60_000
    const pcpu = ageMinutes > 0 ? (cpu / (ageMinutes * 60)) * 100 : 0
    return [{ pid, ageMinutes, pcpu, comm, evidence: JSON.stringify(row) }]
  })
}

export function parseWindowsPortJson(text: string) {
  const rows = jsonRows(text)
  if (!rows) return undefined
  return rows.flatMap((row) => {
    const port = Number(row.LocalPort)
    const pid = Number(row.OwningProcess)
    const address = typeof row.LocalAddress === "string" ? row.LocalAddress : "*"
    if (!Number.isInteger(port) || port < 1 || port > 65_535 || !Number.isInteger(pid) || pid < 0) return []
    return [{ port, pid, address, evidence: JSON.stringify(row) }]
  })
}

export function idleMinutes(etime: string) {
  const [dayPart, clock] = etime.includes("-") ? etime.split("-", 2) : ["0", etime]
  const days = Number(dayPart)
  const segments = clock.split(":").map(Number)
  if (!Number.isFinite(days)) return 0
  if (segments.some((n) => !Number.isFinite(n))) return 0
  if (segments.length === 2) return (segments[0] ?? 0) + (segments[1] ?? 0) / 60
  if (segments.length === 3)
    return days * 24 * 60 + (segments[0] ?? 0) * 60 + (segments[1] ?? 0) + (segments[2] ?? 0) / 60
  return 0
}

export function isUsefulProcess(command: string) {
  const normalized = command.replaceAll("\\", "/")
  if (/^\/(System|usr|Library|Applications)\//.test(normalized)) return false
  const name = normalized.split("/").at(-1)?.toLowerCase() ?? ""
  return /^(bun|node|deno|docker|npm|pnpm|yarn)(?:\.exe)?$/.test(name)
}

function runAllowed(binary: string, args: string[]) {
  if (!Allowlist.has(binary)) return Effect.fail(new AppProcess.AppProcessError({ command: binary }))
  return Effect.gen(function* () {
    const command = trustedCommand(binary)
    if (!command) return yield* Effect.fail(new AppProcess.AppProcessError({ command: binary }))
    const proc = yield* AppProcess.Service
    const result = yield* proc.run(ChildProcess.make(command, args), {
      stdin: "ignore",
      timeout: ScannerTimeout,
      maxOutputBytes: ScannerOutputBytes,
      maxErrorBytes: 32 * 1024,
    })
    if (result.exitCode !== 0) return yield* Effect.fail(new AppProcess.AppProcessError({ command: binary }))
    if (result.stdoutTruncated) {
      return yield* Effect.fail(
        new AppProcess.AppProcessError({ command: binary, cause: new Error("Output truncated") }),
      )
    }
    return result.stdout.toString("utf8")
  })
}

function trustedCommand(binary: string) {
  if (process.platform === "win32" && binary === "powershell.exe") {
    const root = process.env.SystemRoot ?? "C:\\Windows"
    return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  }
  const paths: Record<string, string[]> = {
    df: ["/bin/df", "/usr/bin/df"],
    ps: ["/bin/ps", "/usr/bin/ps"],
    lsof: ["/usr/sbin/lsof", "/usr/bin/lsof"],
  }
  return paths[binary]?.find((candidate) => existsSync(candidate))
}

function runPowerShell(script: string) {
  return runAllowed("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script])
}

export function scannerUnavailable(binary: string): Finding {
  return {
    kind: "scanner",
    severity: "attention",
    summary: `Scanner indisponível: ${binary}`,
    evidence: `Não foi possível executar ${binary}.`,
    suggestion: "Verificar suporte da plataforma e disponibilidade do comando.",
  }
}

const readDf = Effect.fn("Janitor.readDf")(function* () {
  if (process.platform === "win32") {
    const text = yield* runPowerShell(WindowsDiskScript).pipe(Effect.catch(() => Effect.succeed(null)))
    if (text === null) return [scannerUnavailable("PowerShell disk")]
    const rows = parseWindowsDiskJson(text)
    if (!rows || rows.length === 0) return [scannerUnavailable("PowerShell disk output")]
    return rows.flatMap((parsed) => {
      const severity = diskSeverity(parsed.use)
      if (severity === "ok" || !isUsefulMount(parsed.mount)) return []
      return [
        {
          kind: "disk",
          severity,
          summary: `Disco ${parsed.mount} acima do limite`,
          evidence: `${parsed.mount} ${Math.round(parsed.use * 100)}%`,
          suggestion: "Verificar volumes e caches grandes.",
        } satisfies Finding,
      ]
    })
  }
  const text = yield* runAllowed("df", ["-k", "-P"]).pipe(Effect.catch(() => Effect.succeed(null)))
  if (text === null) return [scannerUnavailable("df")]
  const rows = text
    .split("\n")
    .slice(1)
    .flatMap((line) => {
      const parsed = parseDfLine(line)
      return parsed ? [{ line, parsed }] : []
    })
  if (rows.length === 0) return [scannerUnavailable("df output")]
  return rows.flatMap(({ line, parsed }) => {
    const severity = diskSeverity(parsed.use)
    if (severity === "ok" || !isUsefulMount(parsed.mount)) return []
    return [
      {
        kind: "disk",
        severity,
        summary: `Disco ${parsed.mount} acima do limite`,
        evidence: line.trim(),
        suggestion: "Ver culpados: docker volumes, target/, node_modules órfão, cache.",
      } satisfies Finding,
    ]
  })
})

const readProcesses = Effect.fn("Janitor.readProcesses")(function* () {
  if (process.platform === "win32") {
    const text = yield* runPowerShell(WindowsProcessScript).pipe(Effect.catch(() => Effect.succeed(null)))
    if (text === null) return [scannerUnavailable("PowerShell process")]
    const rows = parseWindowsProcessJson(text)
    if (!rows || rows.length === 0) return [scannerUnavailable("PowerShell process output")]
    return rows
      .flatMap((parsed) => {
        const useful = isUsefulProcess(parsed.comm)
        const hot = useful && parsed.pcpu >= Thresholds.cpuPercent && parsed.ageMinutes >= Thresholds.cpuMinutes
        if (!hot) return []
        return [
          {
            kind: "process",
            severity: hot ? ("urgent" as const) : ("attention" as const),
            summary: `${parsed.comm.split("/").at(-1) ?? parsed.comm} pid ${parsed.pid}`,
            evidence: parsed.evidence,
            suggestion: "Investigar loop/leak antes de matar.",
          } satisfies Finding,
        ]
      })
      .slice(0, 20)
  }
  const text = yield* runAllowed("ps", ["-axo", "pid=,etime=,pcpu=,comm="]).pipe(
    Effect.catch(() => Effect.succeed(null)),
  )
  if (text === null) return [scannerUnavailable("ps")]
  const rows = text.split("\n").flatMap((line) => {
    const parsed = parsePsLine(line)
    return parsed ? [{ line, parsed }] : []
  })
  if (rows.length === 0) return [scannerUnavailable("ps output")]
  return rows
    .flatMap(({ line, parsed }) => {
      const idle = idleMinutes(parsed.etime)
      const useful = isUsefulProcess(parsed.comm)
      const hot = useful && parsed.pcpu >= Thresholds.cpuPercent && idle >= Thresholds.cpuMinutes
      if (!hot) return []
      return [
        {
          kind: "process",
          severity: hot ? ("urgent" as const) : ("attention" as const),
          summary: `${parsed.comm.split("/").at(-1) ?? parsed.comm} pid ${parsed.pid}`,
          evidence: line.trim(),
          suggestion: "Investigar loop/leak antes de matar.",
        } satisfies Finding,
      ]
    })
    .slice(0, 20)
})

const readPorts = Effect.fn("Janitor.readPorts")(function* () {
  if (process.platform === "win32") {
    const text = yield* runPowerShell(WindowsPortScript).pipe(Effect.catch(() => Effect.succeed(null)))
    if (text === null) return [scannerUnavailable("PowerShell ports")]
    const rows = parseWindowsPortJson(text)
    if (!rows) return [scannerUnavailable("PowerShell ports output")]
    const dev = rows.filter((row) => [3000, 4000, 5173, 8000, 8080].includes(row.port)).slice(0, 10)
    if (dev.length === 0) return []
    return [
      {
        kind: "port",
        severity: "attention" as const,
        summary: "Dev server preso em porta conhecida",
        evidence: dev.map((row) => row.evidence).join("\n"),
        suggestion: "Liberar porta após confirmar dono.",
      } satisfies Finding,
    ]
  }
  const text = yield* runAllowed("lsof", ["-iTCP", "-sTCP:LISTEN", "-P", "-n"]).pipe(
    Effect.catch(() => Effect.succeed(null)),
  )
  if (text === null) return [scannerUnavailable("lsof")]
  const lines = text
    .split("\n")
    .slice(1)
    .filter((line) => line.trim())
  if (lines.length === 0) return []
  const dev = lines.filter((line) => /:(3000|5173|8000|8080|4000)\b/.test(line)).slice(0, 10)
  if (dev.length === 0) return []
  return [
    {
      kind: "port",
      severity: "attention" as const,
      summary: "Dev server preso em porta conhecida",
      evidence: dev.join("\n"),
      suggestion: "Liberar porta após confirmar dono.",
    } satisfies Finding,
  ]
})

export const scan = Effect.fn("Janitor.scan")(function* () {
  const groups = yield* Effect.all([readDf(), readProcesses(), readPorts()], { concurrency: "unbounded" })
  return summarize(groups.flat())
})
