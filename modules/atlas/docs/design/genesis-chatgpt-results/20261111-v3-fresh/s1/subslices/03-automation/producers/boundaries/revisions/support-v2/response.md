# Resposta support v2 / suplemento 1

Os pedidos públicos integrais de J1 e J2 foram lidos e preservados. A revisão contém somente três precisões no corpo, duas razões corrigidas em coverage v2 separado e prova literal dirigida para RE-SUP-01..05 de J1 e RE-SUP-01..04 de J2. O produtor não atribui aceite nem altera decisões.

## Deltas autorizados

1. **SUP-F01 / D-SUP-01:** Schema→Core e Protocol→Server são relações distintas no README; Server expõe serviços Core por HTTP. A correção não pretende auditar imports adicionais.
2. **SUP-F02:** `omni-expect` mantém uma expectativa `open` e mede a diferença global de spawns entre `expectSpawn` e `settle`. Exclusividade por teste permanece intenção condicionada à ausência de sobreposição e à integração correta com o runner. Não se afirma uma falha real.
3. **SUP-F03:** `ORCHESTRA_CREDENTIAL_KEY_FILE ??=` fornece o caminho temporário somente quando a variável não estava definida, conservando um valor anterior.

`delta.json` e `delta.patch` contêm exatamente essas substituições. O corpo v2 tem 23025 bytes e SHA256 `498a0454418a14977b9b2f4c4f515711d941b6d4bbece13f1baaa8feaa76d378`. Os arquivos v1 estão preservados em `../support-v1/`; a receita e resposta gerais da raiz continuam registros v1.

`coverage-v2.jsonl` conserva as 128 linhas e modifica somente a razão de README e de omni-expect. `coverage-v2.delta.json` identifica linhas e hashes exatos; `shared-reconciliation-2.delta.md` aplica o erratum sobre o bloco compartilhado v1 sem alterá-lo.

## Prova literal e reutilização

O suplemento contém 149 entradas literais, referências exatas aos 36 trechos R042–R077 reconhecidos e um mapa dos 104 paths. Cada trecho novo possui commit quando aplicável, blob, SHA256 integral, intervalo de linhas, offsets da fonte e do suplemento e hash do excerto. Há evidência nova dos 13 capability fixtures.

| Pedido | Prova entregue / reutilizada |
|---|---|
| RE-SUP-01 | Reconciliação compartilhada, 104 disposições, 24+104, 2+102/4+20, 1.441/2.236; recibo estrutural independente e procedimento literal; 437 exports, 63 tabelas, metadata do tar, ZIP e strings SCIP. |
| RE-SUP-02 | Configurações, migration, toolkit-pack, toolkit-floors e fix-node-pty; trechos anteriores conservados por offsets. |
| RE-SUP-03 | RD-CTRLPLANE, RD-SESSION, PLAN, SNAPSHOT, WAVE-2, schema-changelog, ressalvas de api.html e estabilidade histórica de migrations. |
| RE-SUP-04 | Actions/network/resource/GitHub-command/capture; 13 capability fixtures; gates/distribution/CI; packaged-skills, SDK, ripgrep, upstream factories, recording. |
| RE-SUP-05 de J1 / harness de J2 | Janela `open`, omni-effect, nonce/startTime/processes, Effect/Cause/scoped, rejection/tmpdir/tool/location, shared-schema/task-governance, flock/background/dialer. |

O bloco `shared-reconciliation-1.md`, SHA256 `75aa4f74aba2ddcecd58c52fd329481dffabc60271a57bf0bfbe358d0b903992`, é reutilizado dos bytes [9742, 131191) do suplemento boundaries. Não é novamente retranscrito no suplemento support. A recepção pelos juízes continua sendo responsabilidade da coordenação; esta entrega apenas prepara o transporte verificável.

## Verificação independente e limites

O recibo da coordenação, SHA256 `d2938337ccfad084d4e4e6c9d6ecd08c9b26701e86d69ca760601a93e76ca3eb`, confirma contagens estruturais e identidades de seis entradas. Seu status é `PASS_STRUCTURAL_FACTS_ONLY`, com `semantic_acceptance: NOT_ASSIGNED`. O suplemento conserva os trechos literais do procedimento e dos registros; não transforma o recibo em aceite semântico nem em execução dos testes. O produtor não executou o procedimento independente: leu seu código e os bytes de resultado autorizados.

A3 (177.076 bytes), A4 (155.061 bytes) e projection (726.892 bytes) permanecem inputs efetivos integrais para história e população. A identidade completa dos 104 arquivos também permanece; o tar/ZIP/SCIP não se reduzem às seleções probatórias. `effective-inputs.json` registra os grupos exatos e `effective-inputs.support-v2.json` acrescenta os pedidos públicos e o recibo/procedimento independente. Não há reclassificação para contornar 256K.

O AGENTS original é captura local; a publicação deve vincular a fonte de autoridade do repositório inalterada, sem criar nova autoridade AGENTS no namespace de resultados.

## Estado final desta entrega

Suplemento `suplemento-support-1.md`: 366600 bytes, SHA256 `7069f8fb20eb0c08e0d7e5438d0c13c5a776e9982ca88cf14a02b7d397c075b5`. Hashes dos bytes e offsets foram verificados; fontes de produto, testes, providers, Atlas e operações remotas: NOT_RUN. O corpo boundaries v2 e a proposta permanecem inalterados. Suficiência semântica e autorização de avanço: pendentes do mesmo par e da coordenação.
