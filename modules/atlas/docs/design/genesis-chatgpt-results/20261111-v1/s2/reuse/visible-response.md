# PREP-S2-03 — histórico de reuso verificado

**Preparação concluída; produção, importação Atlas, cache, rebuild e julgamento desta campanha não foram executados nesta tarefa.**

O corpus histórico oferece **20 corpos aceitos**, distribuídos em L1, L2, L3, L4 e L4-Sol, mais **um suplemento operacional aceito**. Cada versão tem dois pareceres históricos vinculados ao manifesto exato. A inspeção preservou esses estados e não os converteu em aceite dos juízes S5.

## Evidência observada

- **20/20** SHA-256 dos corpos coincidem com os manifestos aceitos.
- **10/10** arquivos de parecer das cinco versões coincidem com os digests dos recibos de aceite e com o mesmo manifestID; todos dizem PASS dentro do escopo histórico.
- O corpo do suplemento e **2/2** digests de seus pareceres coincidem. O segundo parecer é uma correção explícita de identidade; o original não deve ser apagado.
- Os **11 arquivos** do freeze semântico de Session-input têm os mesmos blobs no baseline novo `1cde2ff7a71bcf7aecb5d030917b577165135d38` e no corpus histórico ancorado em `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`.
- Os **6 arquivos** do suplemento também coincidem por SHA-256 com a referência histórica. Há um arquivo em comum: portanto são **16 fontes distintas** verificadas.
- **70/70** arquivos completos recuperados pelo conector foram materializados com blobs Git conferidos. Esta cópia é um corpus de inspeção, não um checkout Git nem um store Atlas.
- Nenhum corpo de resposta de consumidor ou oracle reservado foi lido. A descoberta de nomes de arquivos não foi tratada como leitura de conteúdo.

## Manifestações históricas que podem entrar no novo pacote como evidência

| Versão | ManifestID histórico | Corpos |
| --- | --- | --- |
| L1 v3 | `f92380d8f484b3bffe83e7e2c13e922e46d3a9aa62ac7f5b6264bf22cbef1d85` | 4 |
| L2 v4 | `d6ab29da4eccd7283a4d4a40ece0a719b7f932bc64098d4a065e19b5914a4cce` | 4 |
| L3 v3 | `ce5677d86347d5d268066926c78051e5be63f819011d235a84cf21a207a6598d` | 4 |
| L4 v2 | `de45b67c357ab52afdbc804a964b4695e35c2b8efabfbb06984f98af21602457` | 4 |
| L4-Sol v2 | `02a230276d5e6f484242c6f2b83b8f6e83ec962a781015388c141451b1389cb4` | 4 |

L4 e L4-Sol são predecessores/alternativas históricos; não representam oito documentos obrigatórios para a nova campanha. O inventário S1 decide as necessidades, conservando a autoria dos originais e das derivações editoriais.

## Correção operacional que não pode ser perdida

Há dois derivados posteriores vinculados ao candidato histórico `db49c2f560897fb8369546d45803f7d914d565b3685926c6aa70536c6394c36e`:

- `L3-supplement:operational-interface`: SHA-256 `abffba16ff229e19e933d577c32a452b8bcd0be82691d358d9144ff6a531777c`.
- `L4:operational`: SHA-256 `c037f40903c1ea9fa6f827df1183da3c24a60c5b7677edd342a2e8bf20293b74`.

Os arquivos corretos estão em `runtime-pilot/consumer-v3/provenance-revision/`. Essa derivação corrige a regra de paginação por sequência durável e, no corpo operacional, o hash do suplemento efetivamente usado. O derivado anterior sem a segunda correção (`f57a6ec2…`) não é intercambiável com ele.

Os dois corpos coincidem com o manifesto de correção; o digest desse manifesto coincide com `prefreeze-v2.json`; existem duas aprovações de importação para aquele candidato exato. O recibo histórico `publication-native-v1.json` registra exit 0 e emissão isolada, mas também um diagnóstico de Bun em stderr. Isso é evidência arquivada, não uma execução desta S2, nem aceite global/consumer.

## Condições para reuso na campanha 20261111-v1

1. S1 precisa vincular Session-input e os demais domínios ao inventário finito, autoridade, membership, contrato e envelope. Coincidência de 16 fontes não prova que a nova closure de dependências está completa.
2. S2 deve preservar bytes e identidades históricas e registrar uma derivação/recibo novo quando a receita, contrato, autoridade ou membership mudar. Não renomear os aceites anteriores como aceites `nativeChatGPT`.
3. O caminho produtor/importador real precisa conferir essas entradas e armazenar/admitir candidatos pelas portas Atlas. Esta auditoria de bytes não demonstra o caminho, cache hit ou zero interpretações de uma reconstrução.
4. S5 precisa decidir a aplicabilidade das evidências ao manifesto de cada camada completa da nova campanha. Aceite histórico do piloto não libera L2 repo-wide.
5. Corpos/recibos de produção históricos só citados como arquivos temporários externos não foram inventados nem recuperados a partir de resumos. Tokens, tentativas físicas e cobrança deste trabalho nativo permanecem UNKNOWN.

## Arquivos de entrega

Sob `/workspace/scratch/ea607dbcbf72/preparation/reuse/`:

- `reuse-candidates.json`: referências imutáveis `{commit,path,sha256}`, corpos, predecessores, autoria, pareceres e correção operacional.
- `semantic-source-compatibility.json` e `supplement-source-compatibility.json`: comparação observada das fontes.
- `source-manifest.json`: 70 fontes completas com blob Git, SHA-256 e tamanho.
- `integrity-summary.json`, `inspect_reuse.py` e `execution-receipt.json`: derivação mecânica e resultado.
- `request.txt` e `visible-response.md`: atribuição recebida e esta resposta original.
- `raw-*-fetches.json` e `sources/`: resultados do conector e bytes exatos para inspeção.

A raiz pode publicar os inventários, recibos e esta resposta no prefixo S2. Não é necessário duplicar no Git os 70 arquivos de fonte: os próprios registros já apontam aos objetos imutáveis existentes. Nenhuma escrita GitHub, mudança de código compartilhado, suite de testes, modelo externo ou nova produção de ownership foi realizada por este subagente.
