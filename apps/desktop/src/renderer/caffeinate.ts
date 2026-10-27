import { createSignal } from "solid-js"

const [caffeinate, setCaffeinateSignal] = createSignal(false)

window.api.onCaffeinateChanged(setCaffeinateSignal)
void window.api.getCaffeinate().then(setCaffeinateSignal)

const setCaffeinate = (enabled: boolean) => window.api.setCaffeinate(enabled)

export { caffeinate, setCaffeinate }
