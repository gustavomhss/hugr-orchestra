# Rodada 2 — persistência, recuperação e distribuição

Agente `sol_mckay`, modelo `gpt-6.1-sol`, lente de resistência a falhas. Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Seis novos achados P2 com confiança alta nas cadeias estáticas, revisadas pelo lead. Nenhum teste, upgrade, instalação ou publicação executados.

## M5 — P2: retries de upgrade incompleto expulsam backup anterior ao lote

[`migration.ts:69`](../../packages/core/src/database/migration.ts#L69) faz backup antes do lote; linhas 79–94 conservam somente três cópias, com prune antes de aplicar. Cada migração tem sua própria transação em linhas 150–166.

**Cenário:** migração A destrutiva commita; B falha; primeiro backup contém o estado antes de A. Nas três novas tentativas de startup, novos backups contêm o estado já parcialmente migrado. O prune da terceira tentativa elimina a cópia anterior a A, antes de B tentar novamente.

**Impacto:** tentativas de abrir/recuperar o app eliminam o único ponto de restauração anterior à alteração destrutiva. Há migrações destrutivas reais, como reset_v2_session_state e simplify_session_input; seus resets intencionais não são, por si, classificados como defeito.

**Mitigações:** VACUUM INTO gera cópia consistente e cada migração é atômica. Falta retenção do ponto inicial de um upgrade parcialmente concluído. **Correção/teste:** preservar backup por início de upgrade até conclusão; testar A remove dados, B falha, quatro aberturas e restauração dos dados originais.

## M6 — P2: conversão parcial do journal legado provoca reaplicação de SQL histórico

[`migration.ts:99`](../../packages/core/src/database/migration.ts#L99) decide importar somente se completed.size=0. Linhas 124–146 importam journal de timestamps linha a linha, fora de transação.

**Cenário:** banco legado já tem alterações históricas; novo journal vazio. A conversão insere a primeira entrada e o processo termina. Na abertura seguinte, completed.size>0 pula o restante da importação e tenta executar migrações históricas que já alteraram o schema. ADD COLUMN, por exemplo, falha por duplicação. Um timestamp desconhecido depois de entradas reconhecidas cria o mesmo prefixo parcial mesmo sem crash.

**Impacto:** interrupção na conversão se transforma em startup persistentemente quebrado, com necessidade de reparo manual do journal. **Mitigações:** a execução de migrações relê marcadores sob lock IMMEDIATE, mas a conversão não está nessa transação.

**Correção/teste:** validar todas as entradas antes e importar atomicamente, ou usar marcador explícito de conversão concluída. Testar interrupção após primeira inserção e retomada sem reaplicar SQL. Os testes existentes validam entradas isoladas, não prefixo parcial.

## M7 — P2: journal legado nomeado contorna recusa de schema futuro no primeiro acesso

[`migration.ts:57`](../../packages/core/src/database/migration.ts#L57) verifica nomes desconhecidos somente na tabela nova migration. [`migration.ts:115`](../../packages/core/src/database/migration.ts#L115) importa nomes legados sem essa validação.

**Cenário:** banco tem session e __drizzle_migrations.name, sem migration; o journal contém todos os IDs conhecidos e um ID futuro. O guard inicial vê applied vazio, a conversão importa tudo e retorna sucesso sem executar SQL. O build abre o schema desconhecido. Só a segunda abertura recusa o mesmo banco, agora com o ID futuro no journal novo.

**Impacto:** a garantia de recusa antes de abrir banco futuro falha na primeira conversão. **Mitigações:** o guard funciona no journal novo, e timestamps sem correspondência falham; o caminho de nomes é a exceção.

**Correção/teste:** normalizar e validar todos os IDs históricos antes de gravar a conversão. Exigir recusa já no primeiro lançamento, sem alterar journal/schema.

## M8 — P2: flush falho descarta drafts ainda não persistidos

[`draft-store.ts:39`](../../apps/desktop/src/main/draft-store.ts#L39) copia pending e o limpa antes de iniciar/commitar a transação. O IPC em [`ipc.ts:183`](../../apps/desktop/src/main/ipc.ts#L183) já respondeu depois de set apenas enfileirar a alteração.

**Cenário:** flush 500 ms depois do set falha por busy, disco cheio ou I/O. A transação não persiste, mas o buffer já foi apagado. Flush posterior e flush de quit não têm mais essas entradas.

**Impacto:** draft reconhecido pelo IPC é perdido ao fechar/reabrir; blobs só associados à versão perdida podem virar órfãos e ser removidos no próximo startup. **Mitigações:** transação protege consistência do banco; hooks de quit/session-end fazem flush, mas não recuperam o buffer descartado.

**Correção/teste:** remover apenas entradas confirmadas, preservar alterações novas e reter buffer no erro. Testar segunda conexão segurando write lock, flush falho e retry após liberar lock, verificando draft/blobs exatos.

## M9 — P2: publicação CLI não retoma após sucesso parcial no npm

[`release-cli.yml:375`](../../.github/workflows/release-cli.yml#L375) publica plataformas num loop set -e sem reconhecer versões já publicadas; publica wrapper depois. O guard inicial em linhas 54–55 só consulta o wrapper; a release GitHub vem depois em linhas 385–387.

**Cenário A:** primeira plataforma publica, a seguinte falha. Rerun colide com a versão imutável da primeira antes de chegar às restantes. Nova execução completa passa no guard do wrapper ausente e sofre a mesma colisão. **Cenário B:** npm termina, criação da release GitHub falha. Rerun colide no npm; execução completa é bloqueada pelo wrapper existente.

**Impacto:** versão parcial entre plataformas/canais não pode ser concluída pelo retry oficial. É recuperável com intervenção externa ou nova versão, não necessariamente perda irreversível.

**Mitigações:** plataformas antes do wrapper evita anunciar dependências ainda ausentes, mas não implementa retomada. **Correção/teste:** verificar identidade dos pacotes existentes e continuar, separando finalização GitHub; simular falha após uma plataforma e após wrapper e concluir mesma versão sem sobrescrever conteúdo divergente.

## M10 — P2: release desktop criada impede reparo do próprio feed

[`release-desktop.yml:450`](../../.github/workflows/release-desktop.yml#L450) recusa release/tag existentes antes de publicar. A release versionada é criada em linhas 468–469; o feed só é substituído em linhas 487–488. O guard do workflow também recusa a versão existente.

**Cenário:** criar desktop-vX.Y.Z funciona; atualização de desktop-latest falha ou é interrompida. Reexecutar para reparar começa por RELEASE_EXISTS e para. Nova execução completa também é bloqueada.

**Impacto:** versão nova pode existir para instalação manual enquanto o feed segue antigo ou parcialmente substituído; retry oficial não conclui a publicação. **Mitigações:** concurrency serializa releases e payloads sobem antes de manifests, mas não resolve interrupção.

**Correção/teste:** reconhecer e verificar a release existente e retomar feed; manter payloads anteriores até confirmar manifests. Testar falha após release versionada e entre payloads/manifests. O reparo manual permanece possível.

## Cobertura e limites

| Área | Leitura/invariantes | Lacunas |
| --- | --- | --- |
| Core DB | Bootstrap, WAL/pragmas, journals, backups, migrações destrutivas selecionadas, testes | Sem todas as transformações históricas ou fault injection |
| Effect SQLite | Transações, rollback/savepoints/causas, adaptadores Bun/Node | Sem execução de concorrência ou query builders integrais |
| Continuity | Arquivo, escrita atômica, hashes, masking, estratégia/recall | Sem fluxo completo com provedor |
| Janitor | Scanner, scheduler, bootstrap, persistência/IPC | Scanner examinado é somente leitura; nenhuma limpeza destrutiva própria identificada |
| Desktop | Updater/controller, staging CLI, resources, drafts, retenção e migração Tauri | Sem instalação ou validação de assinatura por plataforma |
| Distribuição | Installer POSIX, CLI/desktop release, payload/build e feeds | Sem publicar, baixar artefatos ou executar CI |

Não contados: resets históricos intencionais; effect-sqlite-node sem importadores encontrados; divergências obtidas apenas por diff com origin/dev; seleção de arquitetura de updater sem prova do consumidor. Supervisor não recebeu expansão integral nesta rodada; achados anteriores não foram repetidos.
