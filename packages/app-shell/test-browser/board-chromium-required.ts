// Shared by the specs, runner selection and report validator: neither required journey can replace the other.
export const boardChromiumRequired = {
  document: {
    file: "orchestra/board-document.spec.ts",
    title: "original execution source, resource-free Markdown and platform-owned primary/middle links @development-only",
  },
  notice: {
    file: "orchestra/board-write-status.spec.ts",
    title: "operation notice remains hittable over an open issue without dismissing the issue @development-only",
  },
}
