import { Dialog } from "@kobalte/core/dialog"
import { render } from "solid-js/web"
import { DialogSelectDirectoryV2 } from "../../src/components/dialog-select-directory-v2"

// Real desktop picker component, with only its server/context boundaries provided by the fixture.
render(() => <Dialog open><DialogSelectDirectoryV2 server={{ type: "http", http: { url: "https://fixture.test" } }} onSelect={() => {}} /></Dialog>, document.getElementById("root")!)
