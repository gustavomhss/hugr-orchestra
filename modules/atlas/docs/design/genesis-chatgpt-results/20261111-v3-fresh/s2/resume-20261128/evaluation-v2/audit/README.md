# Auditoria estática independente da preparação S2 v2

## Resultado e limite material

A transformação do pacote S2 para o candidato **d1c8478b155b2085df1289ef91edfeaa4834e9300d651c0b953e6e2978aa5d30** foi reconciliada integralmente: **22,752 comparações, zero divergências**. O estado deste relatório é **STATIC_RECONCILIATION_WITH_MATERIAL_COVERAGE_GAP**. Isso não é um parecer ADMIT, uma aprovação semântica, uma qualificação do release S4 nem prova de uso pelos consumidores.

A limitação material é a cobertura automática de `@noble/hashes@1.8.0`. O kernel o importa para calcular IDs; a dependência está declarada em `modules/atlas/package.json`, e tanto esse manifesto quanto o lock estão entre os 28 pins do plano. Porém, o coletor parte do manifesto do adapter e dos pacotes Atlas obrigatórios, sem percorrer as dependências do workspace raiz. Portanto, nenhum arquivo instalado de `@noble/hashes` integra as 925 chaves de `candidate.runtime_identity`.

A inspeção adicional encontrou os **247 arquivos instalados**, totalizando **1,145,416 bytes**, idênticos aos **247 membros do tarball local** identificado pelo lock. A integridade SHA-512 do lock coincide com o tarball; o SHA-256 deste é `e8a765d92c04faaccba8776411c5038cb195f812ee629fce07e1d2e6aec80ea0`. A comparação foi feita lendo o arquivo de cache e seus membros, sem extração, instalação, rede ou execução do pacote. Os hashes por arquivo e a cadeia de imports estão em `runtime-identity.json`.

Essa evidência externa observa os bytes instalados na auditoria. Não altera o candidato preparado, não cria recusa intrínseca por drift desses arquivos e não corrige retroativamente a cobertura automática. Uma verificação externa antes/depois de cada operação S2 poderia registrar esse limite; a suficiência para admissão pertence aos dois julgadores.

## Identidades recalculadas com o kernel real

| Objeto | Identidade |
|---|---|
| Candidato v2 preparado | `d1c8478b155b2085df1289ef91edfeaa4834e9300d651c0b953e6e2978aa5d30` |
| Candidato v1 original desta retomada | `4a36e1210acf6a4bb460846b717d446e6c259f80a78fd73cfce8b5a6e445f522` |
| Contrato v1 original | `9f3829c9ebdd70aa303b9eb1f167bda77adf2f3b1988e98a973205d712ddfce2` |
| Plano de avaliação | `e9b800c7446e64ecbf18ce111ecdfe6a3e1fbfa5fd4e27ae652e3565d81459f3` |
| Conjunto de obrigações | `4c76c66cedd2f82c650e6aaee4d486cbd530091f98c90d137fbff11693900059` |
| Contrato de admissão comum às 13 entradas | `eae556680c714f8f41ee201e2fc17061f801df9622b7c85d45d7e59731fa8d4c` |

O original v1 acima pertence à nova execução `prepare-01`; ele **não é o r4 histórico recuperado**. O v2 pertence à execução original `evaluation-prepare-02`, cujo recibo já existia. Nenhum prepare foi repetido por esta auditoria.

Os 92 objetos CAS foram lidos diretamente, com recálculo do ID pelo módulo puro `kernel/dist/src/canonical.js`, comparação de todos os campos e comparação dos bytes serializados. A composição é: 73 corpos, 13 resultados, dois contratos, um candidato v1 intermediário da raiz nova, um candidato v2, um plano e um conjunto de obrigações. O conjunto de endereços é exato, sem objeto ausente ou extra.

O kernel exclui propriedades chamadas `status`, `grounding` e `freshness` de sua forma canônica e normaliza strings Unicode. Por isso, igualdade de ID não foi usada sozinha: objetos, serializações CAS e bytes de arquivo foram comparados integralmente. `PENDING_FINAL_EVIDENCE` foi confirmado como valor real; os bytes do conjunto de obrigações e do plano também estão vinculados por observações de fonte.

## O que foi comparado

| Área | Reconciliação |
|---|---|
| Pacote | 332.594 bytes; SHA-256 `9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b`; cópia original, corpo CAS e transporte iguais |
| Entradas | Todas as 13 entradas, cada campo do artefato, resultado, autoridade, validade, gaps, evidência, corpo e semântica referenciada |
| Inputs | 818 vínculos por entrada; versões recalculadas dos bytes de cada arquivo; `inputs_id` inclui inputs e dependências ordenados |
| Grafo | 32 dependências de build e 30 arestas de navegação preservadas |
| Observações | As 626 observações nativas permanecem exatas; 64 observações únicas de avaliação acrescentadas; total 690 |
| Referências | 67 usos nativos deduplicados em 40 referências, ordem e bytes preservados; 47 capturas de avaliação |
| Materialização | 716 arquivos, 8.839.171 bytes, incluindo os 667 inputs originais; hashes, tamanhos, objetos Git, commits e caminhos verificados |
| Runtime declarado | 925 chaves: 922 arquivos, duas ausências opcionais e uma identidade de engine; todos os hashes reproduzidos |
| Isolamento observado | Raiz real distinta e sem Git; `observed_head: null`; estado `.atlas` contém somente CAS; nenhum symlink/hardlink nos arquivos materializados/CAS |
| Recibo | Comando, stdout, stderr, saída preparada, 716 entradas antes/depois e 92 CAS reconciliados; exit 0 do prepare original |

A auditoria reconstrói primeiro o mapeamento nativo a partir do pacote e dos arquivos, compara-o com o v1 original e depois reconstrói as alterações v2. O v2 muda o tipo/versão/fase, a raiz e o HEAD observado, acrescenta plano, obrigações, identidade completa declarada e originais, amplia a implementação e as observações. Em cada entrada, os cinco campos nativos permanecem iguais; somente `contract` e `semanticEvidence` são acrescentados. O detalhamento por campo está em `field-deltas.json` e por entrada em `entries.json`.

Os quatro critérios ADMIT foram conferidos contra sua definição no fonte db9. Eles não substituem os 11 critérios finais: AC-01 a AC-10 e `runtime-import-binding` continuam na obrigação original com status pendente. Nenhum parecer histórico foi convertido em novo voto de admissão.

## Plano congelado e manutenção

Os 14 IDs de caso, seus modos e os limites routine/deep coincidem com o deck congelado. São identidades de caso/orçamento, não identidades de agentes consumidores. As referências semânticas de cada entrada são as originais; a aplicabilidade identifica corpo, bytes, revisão, pacote e resultado, e os limites preservam os gaps originais.

S2-U1 permanece `FROZEN_NOT_RUN_PENDING_DISTINCT_TARGET_PLAN`. O plano inicial prevê `admit`, `index` e `read`, excluindo `evaluation-maintenance`. O grafo reservado `716f9f06506a34556ec8b56978048f5e31b401d43aae1bdeb0fdd2de476c954f` e todos os controles originais foram preservados. Antes de manutenção, ainda são necessários patch comportamental concreto, receita de produção alvo, observáveis esperados, comandos/recovery, novas evidências semânticas afetadas e novas decisões exatas. Nada disso foi inventado ou reclassificado como executado/N-A.

Documentos normativos foram conferidos pelos commits baseline `1cde2ff…`, protocolo `ee2521a…`, briefing `bb2a931…` e implementação `db9b423…`. Cópias aditivas retêm títulos/estado históricos. O documento de admissão intitulado protocolo v1 define o procedimento cujo envelope preparado é v2; essa distinção permanece explícita.

## Cobertura e limites do método

O verificador importa somente a função pura de identidade do kernel e suas dependências puras. Não importa ou chama prepare, store, policy, admission, reader ou testes. Usa Git apenas para ler HEAD, estado e árvores/bytes fixados. Uma consulta isolada ao mesmo executável Bun capturou `process.versions` e reproduziu o hash de engine; a consulta ocorreu depois do prepare, sem importar Atlas, e não prova retrospectivamente o ambiente histórico.

A inspeção estática de imports distingue os alvos `require` e `import`: os imports ESM de `blake3` e `utils` alcançam sete arquivos do pacote em 12 arestas, terminando também em `node:crypto`, uma dependência do host. Imports de `vitest` encontrados em arquivos `.test.js` dentro de árvores compiladas são classificados como imports de teste; não são evidência de execução de testes ou de uso no preparo. A análise de imports literais não prova todos os caminhos dinâmicos possíveis.

Nenhum arquivo original, raiz materializada, CAS, runtime, política ou candidato foi alterado. O inventário e todos os arquivos lidos foram rechecados no fim. A primeira execução do verificador mostrou que o scanner precisava distinguir imports de `.test.js`; essa classificação foi corrigida e a segunda execução estática produziu o relatório final, ainda sem qualquer operação Atlas.

O autor desta auditoria também materializou o plano. A independência aqui é da reconstrução sem invocar o mapeamento do runtime, não uma alegação de independência organizacional do autor. Dois julgadores distintos continuam responsáveis pela avaliação de admissão.

## Arquivos entregues

| Arquivo | Conteúdo |
|---|---|
| `verify-evaluation.mjs` | Verificador reexecutável, somente leitura nas raízes examinadas |
| `report.json` | Resultado, IDs, limites, lacuna material e referências aos arquivos detalhados |
| `checks.jsonl` | Todas as 22.752 comparações individualizadas, com esperado/observado ou seus hashes |
| `entries.json` | Todos os campos nativos por entrada e acréscimos v2 |
| `observations.json` | Todas as 690 observações, versões e vínculos de bytes |
| `references.json` | Referências nativas, capturas da avaliação e proveniência normativa |
| `cas.json` | Todos os 92 endereços, hashes de bytes e fontes de cada objeto |
| `materialization.json` | 716 arquivos com proveniência e vínculos Git efetivamente conferidos |
| `runtime-identity.json` | 925 chaves, caminhos resolvidos, manifestos, arestas, engine e auditoria externa do pacote omitido |
| `field-deltas.json` | Diferenças v1 → v2 por campo, preservando a distinção entre valor ausente e alterado |
| `manifest.json` | Tamanhos e SHA-256 dos entregáveis |

Não entregue estes arquivos aos consumidores: contêm contexto de produção e referências reservadas. Os consumidores futuros devem receber apenas perguntas e portas reader permitidas. O relatório não remove o bloqueio de release compatível e não é a primeira travessia operational prepare → binding → publicação → index/read → consumidor.
