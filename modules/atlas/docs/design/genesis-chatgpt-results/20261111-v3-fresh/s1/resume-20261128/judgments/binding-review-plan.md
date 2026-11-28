# Plano do dossiê de binding Auto/API

Esta é preparação de transporte, não parecer. O mesmo par S1/J1 e S1/J2 julgará a transformação exata como obrigação distinta do aceite semântico herdado. Nenhum dos corpos aceitos será reavaliado por associação. Fonte normativa: protocolo fixado ee2521a5b966bd505cc95bd1c733e09e12f33531, runtime.md, seção “Binding, atualização e consumo”.

## Objetos observados

| Seleção | Candidato original prepare | Entradas / observações |
| --- | --- | --- |
| Automation | 0ff5e4144f7ec153a51ca9615b233219a3ec0bf83b4ee62593921646e64bcb56 | 12 / 694 |
| API | efb8558f751e8e4c4926eec2b736eadc3948230ad368023f5e5d19130b6faac8 | 16 / 354 |

Contrato de ambos: 3503d5acc84be88be7ec60ed768745bb7d75c9121c62597d9c51788df0af6bc3. Fonte observada 1cde2ff7a71bcf7aecb5d030917b577165135d38; runtime db9b4235022c4df32fe3bfd4faeea8adcd69abb7; release e171783482d0a44974d6056cd9e144a7e33406a7. Recibos da execução 46117651547, tentativa 1: original_cli=true, runtime_modified=false, exit_code=0; binding_created=false e publication_attempted=false. Identidades e campos originais estão em binding-intake.json, derivados mecanicamente dos arquivos preparados e recibos.

## Ordem de transporte ao par

1. **Norma e escopo.** Trecho literal runtime binding, contrato CAS decodificado exato, release e identificação da execução. Diferenciar source pin, runtime pin, pacote materializado e artefato preparado. Pedir decisão para runtime-import-binding e os critérios associados à transformação, com disposição explícita das demais fases.
2. **Identidade por seleção.** Cabeçalho exato de prepared, candidate ID, contract ID, implementation IDs, roots e required_artifact_keys. Recibo prepare original com argv, cwd, run/attempt e SHA dos outputs. O novo export CAS deve preservar os mesmos IDs, ou constituirá outro candidato e exigirá dossiê identificado próprio.
3. **Vínculo por artefato.** Para cada entry: key, OwnershipArtifact integral, result CAS decodificado integral, corpo/hash/bytes do transporte, authority, validity, gaps, fonte/receita, dependencies, inputs_id e lista exata de inputs/version. Preservar binding de todas as 12/16 entradas, inclusive predecessores incluídos, sem tratar navegação como build.
4. **Revisões e referências.** Corpos originais dos juízos semânticos usados, identidade de cada reviewer/critério/alvo e bytes dos refs materializados; seleção explícita de quais aceites são herdados. Reconciliar pacote nativo com Result/Review/Receipt/Contract reais, sem criar voto ou reviewer histórico. Normalizações de Git blob, package_ref/same_package ou validity devem aparecer como delta, com origem e alcance; igualdade de prosa não iguala resultado.
5. **Observações reais.** Projeção sem perda de observations e materialization: path/key, estado, versão, commit/Git blob/hash/bytes, membership quando aplicável, e referência às capturas efetivamente conferidas. Incluir o relatório mecânico de igualdade e o código/contrato que decide o hash de input; SHA de transporte não vira OwnershipInput.version.
6. **Decisão.** Cada juiz retorna por candidato e entry/critério, com PASS/FIX-FIRST/HOLD/REQUEST_EVIDENCE, evidência e menor correção. Um veto permanece; a aprovação de um corpo não decide runtime binding. Publication/index/read/consumers e controles não executados seguem suas próprias fases.

## Evidência ainda a receber

O artifact da execução 46117651547 contém prepared/materialization/prepare-receipt, mas não exporta objetos CAS. O principal confirmou a ausência e prepara export com inventário e verificação pelo kernel original em reexecução de identidade idêntica. Hashes de Result/Contract/refs sozinhos não são conteúdo para o par sem ferramentas; enviar os bytes decisivos inline. Não há impedimento para continuar as revisões semânticas independentes enquanto essa evidência é produzida.

Pedidos e respostas efetivamente transmitidos, tentativas, byte lengths e SHA-256 serão preservados em reviews. Modelo/tokens/uso físico permanecem UNKNOWN salvo observação direta.
