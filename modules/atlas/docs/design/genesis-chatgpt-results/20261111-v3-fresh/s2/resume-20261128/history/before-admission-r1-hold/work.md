# S2 Interfaces — retomada de 28 de novembro de 2026

Estado: **IN_PROGRESS**, `delivery_complete=false`. O pacote e os 13 corpos aceitos permanecem intactos. Há três operações de prepare preservadas: v1/01 e v2/02–03, sendo o 03 uma execução original com guard externo e bytes preparados idênticos ao 02. O store isolado foi inicializado e as políticas somente de admissão foram instaladas. ADMIT ainda não tem decisões finais nem execução; index/read, consumidores (0/14) e S2-U1 continuam **NOT_RUN**.

## Identidades e custódia

Execução `846d4f9c-fb77-4e21-aff6-1fffccc3132b`, branch exclusiva `genesis-interfaces-resume`, HEAD inicial `bb2a931301d541692b11e5a7f1eab234cd9ed2fd`. Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. O runtime executado é `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`, sem alterações de código.

O pacote público tem 332.594 bytes e SHA-256 `9356cefcb4a1db413e67869a855fd082536476fb18ff7784dde39f051e9b407b`. A conferência encontrou os 13 corpos exatos, os 26 usos das decisões semânticas e os 1.109 arquivos originais preservados. Os pareceres antigos conservam suas rodadas, FIX-FIRST e limites; não foram convertidos em votos novos.

A busca delimitada pelo prepare r4 histórico terminou sem recuperar o candidato preparado, stdout e recibo integral originais. `custody-search.json` conserva fontes consultadas, resultados, identidades e o pedido mínimo de exportação. O candidato histórico `f310ec9b3844d6833ea5a867f9ed14ce099669492c66d8b133116642310310dd` e o preparado SHA-256 `a4946200211c54cdf7f94a26e659cdc285e65d5775a8e1e2f56cf2d9c9d2f207` continuam reportados apenas pelo resumo derivado. Nenhum preparo novo foi atribuído a essa execução antiga.

## Preparos efetivamente executados

| Operação | Resultado e identidade | Evidência |
|---|---|---|
| Prepare nativo v1, operação01 | Exit0; 13 entradas, 626 observações, 667 arquivos sem drift, 69 CAS. Candidato `4a36e1210acf6a4bb460846b717d446e6c259f80a78fd73cfce8b5a6e445f522`; preparado SHA-256 `476891f3bf1edf24f7d2c486a1218bab5b0cd5b2b36b8295c3892917724c2b4a`. | `prepare-01/` e `prepare-01-evidence.zip` |
| Prepare de avaliação v2, operação02 | Exit0; 13 entradas, 690 observações, 716 arquivos sem drift, 92 CAS. Candidato `d1c8478b155b2085df1289ef91edfeaa4834e9300d651c0b953e6e2978aa5d30`; preparado SHA-256 `bb3ee09693ef1ddfb89e548f3f5e0d38c4abaee5e6d253f129c7c6c1a9dbda0e`. | `evaluation-v2/prepare-02/` e `evaluation-prepare-02-evidence.zip` |
| Prepare de avaliação v2, operação03 | Exit0 com guard: 1.890 inputs antes/depois iguais (716 fonte + 1.170 runtime/Bun + quatro controles); 92 CAS intactos. Mesmo candidato d1 e mesmos bytes preparados do 02, por igualdade de preimagem. | `evaluation-v2/prepare-03/` e `evaluation-prepare-03-evidence.zip` |

O primeiro corpus é um checkout Git real no HEAD inicial. A segunda raiz é uma materialização distinta, sem Git; seu `observed_head` verdadeiro é `null`. Os recibos registram argv/cwd, tempos, streams integrais e estados efetivamente observados. As operações de prepare são CAS-only; nenhuma criou política, projeção ou aprovação. A operação03 preservou os 92 CAS já existentes. A inicialização e instalação posteriores têm recibos separados abaixo.

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

O controle externo proposto sobre 1.170 arquivos foi efetivamente usado no prepare03 e no init-store01: os 922 arquivos físicos da identidade declarada, os 247 de `@noble/hashes` e o executável Bun. O recorder recusa a invocação quando o lock diverge e conserva bytes antes/depois. O controle não altera o runtime nem corrige sua cobertura intrínseca; sua adequação continua submetida ao par. A captura do 03 não é atribuída retroativamente ao prepare02. Ver `evaluation-v2/proposed-authority/runtime-coverage-supplement.json`.

## Fila corrente

| Obrigação | Estado |
|---|---|
| Busca histórica e preservação pública | Concluídas no escopo documentado; original r4 ainda indisponível |
| Preparos v1/01 e v2/02–03 | Executados e preservados separadamente; o 03 é a evidência primária guardada |
| V1 binding | HOLD processual dos dois juízes; aprovação não criada |
| V2 ADMIT exato dos 13 | Em revisão, sem decisões finais e sem admissão |
| Inicialização e políticas v2 | Init-store01 executado; políticas exatas de admissão instaladas |
| Publicação/admissão governada v2 | NOT_RUN; depende das duas decisões finais exatas |
| Primeira travessia com consumidor novo | NOT_RUN |
| Casos S2-C/S2-I | 0/14; perguntas, modos e limites intactos |
| S2-U1 | NOT_RUN; plano estático e patch proposto preservados, sem aplicação; driver/produção/targets e provas pendentes |
| Gates locais e fechamento | Parciais; guardas finais do payload e julgamento operacional pendentes |

A geração `694110e9b70b62ca59fe3a0edf91157066f991bb79fcaab27a1b005320bc3488` foi fixada depois do candidato e antes de decisões/manifesto. As propostas usam o actor nominal `genesis-s2-resume-846d4f9c`, sem alegação de identidade autenticada. A política inicial é somente de admissão; cada caso terá sua própria política finita de index/read e um consumidor novo `fork:none`. Não se concede manutenção no plano inicial. As duas políticas de admissão foram instaladas em install-policy-admit-01; políticas de consumidores e manutenção não foram instaladas por essa operação.

Após os dois ADMIT finais exatos e a avaliação das limitações, construir o binding e executar a CLI original para admitir no estado já inicializado. O primeiro consumidor recebe apenas sua pergunta e as respostas reais das portas Atlas. Preservar consulta, corpo, versões, orçamento, resposta e julgamento; entregar essa travessia antes de completar os outros 13 casos. A manutenção exige um plano específico posterior e não usa o executor legado v1.


## Checkpoint: prepare guardado e setup efetivo

O prepare03 executou de `2026-11-28T07:14:06.118420+00:00` a `2026-11-28T07:14:10.661705+00:00`, exit0. Seu recibo tem SHA-256 `36c3c2e6506b2ff9b260d932bdf3cf85e9e8d60600197c43b516c49626a4e3ea`. Os bytes do preparado e stdout são idênticos aos do 02, permitindo reutilizar a auditoria de 22.752 comparações sem alegar nova execução da auditoria. O arquivo de evidência03 tem 605.332 bytes, SHA-256 `df4d915955cd1e22c2eee0acd67563783fa229f182e5565c26befda3f84d2296`; seus 11 membros foram conferidos contra os originais.

A emenda `evaluation-v2/setup-sequencing/sequencing-amendment-before-init.json` distingue preparação reversível de admissão. Ela registra a mudança da sequência proposta antes de executá-la, sem mudar candidato, plano, obrigações ou critérios. O protocolo exige os dois votos exatos antes dos reviews/receipts/artefatos/manifest de admissão; marker e políticas foram preparados separadamente para revisão do estado real.

Init-store01 executou de `2026-11-28T07:22:10.569903+00:00` a `2026-11-28T07:22:10.788985+00:00`, exit0, com 1.896 inputs estáveis e guard correspondente. Produziu somente o marker de 583 bytes, SHA-256 `b191a34d21a16337044e5a30f41fba19338feb3123dd606bf3d9e945e7158497`. Os streams, o recibo, command, precondition e snapshot estão em `evaluation-v2/init-store-01/`; o ZIP próprio conserva também o caminho original `state-after/.atlas/evaluation-store.json`.

Em `2026-11-28T07:22:25.019637+00:00`, install-policy-admit-01 instalou os bytes já fixados de governance e evaluation policy, actor nominal `genesis-s2-resume-846d4f9c`, operações somente `admit`, consumer nulo e nenhum orçamento alterado. Essa instalação não chamou admit, não criou voto, review ou manifest. Ver `evaluation-v2/install-policy-admit-01/`.

Os helpers usados/atuais e as versões anteriores do builder estão em `evaluation-v2/operator-tools/`. O builder atual aponta ao preparado03, preserva o 02 como origem dos 716 inputs e restringe binding/requests/responses ao namespace aceito por nativePath, fora de `.atlas`. Seus históricos conservam o erro detectado antes do primeiro uso e a atualização da evidência primária.

O plano de manutenção em `evaluation-v2/maintenance-static-plan/` é **PROPOSED_STATIC_ONLY_NOT_EXECUTED**. A alteração 120→150 segundos permanece apenas patch prospectivo. S2-U1 é **NOT_RUN**; não há target, produção real, driver executado, semântica nova ou voto novo. A sequência proposta mantém primeira travessia e 14 casos antes da manutenção e preserva o oracle fixo.

Guardas do HEAD `8a5fd8230d0ada0c4c510fa6221562726d5c1722`: exit0, 78 regras, 1.851 caminhos alterados, 208 avisos, zero gates e zero erros; streams integrais em `gates/guards-8a5fd823/`. Esse gate foi executado anteriormente por root e não cobre automaticamente este checkpoint novo. Nenhum gate, teste de produto ou operação Atlas foi executado para montar este checkpoint.

## Gates e limites globais

Guardas já executadas sobre o payload `8858e56`: exit0, 78 regras, zero gates/erros e 204 avisos; 203 fora desta retomada e um aviso esperado do ZIP preservado. Essa prova não é atribuída automaticamente aos arquivos posteriores. Os recibos completos estão em `gates/`. Não houve testes de produto locais, alteração do motor ou relaxamento de regras.

Tokens, tentativas físicas e cobrança do provedor permanecem UNKNOWN. O histórico é GLOBAL_UNRECONCILED. Agentes de pesquisa/auditoria não contam como consumidores ou julgadores. Integração global, merge e ativação continuam com ROOT/Gustavo.
