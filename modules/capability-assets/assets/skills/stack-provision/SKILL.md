---
name: stack-provision
description: Provision SaaS services (databases, messaging, hosting, auth) for a project and sync credentials into .env through the Stripe Projects CLI. Use when the user asks to set up, add, upgrade, rotate, or remove a provider service for their stack.
---

# Stack Provision

Wraps the [Stripe Projects](https://projects.dev) CLI plugin so the agent can provision SaaS services (Neon, Twilio, Vercel, etc.), generate and sync credentials into the user's `.env`, and manage billing across providers from one place.

## When to Use

Trigger phrases:

- "set up <provider>", "provision <Neon|Twilio|Vercel|...>", "create a database"
- "give me a <Postgres|Redis|Twilio number|...> for this project"
- "manage my stack credentials", "rotate this key", "upgrade my plan"
- "what providers can I add?"

If the user already has a provider account, this skill can still connect it with `stripe projects link <provider>`. If the user wants to use an existing provider resource, such as an existing database or Vercel project, check provider support first; many providers currently support provisioning new resources but not importing existing ones.

## Confirm with the user first

Provisioning creates real resources and real bills. Before `add`, `upgrade`, `remove`, or `rotate`, state the provider, service, tier, and cost prompt and wait for a clear yes. `remove` is destructive: confirm, and warn that some providers keep the underlying resource. When a Stripe connection exists in connected platform tools, prefer `service_find`/`service_describe`/`service_call` for account and billing reads; the `stripe projects` CLI remains the path for provisioning and credential sync.

## Credentials

Sign in through the CLI's own flow (`stripe login`, browser) done by the user. Never ask the user to paste Stripe or provider keys into chat or files, and never print `.env` values or vault contents; report only key names.

## Prerequisites

- Stripe CLI installed (Homebrew on macOS, package manager on Linux, or download from https://docs.stripe.com/stripe-cli/install)
- Stripe Projects plugin installed
- A Stripe account. If the user doesn't have one yet, the CLI can guide them through sign-in or account creation in the browser during setup.

## Install

macOS:

```
brew install stripe/stripe-cli/stripe
stripe plugin install projects
```

Linux: follow the platform-specific install at https://docs.stripe.com/stripe-cli/install, then:

```
stripe plugin install projects
```

## How to Run

All commands run through `bash` from inside the user's project directory (the CLI writes `.env` and `.projects/vault/vault.json` into the CWD).

## Procedure

### 1. Initialize the project

```
cd <project-root>
stripe projects init
```

This creates `.projects/vault/vault.json` (encrypted credential store) and prepares the project to receive providers.

### 2. Discover available providers

```
stripe projects catalog
```

Lists every provider Stripe Projects supports — databases, hosting, auth, AI, analytics, messaging, etc.

### 3. Add a service

```
stripe projects add <provider>/<service>
```

Examples:

- `stripe projects add neon/postgres`
- `stripe projects add twilio/sms`
- `stripe projects add runloop/sandbox`

The CLI provisions the service in the user's own account with the provider, generates credentials, syncs them into `.env`, and records the resource in the vault. The user may need to confirm a tier selection or pricing prompt.

### 4. Verify

```
stripe projects list
```

Should show the newly added provider and its `.env` keys.

### 5. Manage / upgrade / remove

```
stripe projects upgrade <provider>     # tier change
stripe projects remove <provider>      # deprovision
stripe projects rotate <provider>      # rotate credentials
```

## Pitfalls

- **`.env` writes are real writes.** The CLI appends to whatever `.env` is in the project root. If the user's `.env` is gitignored (normal), the keys land safely; if not, this skill could be a credential-leak vector. Always check `.gitignore` first.
- **Per-project state.** `.projects/vault/vault.json` is per-project. Provisioning the same service in two different projects creates two separate resources — and two bills.
- **Billing happens on Stripe's side.** Tier prompts during `add`/`upgrade` are real charges; surface them to the user before confirming.
- **Provider availability changes.** The catalog grows; if a provider the user names isn't listed, `stripe projects catalog | grep <name>` first instead of failing the `add` call.
- **Credentials in vault are encrypted but `.env` is plaintext.** Standard `.env` hygiene applies — never commit it.
- **Removing a service does NOT always destroy the underlying resource.** Some providers leave a paused/dormant resource behind. Check the provider's own dashboard after `remove` for high-cost services (managed databases especially).

## Verification

```
stripe projects --version && stripe projects list
```

Exit code 0 inside an initialized project means the plugin is healthy.

Adapted from NousResearch/hermes-agent@134e08ca6d272c9b9610ce5889e2ecff9c73adf0 optional-skills/payments/stripe-projects (MIT).
