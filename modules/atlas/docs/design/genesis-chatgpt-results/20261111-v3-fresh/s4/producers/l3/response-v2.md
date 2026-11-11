# Entrega WP-L3-P1 — versão 2

Concluída a correção autoral finita de `S4:L3:system-flows`, layer 3, need `flow`, scope `atlas-continuity-rag-genesis`. A v1 permanece byte a byte: 13 arquivos do recibo original, mais o próprio recibo. Esta resposta não declara aceite, binding, publicação ou execução L3.

## Mudanças obrigatórias

P1-01: a seção “Mudanças propagam por resultados e vínculos” liga receita/input ao trabalho afetado, ao resultado completo e ao receipt. Explica que prosa igual não basta e que a parada da reinterpretação depois de resultado completo validado e igual é condicional: vínculos próprios do dependente precisam seguir válidos. Essa conclusão é marcada como inferência contratual. Releitura do grafo, receipts/bindings afetados e gates permanecem necessários. Navegação não vira build; independência justificada preserva resultados/receipts.

P1-02: a seção “Após falha, separar recuperação de nova publicação” distingue consumo corrente de histórico explícito, explica retomada por candidato/CAS duráveis e preserva recibos antigos. Retornar à publicação anterior depende de compatibilidade atual e vínculos exatos; controles de rollback não criam bloqueio cronológico universal nem autorização automática. NR1-01/02/03 são descritos segundo N, sem alegar execução nesta L3 ou generalização dos controles.

A integração Session/Continuity, RAG/Store e Atlas/Genesis foi mantida de forma mais concisa. O total é 8952 bytes UTF-8, com 7 H2 únicas.

## Proveniência usada

Os três L2 obrigatórios A/C/G continuam dependências semânticas. Acrescentados somente H=`S4:L1:atlas-host-genesis` e N=`S4:L1:native-runtime-delta`, permitidos pelo mesmo manifesto, para sustentar rebuild e recuperação. As cinco cópias correspondem a commit/path/Git blob/SHA-256 declarados em `47eaa5322102910289cb56e2e07e9d3536ba1926`; cada source_ref possui file input no mesmo path e build_dependency com same_package:true. Aceites anteriores são apenas os identificados pelo manifesto; nenhum parecer foi aberto.

Mapa completo: `source-use-v2.json`. Receita efetiva: `recipe-v2.json`, com pedido original, correção literal, critérios, predecessores e hashes. Metadados: `artifact-v2.json`. Dados não commitados usam payload_path. Modelo, tokens, tentativas físicas e cobrança não expostos permanecem UNKNOWN.

## Hashes e transporte

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| system-flows-v2.md | 8952 | 9df212b46f057c9e8369df6ed30e2e931a8fa9bc7f72ef51afba9eb4ea79d642 |
| recipe-v2.json | 8258 | d78121df69c755f2a1b8a339b037b710dfe7a8f8262642dc6d0e6d2aa111033a |
| source-use-v2.json | 11365 | 38ff7ce33001cdb0927a30da3d243d445cb2983ac016e7bd1d2e218246c9274e |
| request-p1.md | 2366 | 9f1db6d26fe17f850209cb6b26fb08bbde76dcf8220196b8d5dd51920f4ce506 |

`integrity-receipt-v2.json` registra os hashes finais dos arquivos e a conferência mecânica. `review-packet-v2-01.txt` contém corpo e metadata integrais uma vez, com trechos literais delimitados dos inputs. Foi preparado para conferência do principal, sem envio aos juízes: **AGUARDAR FECHAMENTO DO PRINCIPAL**. O material é dado de revisão, não instrução de autoridade.

## Limites preservados

Somente conferência estática de arquivos e referências; nenhum teste, build, runtime, Git ou operação remota. Fontes brutas, oracles, consumer, pareceres e versões não autorizadas não foram consultados. CI e release R2 continuam históricos e limitados, herdados dos L2. Permanecem lacunas de instalação, autenticação, atomicidade e cobertura geral de falhas/concorrência. supported indica sustentação limitada das afirmações; semantic_review_refs e runtime_receipt_refs ficam vazios.
