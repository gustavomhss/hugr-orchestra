# Evidência de derivação — s1.subslice03.automation-flow

## 1. Objeto, autoridade e identidade exata

Esta evidência acompanha somente `s1.subslice03.automation-flow`, L2, need `flow`, da execução `34269cf4-d631-41c5-a30b-85b0ec217390`, missão S1-03. A autoria explica fluxo local; não entrega impacto L3, manutenção L4, entrada global ou qualificação operacional.

A autoridade semântica consumida foi o arquivo inteiro `producers/automation/body.md`, chave `s1.core.automation`, v4, com **60.767 bytes**, SHA256 **`968965f1b15d633cefc8a78868d9d1049147f23dff409c6cb05c7a75e3561cae`**, Git blob **`e26213eb2fc76dc843dca17d1111334c76f88890`**. A identidade foi recalculada e coincidiu com a receita. Todas as referências E01–E10 abaixo vinculam-se exclusivamente a esses mesmos bytes; não citam uma versão genérica da chave.

O predecessor atribui seus achados ao baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Esse commit é procedência relatada pelo L1, não checkout/código relido pelo produtor L2. Seus marcadores A/B/S/T e referências a arquivos de evidência são parte do conteúdo aceito; os respectivos arquivos não foram abertos.

O gate fornecido pela receita congelada registra PASS dos papéis `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` para o SHA256 acima. Recebi essa condição de liberação sem consumir pareceres originais. Não a converto em aceite do L2 ou em OwnershipReview de runtime. O principal mantém o mesmo par para a revisão destes novos bytes.

Corpo L2 acompanhado: `producers/derived-automation-flow/body.md`, SHA256 `5985441b360d0efc6693d0d385980f4a93cab2c044387a7375608dd5a9adf517`.

## 2. Mapa de afirmações e seções do predecessor

Cada linha identifica o trecho útil do L2, o apoio exato dentro do único predecessor e a qualificação que precisa sobreviver à consulta limitada. Os números/títulos são os do corpo aceito, sem linhas de fonte inventadas.

| ID / trecho L2 | Seções exatas de s1.core.automation nos bytes fixados | Afirmação sustentada e limite conservado |
| --- | --- | --- |
| E01 — §1; limite final de §8 | `Como usar este L1`, subheading `Três mecanismos, três significados de sucesso`; `13. Prova disponível e lacunas preservadas`; `14. Impacto de manutenção e uso seguro do conhecimento` | Actions observa pós-condição; Board separa plano/fato/integração; scheduler assenta admissão. Descrições são leitura estática, não execuções. Derivação não concede validade atual fora do baseline nem aceite local/global. O vínculo de build único e o papel L2 são fixados pela receita/plano públicos. |
| E02 — §2, vínculo | `1. Actions: vínculo, leitura e autoridade`, especialmente `1.1 Vínculo confiável antes de tocar o provider`; `4.2 Comandos GitLab` | Fachada lazy, ID/revisão e releitura de projeto/conta; policy local distinta da remota; capacidade/permissão/role desconhecidos não concedem autoridade. Não se qualifica conta/host atual. |
| E03 — §2, base/projeção/autoria | `2. Fonte de CI: compreender, validar e propor alteração`, incluindo `2.1 O grafo é uma projeção da definição` e `2.2 Ciclo de autoria com base imutável`; `4.3 Recursos: escopo, versões e efeitos parciais` | Commit-base, sourceVersion e hash de draft têm papéis distintos. Parser/CI lint não executam grafo remoto. Branch→arquivo→review são fases; versão/fingerprint não garante CAS remoto e readback perdido não desfaz escrita. |
| E04 — §3 | `3. Intenção durável, execução única local e readback`, incluindo `3.1 O ledger protege o envio, não inventa certeza remota` e `3.2 Confirmar exige atribuição suficiente`; `2.2 Ciclo de autoria com base imutável` | Chave única, conflito de intenção, CAS sending, prazos/retenção e persistência restrita. Unknown não é convite a replay. Observação é read-only e limitada por kind/ID/tentativa: dispatch pode confirmar antes de terminar, retry GitHub não recebe tentativa inventada e source/resource/job não ganham confirmação genérica. |
| E05 — §4 | `1.2 Identidade e paginação são parte da leitura`; `4. Comandos e recursos têm semântica nativa` e subheadings `4.1 Comandos GitHub`, `4.2 Comandos GitLab`, `4.3 Recursos: escopo, versões e efeitos parciais`; `5. Transporte e download: onde a incerteza começa`; `5.1 Transferir resultado sem mudar sua autoridade` | Dispatch/retry/schedules/resources preservam identidade/escopo por provider; schedule YAML difere de recurso GitLab e ambos de ScheduledTask. Metadado de binding não qualifica versão real. Fase pós-envio pode ser unknown; transferência exige término válido e não repete bytes parciais. Nenhuma chamada real foi feita. |
| E06 — §5, plano/decisão/card | `6. Board: plano, owner, evidência e memória de decisão`, incluindo `6.1 Fluxo do card e controles` e `6.2 Decisão, resultado narrado e undo` | Guard Maestro é da porta de tools; transação/atividade e publicação posterior; decisão preservada, outcome narrativo não é prova; Intake, Review, queue e shipped têm condições específicas. Controles não são autenticação ou cancelamento universal. |
| E07 — §5, queue/CI/correlação | `7. Espelho GitHub, CI local e métricas do Board`, especialmente `7.1 Espelho e fatos vivos` e `7.2 ci_run: resultado do tree, não do rótulo`; `8.1 Antes de cortar um bundle` | Queue fixa head e record; scoped state é por tree e último resultado por kind/command, com regra exata de pass/fail, não todos os comandos verdes. Contrato ausente/default não prova CI ausente. Correlação por SHA/tempo/latest é heurística própria do Board; possível ambiguidade é inferência estática. |
| E08 — §6 | `8. Fila: admissão, bundle, gate e integração`, com `8.1 Antes de cortar um bundle`, `8.2 O gate e suas saídas`, `8.3 Integração e recuperação parcial`, `8.4 Limite de revogação observado por leitura`; `9. Snapshots e records: durabilidade limitada ao que foi gravado` | Lanes/bundles, pending/red/flaky, confirmação de heads/base e recuperação específica após push. Tested/merged podem divergir sob condição qualificada. Hold/pause sem rechecagem final conserva janela de revogação como inferência, sem reprodução. Restore de plano não recompõe automação inteira. |
| E09 — §7, política/tempo | `10. Agendamento: duas políticas, identidades diferentes`; `11. Tempo devido, catch-up e DST` | Policy/owner/placement, diferenças de manual, cadência, atraso, DST e cron. `placed` não é leitura caller-scoped. Capability e legado não podem ser unificados sem mudar semântica. |
| E10 — §7, daemon; §8 | `10. Agendamento: duas políticas, identidades diferentes`; `12. Claim, admissão, revogação e retomada`; `13. Prova disponível e lacunas preservadas` | Claim/lease/dedupe/retenção; started após SessionInput; failure de tick consome slot; manual e takeover reconciliam identidade; edição/revogação não cancela admissão. Janela após holds e ramo revoked→started preservam excesso possível sobre repeat. Wake capability.create é inferência sem liveness test; teste da race é código lido no L1, não executado no L2. |

## 3. Classes de evidência e fronteiras de afirmação

**Achado estático herdado:** mecanismos, estados e condições foram explicados a partir do corpo L1 aceito. Não houve acesso às implementações, fixtures ou testes originais. O aceite informado libera a derivação dessa versão; não elimina limitações expressas nela.

**Expectativa de contrato em teste:** o predecessor relata teste que simula revogação após o último recheck do scheduler. O L2 conserva a expectativa e a marca NOT_RUN. A existência de assertion, fixture ou teste live não é evidência de execução nesta autoria.

**Inferência estática identificada:** correlação heurística de runs do Board sob concorrência; falta de rechecagem final de hold/pause de bundle; falta de wake demonstrado em capability.create com daemon ocioso. Não foi reproduzida corrida, medida liveness nem corrigido produto.

**Composição L2:** escolher o fato ausente antes do aprofundamento, distinguir schedules de CI de ScheduledTask e organizar os três fluxos em entradas limitadas são síntese local apoiada nas seções citadas. Isso não estabelece uma integração transacional entre esses mecanismos.

**Execução real desta autoria:** leitura dos inputs públicos enumerados e do predecessor, preservação do dispatch, composição dos arquivos e verificação determinística de UTF-8/bytes/SHA256/Git blob/estrutura. Não foram feitos testes de produto, rede, providers, GitHub, CI, Atlas import/binding/publicação/index/read, consumidores ou manutenção. Não há PASS autoatribuído.

## 4. Critérios públicos: contribuição e prova ainda externa

| Critérios pertinentes | Contribuição concreta desta entrega | Fronteira de avaliação |
| --- | --- | --- |
| GO-A1, GO-A2, GO-A3; QS-1, QS-2; CC-3 | Oito seções L2 independentes explicam propósito, sequência, decisões e limites; E01–E10 permitem aprofundar no L1 | Utilidade e suficiência destes bytes ainda requerem o par nativo; links não provam leitor Atlas real |
| GO-A4, GO-A5; GO-I1, GO-I2; CC-1, AC-01 | Inputs e receita fixados, predecessor exato, dispatch/pedido preservados, tipos de evidência separados | Hash atual não prova verdade; esta entrega não reconcilia toda S1-03 nem todos os artefatos/casos |
| GO-A6, QS-6 | Leitura delimitada, reaproveitamento do L1 aceito, hashes calculados; uso não exposto UNKNOWN | Nenhum número de bytes é convertido em tokens/custo; não se presume cache hit de runtime |
| GO-A7, GO-I7; QS-3, QS-4 | Apenas arquivos da área exclusiva, sem novo motor/store, fontes externas, testes ou alterações de produto | A autoria não oferece permissões para operação externa ou publicação |
| GO-I8, QS-5 | Conteúdo semântico e evidência disponíveis para juízo; estrutura mecânica não autocertifica | Revisão L2, consumidores e recibos reais permanecem obrigações da coordenação |
| CC-4, CC-7 | Dependência declarada e limites de compatibilidade/pin preservados; escopo posterior nomeado | Build/reuse/invalidação ponta a ponta e obrigações de produto/campanha não são demonstrados por esta autoria |

O único predecessor semântico de build é `s1.core.automation` nos bytes fixados. Referências internas a seções e nomes de dependências externas são navegação/contexto relatado; não acrescentam arquivos brutos ou artefatos irmãos ao conjunto de inputs. Camadas L3/L4 continuam dependentes de novos gates e despachos.

## 5. Procedência do procedimento e conferências

A receita efetiva é a combinação do contrato público `payload/recipes/derived-contract.json`, da receita congelada `payload/recipes/derived/automation-flow.json`, do pedido preservado `producers/derived-automation-flow/request.txt` e do dispatch visível registrado em `dispatch-message.txt`. `production-manifest.json` é registro posterior à autoria, não receita preexistente.

Os 14 arquivos em `read_exactly` foram consumidos por inteiro; somados à receita, ao pedido e ao dispatch, são 17 unidades de input distintas. Uma saída inicial de leitura truncou parte de COMMON/mission; ambos foram relidos integralmente. O predecessor foi lido em quatro segmentos contíguos que cobrem seus 59.078 caracteres UTF-8 decodificados, após conferência da identidade integral de 60.767 bytes. Não houve leitura de oracle, parecer completo, irmão não listado ou inventário recursivo.

O manifesto conserva local_path, bytes, SHA256 e Git blob de cada unidade integral. As conferências finais são determinísticas: identidades contra a receita, preservação do pedido, enum/layer/need, dez referências E sem faltas, oito headings depth2 e resposta sem LF terminal. Nenhuma dessas verificações substitui o juízo semântico ou testes de comportamento.
