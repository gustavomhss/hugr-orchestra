# S1-04 — Schema, contratos públicos, APIs, clientes e SDKs

Estado de entrega: **INCOMPLETE_BLOCKED**. A produção e revisão de conteúdo foram concluídas; operações próprias dependentes permanecem abertas com impedimentos observados. Esta é somente a subfatia S1-04.

## Identidade e autoridade

- Execução local: `94f1e157-8c44-4e6e-a4af-7690a8845ecf`; não é um ID de conversa.
- Repositório/branch: `gustavomhss/hugr-orchestra`, `genesis-s1-api`; escritora remota: principal `/root`.
- HEAD inicial preservado: `89c78249e63060acf7c41f45f14af88fd51aa0c4`; registro P `96e9222f1f8f1fdd68693c8c30062a1544b3110d`, selo `8835faf6329cc3d5f5de1097872882d57472b793`.
- Fonte: `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo: `ee2521a5b966bd505cc95bd1c733e09e12f33531`; herança: `a8df22ae3a140c58c63f62ce2a634c84f415c943`; kit: `70234d541a9a3539935ef16f19e33c8f2d5f30ec`.
- O handoff final informa o HEAD efetivamente relido para lease e o payload já criado. Esta fila não inventa SHAs futuros.
- Escritas de entrega limitadas a este namespace. Sem nova branch, reset, force-push, PR, merge, alterações centrais/outras subfatias, produto, gerados manuais, políticas, AGENTS, guards ou workflows.

## Fila finita e decisão de cada obrigação

| Unidade | Estado final local | Evidência e trabalho restante |
| --- | --- | --- |
| API-01 — retomar B-v3/B1/B2/B3 | CONTENT_ACCEPTED | Nove chaves históricas preservadas; correção de stream e mapa de 24 domínios aceitos pelo mesmo par. Claims detalhados retirados continuam `RETIRED_EXTRA_CLAIM`, sem promoção a fato resolvido. `receipts/l1-release.json`. |
| API-02 — 472 fontes e necessidades | CLASSIFIED | Todas as 472 fontes/52 famílias têm disposição; 95 leituras herdadas da população anterior + 190 leituras integrais B-v3 reutilizadas + 2 seções + 2 gerados capturados sem leitura semântica + 183 inventário = 472. Inventário não é alegação de leitura integral. `source-disposition.jsonl`, `receipts/population-reconciliation.json`. |
| API-03 — produção cumulativa L2–L4 | CONTENT_ACCEPTED | L2 só após L1; L3 só após L2; L4 só após L3. Avanço Core incorporado em L3 revisão 3 após reconhecimento de três L1 exatos; L4 atualizado após novo gate L3. Releases locais e predecessores imutáveis preservados. |
| API-04 — capacidade e ambiente Atlas | DISCOVERED_WITH_BLOCKERS | R3 congelado; checkout Git verificado, 22 membership keys observadas pelo observador original, arquivo de 462732 bytes preservado. Código posterior db9 foi materializado e preparado apenas como diagnóstico isolado: PREPARED_DIAGNOSTIC_ONLY, exit 0. `receipts/runtime-disposition.json`. |
| API-05 — pacote Atlas | CONTENT_ACCEPTED_CANDIDATE | 16 artefatos: 13 próprios e 3 cópias Core exatas, sem substituir autoria. Chaves `s1.api.*`, fontes, receitas, autoridade, gaps, navegação e histórico preservados; normalização explícita e conferência mecânica. `native-package.json`, `transport-provenance.json`, `receipts/transport-check.json`. |
| API-06 — prepare/binding/publish/index/read | HOLD | Prepare original R3 exit 1, `native-file-limit: packages/client/src/generated/types.ts`; index/read reais exit 2, `ownership-store-unavailable`. Código posterior não foi promovido a release e não fornece binding automático. Nenhuma publicação/binding inventado. |
| API-07 — consumidores | HOLD | Um consumidor novo, isolado e Atlas-only, tentou S1-O3: 1 index, 0 reads, 0 bytes, HOLD. Tentativa pertence ao pacote anterior de 13 artefatos, preservado. Recheck real com o pacote final continua sem geração servida. Todos os 22 casos congelados estão HOLD, nenhum PASS semântico. |
| API-08 — manutenção M1/M2 | HOLD | Prerequisito de geração aceita própria ausente. Mudanças pública/receita, geração oficial, stale/refusal, affected set/rebuild e preservação de independentes continuam NOT_RUN. Regras de conteúdo e controles comuns não substituem execução própria. |
| API-09 — gates, economia, matriz e selagem | BLOCKED_GATES; SEALED_BY_HANDOFF | Guard original executado e interrompido pela falta dos bytes exatos de ZIP histórico no conector. Typechecks de setup passaram. Testes de produto somente Actions; nenhum teste local. Matriz única com 50 IDs, ledger honesto UNKNOWN e dois pareceres finais cobrem esta disposição; Git final é atestado pelo handoff e releitura externa. |

## Findings e reúso

B1/B2 foram fechados com limites exatos; B3 foi resolvido por compreensão no nível dos 24 domínios e seus 190 membros, revisão de evidência decisiva e retirada explícita de claims além da prova. Os pareceres FIX-FIRST e correções não foram apagados. A resposta B-v3 não foi reescrita por rotina nem suas 190 fontes relidas integralmente.

Os três predecessores S1-01 são `s1.core.session-admission`, `s1.core.session-execution` e `s1.core.persistence`, copiados do payload `a2a5de03d7b1034373eb877d8f03c4cecc772dde`, handoff `9fd024a34e76d2e9328e1f793ef1f69fbf606e51`. Seus corpos/aceites de fonte são exatos. Eles distinguem identidade de retry, admissão, promoção, coordenação local e persistência. O restante Core permanece IN_PROGRESS e não foi aceito por extensão. A falta anterior desses predecessores está preservada como história.

O mesmo par independente `/root/api_j1` e `/root/api_j2`, inicialmente criado com fork vazio, julgou deltas e camadas sem ferramentas. Nenhum scout ou arquivista é terceiro juiz. O produtor e o consumidor não receberam o oracle reservado. A rodada 9 conserva decisões originais e provas exatas de reúso, mas o texto original completo do pedido não ficou disponível após compactação; o limite está em `requests/10-archive-receipt.json`. A submissão final preservada reconfirma explicitamente a seleção/proveniência, sem alegar restauração desse pedido histórico. A divergência de transcrição no trecho do L4 recebido na rodada 8 foi registrada em `receipts/l4-submission-erratum.json`; ambos os juízes receberam nova submissão canônica integral na rodada 11a. Um lapso pontual na mensagem 11a a J2 também recebeu correção explícita imediata e arquivo próprio. O original, a correção e a conferência mecânica dos bytes finais permanecem separados; nenhum arquivo local é apresentado retroativamente como prova de wire idêntico.

## Impedimentos precisos e condições de retomada

1. **Capacidade qualificada de importação:** o release oficial R3 recusa o input obrigatório de 462732 bytes por teto de 256000. O diagnóstico db9, com teto de 2097152, está separado e seus resultados reais constam do recibo. Uma release S4 compatível explicitamente qualificada deve preceder o caminho de binding/publicação atribuído a ela. Não reduzir ou remover a fonte para passar.
2. **Guard obrigatório:** `bun run check:guards --base origin/dev` exige o blob binário histórico `d83941a9d836a23e466ca09ecba1f21d423094cb` de 1339105 bytes para o diff original. Contents/base64 retornou corpo vazio, fetch_blob falhou ao decodificar UTF-8, GET blob só aceita UTF-8; a rota adicional de inventário de artefatos foi recusada pelo conector, sem demonstrar ausência do artefato no GitHub. Recuperar bytes por uma rota autorizada com identidade comprovada ou disponibilizar ambiente/Actions autorizado completo, e repetir o guard original.
3. **Dependentes próprios:** obter candidato qualificado, juízos separados de binding e autoridade efetiva; publicar isoladamente; executar consumidores e M1/M2 com recibos e gates. São pendências S1-04, não trabalho transferido para a união.

Nenhuma falha de política/ator é alegada como observada: o caminho qualificado não atingiu esse gate. Nada foi inventado para ultrapassá-lo. As provas comuns de S4 mantêm seus candidatos, escopos e limites próprios; CI posterior não promove a release nem os bindings.

## Economia, preservação e composição

O ledger registra produção, juízes, correções, falhas de despacho, arquivamento, setup e operações reais. Tokens, tentativas físicas e custo não expostos permanecem UNKNOWN; não há economia numérica, custo zero ou hard cap fictícios. ROOT reconcilia o agregado histórico. Os 50 IDs originais estão em `criteria-matrix.json`, com PASS local delimitado, HOLD próprio e complemento global separado.

A coordenação S1 compõe depois as cinco subfatias, o índice geral e os 2236 paths; ROOT integra S1–S5 e responde por aceite humano/landing/ativação. Esta entrega não assume essa composição nem encerra obrigações operacionais próprias como N/A. Todos os itens independentes executáveis foram tratados; a devolução de controle ocorre como INCOMPLETE_BLOCKED, sem promessa de execução em background.
