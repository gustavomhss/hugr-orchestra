// Chromium's HTTP disk cache is unbounded unless told otherwise. 256 MiB is a cap, not a disable: pages can still
// be cached, and a dev profile that grew past a gigabyte stops there. The switch has to be set before app ready.
export const DISK_CACHE_BYTES = 256 * 1024 * 1024

export function applyDiskCacheCap(commandLine: { appendSwitch(name: string, value: string): void }) {
  commandLine.appendSwitch("disk-cache-size", String(DISK_CACHE_BYTES))
}
