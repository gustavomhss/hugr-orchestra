# Auditoria mecânica final dos scripts de montagem e consumo

Registro original de auditoria local em 2026-11-15T06:27:46.174293+00:00. Execução `34269cf4-d631-41c5-a30b-85b0ec217390`, S1-03. Escopo: os cinco scripts solicitados, os contratos reais da CLI local e as identidades dos inputs atualmente disponíveis. **Nenhum assemble, prepare, consumidor, teste de produto, publicação ou juízo foi executado. Não há afirmação de runtime PASS.** Oracle/reserved não foram abertos; a referência opaca encontrada no código foi analisada somente como estrutura.

## Resultado que exige ação antes da execução

Foram encontrados **um bloqueio determinístico de canonicalização**, **uma falha de preservação quando houver timeout** e **uma omissão de conferência de uma referência contra o snapshot publicado**. A proposta concreta está em `proposed.patch`, **não aplicada**. Ela altera somente a lógica de transporte de `assemble-native-final.py` e propõe uma nova `scripts/atlas-consumer-bridge-v2.py`, mantendo o arquivo v1 intacto.

O pacote planejado continua com **12 artefatos**, as fontes continuam inteiras e o alias histórico de support continua vinculado a **boundaries v2**. Nenhum gate ausente foi criado, substituído ou presumido.

## F01 — bloqueio determinístico: `inputs/mission.json` não resolve pelo nome do capture_archive

**Local:** `scripts/assemble-native-final.py`, índice `shared_by_local` na linha 31 e `canonical_local` a partir da linha 49; recusa de `inputs/` na linha 56.

O mapa `payload/receipts/shared-input-materialization.json` registra a missão no caminho canônico original:

`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/03-automation/mission.json`

Seu `capture_archive` é `producers/boundaries/sources/` seguido desse caminho. Os quatro manifests derivados hoje disponíveis, porém, declaram `inputs/mission.json`. Como o montador indexa apenas o nome de `capture_archive`, esse input não entra no primeiro ramo, não tem segmento `/sources/` e cai na recusa `unmapped original authority file`. A falha ocorrerá mesmo depois de chegarem os gates legítimos.

**Identidade observada dos dois aliases:** 6.006 bytes, SHA-256 `32fc0a8d442eff56716ba86400b13109c4bbb97d047e12a2d597a930153e7f75`, Git blob `48fa8da131e97c50110ee76e41e79283cd9a0ac4`; commit do kit `70234d541a9a3539935ef16f19e33c8f2d5f30ec`. Os bytes inteiros foram comparados. Não é uma inferência por nome.

**Correção proposta:** resolver aliases de `inputs/` pela tripla SHA-256/tamanho/Git blob no mapa existente, exigir uma única origem `(path, commit)` e conservar a recusa para ausência ou ambiguidade. Capturas já nomeadas também passam pela mesma verificação de identidade. Fontes com caminhos originais distintos não são fundidas arbitrariamente. AGENTS permanece na autoridade original, sem nova cópia de autoridade no namespace de resultados.

## F02 — timeout da ponte perde o registro da tentativa

**Local:** `scripts/atlas-consumer-bridge.py`, `subprocess.run(..., timeout=60)` na linha 53 e gravação dos streams/recibo somente depois desse retorno.

`TimeoutExpired` sai do script antes de persistir stdout, stderr e `call-NN.json`. Como a numeração e as quotas vêm dos recibos `call-*.json`, essa tentativa física não fica registrada e uma chamada posterior pode reutilizar o número e não contabilizar a tentativa. Trata-se de um risco concreto do ramo de erro; **não ocorreu nem foi simulado nesta auditoria**. A principal informou que a bridge v1 nunca foi executada.

**Correção proposta:** nova bridge **v2**, preservando v1. Capturar o timeout real, gravar os bytes parciais antes de decodificar, registrar `exit_code: null`, início/fim, `timeout: true`, hashes dos streams e `runtime_response_complete: false`. O envelope informa `CLI_TIMEOUT_NO_COMPLETION` e não se apresenta como resposta Atlas concluída. Uma sequência UTF-8 interrompida fica em base64 exato, além do arquivo bruto, sem substituição silenciosa de caracteres. O recibo efetivo passa a contar para chamadas/bytes retornados; perguntas e limites permanecem idênticos.

O patch também identifica a versão e o SHA-256 do próprio wrapper no recibo. A proposta **não cria um recibo futuro** e não atribui sucesso a nenhuma operação. Exceções de spawn diferentes de timeout e crash externo do processo continuam sendo falhas que a principal precisa preservar antes de qualquer retry; a proposta é deliberadamente limitada ao ramo demonstrado e autorizado.

**Uso depois de aplicada pela principal:** congelar e preservar o novo arquivo v2 com identidade própria; escolher explicitamente o caminho v2 na invocação da ponte. Não sobrescrever `scripts/atlas-consumer-bridge.py`, a cópia v1 em `payload/consumers/` ou seu freeze. O texto público de perguntas/quotas/protocolo não precisa mudar.

## F03 — a referência opaca de contrato não participa da conferência do pin

**Local:** `scripts/assemble-native-final.py`, bloco `if not inventory_only` e lista de referências na linha 148.

O código confere todos os inputs locais, corpos, recipe/request/response e pareceres contra o índice do P fornecido. `contract.oracle_ref`, construído no mesmo script, não entra nessa lista. Assim, a conferência atual não demonstra que **essa referência** corresponde ao mesmo snapshot imutável. Nenhuma divergência do oracle foi observada ou alegada: seu conteúdo não foi aberto nesta auditoria.

**Correção proposta:** acrescentar somente a identidade da referência opaca já selecionada ao mesmo array `checks`, antes de verificar os rows do snapshot. Isso não muda o oracle, suas perguntas, respostas, critérios ou o pin. O vínculo ao oracle congelado antes da produção continua obrigação da principal; esta auditoria não fornece valores novos nem substitui esse vínculo por um hash inventado.

## O que foi conferido por bytes e por estrutura

### Inputs e versões históricas

- **646 conferências individuais** da base L1 auditada e das extensões L1 atuais: tamanho, SHA-256 e Git blob coincidem. Esse número inclui linhas repetidas entre seleções e não é a contagem final de inputs únicos do pacote.
- **196 inputs** dos quatro manifests derivados existentes: 28 boundary-flow, 45 research-flow, 58 research-impact e 65 research-maintenance. Todas as identidades observadas coincidem; nenhum `retained_alias` divergente de `local_path` nesses manifests exige uma remapagem adicional hoje. Os paths originais de leitura ficam preservados nos metadados.
- A seleção de procedimento/pedido de `build-final-assembly-config.py` encontra os campos reais dos quatro schemas disponíveis. Os procedimentos selecionados estão em `inputs`: `derived-boundary-flow/revisions/v2/apply.py`, `derived-research-flow/revisions/v3/apply.py`, e as receitas congeladas de research-impact e research-maintenance. Os pedidos escolhidos também estão em `inputs`. Não há falha observada de schema nesse subconjunto; os manifests ainda ausentes não foram presumidos.
- O alias específico de support foi conferido: `producers/boundaries/revisions/boundaries-v3/history/body.md` conserva **23.665 bytes**, SHA-256 `ca7e76aa47100f32e2076b0a5055b2cebfe3d36cfb5c0d29601125db34d7b3c6`, Git blob `6821d54aec4f8015dd00d634f632dc9960d1bd74` — boundaries **v2**. O atual `producers/boundaries/bodies/boundaries.md` tem **23.769 bytes**, SHA-256 `937208953bb286da7bcefad8fd145d935a0ed00ee7d8f87d87c840973033d070`, Git blob `d3b070015882d10f778f563438eb3f9d67cab061` — boundaries **v3**. A configuração usa corretamente o primeiro como sentinela histórico de support; o patch não altera essa configuração.
- A3/A4, projeção histórica de 726.892 bytes, Modelina de 266.885 bytes e as quatro evidências anteriores de automation que excedem 256.000 continuam no conjunto. Nenhum recorte ou omissão foi proposto. O limite oficial de 256.000 continua impedimento previsto para a seleção íntegra, não uma autorização para reduzir inputs.

### Plano, gates e referências

- O plano observado contém exatamente **12 chaves distintas**, layers numéricos 1–4 e needs válidos. A ordem coloca os predecessores antes dos dependentes. A entrada local navega para as outras onze chaves; essa forma permite alcançar a seleção completa sem incorporar o histórico `s1.core.entry` como novo artefato.
- Os **50 IDs públicos** em `derived-public-criteria.json` são não vazios e únicos. Nenhum critério foi criado ou removido.
- No snapshot de metadados consultado para este relatório havia **6 gates registrados**. Seus seis corpos correntes e os doze arquivos originais/arquivados dos pareceres coincidem por bytes/hash. Essa é verificação da identidade de registros já existentes, **não um novo julgamento**.
- Gates ainda ausentes no momento da leitura: `s1.core.automation`, `s1.subslice03.automation-flow`, `s1.subslice03.automation-impact`, `s1.subslice03.automation-maintenance`, `s1.subslice03.research-maintenance`, `s1.subslice03.entry`. Novas decisões do relay podem chegar depois; o relatório não as antecipa. O guard de `build-final-assembly-config.py` corretamente exige todos os doze antes de gerar a configuração.
- O `source_payload_commit` de configuração final permanece por preencher somente com um P real após publicação/readback. No modo final, o montador exige o pin e confere caminhos/hash/tamanho/blob contra o snapshot; no modo de inventário, o pin deve ser nulo. Não foi criado ou escolhido um commit futuro.
- `--inventory-only` **ainda materializa arquivos** no native-source e, quando necessário, no payload; ele apenas deixa de emitir o `native-package.json`. Por isso não foi usado como pretexto para executar a montagem incompleta nesta auditoria.

### CLI oficial e execução ainda não realizada

- A CLI local admite exatamente `prepare <root> <package-relative-path> <new-candidate-file>` e `index|read <root> <query-file>`. Os argv/cwd montados pelos scripts correspondem a essas assinaturas.
- A consulta index oficial exige `scope` e `need`; read exige exatamente uma seleção `key`/`need` e inteiro positivo `maxBytes`. O wrapper delega a validação semântica restante à CLI real. Os caminhos de query são arquivos de controle lidos pela própria CLI.
- `genesis-native-format.ts` exige `source_refs` com commit de 40 hex, path/blob/SHA, recipe no input_keys, ao menos duas referências semânticas distintas, enum válido, predecessores ordenados e cobertura das roots. O shape que o montador pretende emitir corresponde a esses campos, mas **não foi produzido nem validado um pacote final inexistente**.
- Os **399 arquivos** do candidato local conferem integralmente com `payload/receipts/runtime-preflight/source-captures.jsonl`. Isso confirma os bytes do candidato, não seu comportamento executado. O binário Bun e o entrypoint local existem; o Bun é um symlink normal do instalador e não foi invocado.
- `run-native-final-prepare.py` já captura `TimeoutExpired` e salva os streams brutos, `exit_code: null` e estado não concluído. Ele não converte essa situação em PREPARED. Não foi necessária alteração desse ramo.
- Não existiam `payload/receipts/native-package-assembly.json`, `payload/receipts/native-prepare-final.json`, `payload/assembly/final-config-prepublication.json` nem `runtime-final/` ao verificar o estado. Portanto não existe resultado final dessa sequência que possa ser alegado.
- O prepare oficial cria um candidato/CAS, **não publicação governada**. Os consumidores podem documentar uma recusa real após a tentativa íntegra prevista, mas recusa não prova consumo nem PASS do caso. `prepare-consumer-dispatch.py` registra `PREPARED_NOT_DISPATCHED`; a ponte registra que não atribui PASS de domínio. A proposta preserva essa separação.

## Procedimento sugerido à principal, sem executá-lo aqui

1. Preservar esta proposta e as versões v1 dos wrappers; revisar/aplicar a correção de aliases e criar a bridge v2 em caminho novo.
2. Aguardar os gates verdadeiros restantes e conferir os manifests finais ainda indisponíveis. Não relaxar o guard de doze artefatos.
3. Gerar o inventário completo, publicar o P real com os inputs/aliases integrais e obter seu snapshot/readback. Somente então preencher o pin e montar a seleção final.
4. Executar a CLI oficial uma vez no estado isolado autorizado, preservando o resultado real. O teto de arquivos continua explícito; não remover fontes para obter outro resultado.
5. Quando houver despacho de consumidores, usar a bridge v2 explicitamente, com as perguntas, quotas, isolamento de contexto e registros congelados. Nenhum resultado de consumidor foi pré-preenchido.

## Identidades dos cinco scripts auditados

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| `scripts/build-final-assembly-config.py` | 6772 | `067100ef2e0c1cb8046ce1f1bfec1b6ce7e2645f26d215ee479a21b0bf8b16f6` |
| `scripts/assemble-native-final.py` | 12722 | `166aefa008dd62f48c5ca6818681922b6fdfbfb183592b9c79e300323d5784a1` |
| `scripts/run-native-final-prepare.py` | 4275 | `42be8809d41bb12f851e4048b8ee4ea346abda5e80eeef54704a1e4e06752a4e` |
| `scripts/prepare-consumer-dispatch.py` | 3418 | `c1bcddbe233a4e0ae53a38d2e5ebdfa53d82aab583d5d3d5f094d2f8002576d3` |
| `scripts/atlas-consumer-bridge.py` | 5453 | `5d64a69d986178ae62ad653fdd8f6f022b52d63bdc0a3f37eda9252daf98788f` |

## Identidades dos contratos e controles consultados

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| `runtime-preflight/candidate/modules/atlas/scripts/genesis-native.ts` | 3004 | `18dc473b79c9bf986f07677bdba728d38490e0df36e6a39763f3765f422af3ce` |
| `runtime-preflight/candidate/modules/atlas/packages/adapter-io/src/genesis-native-format.ts` | 13377 | `e7a3b3147cad680111edcf78031fa4ab881a822ef0684067bc2b9174b8baf349` |
| `runtime-preflight/candidate/modules/atlas/packages/adapter-io/src/genesis-native.ts` | 12376 | `bb6b0c2bbcb8bc20f804344c9015c3f19dac86a3f60264ccb50fe023308de312` |
| `runtime-preflight/candidate/modules/atlas/packages/adapter-io/src/genesis-native-io.ts` | 4162 | `04d04c1ad64d5f8f916d5416df650d23e13aba997ad19baf78e6ec32e9397983` |
| `payload/artifact-plan.json` | 5017 | `6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad` |
| `payload/assembly/native-l1-current-inputs.json` | 11615 | `306b54aadc1e922c2813223328dc4534a55c943c4bb7d5c4282929f4849d8f72` |
| `payload/receipts/shared-input-materialization.json` | 17331 | `537a2fe746eaf08cdf0eb7525fa64c13b268b5ab4aadb8fae6e9d82c3ebee271` |
| `payload/semantic-acceptances.json` | 17083 | `8b244d106a88a403e0ab99982bcb11561058c9b339724fdbeb1e7670aa1db499` |
| `payload/consumers/public-cases.json` | 2568 | `6f555dc22ea571bc2d6a683587cb320b7681b6bd22367a2f33e6fc8eb3741ab2` |
| `payload/consumers/public-bridge-protocol.md` | 3285 | `83ee13b6ee7a92ceb87be728640f028769e88be69eb72eebde2a33b7a2ad1839` |

## Proposta não aplicada

`proposed.patch`: 10392 bytes; SHA-256 `911f16d004a6eea69ca34d428c053f1994d58ac81bf1c952dcd52337ad7df3fe`. O patch preserva o original v1 da ponte e cria v2. Os dois textos propostos foram apenas parseados com `ast.parse` para conferir sintaxe; nenhum módulo foi importado, nenhum processo filho/Atlas foi iniciado e nenhum teste foi executado. A aplicação e as provas de comportamento permanecem pendentes.

Escritas desta auditoria restritas a este `REPORT.md`, `proposed.patch` e, por solicitação final do principal, às capturas originais idênticas `response.md` e `FINAL.md`, dentro de `assembly-native-descriptors/final-mechanical-audit/`. Sem escrita remota, chamada a juízes/produtores, alteração de arquivos originais ou leitura de conteúdo reservado.
