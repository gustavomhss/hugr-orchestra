# Evidências — s1.subslice03.automation-maintenance

## 1. Objeto, autoridade e identidade integral

Este registro acompanha somente `s1.subslice03.automation-maintenance`, L4, need `maintenance`, v1. Corpo: **13840 bytes**, SHA256 `8cb4befb0cef6a35002679580d60f1746fdeac26acf45ff08e04942cff83abc7`, Git blob SHA1 `2685cecdd7df56046cc82f70ac8104c639249e33`. A autoria usa o mesmo contexto de família, sem oracle, parecer completo, fonte nova ou corpo de família irmã.

**P1 — única autoridade semântica e único predecessor obrigatório de build:** `s1.subslice03.automation-impact`, L3 v2. Todos os apontamentos P1 abaixo referem-se a este arquivo inteiro e a estes bytes:

| Campo | Valor |
| --- | --- |
| Caminho local | `producers/derived-automation-impact/body.md` |
| Bytes | 13666 |
| SHA256 | `05aeecb75fb2c4f8afb34fc44cf315490d800ac976eed82100f279ec2402044d` |
| Git blob SHA1 | `b803b5e7b626bcf746d5c15d7a0071a9f23de592` |
| Baseline de origem referido | `1cde2ff7a71bcf7aecb5d030917b577165135d38` |

A receita atual informa PASS de `parallel-v3-fresh/S1-03/J1` e `parallel-v3-fresh/S1-03/J2` para P1 exato, sem achados obrigatórios. Os hashes de resposta originais fornecidos são, respectivamente, `cebf51a08751a4ce81ffa6c2a472535e6ed3f6dde0f846f1bef8e10355310f29` e `00410b524cea90a9a4626a55fc83a2ec0c13ab648aca6b3590f198a9723063dd`. São metadados de gate recebidos; os pareceres completos e os arquivos de captura não foram lidos. Aceite semântico de P1 não prova runtime, consumo ou aceite deste L4.

**P2 — proveniência, sem edge semântico adicional:** `producers/derived-automation-impact/production-manifest.json`, 59561 bytes, SHA256 `71c87a55b4b64cf1dceeddbf466ecee7d7571edf15d125b24d91d968c792d4f5`, Git blob SHA1 `5b219e435b23d758b614f9212c8048fbfd55d373`. Seu estado de revisão é histórico, anterior ao gate comunicado na receita L4. O arquivo permanece inalterado; não é receita original nem autoridade para acrescentar fatos de produto.

## 2. Legenda de sustentação

- **Fato herdado:** contrato descrito em P1, sem observação nova de execução.
- **Derivação operacional:** orientação proposta a partir desse contrato; sua aplicação depende da autorização e de evidência nas portas pertinentes.
- **Norma pública:** requisito de manutenção, validade, preservação ou revisão do plano/contrato/critérios autorizados.
- **Não executado:** testes, reparos, provider, CI, Atlas e consumidores não foram exercitados nesta entrega. Conferência de arquivos não é teste de produto.

P1 é sempre a origem das afirmações sobre Actions, Board e scheduler. Os L1/L2 retidos no contexto cumulativo não viram predecessores diretos extras nem substituem a autoridade de P1. O manifesto anterior serve à enumeração e preservação do contexto, não à ampliação do escopo semântico.

## 3. Mapa do corpo às seções exatas de P1

| Grupo / destino neste L4 | Seções de P1 | Sustentação e transformação permitida |
| --- | --- | --- |
| **M01 — §1; gate e encerramento em §8** | §1 “Qual decisão este L3 sustenta”; §6 “Propagação entre conhecimentos e preservação dos independentes”; §8 “Fronteira desta análise e evidência ainda necessária” | Escopo, baseline e distinção entre análise, aceite e execução. O papel L4 vem de `derived-contract.json/layer_roles/4`; identidade e gate atual vêm de `automation-maintenance.json/predecessors`. A navegação curta é orientação editorial proposta, sem operação Atlas ou edge extra. |
| **M02 — §2 e handoff de §8** | §2 “Relações do produto: os fatos não são intercambiáveis”; §8 | Preserva identidades próprias: Actions Location/binding/revisão/client ID/IDs nativos; Board card/PR/head/tree/comando/bundle/base; scheduler policy/owner/placement/task/revision/slot/manualKey. A triagem e o encaminhamento são derivação operacional. Não se atribuem pessoas ou plantões; responsabilidade de produto permanece a confirmar. |
| **M03 — §3; verificações em §6** | §3 “Actions: onde uma mudança desloca a prova”; §2, parágrafo dos schedules de CI | Binding, autoridade/precondições, envio/ack/readback, autoria, efeito parcial e transporte são fatos herdados. O diagnóstico proposto exige prova compatível com o estado, sem transformar accepted em confirmed ou ausência de confirmação em ausência de efeito. Mantém branch padrão como prova de workflow_dispatch e fonte da ref selecionada como objeto separado; 204 sem atribuição. GitLab não herda contratos GitHub. Schedules: cron YAML da branch padrão GitHub → autoria/fonte via source.write; pipeline schedule GitLab → recurso/identidade/owner/timezone/ref/active/precondições; sem invalidar automaticamente DST/claims de ScheduledTask. |
| **M04 — §4; verificações em §6** | §4 “Board: impacto em elegibilidade, evidência e integração” | Mantém separação entre plano/outcome e fato externo, guard e autenticação, scoped state e bundle, tested on/merged on e integração observada. Scoped-green pode coexistir pending/error pelo último resultado por (kind, command) no tree; fail nesses resultados é red. Check requerido ausente deixa bundle pending; somente source:no-ci permite green sem checks. Preserva limites de flaky, correlação, busy-set, restore, push/banco e revogação, sem elevar inferência a execução. |
| **M05 — §5 e fronteira com CI em §3** | §5 “Scheduler: impacto antes e depois da admissão”; §2, parágrafo dos schedules; §3, parágrafo final de retry | SessionInput durável é fronteira; started não é término. Preserva DST legado/capability, latest/skip, owner antes da Session, holds somente para claim não admitida sem reler Session do owner, lease de 120.000 ms, falha de tick que consome slot sem retry automático e takeover admitido com mesmo messageID/prompt. Replay manualKey: running sem SessionInput pede retry shortly, revoked erro, demais incluem running com SessionInput e row assentada não exige admissão nesse ramo. Mantém janela revoked→started sem contar repeat/mover next, lacuna de wake, nova chave como nova invocação e retenção dos últimos 20 assentados distinta de Actions. |
| **M06 — §6; rótulos de §§1,4,5** | §§3–5; §8 | A matriz de prova e o desenho de verificações são orientação proposta. Contratos e inferências de P1 dão o objeto a examinar; não há evidência de testes ou correção medida. O teste de revogação permanece expectativa NOT_RUN. Hash, teste, julgamento, efeito atribuído e leitura real têm escopos distintos. |
| **M07 — §7; navegação em §1** | §6; §7 “Consumidores: quem deve ser reavaliado e por quê”; §8 | Mantém grafo declarado, granularidade de artefato, independência de research/boundaries/support, diferença entre navegação e build, impacto de adição/remoção/intenção/receita, reúso e propagação de autoridade/validade/gaps. IDs de consumidor são necessidades públicas do plano, sem casos ou respostas reservadas. O procedimento de atualizar e rever o conjunto é proposto, não rebuild/consumo executado. |
| **M08 — §8; fronteiras em §§2 e 6** | §8; §§6–7 | Preserva gaps, HOLD para impacto desconhecido, distinções entre conteúdo, provider, testes, publicação/binding/leitura e consumidor. Handoff e critério de encerramento são proposta normativa, sem declarar sucesso de manutenção. Originais, versões e históricos devem permanecer identificados. O gate de P1 libera somente a autoria deste L4; o gate deste corpo permanece pendente. |

A orientação é prescritiva onde explicitamente rotulada, sem transformar essas prescrições em contratos novos do produto. As qualificações do predecessor acompanham as decisões: ambiguidade de correlação do Board, janela de revogação de bundle e wake capability não foram reproduzidos nem resolvidos nesta entrega.

## 4. Normas públicas usadas e limites de prova

| Input normativo efetivo | Localizador | Uso neste L4 |
| --- | --- | --- |
| `payload/recipes/derived-contract.json` | `layer_roles/4`; `quality_rules`; `gate` | Ownership, diagnóstico, verificação e encaminhamento; referência útil em português; distinção de execução; gate do mesmo par. |
| `payload/artifact-plan.json` | `artifacts`; `direct_use_case_plan`; `navigation_rule`; `historical_entry` | Único predecessor L3; futura entry e demais famílias; associações A-VIOLATION, A-PERMITTED, S-FAILURE, A-IMPACT, ENTRY-NAV, R-FAILURE e B-ABSTAIN; preservação da entrada histórica. |
| `payload/recipes/derived-public-criteria.json` | GO-A1–A6, GO-I1–I5, GO-I7–I8, AC-01–AC-07, AC-09–AC-10, CC-3/4/7, QS-1/2/4/5/6 | Utilidade operacional, distinção epistemológica, independência/propagação, vínculo corrente, histórico, preservação, governança e limites de prova. São critérios públicos, não verdicts concedidos. |
| `payload/recipes/derived/automation-maintenance.json` | `artifact`; `predecessors`; `read_exactly`; `instructions`; `outputs` | Liberação e limites desta autoria L4; 15 inputs enumerados; cinco outputs exclusivos. |

As normas AGENTS, COMMON, missão, SKILL e seis referências públicas já lidas integralmente nesta família permanecem retidas e foram reconferidas por identidade. Plano, contrato comum e critérios foram relidos integralmente nesta entrega. Nenhum arquivo apontado por essas normas foi aberto apenas por estar citado. Em particular, `consumers/public-cases.json`, arquivos de oracle, pareceres e corpos irmãos não foram lidos.

As regras de reúso e de leitura corrente são requisitos públicos a demonstrar nas portas reais. Esta entrega não observa cache hit, call count de runtime, invalidação/rebuild, publicação/recuperação, reader ou consumidor; tampouco qualifica adapter/provider ou altera policy/guards. Papéis de encaminhamento são funcionais, sem afirmação de ownership operacional já atribuído.

## 5. Procedimento efetivo e contexto cumulativo

Receita, pedido, dispatch visível, corpo P1 e manifesto P2 são os cinco inputs novos. Somados aos **43 inputs anteriores integralmente retidos**, resultam em **48 unidades de input**, sem duplicar paths ou omitir aliases. Os **12 aliases históricos** e seus `original_read_paths` continuam idênticos. P1 atual é distinto do seu histórico v1; P2 atual é distinto do manifesto histórico preservado. O manifesto corrente registra cada arquivo inteiro, bytes, SHA256 e Git blob SHA1.

| Procedimento atual | Caminho | Bytes | SHA256 |
| --- | --- | ---: | --- |
| Receita congelada efetivamente usada | `payload/recipes/derived/automation-maintenance.json` | 9509 | `234852b82b4d24a10cda4840c6262abab446e3520f1a706eb0a1c555200cca5c` |
| Pedido preservado efetivamente usado | `producers/derived-automation-maintenance/request.txt` | 884 | `1fca3760dc1cc0749d5e44c216a7de6db0dc92916683c11e2435b05b199f25d8` |
| Dispatch literal efetivamente usado | `producers/derived-automation-maintenance/dispatch-message.txt` | 1704 | `47c9e0fe0a731c14c5930ec3d6b58a8322dae2381efd71852df7f1e67640d35f` |

P1 foi lido integralmente. Na exibição inicial de P2 houve truncamento central; o trecho literal de caracteres `[18000,38000)` foi relido e recuperou toda a região omitida, com sobreposição às extremidades recebidas. O arquivo inteiro tem 59.436 caracteres UTF-8 decodificados e 59561 bytes. Sua identidade integral e as identidades dos 15 inputs enumerados e dos 43 retidos foram conferidas. Normas já consumidas integralmente puderam ser reutilizadas conforme a receita.

A composição é nativa. Python por `exec_command` foi usado para leitura/escrita de UTF-8/JSON e conferência determinística via SHA256 e Git blob SHA1 (`blob`, espaço, tamanho, NUL, bytes). Um rascunho de 15.044 bytes foi mantido apenas em memória e condensado antes de gravar o corpo de 13840 bytes; a conferência de tamanho não é teste de produto. Nenhum script/procedimento extra foi salvo. O manifesto produzido depois é registro de proveniência, nunca receita retroativa.

Foram escritos somente `body.md`, este `evidence.md`, `production-manifest.json`, `response.md` e `dispatch-message.txt` no diretório exclusivo. `request.txt`, antecessores, pedidos/dispatches anteriores e históricos foram preservados. O dispatch e a resposta usam UTF-8 sem LF terminal; o FINAL reproduzirá a resposta exatamente. O manifesto registra a identidade da resposta; a identidade do próprio manifesto é calculada externamente após a serialização, evitando self-hash circular.

## 6. Estado e lacunas desta entrega

O corpo L4 tem oito seções depth2 e oito grupos de evidência. Verificações locais de identidade, estrutura, alias e preservação são mecânicas. Não foram feitas rede/GitHub, delegação, teste ou alteração de produto, operação Atlas, execução de consumidor ou produção da entrada.

P1 está aceito segundo o gate recebido. Este L4 permanece **AUTHORED_AWAITING_SAME_PAIR_SEMANTIC_REVIEW**. O principal obtém revisão do mesmo par antes de liberar dependentes. Limites de leitura/consumo devem ser demonstrados em atividade própria; navegação em Markdown não os satisfaz. Nenhum sucesso de manutenção ou aceite global S1-03/S1 é alegado. Tentativas físicas, tokens e cobrança são `UNKNOWN` quando não expostos.
