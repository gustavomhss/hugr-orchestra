import { readFile } from "node:fs/promises"
import { verifyReleaseArtifacts } from "../packages/script/src/release-artifact-identity"

if (import.meta.main) {
  const root = process.argv[2]
  const receipt = process.argv[3]
  if (!root || !receipt) throw new Error("Usage: release-artifact-identity.ts ROOT RECEIPT")
  await verifyReleaseArtifacts(root, JSON.parse(await readFile(receipt, "utf8")), {
    version: process.env.VERSION,
    repository: process.env.GITHUB_REPOSITORY,
    sourceSha: process.env.GITHUB_SHA,
    cliRunId: Number(process.env.CLI_RUN_ID),
    desktopRunId: Number(process.env.DESKTOP_RUN_ID),
    qualificationRunId: Number(process.env.QUALIFICATION_RUN_ID),
  })
  console.log("Release artifact identity verified")
}
