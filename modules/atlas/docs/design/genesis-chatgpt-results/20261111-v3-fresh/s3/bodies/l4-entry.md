# S3 L4 — entrada mínima para Maestro, Relay, especialistas e integrações

**Estado:** `CANDIDATE_UNRELEASED`; depende de L3 liberado, o que ainda não ocorreu nesta recuperação. Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Este mapa serve para encontrar a menor leitura útil; não concede autoridade, não substitui os gates e não declara runtime.

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

Estas são **rotas de navegação**, não dependências adicionais de build nem aceite transitivo:

- Maestro: `bodies/l1-maestro.md`
- Relay: `bodies/l1-relay.md`
- especialistas/adapters/Dock/Janitor/assets: `bodies/l1-integrations.md`
- aceite semântico L1 persistido: `evidence/L1-acceptance.json`
- fontes e cobertura Maestro: `receipts/L1-A/sources.json`, `receipts/L1-A/coverage.json`
- fontes e cobertura Relay: `receipts/L1-B/sources.json`, `receipts/L1-B/coverage.json`
- fontes e cobertura integrações: `receipts/L1-C/sources.json`, `receipts/L1-C/coverage.json`
- decisões J1/J2 L1: `judgments/judge-1-L1-A.json` ... `judgments/judge-2-L1-C.json`

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
