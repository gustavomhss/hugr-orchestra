import type { Report } from "./scan"

let latest: Report | undefined

export function setLatestReport(report: Report) {
  latest = report
}

export function getLatestReport() {
  return latest
}

export function clearLatestReport() {
  latest = undefined
}
