# S3 L4 — receitas de manutenção segura

**Estado:** `CANDIDATE_UNRELEASED`. Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. As receitas descrevem mudanças no pin e seus negativos; não declaram execução, CI, importação ou publicação.

## 1. Formato obrigatório de uma mudança

Antes de editar, escreva: objetivo, fonte autoral, owner, consumers, tipo de aresta (`build`, `semantic`, `navigation`), gerados/cache, checks positivos, checks negativos e rollback/recovery. Preserve histórico/conflitos. Nunca altere fixture/golden apenas para obter PASS.

## 2. Acrescentar um companion à skill `backend-implement`

1. Edite a árvore autoral sob `modules/specialists/backend/skills/backend-implement`.
2. Use nome portável, arquivo regular UTF-8 e conteúdo compatível com os contratos da árvore; não atravesse symlink/root.
3. Confirme que a root já é declarada pelo seat e que o arquivo novo pertence ao membership. O grant da root cobre o filho; não crie grant novo por arquivo.
4. Rode/inspecione `SeatSkillContent` para tree, UTF-8, frontmatter/links e membership.
5. Regenere via `seatSkillsModule`/`seatSkillsFiles` para os targets Bun e Node. **Não edite** `orchestra-seat-skills.gen.ts` manualmente.
6. Valide o embed e a extração de `SeatSkillRoot`: versão/digest, cache íntegro, reconstrução de cache parcial/adulterado e locks.
7. Exercite source e pelo menos o target compilado realmente entregue. Confirme que o seat consegue descobrir a instrução shipped.
8. Verifique negativos: arquivo fora da root, invalid UTF-8, symlink/escape, gerado manualmente divergente e cache adulterado devem falhar.
9. Registre bytes/hashes e target. Um link para Relay é navigation; só declare dependência Relay se o resultado consumir os bytes.

## 3. Trocar o label de um seat

1. Preserve o ID canônico e a config key.
2. Para seats com `labelEnv`, a variável tem precedência sobre `agent.<id>.name`; sem ambos, use default do roster.
3. Valide: não vazio, até 40 code points, sem controles/quebras, sem ID reservado e sem colisão com outro ID/label.
4. Se a fonte escolhida é inválida, a resolução volta ao default e emite warning; não cai para a fonte de prioridade seguinte.
5. Não altere routing, work-result tags, IDs persistidos ou histórico.
6. Não ofereça essa receita para renomear Maestro; seu nome é fixo nessa superfície.
7. Testes negativos: colisão, reserved label, controle, env inválida sobre config válida e alias legado. A env inválida deve demonstrar fallback ao default, não à config.

## 4. Criar ou alterar uma tool governada

1. Identifique registry/schema e owner real.
2. Defina recursos/efeitos e a porta de execução. Texto do prompt não é grant.
3. Mantenha caller/owner gate, profile floor, ToolSafety, permission snapshot e approval separados.
4. Sincronize playbook/skill apenas quando forem parte do contrato; load de playbook não substitui approval.
5. No Claude adapter, preserve `PreToolUse`/`canUseTool` por tool-use id e o caminho `turn.authorize`/`turn.execute`.
6. Não crie alias para contornar recusa. `Agent`/`Task` continua recusado; delegação usa Orchestra task/child Session.
7. Testes: owner correto + estado completo; caller errado; owner não nativo; skill não carregada; permission denied; mismatch de revision/child; restart que perde load in-memory.
8. Registre receipt da tool e, quando aplicável, settlement do workflow separadamente.

## 5. Alterar profile/policy/controle Relay

1. Edite a fonte autoral (por exemplo YAML ou TS) e regenere/compile o derivado previsto; não trate JSON compilado como origem.
2. Preserve IDs globais únicos depois do merge.
3. Confirme que o driver selecionado implementa os kinds/fields emitidos. TS, shell, `relay-gate` e integração Python possuem lifecycle/estado diferentes.
4. Marque judges advisory versus blocking explicitamente.
5. Exercite DoD/regressão/plan comparison conforme a superfície. `oracle_recheck.status=not-run` não fecha o controle.
6. Rode audit/verify para a propriedade correspondente, lembrando que exit 0 não executa checks nem prova artefatos atuais.
7. Verifique blank stdout consultando state/stderr/ledger; não o interprete sozinho.
8. Não edite failing fixture/golden para apagar a divergência. Atualização de oracle exige mudança consciente do contrato e revisão dos casos.
9. Registre tentativas, receipts e custos observados; ausentes ficam `UNKNOWN`.

## 6. Adicionar preset/capability asset

1. Trate a mudança como dados: nome/destino reservado, fonte, licença e adaptação.
2. Não declare conexão, credencial, grant ou live acceptance por catalogação.
3. Verifique collision/provenance e mantenha o item `source-qualified`/pending até dependency integrity, conformance e aceitação específica.
4. Para disponibilizar ao seat, existe uma segunda mudança: carregar/embutir o asset na porta/skill realmente consumida e manter os gates.
5. Testes negativos: asset catalogado sem conexão; provider ausente; credencial ausente; seat sem grant; destino reservado sem handler.
6. Economia só é calculada com baseline e usage medidos.

## 7. Manter Dock ou Janitor

### Dock

- Preserve o transport desktop real: Electron main, loopback WebSocket e URL/token por launch.
- Não copie token entre launches nem gere um valor arbitrário.
- Diferencie hook direto de RPC/MCP e valide a ordem/permissão de cada porta.
- Para ação incerta, registre idempotência/receipt; somente `stale-not-dispatched` usa retry delimitado.
- Preserve o reaper Linux ligado ao lifetime da Session.

### Janitor

- Mantenha scanner/report/sink read-only.
- Falha do scanner retorna unavailable, não lista vazia/clean.
- Não acrescente delete/kill/restart como “conveniência” sem novo contrato, owner e revisão.
- Prove a composição com o store/desktop antes de afirmar persistência; nomes semelhantes não bastam.

## 8. Atualizar Atlas Memory de seats

1. O baseline permite apenas `backend`, `jimmy`, `archie` e `live`.
2. Atualize código/descriptors/gates coerentemente; não autorize ID arbitrário ou agente customizado que o copie.
3. Preserve a spec backend-only antiga como conflito histórico com época.
4. Teste owners permitidos, owner proibido, outra Location/projeto e ausência de runtime.
5. Não reescreva a história para produzir uma narrativa sem divergências.

## 9. Definition of done local

A receita está completa quando fonte e gerados estão coerentes, checks positivos e negativos foram observados, consumers reais foram exercitados, receipts foram persistidos e runtime/CI têm status real. Sem execução, registre `NOT_RUN`; sem medição, `UNKNOWN`; sem dois pareceres independentes, o artefato não está aceito.
