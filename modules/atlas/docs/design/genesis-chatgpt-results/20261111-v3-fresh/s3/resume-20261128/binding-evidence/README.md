# Evidência mecânica limitada de prepare S3

Autor: `/root/s3_maintenance_cases`. Estes artefatos organizam e conferem bytes de prepares reais já executados no CI. Não são produção de conhecimento, parecer semântico, aprovação de binding nem publicação Atlas.

## Resultado disponível

| Versão | Actions run | Candidate observado | Função |
|---|---|---|---|
| v3 | `46120849935` | `7c7dafa40b78156e70c8ed1fe9ade40e3f656744e8cc4b5f62c7078170ea25cc` | Preliminar, preservado e superado pelo pacote v4 |
| v4 | `46121909582` | `efc5e131f6969566606b834e1c63a8082511c6e330f90a17d04d3f6f4c2e420f` | Vista do prepare real do pacote final selecionado; sem decisão de binding |

Os dois estados registram `ownership_manifest=null` e `publication_attempted=false`. Os commits de payload representam arquivos no Git. Não representam publicação operacional Atlas.

O recibo de operação de ambos registra retorno com sucesso. O relatório existente `s3-ci/46120849935/verification.json` identifica separadamente `PREPARE_SUCCEEDED_WORKFLOW_GUARD_FAILED` para v3. Esta auditoria de bytes não altera esse estado do workflow. Para v4, ROOT comunicou sucesso de operation e guards; o verificador só afirma as comparações enumeradas no seu relatório e os valores exatos dos recibos que carregou.

## Arquivos por versão

- `dispatch-summary.json`: transporte manual de até 22.000 bytes. Tem todas as 11 entradas, result IDs, inputs IDs, body CAS IDs, SHA-256/tamanho do corpo, dependências e navegação exatas, roots, contrato e 32 critérios, mapping dos aceites existentes, contagens e limites. Não contém os campos extensos de result nem os vetores completos; a omissão é explícita.
- `binding-view.json`: vista ampla. Inclui integralmente authority, validity, gaps e evidence de cada result, sem reformular os valores; inclui artifact embutido, dependências, navegação e todas as referências do candidate. Corpos e vetores extensos continuam omitidos por referência exata.
- `mechanical-report.json`: identidades das fontes, hashes ZIP/tar, contagens de comparações e limites. Seu estado `MECHANICAL_COMPARISONS_COMPLETED` é uma descrição de processamento, sem voto semântico.
- `cas-index.json`: índice de todos os objetos CAS efetivamente referenciados pelo candidate, contrato, results, corpos, transport e refs. Distingue ID observado, SHA-256 dos bytes CAS e SHA-256 dos bytes decodificados.
- `omissions.json`: inventário das omissões, incluindo arquivo, SHA-256, tamanho, JSON Pointer e contagem quando aplicável.
- `handoff.md`: descrição breve e mapa dos hashes dos 11 corpos.

O JSON de dispatch usa serialização compacta para respeitar o limite de transporte. Sua ordem de entries é a ordem de `candidate.entries`; os JSON Pointers com índice usam essa mesma ordem.

## O que foi efetivamente comparado

Em cada prepare foram conferidos o SHA-256 do ZIP e do tar interno; igualdade dos bytes dos snapshots ZIP/local/tar; igualdade JSON lossless de candidate CAS com prepared; os 32 critérios; metadados dos 11 artifacts embutidos; results completos; bytes dos 11 corpos nas representações CAS/archive/payload local; hashes declarados e Git blob SHA-1 dos recibos de readback; hashes de corpo dos releases L2–L4 e da custódia original L1; 35 refs preservadas; 6.441 pares de input com repetição; 4.646 observações; 4.639 arquivos do input lock; 14.576 arquivos regulares e um symlink no inventário; e presença/ordem/unicidade das 45 listas de membership. As contagens detalhadas e fontes estão nos relatórios.

As referências de aceites existentes são mapeadas aos mesmos bytes de corpo. Não há nova revisão, extensão desses aceites ao runtime nem afirmação de que o par de juízes leu a vista ampla ou o prepared completo.

## Identidade do kernel e limites

A fonte do kernel capturada por ROOT no commit runtime `db9b4235022c4df32fe3bfd4faeea8adcd69abb7` foi registrada com hashes. Ela usa BLAKE3 sobre JSON canônico com NFC, ordenação UTF-16 e exclusão recursiva dos campos de side index. A biblioteca Python `blake3` não estava disponível. Este verificador **não implementa nem recalcula `id`** e não substitui BLAKE3 por SHA-256. Candidate/result/body/contract IDs e inputs IDs continuam identificadores observados nos recibos reais.

Igualdade JSON lossless é igualdade dos valores completos, incluindo arrays e strings, sem reformatação semântica. SHA-256 dos bytes brutos é conferido separadamente. Nenhum desses checks por si só prova independentemente o ID canônico do kernel.

O SHA de enumeração de membership foi preservado do recibo. O stdout original de `git ls-files` não está disponível como vetor bruto separado; o verificador não o reconstruiu nem executou Git. Verificou as listas materializadas contra o archive, preservando a distinção.

O verificador não fez chamadas de rede, não executou produto/runtime/testes, não importou Atlas, não materializou checkout e não executou código extraído do archive. SHA-1 foi usado somente para a identidade Git blob documentada nos recibos de readback e source refs.

## Extração e correção preservada

Somente os 60 objetos CAS referenciados e 47 corpos CAS decodificados por versão foram gravados em `/tmp/s3-binding-evidence-<run_id>/`. O ZIP e o tar não foram copiados para o workspace. Os outros arquivos do tar foram apenas lidos em fluxo para medir seus bytes; symlinks não foram extraídos.

`verifier-corrections.json` e `v4/verifier-initial-symlink-hypothesis-failure.json` preservam o erro inicial do verificador: a primeira versão comparou a identidade de um symlink com os bytes do arquivo-alvo. O runner registra o próprio target string e seu SHA-256, sem byte_length. A correção confere exatamente esse contrato; a existência do alvo relativo interno é um check separado. Não foi uma falha do produto.

## Reuso

Para reproduzir as mesmas comparações locais, com os arquivos ainda presentes:

```bash
python s3-binding-evidence/verify_prepare.py s3-binding-evidence/v3-config.json
python s3-binding-evidence/verify_prepare.py s3-binding-evidence/v4-config.json
```

Para um novo prepare, crie um novo config abaixo desta pasta, com o archive real, seus hashes, snapshots, candidate ID, pacote selecionado, readback, releases, custódia e fontes reais. Use subdiretórios novos de output e bulk. O script exige os pins configurados e interrompe no primeiro desacordo, deixando um relato local da comparação que falhou. Não herda decisões ou IDs de uma versão anterior.

`artifact-identities.json` lista os hashes dos artefatos deste diretório após a conclusão documental. As propostas M0–M3 e a matriz documental anterior não foram alteradas.
