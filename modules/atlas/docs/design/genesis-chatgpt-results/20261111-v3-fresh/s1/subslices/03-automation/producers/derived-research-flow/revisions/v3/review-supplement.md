# Research-flow L2 v3 — atualização ao predecessor aceito

## Escopo e autoridade

O único predecessor semântico corrente é `s1.core.research` L1 v4, 64106 bytes, SHA-256 `c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`, blob `69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b`. A receita v3 fornece os dois PASS para esses bytes; nenhum parecer integral foi lido. O L1 v3 anterior permanece apenas como contexto histórico no alias autorizado.

## Decisão de autoria

A releitura integral confirmou que R8.1 agora explicita missing && !building && ctx.extract, com missing por ausência ou stale e retorno inicial quando não há shards no escopo. F3 v2 já condiciona o início à necessidade de construção, ao extrator e à ausência de build em curso, sem converter building/unavailable em prova de disparo. Nenhuma contradição concreta remanescente foi identificada nesse vínculo. F3 e todos os bytes de F1–F8 foram preservados. Não houve nova alteração substantiva.

## Delta exato

### F0-parent-identity — body.md

Categoria: metadata. Motivo: Atualizar identidade e versão do único predecessor aceito; preservar prosa funcional. Offset antigo 375, novo 375; linha antiga 7.

**ANTES**

```text
`s1.core.research`, corpo de **63.841 bytes**, SHA-256 **`f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`**
```

**DEPOIS**

```text
`s1.core.research`, versão 4, corpo de **64.106 bytes**, SHA-256 **`c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`**
```

Hashes dos literais: ANTES `f4e910443bfed12985bfe464350c28c6bec93277a10af46ae8995500f595f95f`; DEPOIS `8cc6ce49426231a5497ea519c7f74918fdd5fc72070592bb1760ea81d69fbd13`.

### E0-current-predecessor-and-gate — evidence.md

Categoria: metadata. Motivo: Atualizar identidade, gate e leitura do L1 v4; conservar o L1 v3 somente por alias histórico. Offset antigo 94, novo 94; linha antiga 5.

**ANTES**

```text
A única autoridade semântica de construção é `s1.core.research`, L1/`component`, em `producers/research/body.md`, **63.841 bytes**, SHA-256 **`f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`**, blob Git recalculado **`72bdc55fdf2dbda97e84c87111be73fa49aceeb4`**. A fonte investigada por esse L1 é `1cde2ff7a71bcf7aecb5d030917b577165135d38`; este produtor L2 não abriu essa fonte bruta, os captures, coverage ou evidence do L1.

A receita congelada `payload/recipes/derived/research-flow.json`, 8.423 bytes, SHA-256 `543c6045bfb145c0db4b2779b12c96c140ff20198c408357c7d84bcf0a7f71e1`, declara que `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` aceitaram esse mesmo corpo. As respostas originais são identificadas na receita por `e52fc2d9eb369da417d7ea035ec641839ca4714be9f75b4b0f2ac4bab35e3cc7` e `8dd9f7ae58de3cda63482558e2940931b185a644bcbd8cafd0b7d5463ea835c6`. São referências de proveniência fornecidas pelo gate; os pareceres integrais não foram lidos. Nenhuma decisão L2 é atribuída aos juízes por este autor.

O body do predecessor foi consumido integralmente em duas exibições contíguas, linhas 1–230 e 231–378. As referências abaixo apontam às seções desse arquivo exato, sem fabricar linhas de código ou substituir sua autoridade por referências externas.

```

**DEPOIS**

```text
A única autoridade semântica corrente de construção é `s1.core.research`, L1/`component`, versão 4, em `producers/research/body.md`, **64.106 bytes**, SHA-256 **`c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`**, blob Git recalculado **`69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b`**. A fonte investigada por esse L1 é `1cde2ff7a71bcf7aecb5d030917b577165135d38`; este produtor L2 não abriu essa fonte bruta, os captures, coverage ou evidence do L1.

A receita congelada desta revisão, `producers/derived-research-flow/revisions/v3/recipe.json`, 5.536 bytes, SHA-256 `6b77e699b909ae075954e1d0fb00cd205a4ada0f4cd5ed23eff6fdd350630eae`, declara que `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` aceitaram esse mesmo corpo L1 v4. As respostas originais são identificadas na receita por `f0aa061a964bc10e7429dde0b54c2f74c465bdb1e1a7198544541af0fc23218e` e `1d6caeecccc795766c71a3cb9822c8feb1939c8477d7c1d6c9d5ff90d96bea35`. São referências de proveniência fornecidas pelo gate; os pareceres integrais não foram lidos. Nenhuma decisão L2 é atribuída aos juízes por este autor; a v2 preparada não recebeu reavaliação semântica.

O novo body L1 v4 foi relido integralmente em duas exibições contíguas, linhas 1–230 e 231–378. O L1 v3 anterior, já consumido integralmente neste contexto, permanece byte-verificado no alias `producers/research/revisions/v4/history/body.md`, 63.841 bytes, SHA-256 `f6e3fe95e3db7adab59087b780fb232ae62cc7a2ba83623d355bcbad250b431f`; é proveniência histórica, não outro predecessor semântico corrente. As referências abaixo apontam às seções do L1 v4 aceito, sem fabricar linhas de código ou transferir autoridade de versões antigas.

```

Hashes dos literais: ANTES `88be28eda023e9e114c619f8656902c8da51d757f2d5d9247b589edbeb95880e`; DEPOIS `8b2d20dc0071e76bdbc0ffb6c0d1debdbbc519f5d7677fa7978925fa272c4d1b`.

### E1-direct-accepted-mapping — evidence.md

Categoria: metadata. Motivo: O mecanismo condicionado está agora explícito no próprio predecessor aceito; a qualificação pública anterior permanece no histórico e nos inputs. Offset antigo 4538, novo 4938; linha antiga 27.

**ANTES**

```text
R8.1 Query: vazio, stale e dirty; qualificação pública RF-J2-F01 | Observação; ausência de hit não prova ausência de uso
```

**DEPOIS**

```text
R8.1 Query: vazio, stale e dirty | Observação; ausência de hit não prova ausência de uso
```

Hashes dos literais: ANTES `1ad5c29f4281d04269091df77599fa6f5f9d7782b0a73a5159b2f8e85ac3d107`; DEPOIS `3826e8b2cb90e42bd53018f492e9d1ae318f1c3f7b39b0b587024462b2cab5c1`.

### E3-current-version-provenance — evidence.md

Categoria: metadata. Motivo: Atualizar medições/proveniência corrente e distinguir explicitamente os registros históricos preservados. Offset antigo 9776, novo 10141; linha antiga 53.

**ANTES**

```text
Foram comparados tamanho, SHA-256 e blob Git recalculado dos 14 inputs enumerados com a receita congelada; todos coincidiram. Pedido, receita e dispatch são três unidades adicionais, totalizando **17 inputs integrais únicos**. O pedido foi preservado no hash `351e7104bfdbc75075906493ef2db4d3f689d4181f7e621f64e75e6caf31f6ee`. O dispatch exato, sem newline acrescentado, tem 1.511 bytes e SHA-256 `2252f97394d8dbc61fd0e629ce1a16700f8a81bc78673add06985842fc75efcf`.

A primeira exibição agrupada excedeu o limite de saída da ferramenta e truncou a parte intermediária de COMMON; COMMON foi reapresentado integralmente em chamada separada. Nenhuma conclusão dependeu de trecho truncado. Os demais arquivos e o predecessor completo foram expostos integralmente antes da autoria. A verificação de completude de leitura é procedural, não uma prova de isolamento técnico do host.

O body contém nove cabeçalhos depth2 independentes e 16.980 bytes UTF-8. Excede a preferência usual de 6.000–14.000 bytes para conservar as qualificações que alteram decisões entre aquisição, plano/build, stale/dirty, probe, orçamento, custódia e inquiry. Não reproduz o catálogo completo do predecessor. Hashing, UTF-8/JSON e consistência do conjunto de arquivos são verificações determinísticas, sem execução de teste de produto ou julgamento semântico.

**NOT_RUN:** instalação/download de engines, providers/rede, testes/typecheck/guards do produto, Atlas import/binding/publicação/index/read, consumidor independente e manutenção. **UNKNOWN:** tentativas físicas do host, tokens e custo. L3/L4 não foram produzidos; a principal mantém seus gates separados.

```

**DEPOIS**

```text
**Histórico preservado.** A produção inicial registrou 17 inputs integrais; sua verificação de 14 pins, pedido/dispatch e a recuperação da exibição truncada de COMMON permanecem nas versões preservadas. A v2 registrou 28 inputs e a correção RF-J2-F01. Os quatro outputs v1 continuam em `history/v1/`; os quatro outputs v2 foram copiados byte a byte para `revisions/v3/history/` antes de qualquer alteração. Pedidos, dispatches, receitas e procedimentos anteriores não foram reescritos.

**Consumo cumulativo atual.** O manifesto v3 enumera **45 unidades integrais únicas**: 28 do manifesto anterior, cinco outputs v2 efetivamente lidos nas verificações de bytes/hashes e 12 unidades desta revisão. A inclusão dos cinco registros conserva leituras reais que eram verificações de outputs recém-produzidos na etapa anterior. Cada unidade tem local_path, tamanho, SHA-256 e blob Git; a linhagem de leitura original fica separada do alias retido. O L1 v3 usa seu alias histórico e não é predecessor corrente. Nenhum body/evidence/manifest/response atual é auto-input.

**Leitura e identidade.** Os sete inputs enumerados na receita v3 foram lidos integralmente ou, no caso do alias do L1 v3 já integralmente consumido, relidos em bytes e conferidos contra a mesma identidade. O L1 v4 inteiro foi relido nesta revisão. Os tamanhos, SHA-256 e blobs Git coincidiram com os pins. A verificação de completude de leitura é procedural, sem alegação de isolamento técnico do host.

**Mudanças e procedimento.** Foram quatro edições de metadata: identidade em F0, identidade/gate/leitura em E0, vínculo direto em E1 e registros atuais nesta E3. F3 e todos os bytes de F1–F8 permanecem idênticos à v2; nenhuma alteração substantiva adicional foi necessária. O script real e os inputs foram congelados antes da execução. O delta registra literais, offsets e segmentos inalterados; sua inversão recompõe body/evidence v2 byte a byte. O body atual contém nove cabeçalhos depth2 e 17.124 bytes UTF-8. A extensão acima da preferência usual conserva as qualificações já produzidas, sem reproduzir o catálogo integral do predecessor.

**Estado de revisão.** A principal informou verificação mecânica da v2; nenhum parecer L2 v2 foi inferido. A v3 exige conferência independente e reavaliação pelos mesmos juízes. Hashes, preservação e prova inversa não são PASS semântico.

**NOT_RUN:** instalação/download de engines, providers/rede, testes/typecheck/guards do produto, Atlas import/binding/publicação/index/read, consumidor independente e manutenção. **UNKNOWN:** tentativas físicas do host, tokens e custo. L3/L4 não foram produzidos; a principal mantém seus gates separados.

```

Hashes dos literais: ANTES `a2ddccaffb9623e0741adac50b456f67f6b9ea7cacefc6a30ef9316856e09647`; DEPOIS `b4c5680664d06e36932f3c0dcfea5fee6197f233fb483619d85813b3299b9352`.

## Preservação e consumo

Os quatro outputs v2 estão em `revisions/v3/history/`, byte-idênticos; o histórico v1 e os controles v2 não foram modificados. O manifesto cumulativo inclui 45 unidades integrais: 28 manifestadas anteriormente, cinco registros v2 já lidos nas verificações e 12 unidades desta revisão. O alias do L1 v3 conserva hash e origem; não é outro predecessor de build. E3 corrente foi atualizado para distinguir medições históricas e atuais.

## Verificação e limites

O procedimento e seus inputs foram congelados antes da execução. Quatro edições de metadata foram aplicadas; os deltas inversos recompõem os dois arquivos v2 exatamente. `delta.patch` oferece a comparação literal adicional. A verificação da principal e o mesmo par de juízes devem avaliar a v3; nenhum parecer L2 v2 foi presumido. Não há self-PASS, L3/L4, produto/rede/Atlas/testes/consumidores. Uso físico, tokens e custo: UNKNOWN.
