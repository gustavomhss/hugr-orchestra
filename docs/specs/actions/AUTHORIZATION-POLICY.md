# Explicit request policy

Owner clarification, 2026-10-14. The previous available-only UI policy conflicted
with the native command boundary, which permits an explicit request and lets the
provider authorize it without inventing a token role.

The owner answered the following question:

> Achei contradição no contrato: UI bloqueia toda mutation com permissão “Unknown”, mas backend aceita pedidos explícitos e deixa provider autorizar. APIs nativas não permitem provar antecipadamente todas essas permissões. Para fechar paridade funcional, podemos oferecer pedidos explícitos com estado “Unknown”, usando confirmações do mock e validação nativa, sem exibir “Available”? Negações comprovadas e restrições históricas/herdadas continuam bloqueadas.

Verbatim response: **“Permitir pedido (Recommended)”**.

## Meaning

- `unknown` never becomes `available` or a claim of permission.
- An explicit user request may submit an implemented, structurally valid native
  operation while authorization remains unknown. Existing mock confirmations
  remain in place; no automatic mutation probe is performed.
- Known denials, unresolved binding/target/source identity, historical mutations,
  and provider-native inherited restrictions remain blocked.
- Before sending, the backend validates the binding, actor, exact native target,
  source/resource version and applicable native restrictions. The provider
  authorizes or rejects the request; ambiguous post-send outcomes remain durable
  unknown and never automatically retry.
- Local draft editing is separate from publish permission. Historical source is
  immutable. Creating a workflow uses an observed native branch and head commit,
  not a guessed `main`, nonexistent file or fabricated blob version.
- This clarification supersedes the available-only interpretation of the earlier
  C2 permission clause. It does not waive identity, redaction, lifetime or replay
  protections and does not authorize live provider mutations during validation.
