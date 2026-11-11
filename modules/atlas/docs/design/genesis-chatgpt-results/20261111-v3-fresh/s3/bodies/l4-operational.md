# S3 L4 — diagnóstico e operação sem adivinhação destrutiva

**Estado:** `CANDIDATE_UNRELEASED`. Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Este runbook organiza inspeção e recusas; não executou o produto.

## 1. Ordem universal de diagnóstico

1. Fixe revisão, projeto, Location, Session e ID canônico do actor/seat.
2. Identifique a porta real: Core task, registry tool, provider built-in, hook direto, MCP/RPC, Relay driver, Dock transport ou scanner Janitor.
3. Leia estado e receipts antes de repetir a ação.
4. Confirme pré-condições materiais: approval/revision/child, permission snapshot, skill load, URL/token/channel, lock/ledger, source/generated/cache.
5. Classifique `success`, `failure`, `unknown-effect`, `stale-not-dispatched`, `unavailable`, `corrupt` ou `not-run`.
6. Só então escolha correção. Não use rename, allow local, token inventado, edição de golden ou cleanup destrutivo para atravessar o gate.

## 2. Claude recusa `maestro_record_plan_revision`

### Verifique

- actor/Session e owner da tool;
- profile floor, visibility e caller gate;
- se `maestro-run-governed` foi carregado com sucesso pela tool `skill` do MCP Orchestra **na mesma Session**;
- se o processo reiniciou e perdeu o Set in-memory;
- `PreToolUse` e `canUseTool` para o mesmo tool-use id;
- `turn.authorize`/`turn.execute`, approval e permission snapshot quando aplicáveis;
- preset estrutural `claude_code`.

### Caminho permitido

Recarregue a skill na Session correta quando esse for o único gap; corrija identidade/permission/approval pela porta owner; delegue via `mcp__orchestra__task`, criando child Session Core.

### Não faça

Não use allow rule Claude como bypass, não renomeie a tool, não chame Claude `Agent`/`Task`, não trate `ToolSearch` como autorização e não confunda load do playbook com approval. `maestro_arsenal_*`/`maestro_workflows` podem dispensar o pré-load específico, mas continuam sujeitos aos próprios contratos.

## 3. Relay: stdout vazio, `verify` 0, recheck `not-run`

Stdout vazio é ambíguo. Verifique token/WP, state, lock, stderr, ledger/receipts e driver. `relay verify` exit 0 comprova apenas a integridade/consistência que esse audit verificou; não executa gates, não prova artefatos atuais e não converte `oracle_recheck.status=not-run` em `ok`.

Quando plan comparison/recheck é exigida:

- `ok` observado pode satisfazer a condição correspondente;
- `not-run` é evidência ausente;
- malformed/explicit invalid continua falha;
- fixture/golden divergente exige investigação do contrato, não edição para verde.

Diferencie lifecycle/campos de Arm TS, shell, `relay-gate eval/check`, benchmark hook e wrapper LangGraph/Python. Exit code parecido não os torna equivalentes.

## 4. Relay: processo morreu depois de possível efeito

1. Congele retry automático.
2. Leia lock, state, ledger/receipts, stderr e alvo externo observável.
3. Separe efeito, disposição, receipt e aplicação de estado.
4. Classifique:
   - `observed-applied`: não repita; reconcilie state/settlement.
   - `observed-not-applied`: siga retry do contrato.
   - `stale-not-dispatched`: use apenas retry delimitado.
   - `unknown-effect`: HOLD/manual ou idempotência comprovada.
   - `corrupt/unavailable`: repare a evidência antes de agir.
5. `release` de lock não reverte efeito nem prova exactly-once.
6. Em workflow governado, conclua pelo settlement do host; `evaluate` isolado não o substitui.
7. Custos/tentativas físicas não observados permanecem `UNKNOWN`.

## 5. Dock sem canal ou ação incerta

### Pré-condição

Fora da composição desktop, `fromEnv` pode não ter URL/token. A porta real depende de Electron main, loopback WebSocket, token por launch, canal e Session. Confirme esses valores fornecidos pelo desktop; não os fabrique.

### Ação incerta

- receipt de success/failure: siga-o;
- `stale-not-dispatched`: retry delimitado do contrato;
- `unknown`: não repita quando duplicação é perigosa;
- channel unavailable: restaure a composição.

Hooks diretos e MCP/RPC possuem checks distintos; não presuma que uma permissão ou ordenação vale para a outra. Session deletion pode acionar o reaper Linux; isso é lifetime Dock, não limpeza Janitor.

## 6. Janitor scan falhou

Marque `unavailable`. Leia scanner, report e sink fornecido pelo host. Não interprete falha como “zero órfãos” e não use Janitor para delete, kill, restart, credential cleanup ou reparo Dock. Estado/scheduler em memória não prova persistência no desktop; procure a ligação real.

## 7. Pedido para confirmar 32 capability assets live e calcular economia

Recuse a confirmação e a estimativa sem evidência. O baseline mostra catálogo/provenance/source qualification e destinos reservados; não prova conexão, autenticação, grant, dependency integrity, conformance, aceitação live ou produção. Usage, billing e baseline financeiro ausentes significam `UNKNOWN`, não zero e não percentual de economia.

Uma resposta útil lista o que seria necessário por item: owner/provider, credential/connection, handler/destination, grant, test de conformance, live acceptance, usage e custo observado.

## 8. Conflito Atlas Memory

Quando uma spec diz backend-only e o código atual do pin aceita backend/jimmy/archie/live:

1. trate o código/descriptors observados como comportamento estático atual do pin;
2. preserve a spec como conflito histórico;
3. mantenha o gate restrito aos quatro owners nativos e à Location;
4. não libere seat arbitrário nem aceite ID usurpado;
5. não alegue runtime/CI sem execução.

## 9. Sinais que nunca fecham o caso sozinhos

- texto “approved”, “independent” ou “complete”;
- exit 0 de audit;
- stdout vazio;
- arquivo de release editável;
- label ou tool renomeada;
- catálogo com item presente;
- módulo/desktop com nome semelhante;
- ausência de receipt;
- cache existente sem digest;
- fixture atualizada;
- custo omitido.

## 10. Escalonamento e recibo

Escale ao owner correto com: revisão, IDs, porta, estado, receipts disponíveis, classificação, risco de duplicação, ação bloqueada e próxima observação segura. Nunca reporte PASS para runtime/CI/consumer que não rodou. A falta de executor nesta recuperação é `NOT_RUN`, e a falta dos dois novos juízos mantém L2–L4 sem aceite.
