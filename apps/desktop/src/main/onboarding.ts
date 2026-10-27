import { existsSync, readdirSync } from "node:fs"
import { mkdir, realpath } from "node:fs/promises"
import { join } from "node:path"
import { app } from "electron"
import { getStore } from "./store"
import { FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY, OLD_LAYOUT_ELIGIBLE_KEY } from "./store-keys"
import { write as writeLog } from "./logging"
import { hasExistingAppState } from "./install-state"

const DEFAULT_PROJECT_DIR = "Default Project"

export function initializeOldLayoutEligibility(userDataPath: string) {
  const entries = existsSync(userDataPath) ? readdirSync(userDataPath, { withFileTypes: true }) : []
  const store = getStore()
  const current = store.get(OLD_LAYOUT_ELIGIBLE_KEY)
  if (typeof current === "boolean") return current

  const eligible = hasExistingAppState(entries)
  store.set(OLD_LAYOUT_ELIGIBLE_KEY, eligible)
  return eligible
}

export function isOldLayoutEligible() {
  return getStore().get(OLD_LAYOUT_ELIGIBLE_KEY) === true
}

export function isFirstLaunchOnboardingPending() {
  const pending = getStore().get(FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY) !== true
  writeLog("onboarding", "first launch onboarding pending checked", { pending })
  return pending
}

// The renderer supplies the folder name in the person's language. It becomes one path segment, so anything that
// could leave Documents or is not valid on every platform is dropped.
function defaultProjectDirectory(name?: string) {
  const clean = (name ?? "")
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80)
  return clean || DEFAULT_PROJECT_DIR
}

export async function finishFirstLaunchOnboarding(createDefaultProject: boolean, folderName?: string) {
  if (!isFirstLaunchOnboardingPending()) {
    writeLog("onboarding", "first launch onboarding already completed")
    return null
  }

  const defaultProject = createDefaultProject
    ? join(app.getPath("documents"), defaultProjectDirectory(folderName))
    : null
  if (defaultProject) await mkdir(defaultProject, { recursive: true })
  const directory = defaultProject ? await realpath(defaultProject) : null
  writeLog("onboarding", "first launch default project ready", { createDefaultProject, defaultProject: directory })
  return directory
}

// Called by the renderer once it has opened the first project. Until then onboarding stays pending, so a failure
// while creating or opening the folder is retried on the next launch.
export function confirmFirstLaunchOnboarding() {
  getStore().set(FIRST_LAUNCH_ONBOARDING_COMPLETE_KEY, true)
  writeLog("onboarding", "first launch onboarding completed")
}
