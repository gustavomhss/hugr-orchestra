declare global {
  const ORCHESTRA_VERSION: string
  const ORCHESTRA_CHANNEL: string
}

export const InstallationVersion = typeof ORCHESTRA_VERSION === "string" ? ORCHESTRA_VERSION : "local"
export const InstallationChannel = typeof ORCHESTRA_CHANNEL === "string" ? ORCHESTRA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
