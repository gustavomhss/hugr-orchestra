# S2 Interfaces — retomada de 28 de novembro de 2026

Estado: **IN_PROGRESS**, `delivery_complete=false`. O pacote e os 13 corpos aceitos permanecem intactos. Há dois preparos novos preservados, com candidatos diferentes. A admissão isolada v2 está em preparação para julgamento; index/read, consumidores e manutenção continuam **NOT_RUN**.

## Identidades e custódia

Execução `846d4f9c-fb77-4e21-aff6-1fffccc3132b`, branch exclusiva `genesis-interfaces-resume`, HEAD inicial `bb2a931301d541692b11e5a7f1eab234cd9ed2fd`. Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. O runtime executado é `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`, sem alterações de código.

O pacote público tem 332.594 bytes e SHA-256 `9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b`. A conferência encontrou os 13 corpos exatos, os 26 usos das decisões semânticas e os 1.109 arquivos originais preservados. Os pareceres antigos conservam suas rodadas, FIX-FIRST e limites; não foram convertidos em votos novos.

A busca delimitada pelo prepare r4 histórico terminou sem recuperar o candidato preparado, stdout e recibo integral originais. `custody-search.json` conserva fontes consultadas, resultados, identidades e o pedido mínimo de exportação. O candidato histórico `f310ec9b3844d6833ea5a867f9ed14ce099669492c66d8b133116642310310dd` e o preparado SHA-256 `a4946200211c54cdf7f94a26e659cdc285e65d5775a8e1e2f56cf2d9c9d2f207` continuam reportados apenas pelo resumo derivado. Nenhum preparo novo foi atribuído a essa execução antiga.

## Preparos efetivamente executados

| Operação | Resultado e identidade | Evidência |
|---|---|---|
| Prepare nativo v1, operação01 | Exit0; 13 entradas, 626 observações, 667 arquivos sem drift, 69 CAS. Candidato `4a36e1210acf6a4bb460846b717d446e6c259f80a78fd73cfce8b5a6e445f522`; preparado SHA-256 `476891f3bf1edf24f7d2c486a1218bab5b0cd5b2b36b8295c3892917724c2b4a`. | `prepare-01/` e `prepare-01-evidence.zip` |
| Prepare de avaliação v2, operação02 | Exit0; 13 entradas, 690 observações, 716 arquivos sem drift, 92 CAS. Candidato `d1c8478b155b2085df1289ef91edfeaa4834e9300d651c0b953e6e2978aa5d30`; preparado SHA-256 `bb3ee09693ef1ddfb89e548f3f5e0d38c4abaee5e6d253f129c7c6c1a9dbda0e`. | `evaluation-v2/prepare-02/` e `evaluation-prepare-02-evidence.zip` |

O primeiro corpus é um checkout Git real no HEAD inicial. A segunda raiz é uma materialização distinta, sem Git; seu `observed_head` verdadeiro é `null`. Os recibos registram argv/cwd, tempos, streams integrais e estados efetivamente observados. As duas operações escreveram CAS e arquivos de saída. Nenhuma criou política, projeção ou aprovação.

O arquivo de evidência da operação02 tem 5.654.997 bytes, SHA-256 `3afd80a4f6b48aba51b7df90d4837a446b53346b58cca2084f121a5dc492ead1`. Seus 1.114 membros foram verificados: inclui os 716 arquivos materializados, 92 objetos CAS, recibo original, verificador, relatórios completos e propostas separadas. O CAS arquivado não constitui store servido nem autorização de publicação. O inventário interno separa o recorder realmente usado das revisões propostas para operações futuras.

## Por que a rota v1 ficou em HOLD

Os mesmos dois juízes independentes, `/root/s2_j1` e `/root/s2_j2`, receberam o contrato original, critérios e fontes normativas literais. Ambos emitiram **HOLD_PROCESSUAL**: o contrato v1 exige PASS em AC01–AC10 e runtime-import-binding, enquanto consumidores, manutenção e demais provas ainda não existem. Um propósito de transformação não redefine esses critérios. Nenhuma aprovação v1 foi criada.

Os pedidos e respostas integrais estão em `judgments/binding-scope/`. O PASS anterior em `judgments/record-r1/` cobre exclusivamente o registro de custódia/diagnóstico do payload `8858e56a0a8e7824798a593e893ac56a46dac4a3`; não é binding nem conclusão S2.

O código db9 já contém o protocolo distinto de admissão de avaliação. A operação02 usa esse protocolo com quatro critérios ADMIT, mantendo o candidato/contrato anteriores e todos os 11 deveres finais em `PENDING_FINAL_EVIDENCE`. O plano, obligation set e receituário estão em `evaluation-v2/plan/`. A rota não muda os corpos nem transforma aprovação semântica histórica em admissão atual.

## Compatibilidade do runtime

O release S4 `20261128-s4-runtime-db9b423-prepare-v1`, selado em `e171783482d0a44974d6056cd9e144a7e33406a7`, fixa o mesmo código db9. Seu manifesto tem blob `ac4f5f46ce2044ded044e4c9a4e35220558bae22` e SHA-256 `2922f769ea2b533d06748a4c10471b19deba3fd0c41b8f1bf7930512eaa75af1`.

Ele qualifica prepare v1 completo para S1-03/S2, incluindo os inputs grandes e recusa real por permissão. Não declara execução v2 nem resultados locais S2 de binding, publicação ou consumo. O suplemento `runtime-followup/release-e171/` documenta o reúso do código exato e dos 54 controles v2 da CI comum, preservando esse limite. A responsabilidade de executar e provar as portas locais continua com a S2; a ausência de resultado de domínio no release não é tratada como proibição automática.

CI comum: run `43343953480`, SHA db9, 278 testes/27 arquivos, incluindo 54 controles v2. Qualificação de pacotes completos: run `46114652347`, runtime db9, harness `09a4c4afc7aab2f9a153eb059d13df0ecf15595c`. O candidato S2 desse run mantém sua própria raiz/HEAD e seu próprio ID; não foi transplantado. O recibo original da operação02 mantém sua observação anterior do release; o vínculo ao release novo é um suplemento posterior.

## Auditoria v2 e limite de cobertura

A auditoria independente terminou com **22.752 comparações e zero divergências** de transformação/bytes. Conferiu os 92 CAS, 13 entradas, 818 vínculos de input, 690 observações, 40 referências, 32 dependências, 30 navegações e toda a materialização. O relatório e o verificador estão em `evaluation-v2/audit/`; os detalhes e cada comparação estão no ZIP.

O resultado é `STATIC_RECONCILIATION_WITH_MATERIAL_COVERAGE_GAP`, e não um voto ADMIT. As 925 chaves de `runtime_identity` reproduzem exatamente o coletor. Ele omite `@noble/hashes@1.8.0`, importado pelo kernel e declarado apenas no manifesto raiz do workspace. Manifesto e lock estão entre os pins do plano, mas esses pins não incorporam automaticamente os bytes instalados à identidade intrínseca.

Os 247 arquivos instalados dessa dependência, 1.145.416 bytes, foram comparados integralmente ao tarball local cuja integridade está no lock. Todos coincidiram. O tarball de 155.326 bytes tem SHA-256 `e8a765d92c04faaccba8776411c5038cb195f812ee629fce07e1d2e6aec80ea0`. Essa observação posterior e a recomputação dos IDs não fabricam um snapshot anterior ao prepare.

Para as próximas operações foi proposto um controle externo sobre 1.170 arquivos: os 922 arquivos físicos da identidade declarada, os 247 de `@noble/hashes` e o executável Bun. O recorder recusa a invocação quando o lock diverge e conserva bytes antes/depois. A proposta não altera o runtime nem corrige sua cobertura intrínseca; sua adequação precisa ser julgada pelo par. Ver `evaluation-v2/proposed-authority/runtime-coverage-supplement.json`.

## Fila corrente

| Obrigação | Estado |
|---|---|
| Busca histórica e preservação pública | Concluídas no escopo documentado; original r4 ainda indisponível |
| Novo prepare nativo e novo prepare v2 | Executados e preservados separadamente |
| V1 binding | HOLD processual dos dois juízes; aprovação não criada |
| V2 ADMIT exato dos 13 | Dossiê em finalização, sem voto ou admissão |
| Inicialização, políticas e publicação governada v2 | NOT_RUN; propostas fora da raiz servida |
| Primeira travessia com consumidor novo | NOT_RUN |
| Casos S2-C/S2-I | 0/14; perguntas, modos e limites intactos |
| S2-U1 | NOT_RUN; oracle intacto, exige plano concreto/target e provas próprias |
| Gates locais e fechamento | Parciais; guardas finais do payload e julgamento operacional pendentes |

A geração `694110e9b70b62ca59fe3a0edf91157066f991bb79fcaab27a1b005320bc3488` foi fixada depois do candidato e antes de decisões/manifesto. As propostas usam o actor nominal `genesis-s2-resume-846d4f9c`, sem alegação de identidade autenticada. A política inicial é somente de admissão; cada caso terá sua própria política finita de index/read e um consumidor novo `fork:none`. Não se concede manutenção no plano inicial. Nenhuma dessas políticas foi instalada.

Depois dos dois ADMIT exatos e da avaliação das limitações, executar a CLI original para inicializar/admitir no estado isolado. O primeiro consumidor recebe apenas sua pergunta e as respostas reais das portas Atlas. Preservar consulta, corpo, versões, orçamento, resposta e julgamento; entregar essa travessia antes de completar os outros 13 casos. A manutenção exige um plano específico posterior e não usa o executor legado v1.

## Gates e limites globais

Guardas já executadas sobre o payload `8858e56`: exit0, 78 regras, zero gates/erros e 204 avisos; 203 fora desta retomada e um aviso esperado do ZIP preservado. Essa prova não é atribuída automaticamente aos arquivos posteriores. Os recibos completos estão em `gates/`. Não houve testes de produto locais, alteração do motor ou relaxamento de regras.

Tokens, tentativas físicas e cobrança do provedor permanecem UNKNOWN. O histórico é GLOBAL_UNRECONCILED. Agentes de pesquisa/auditoria não contam como consumidores ou julgadores. Integração global, merge e ativação continuam com ROOT/Gustavo.
