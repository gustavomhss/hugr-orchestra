// The discovered submit.test.ts runs this entry in an isolated child process.
// Each domain imports the same harness, so mocks and reset hooks register once.
import "./submit-harness"
import "./submit-dispatch.suite"
import "./submit-admission.suite"
import "./submit-delivery.suite"
import "./submit-policy.suite"
import "./submit-queue.suite"
import "./submit-canonical-race.suite"
