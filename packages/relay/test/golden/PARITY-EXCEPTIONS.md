# Parity exceptions

Every place the TS engine diverges from a golden, with its reason and the test that pins the TS behaviour. A golden
mismatch that is not listed here fails. The owner reviews this file before the Python Relay is retired.

| ID | Golden or exit path | Divergence | Reason | Test |
|---|---|---|---|---|
| J1 | judge: HTTP redirect | urllib follows a 301, 302 or 303 as a GET and raises on a 307 or 308. The TS judge follows none and returns `api error: HTTP Error <code>: <phrase>`. | Following a redirect would send the judge key to a location the config did not name. | `test/judge.test.ts`: a redirect is an HTTP error and is never followed |
| J2 | judge: no API key and no base URL; backend choice | Python fell back to `ANTHROPIC_API_KEY`, chose the `api` backend when it was set, and named it in `api: ANTHROPIC_API_KEY not set`. TS reads only `JudgeConfig.Config` and returns `api: judge API key not set`. | Owner decision: no provider credential ever reaches the judge. Naming a provider variable would point the operator at a setting the judge never reads. | `test/judge.test.ts`: no provider or legacy judge variable is read, sent or obeyed |
| J3 | judge: transport failures other than an HTTP status | A connection failure, a timeout or a body that is not JSON carries Bun's message after `api error: `, not CPython's (`<urlopen error [Errno 61] Connection refused>`, `Expecting value: line 1 column 1 (char 0)`). The 60 s timeout covers the whole exchange rather than each socket operation. The verdict, the backend tag and the abort are unchanged. | Those texts are specific to CPython and the OS (the errno differs between macOS and Linux), and the reason never reaches the ledger. | `test/judge.test.ts`: a body that is not JSON is an api error; a reply that never comes is an api error after 60 seconds |
