# S3 L3 — fluxos integrados de autoridade, execução e recuperação

**Estado:** `CANDIDATE_UNRELEASED`. Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Oracle: `oracles/L3-flows.json`. Este corpo foi reconstruído depois da perda da sessão anterior. Os corpos L2 correspondentes estão persistidos, mas ainda não receberam dois novos pareceres independentes; portanto este L3 não está liberado, não entra como artefato aceito no pacote nativo e não autoriza L4.

## 1. Invariantes que atravessam os quatro fluxos

1. **Identidade não é apresentação.** A autoridade parte do actor composto e do ID canônico do seat. Label, nome de tool, texto do modelo e Task ID copiado não substituem `projectId + sessionId + memberId`.
2. **Plano não é autorização; autorização não é execução; execução não é aceite.** Cada transição exige seu próprio objeto e sua própria evidência.
3. **A Session pertence ao Core/host.** Maestro coordena; adapters traduzem; providers não ganham uma segunda árvore de Sessions.
4. **Permissões são cumulativas apenas dentro das portas declaradas.** Profile nativo, caller gate, owner gate, ToolSafety, approval e permission snapshot continuam aplicáveis mesmo quando um provider possui allow rules locais.
5. **Efeito, disposição, receipt e estado aplicado são fatos distintos.** Uma falha entre eles deixa incerteza real.
6. **Fonte autoral, gerado, fixture, histórico e navegação têm semânticas diferentes.** Apenas dependência de build/semântica declarada propaga invalidação.
7. **Desconhecido permanece desconhecido.** Runtime, CI, billing, conexão live, resultado externo e consumo do desktop não são inferidos de texto estático.

## 2. F1 — acrescentar um companion UTF-8 a uma skill de seat

### Entrada

Um mantenedor acrescenta um documento filho à árvore já declarada `backend-implement`, sob `modules/specialists/backend/skills`. A intenção é que o seat o leia tanto em execução de fonte quanto no binário/sidecar compilado.

### Caminho de autoridade e build

1. O owner da árvore autoral cria o arquivo dentro da root declarada. O nome precisa ser portável; o objeto deve ser arquivo regular UTF-8, sem symlink/escape e compatível com os contratos de conteúdo da árvore.
2. O membership da root e os bytes capturados viram inputs. O grant é da root seat-scoped e cobre descendentes válidos; o arquivo novo não cria seat, ID, tool ou grant adicional.
3. `SeatSkillContent` valida a árvore e seu conteúdo. Erro de encoding, frontmatter/link proibido ou saída da root é falha do input, não motivo para contornar a validação.
4. `seatSkillsModule`/`seatSkillsFiles` regenera o módulo virtual `orchestra-seat-skills.gen.ts` para os targets Bun e Node. O gerado é consequência dos inputs; editá-lo manualmente produziria drift e perderia a fonte de verdade.
5. Em source, a árvore autoral é lida no lugar. Em build compilado, `SeatSkillRoot` exige o embed e extrai cache por versão/digest, validando membership e bytes. Cache íntegro pode ser reutilizado; parcial ou adulterado precisa ser reconstruído sob o contrato de lock/digest.
6. Uma orientação que precisa chegar ao seat em runtime deve estar na árvore shipped. Uma skill em `.orchestra/skills/` pode instruir contribuidores, mas não substitui o payload embarcado.

### Impacto e não impacto

O resultado Maestro/skills deve ser regenerado porque os bytes são input real. Um link documental para Relay é navegação enquanto o resultado Relay não consumir esses bytes como input. Navegação pode ajudar descoberta, porém não transforma a base Relay em dependência de build nem exige sua invalidação.

### Evidência de manutenção

O recibo útil contém: path autoral, membership observado, hashes dos bytes, resultado do gerador, digest do embed/cache, target exercitado e checks negativos. A existência do arquivo no Git isoladamente não prova disponibilidade no sidecar.

## 3. F2 — Maestro despacha trabalho governado para Claude e o resultado participa de Relay

### Preparação e aprovação

1. Maestro mantém o plano e o contexto, mas a identidade de autoridade é o `ComposedActor`; o seat escolhido continua sendo o owner da execução.
2. A revisão apresentada ao owner vincula os hashes exatos de revisão, validação, contexto, policy e task. Só a primeira resposta genuína posterior, na mesma Session e não sintética, pode ser interpretada.
3. A decisão aprovada não é uma permissão ampla. A reservation write-once vincula uma child Session exata e o permission snapshot correspondente.
4. Antes do primeiro provider turn, `beforeTurn` revalida/consome o vínculo. Alteração de prompt, intent, seat, child ou permissões exige nova revisão/autorização; mismatch produz HOLD/recusa.

### Execução Claude

1. O Core cria ou retoma a child Session durável; o adapter Claude recebe um `Turn` filtrado e preserva history, context, tools, authorize/execute, estado e steers.
2. O preset estrutural permanece `claude_code`; contexto Orchestra entra pela porta adicional prevista. Catálogo ou cast não autoriza system prompt arbitrário.
3. Claude `Agent`/`Task` e superfícies equivalentes são recusados. Delegação permitida passa por `mcp__orchestra__task`, que cria a child Session Orchestra.
4. Built-ins atravessam `turn.authorize`/ToolSafety. Tools Orchestra atravessam `turn.execute` no registry. `ToolSearch` carrega schema, não concede autoridade.
5. `PreToolUse` e `canUseTool` compartilham a decisão pelo tool-use id para evitar divergência, mas uma allow rule local nunca bypassa o host.
6. Tools `maestro_*` protegidas exigem o load bem-sucedido de `maestro-run-governed` naquela Session; o estado é in-memory e não sobrevive a restart. Exceções de load, como `maestro_arsenal_*` e `maestro_workflows`, preservam seus próprios gates.

### Settlement Relay

O workflow Relay precisa ser o caminho governado realmente configurado: definição, parâmetros, skills/âncoras, checks finais, arm/placement e receipt durável. Uma chamada isolada a `evaluate` ou um exit code não substitui settlement. O resultado pode ser aceito apenas depois de evidência de execução, revisão e conclusão apropriada; carregar playbook, produzir texto ou obter approval não fecha o workflow por si.

## 4. F3 — efeito Relay possivelmente ocorreu, mas receipt/state não foram aplicados

### Estado possível

O processo pode morrer depois do efeito externo e antes de produzir disposição, antes do receipt durável ou antes da aplicação de estado. Esses cortes não são equivalentes. `release` de lock permite retomar a WP sob o contrato; não desfaz efeito externo e não prova exactly-once.

### Recuperação segura

1. Identificar arm/token/WP, lock, revisão e driver. Não apagar lock ou editar state/golden para tornar o diagnóstico verde.
2. Ler state, ledger/receipts, stderr e artefatos atuais. Separar: efeito observado, disposição assinada/proveniente, receipt do caller e evento de aplicação.
3. Observar o alvo externo somente por porta segura/idempotente quando o contrato oferecer essa leitura. Ausência de receipt não prova ausência de efeito.
4. Classificar o resultado como `observed-applied`, `observed-not-applied`, `stale-not-dispatched`, `unknown-effect`, `corrupt` ou `unavailable`.
5. Repetir automaticamente apenas se o contrato prova `not-dispatched` ou se a operação foi realmente emitida com chave idempotente válida. `unknown-effect` bloqueia repetição quando duplicação é perigosa.
6. Em workflow governado, concluir pelo settlement do host. Audit/verify confirma apenas as propriedades que de fato verificou; não executa checks nem valida automaticamente os artefatos correntes.
7. No oracle recheck, cadeia íntegra sem sprint atual resulta em `not-run`; sprint fornecido/descoberto que é ilegível, UTF-8 inválido, JSON malformado ou schema inválido resulta em `invalid`, nunca em `not-run`. Cadeia ou registros quebrados têm seu próprio `not-run` com motivo de comparação não executada. Nenhum desses estados fecha a WP.
8. Preservar tentativa e lacunas. O audit usa `total: null` quando nenhum custo foi registrado: não é custo zero, é não medido. Billing, tokens e número físico de chamadas continuam `UNKNOWN`.

## 5. F4 — Dock retorna ação incerta e Janitor está indisponível

### Pré-condição de transporte

Dock depende do transport real composto pelo desktop: Electron main, loopback WebSocket e URL/token por launch, associados ao canal/Session. `fromEnv` ausente fora dessa composição significa canal indisponível. Não se inventa token, não se reaproveita credencial de outro launch e não se interpreta um catálogo como conexão.

Hooks diretos e RPC/MCP possuem ordens e superfícies de permissão próprias. Uma permissão em uma porta não deve ser projetada silenciosamente na outra.

### Tratamento da ação

- `success` ou `failure` observado: seguir receipt.
- `stale-not-dispatched`: usar somente a regra de retry delimitada do contrato.
- `unknown/uncertain`: não repetir automaticamente quando o efeito pode ter ocorrido.
- `channel-unavailable`: corrigir a composição; não simular sucesso.

A exclusão da Session pode acionar o reaper Linux pertencente ao lifetime Dock. Isso não transfere poderes destrutivos ao Janitor.

### Fronteira Janitor

Janitor é scanner/read-only: identifica candidatos/órfãos e entrega report a um sink fornecido pelo host. Falha do scanner é `unavailable`, não “clean”. Janitor não remove, mata, reinicia, limpa credenciais, cria transportes ou resolve uma ação Dock incerta. Estado/scheduler in-memory e store persistido do desktop só podem ser tratados como compostos quando a ligação real foi observada.

## 6. Matriz de decisão integrada

| Sinal | Próxima leitura | Ação permitida | Ação proibida |
| --- | --- | --- | --- |
| label mudou | actor/ID canônico e resolução de label | corrigir apresentação validada | rotear por label |
| approval mismatch | revisão, hashes, reservation e child | reabrir revisão/autorização | ampliar token antigo |
| tool Claude recusada | owner, skill load, authorize/execute | usar porta Orchestra correta | Agent/Task direto ou allow bypass |
| stdout vazio | state, stderr, ledger, recheck | classificar evidência | concluir WP por silêncio |
| efeito desconhecido | receipt + alvo externo observável | HOLD/manual/idempotência provada | retry cego |
| Dock sem URL/token | composição desktop/channel | restaurar transport real | gerar credencial |
| Janitor falhou | scanner/report/sink | marcar unavailable | declarar clean ou limpar processos |
| asset catalogado | provenance, grant, connection e live acceptance | manter source-qualified/pending | afirmar integração live |

## 7. Limites desta reconstrução

A cobertura estática dos quatro casos do oracle pode ser verificada deterministicamente, mas este corpo não recebeu os dois novos pareceres independentes exigidos. Nenhuma Session, provider, workflow, build, cache, Dock, Janitor, CI, importação, publicação ou leitura Atlas foi executada por esta reconstrução. O histórico da conversa anterior registra que um L3 chegou a ser aceito, mas os pareceres e o corpo completos não estão duráveis; essa alegação não é usada como release.
