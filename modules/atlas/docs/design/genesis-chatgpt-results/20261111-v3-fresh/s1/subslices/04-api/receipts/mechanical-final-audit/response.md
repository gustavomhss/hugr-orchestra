# Auditoria mecânica final S1-04

**Nenhuma inconsistência mecânica atual permanece nos elementos verificados.** Esta é conferência de identidades e recibos, não revisão semântica, terceiro juiz ou aceite de runtime.

Pacote: `71bc1102fd5e2c6be166b2df790e8ee8fe4ecd053ab2d7fed5bbc46130349442`. Prepare diagnóstico preservado: `be267a8e2db79343731eba856d84ff914f1d43f8849b0072f05b1d0bbff794a6`. Ambos permaneceram byte-idênticos durante a correção do locator.

## Elementos conferidos

- 16 artefatos: 13 próprios e 3 predecessores Core exatos; 9 chaves históricas `s1.api.*`; required keys únicas; dependências/navegação/roots locais válidos e grafo de construção sem ciclo.
- Corpos, metadados, receitas, releases e referências atuais: 340 conferências de hash em 101 paths distintos. Os campos copiados Core, salvo os paths declaradamente relocados, correspondem aos originais preservados.
- 472 fontes únicas, 52 famílias e 190 membros de domínio correspondentes ao conjunto B-v3; os 289 source_refs dentro da população atribuída coincidem com os Git blobs do inventário.
- 50 IDs de critérios: 20 PASS locais delimitados, 29 HOLD e 1 N/A. Todos os paths de evidência da matriz existem.
- 22 casos de consumidor, com limites iguais aos congelados: todos HOLD e nenhum PASS semântico. S1-O3 permanece vinculado ao pacote anterior de 13 artefatos. M1/M2 permanecem NOT_RUN.
- Prepare R3 exit 1 com native-file-limit; prepare db9 diagnóstico exit 0, com 16 entries e 354 observações de input; index/read R3 e db9 exit 2 com ownership-store-unavailable; guard reconciliado exit 1 no ZIP histórico d83941a9d836a23e466ca09ecba1f21d423094cb. Os resumos distinguem o diagnóstico db9 não promovido do release R3.

## Locator reconciliado

A evidência serializada de L4 preservava `body_diff_ref.path="body.diff"`, relativo ao metadata do produtor. Os bytes já existiam em `producers/upper/l4/body.diff`, 8286 bytes, SHA256 `34cdfe65f88476761f5f35453505b677cf55dada2ece278bee5ba7fd9c09e5f7`. A principal adicionou o contexto e o payload path completo em `transport-provenance.json/evidence_relative_contexts[0]`; `normalization-check.json` confirma o locator e o sidecar `c13e8603502d968d347bdf277a885e76cd01d48f7a51d78191a701bb0d9c42da`. Nenhum corpo, pacote ou candidato precisou ser alterado. Nenhum outro path curto do mesmo tipo foi encontrado nos dados atuais serializados de evidence/authority/gaps.

## Proveniência e limites

O bloco canônico visível de J1 e o bloco de J2 após somente a correção explícita coincidem exatamente com o L4 final `ce0f86d365df573cf89218da7fee86009d1a37c65c775735c02a68079d38160e`. O original divergente e a retirada da alegação de wire verbatim da rodada 8 permanecem preservados.

As diferenças do overlay registrado pelo guard em ledger, work e transport-check são snapshots anteriores à finalização. Não são referências atuais quebradas nem um gate verde: o comando falhou e a evidência conserva esse fato.

Não usei GitHub, fontes cruas, testes, guards ou prepare. O oracle foi tratado apenas como bytes para conferir seu hash, nunca como conteúdo. Referências externas de commit/fonte não foram baixadas ou revalidadas. Este relatório não atesta promoção, binding, publicação, consumidores ou manutenção executada.
