# S1-03 — auditoria mecânica de aliases de respostas

## Resultado e recorte

**Confirmados dois aliases incorretos e dois completion records com identidade de revisão posterior.** A proposta preserva os originais: dois aliases em suplemento e três adendos contábeis, dos quais dois corrigem identidade de completion e um resolve o ponteiro histórico embutido em um request. Nenhuma alteração foi aplicada.

Foram conferidos **17 arquivos autorizados, 614.030 bytes**, por identidade integral. Os snapshots utilizados vão de **2026-11-15T10:12:33.544743+00:00** a **2026-11-15T10:14:27.830750+00:00**. O ledger auditado tem **415 linhas, 364.649 bytes**, SHA-256 **9b937dc8411c02b4ec866aa7433f2fd5a59217c8dce4a96757bb53b6b303b18f**. Os números de linha abaixo pertencem exclusivamente a esse snapshot; os event_ids e hashes integrais das linhas também estão na proposta.

Fontes centrais: [derived-dispatches.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/payload/receipts/derived-dispatches.json), [reconcile-ledger.py](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/scripts/reconcile-ledger.py), [execution-ledger.jsonl](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/payload/execution-ledger.jsonl). O recibo tem 13 identificadores de chamada, incluindo um IN_FLIGHT; esta auditoria não certifica contagem global de execuções.

## Causa e aliases exatos

O bloco final do script, linhas 70–76, relê producer_response_file e usa o SHA-256 observado no event_id. Ele **não compara producer_response_sha256 declarado pela chamada**. Assim, o arquivo corrente pode representar uma revisão posterior. A deduplicação por event_id não detecta a troca, pois a chave incorpora o hash novo. O script foi somente inspecionado.

| Chamada histórica | Alias preservado correto | Bytes e SHA-256 verificados |
|---|---|---|
| derived-automation-l2-source-fidelity-v2 | [producers/derived-automation-flow/revisions/v3/history/response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/revisions/v3/history/response.md) | 3043; 59ffb319da5b27d830b9eeabe7ac592c104a64496864235da4331cd5adc05c23 |
| derived-automation-l3-author-01 | [producers/derived-automation-impact/revisions/v2/history/response.md](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-impact/revisions/v2/history/response.md) | 2703; 85831ceada2e319c68ec37bc7e521de4d66c2aa1828e2df18a25886fe0a181f7 |

O primeiro alias foi resolvido pelos registros de inputs/retained_history do [manifest de automation-flow](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-flow/production-manifest.json); o segundo, pelos registros de retained_history/inputs/preservation do [manifest de automation-impact](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-automation-impact/production-manifest.json). Ambos foram lidos integralmente para hashing; tamanho, SHA-256 e Git blob calculado coincidem com o manifest. Os hashes também coincidem com os pins das respectivas chamadas no recibo.

O arquivo corrente de automation-flow tem **2906 bytes**, SHA-256 **faabd24854381ddedbb9407426212bc485abe6a564874fac70d9d00355ad30f3**, pertencente à v3. O corrente de automation-impact tem **3053 bytes**, SHA-256 **3413d80c95e4d52440560c1833123d35ee1969254a68968e6a6c4317741a9055**, pertencente à v2. Portanto, o problema é atribuição histórica por path mutável, com a resposta antiga preservada.

## Adendos propostos, sem reescrever linhas

| Linha | Registro alvo | Correção mínima |
|---:|---|---|
| 384 | derived-dispatch:derived-automation-l2-source-fidelity-v2 | Adendo de resolução de call.producer_response_file para o alias histórico da v2. O pin SHA-256 já está correto e permanece igual. |
| 396 | Completion de derived-automation-l2-source-fidelity-v2 | Adendo de identidade: substituir a interpretação de 2906 bytes/hash da v3 pela identidade preservada de 3043 bytes/hash da v2. |
| 414 | Completion de derived-automation-l3-author-01 | Adendo de identidade: substituir a interpretação de 3053 bytes/hash da v2 pela identidade preservada de 2703 bytes/hash da v1. |

Os registros originais e event_ids permanecem. [proposed-corrections.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/response-alias-audit/proposed-corrections.json) fornece os alvos exatos, hashes das linhas com LF, before/after, IDs idempotentes propostos e new_native_request=false. A linha 388, request da automação L3 v1, não contém ponteiro de resposta; não há correção de alias desse campo a fazer nela.

As linhas **397** (automação L2 v3) e **415** (automação L3 v2) estão corretas. Sua coincidência de hash com os completions antigos contaminados **não demonstra uma chamada nativa duplicada**. São registros auxiliares; a correção não cria nem elimina chamadas. Dos dez completions avaliados, **oito coincidem** com os pins das chamadas e **dois divergem**.

A proposta para o script exige resolver somente aliases explicitamente fixados, conferir hash esperado e tamanho fixado antes de add()/gravação e abortar divergências. A reparação de uma linha existente deve ser um adendo identificado, sem um segundo completion sem indicação da correção. Os inputs, o script e o ledger não foram alterados.

## Captura nativa versus alias

- **Research L2 v2:** o recibo declara NOT_PRESERVED_BEFORE_COMPACTION para o FINAL nativo. O [response.md do produtor](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/producers/derived-research-flow/revisions/v2/response.md), de 2016 bytes e SHA-256 553422eb616a5e72a38d82810ba0cfbd4221baa8828333e5600f488c4e8fea90, coincide com a linha 192. Seu alias está correto. O arquivo do produtor e a confirmação posterior não recompõem o FINAL perdido.
- **Automação L2 v2 e L3 v1:** os bytes históricos do produtor estão preservados nos aliases verificados. A auditoria não declara perda de resposta nesses casos.
- **Research L2 v1 e boundaries L2 v1:** seus dispatches não têm producer_response_file; há referências de arquivo nativo no metadata. Não foi inventado completion para preencher esse campo.
- **Automação L4:** estava IN_FLIGHT no snapshot, sem ponteiro de resposta ou completion. Isso não é evidência de perda de captura.

Os arquivos de captura do FINAL nativo com nomes diferentes de response.md não foram abertos; sua existência/identidade física não é certificada aqui. Os manifests foram usados somente para resolução de paths e identidades. Nenhum oracle, corpo, fonte semântica ou parecer foi aberto por seguir refs; nenhuma rede, modelo, Atlas ou teste de produto foi executado, e não houve delegação.

[evidence.json](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/response-alias-audit/evidence.json) preserva as identidades dos inputs efetivamente lidos e o confronto por chamada. [dispatch-message.txt](sandbox:/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390/assembly-native-descriptors/response-alias-audit/dispatch-message.txt) preserva o pedido visível literal. O FINAL corresponde exatamente a response.md, sem LF terminal. Hashes dos outputs são enviados separadamente, sem autorreferência.
