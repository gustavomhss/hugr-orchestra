import { registerSubmitHarnessLifecycle } from "./submit-harness"
// The discovered submit.test.ts runs this entry in an isolated child process.
// Each domain shares mocks; this entry owns one file-local reset/cleanup registration.
import "./submit-harness"
import "./submit-dispatch.suite"
import "./submit-admission.suite"
import "./submit-delivery.suite"
import "./submit-policy.suite"
import "./submit-queue.suite"
import "./submit-canonical-race.suite"
import "./submit-retained.suite"
import "./submit-busy.suite"
import "./submit-receipt.suite"

registerSubmitHarnessLifecycle()
