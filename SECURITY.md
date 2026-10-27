# Security

## IMPORTANT

We do not accept AI generated security reports. We receive a large number of
these and we absolutely do not have the resources to review them all. If you
submit one that will be an automatic ban from the project.

## Threat Model

### Overview

Orchestra is an AI-powered coding assistant that runs locally on your machine. It provides an agent system with access to powerful tools including shell execution, file operations, and web access.

### The Sandbox Is Opt-In

Orchestra can confine shell commands in an OS sandbox (macOS, Linux and Windows), but it does **not** do so for every command. The sandbox is used when a command runs for a read-only agent, when the host or a project's profile requires it (`requireSandbox`, or `sandbox.enabled` in the tool-safety profile; a project that lists `neverTouch` paths in its profile turns it on), and when a feature asks for exact socket or read-root grants (see `packages/core/src/tool-safety-sandbox.ts`). In every other case, agents run commands, edit files and reach the network with **your user's permissions**.

The permission system exists as a UX feature to help users stay aware of what the agent is doing; it prompts for confirmation before executing commands, writing files, and so on. It is not security isolation. If you need isolation for untrusted work, enable the sandbox or run Orchestra inside a container or VM.

### Server Mode

Server mode is opt-in only, and it always requires HTTP Basic Auth. `ORCHESTRA_SERVER_PASSWORD` sets that password; without it, `serve` uses the service password the daemon generates (32 random bytes) and saves in the state directory with mode 0600. The server removes `ORCHESTRA_SERVER_PASSWORD` and `ORCHESTRA_SERVER_USERNAME` from its own environment once it has read them, so processes it starts (MCP servers, language servers, terminals) cannot read them. `orchestra web --mdns` (or any non-loopback host) serves plain HTTP, so on a shared network the password travels unencrypted. Logs are written owner-only, and the desktop debug export redacts `auth_token` and `Authorization` values. It is the end user's responsibility to secure the server - any functionality it provides is not a vulnerability.

### Credentials at Rest

Provider credentials, integration tokens and MCP OAuth tokens are encrypted on disk with a key kept in the OS credential store, or in a 0600 key file when no store is available. See [docs/guides/credentials.md](docs/guides/credentials.md).

### Out of Scope

| Category                        | Rationale                                                               |
| ------------------------------- | ----------------------------------------------------------------------- |
| **Server access when opted-in** | If you enable server mode, API access is expected behavior              |
| **Missing sandbox**             | The sandbox is opt-in and the permission system is not one (see above)  |
| **LLM provider data handling**  | Data sent to your configured LLM provider is governed by their policies |
| **MCP server behavior**         | External MCP servers you configure are outside our trust boundary       |
| **Malicious config files**      | Users control their own config; modifying it is not an attack vector    |

---

# Reporting Security Issues

We appreciate your efforts to responsibly disclose your findings, and will make every effort to acknowledge your contributions.

To report a security issue, use GitHub private vulnerability reporting for this repository: open the [Report a vulnerability](https://github.com/gustavomhss/hugr-orchestra/security/advisories/new) form on the Security tab of gustavomhss/hugr-orchestra. Do not open a public issue for a vulnerability.

After the initial reply, the maintainers will keep you informed of progress towards a fix and announcement, and may ask for additional information.
