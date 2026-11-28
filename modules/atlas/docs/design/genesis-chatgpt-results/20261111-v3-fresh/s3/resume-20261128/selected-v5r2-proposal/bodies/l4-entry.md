# S3 L4 — entrada mínima para Maestro, Relay, especialistas e integrações

**Estado no momento da produção (2026-11-28T06:38:33Z):** `CANDIDATE_UNRELEASED` / `REVIEW_REQUIRED`. Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Este mapa serve para encontrar a menor leitura útil; não concede autoridade, não substitui os gates e não declara runtime.

**Proveniência no momento da produção (2026-11-28T06:38:33Z):** nova adoção/correção por `/root/s3_l4_producer`, execução `15cc9853-0e71-4950-8813-0bfb66f82c8a`, protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. O input é o alternativo `s3-provenance/files/bodies/l4-entry.md` (hash e bytes em `response.json`); os originais superiores, seus prompts e aceites históricos não foram recuperados. L1/L2 e L3-adoption-v1 estão liberados conforme atestado da principal nesta execução; o corpo L3 selecionado tem SHA-256 `17c3d7fdd7f693d66eefc29df3928d5bda449387db77a016a9b7b1f3cc3f0b99`. Estados antigos nos predecessores descrevem seu momento de produção; os recibos externos posteriores determinam sua liberação. Isso permite produzir L4, sem conceder aceite a este corpo. Recibos externos sobre seus bytes exatos determinarão sua liberação futura; o produtor não concede aceite. Runtime/CI/live nesta adoção: `NOT_RUN`.

## 1. Escolha primeiro a classe do pedido

| Pedido ou sintoma | Comece por | Aprofunde somente se necessário |
| --- | --- | --- |
| trocar nome exibido de um seat | §2 deste arquivo + `l4-ownership.md` | L1 Maestro §2 e fonte `v2/seats.ts` |
| approval, child Session ou tool governada recusada | `l4-operational.md` §2 | `l2-maestro.md`, `l2-integrations.md`, L3 F2 |
| adicionar/alterar skill de especialista | `l4-maintenance.md` §2 | `l2-maestro.md`, L3 F1 |
| stdout Relay vazio, audit/verify 0 ou WP incerta | `l4-operational.md` §§3–4 | `l1-relay.md`, `l2-relay.md`, L3 F3 |
| Dock sem canal/token ou ação incerta | `l4-operational.md` §5 | `l1-integrations.md`, `l2-integrations.md`, L3 F4 |
| Janitor falhou ou sugeriram “limpar” processos | `l4-operational.md` §6 | L1/L2 integrações |
| capability asset “já está live” | `l4-ownership.md` §5 | L1 integrações e oracle S3-C6 |
| conflito Atlas Memory backend-only versus quatro seats | `l4-ownership.md` §6 | L1 Maestro e oracle S3-C7 |
| mudança atravessa vários componentes | `l4-ownership.md` §§2–4 | L3 e apenas as evidências L1/L2 específicas |

Leia `index` e um único artefato de entrada/ownership primeiro. Só abra maintenance/operational e as fontes necessárias para o caso. Volume de fixture, nome de diretório e proximidade textual não são sinais de ownership.

## 2. Regra de identidade e nome exibido

O ID canônico é a identidade de roteamento e proveniência. Para seats nativos diferentes de Maestro, a resolução observada do label é:

1. variável indicada por `labelEnv`, quando definida;
2. caso contrário, config `agent.<id>.name`;
3. caso contrário, default do roster.

O valor é `trim`ado e validado contra vazio, mais de 40 caracteres, controles/quebras, IDs reservados e colisão com outro ID/label. Se o valor selecionado for inválido, o runtime usa o default do roster e emite warning; ele **não** tenta silenciosamente a próxima fonte. `maestro` conserva nome fixo. O ID `backend` e escritas canônicas permanecem, mesmo quando um alias legado é lido/canonicalizado.

Portanto: mudar apresentação pode ser permitido; renomear a autoridade, hardcodear o novo label em routing ou replicar o default por vários arquivos não é.

## 3. Rotas diretas para a evidência L1

As rotas abaixo são referências de navegação e consulta. Separadamente, o vínculo de build deste entry declara dependências diretas para `s3-l3-flows`, `s3-l1-maestro`, `s3-l1-relay` e `s3-l1-integrations`; alterações nesses predecessores invalidam este binding e exigem nova preparação. Esses vínculos controlam os inputs da construção, não concedem ownership, autoridade nem aceite semântico transitivo. As rotas e o catálogo abaixo continuam sendo navegação; a existência de uma rota não prova leitura, publicação ou execução.

- Maestro: `bodies/l1-maestro.md`
- Relay: `bodies/l1-relay.md`
- especialistas/adapters/Dock/Janitor/assets: `bodies/l1-integrations.md`
- aceite semântico L1 persistido: `evidence/L1-acceptance.json`
- fontes e cobertura Maestro: `receipts/L1-A/sources.json`, `receipts/L1-A/coverage.json`
- fontes e cobertura Relay: `receipts/L1-B/sources.json`, `receipts/L1-B/coverage.json`
- fontes e cobertura integrações: `receipts/L1-C/sources.json`, `receipts/L1-C/coverage.json`
- decisões J1/J2 L1: `judgments/J1-L1-A-v1-final.md`; `judgments/J2-L1-A-v1-final.md`; `judgments/J1-L1-B-v2.json`; `judgments/J2-L1-B-v2.json`; `judgments/J1-L1-C-v3.json`; `judgments/J2-L1-C-v3.json`

### Catálogo H2 dos intermediários L1

`index(scope, need)` lista apenas headings da root daquele need e não aceita `key`. No need `evidence`, a root é `s3-l1-maestro`; os dois corpos abaixo são intermediários. Para `Read(key, section, maxBytes)`, use a chave correspondente e, em `section`, exatamente um dos textos H2 abaixo (o texto após `## `), preservando número, acentos e pontuação. Isso permite ler a seção do intermediário sem adquirir o corpo inteiro. `maxBytes` é limite de recusa, sem truncamento.

**`s3-l1-relay` — textos exatos de `section`:**

- `1. O que existe e quem decide`
- `2. Mapa contratual das famílias`
- `3. Entradas e semântica dos controles`
- `4. Drivers, execução e estado`
- `5. Auditoria, persistência e recuperação`
- `6. Authoring, hooks e material gerado`
- `7. Integrações externas e evidência preservada`

**`s3-l1-integrations` — textos exatos de `section`:**

- `1. População e necessidades`
- `2. Identidade e autoridade dos especialistas`
- `3. Árvores de skills, geração e instalação`
- `4. Discovery: pacote documental versus host efetivo`
- `5. Claude: integração, execução e recusas`
- `6. Claude: identidade, lifetime, conta e distribuição`
- `7. Capability assets: proveniência não é runtime`
- `8. Dock: duas superfícies e um receptor desktop`
- `9. Janitor: observação e notificação, sem limpeza automática`
- `10. Intenção, histórico e evidência de testes`
- `11. Alcance e gaps que acompanham o resultado`

Abra a menor rota que sustente a decisão. O reader deve citar a autoridade/gap do próprio artefato; a existência dessas rotas não promove L2–L4 nem prova publicação Atlas.

## 4. Profundidade por objetivo

### Alteração permitida

Leia entry + ownership. Identifique fonte autoral, owner e contratos compatíveis. Confirme os negativos: identidade não muda, gates não alargam, gerado não é editado e navegação não vira build dependency.

### Falha operacional

Leia entry + operational. Comece por identidade, estado, receipts e pré-condições reais. Classifique `failure`, `unknown`, `stale-not-dispatched`, `unavailable` ou `corrupt`; não transforme ausência de output em sucesso.

### Manutenção estrutural

Leia entry + maintenance. A receita precisa nomear fonte de verdade, gerados/cache, validação e checks negativos. Só depois abra L2/L3 e source receipts.

### Pergunta fora do escopo

Abstenha-se de afirmar conexão live, credencial, produção, custo, billing, CI ou economia sem evidência observada. Direcione a lacuna; não invente estimativa.

## 5. Autoridade e frescor

Todos os corpos desta S3 estão pinados ao baseline acima. O repositório pode ter avançado depois dele; use este conhecimento para entender o pin, não para declarar o estado atual de outra revisão. Specs e charters preservam intenção/histórico; código e composição observados no pin têm precedência para comportamento instalado, mas ainda não provam execução.

## 6. Regra de parada

Uma resposta é suficiente quando identifica: componente e owner, identidade/porta, fonte autoral, efeito permitido, negativos obrigatórios, evidência usada e desconhecidos. Não carregue o corpus inteiro para uma troca de label; não responda a uma falha multiporta usando apenas um catálogo.
