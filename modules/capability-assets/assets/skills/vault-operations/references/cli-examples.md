# op CLI examples

Reference only: avoid commands that print secret values into tool output. Prefer `op run` and `op inject`.

## Sign in

- `op signin`
- `op signin --account <shorthand|signin-address|account-id|user-id>`

## Run (secrets resolved into the child process only)

- `export DB_PASSWORD="op://app-prod/db/password"`
- `op run -- ./command-that-needs-db-password`
- `op run --env-file="./.env.tpl" -- ./command`

## Inject (template to file)

- `op inject -i config.yml.tpl -o config.yml`

## Read (pipe into a consumer, never display)

- `op read op://app-prod/db/password | some-cli --password-stdin`
- `op read "op://app-prod/db/one-time password?attribute=otp"` (one-time codes go to the user's own flow, not into chat)
- `op read --out-file ./key.pem op://app-prod/server/ssh/key.pem` (owner-only file the user designated; confirm first)

## Whoami / accounts

- `op whoami`
- `op account list`
