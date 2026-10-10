// Test-only --dir packaging. Canonical resources/bundles, no signing credentials or publishing.
import config from "../../electron-builder.config"

export default {
  ...config,
  mac: { ...config.mac, identity: null, sign: undefined, notarize: false },
  win: { ...config.win, signtoolOptions: undefined, signAndEditExecutable: false },
}
