# Revisão adversarial — paralelismo, simplicidade e performance

**Parecer: corrigir os pontos abaixo antes do rollout paralelo amplo. Não descartar o design, o mapa nem a divisão principal de responsabilidades.**

A publicação no GitHub está completa, mas publicação não é aprovação técnica deste contrato. Este documento é uma revisão, não uma versão substituta do plano. Nenhuma dependência, axioma, orçamento, asset, estado de task ou implementação do produto foi alterado nesta passagem.

## Escopo e evidência

- Plano examinado: `visual-migration-plan`, commit `d022ec1e281b51a6c8afa5740c6781c01efefb37`; contrato v4.1, `PLAN.json` SHA-256 `b7775a4fee972168b01b42ab209f4aa8d4e02c0a0337e6359cc6c3436b7e94d2`.
- Código consultado por leitura focalizada: `dev` em `bde9005056e17d6495ce1270a2f25ca811b69e43`. O plano documenta como base anterior `30d951fcc4a09e708768551c7c6fd38a0efe3da8`; S01 ainda deve conferir o checkout usado pelo executor.
- Foram examinadas as 66 tasks e suas dependências/escopos, os contratos de medição/cobertura, o seletor e o avaliador. Os arquivos críticos do pacote local foram confrontados com os blobs da revisão remota. As identidades estão em [RESULTS.json](RESULTS.json).
- Reexecutados **151 testes do núcleo v4.1**, todos passando. Os 13 testes de navegação acrescentados depois não foram reexecutados nesta rodada. Passar na suite existente não elimina os contraexemplos desta revisão.
- [audit.py](audit.py) reproduz a análise de grafo e as sondas numéricas/de cobertura, com fixtures explicitamente sintéticas. Não inicia agentes, acessa contas, altera o plano, chama modelos ou mede o Orchestra.
- Não houve checkout integral do produto no container, build, render, Electron ou benchmark no hardware do usuário. A disjunção comprovada abaixo é a dos **escopos declarados**, não uma certificação de todas as relações comportamentais do monorepo.
- Revisão feita pelo mesmo assistente em passagem adversarial distinta; não por auditor externo independente.

## Resultado que deve ser preservado: boa separação de escrita

Entre os **927 pares de tasks sem relação de precedência transitiva**, a inspeção dos cones declarados encontrou **uma sobreposição de escrita**: `S19-W2-T1` com `S20-W2-T1`. Ela é intencional e possui o lease comum `public-api-registration-and-client-codegen`.

**Não encontrei colisão de escrita desprotegida nesses cones.** Não seria correto inventar uma para tornar a revisão mais severa. As divisões S17/dados versus S18/apresentação, S15/Dock versus S16/bridge nativa, S12/configurações versus S13/providers e S04/primitives versus S05/marca são úteis. O writer único S25 para os pontos de integração também deve permanecer.

Entretanto, arquivos distintos não garantem execução independente: contratos compartilhados, fases completas exigidas prematuramente e reservas de máquina inteira ainda serializam o programa. O problema remanescente é maior na **orquestração do trabalho e no aceite**, não em uma necessidade de redesenhar o aplicativo.

## Achados

| ID | Prioridade | Problema | Responsáveis existentes |
|---|---|---|---|
| PA-01 | Alta | Reserva de hardware pela task inteira e medição grande demais para alterações pequenas | S02, S23, S25 e política de verificação das frentes |
| PA-02 | Alta | Dependências de etapas completas e prioridade inadequada do piloto | S03/S04/S06/S09/S11/S22/S25 |
| PA-03 | Bloqueador | Critérios de qualidade do produtor ainda exigem aceite final futuro | S25 / #168 |
| PA-04 | Bloqueador | Unidade de slope faz o avaliador rejeitar memória decrescente | S02 / #145 e S23 / #166 |
| PA-05 | Alta | Limite absoluto de latência permite regressão grande | S02 / #145 e S23 / #166 |
| PA-06 | Média | Categoria visual obrigatória sem consumidores/capturas esperados | S01/S03/S20/S24 |

### PA-01 — Reserva e granularidade excessivas de prova

**Observação.** `exclusive-benchmark-hardware` está em **22 das 66 tasks**. O seletor retém essa exclusividade enquanto a task inteira está RUNNING, não apenas durante a janela de amostragem. Pelo próprio código, nenhuma outra task é selecionada enquanto essa reserva está ativa, inclusive quando ela poderia executar revisão ou trabalho em outro recurso.

A configuração também exige cinco pares A/B para os cinco registros estáticos de P01, incluindo tamanho do bundle e contagem de novas dependências. Essas propriedades se verificam diretamente nos manifests dos dois artefatos; repetir cinco rodadas de execução não aumenta sua precisão. Já P10, que incorpora o perfil P3 de soak, aparece em sete verificações de frente/integração. O plano não distingue suficientemente prova determinística local de uma campanha quantitativa do produto completo.

**Impacto.** Há concorrência de implementação no papel, mas grande parte das verificações monopoliza a máquina. Isso aumenta espera e incentiva o executor a produzir burocracia antes de entregar a UI. Não estimei horas perdidas: campanhas podem compartilhar observações válidas, e as tasks não têm durações medidas.

**Correção mínima.** Manter exclusividade apenas durante coleta sensível; revisão dos resultados, typecheck, testes determinísticos e documentação não precisam da reserva. Usar três níveis no contrato já existente: checks locais proporcionais; medição focalizada quando há mudança em um hotspot; campanha integrada de piloto/release. Prova estática vem de manifests, não de cinco pares artificiais. Recibo de pai agrega provas dos filhos sem obrigar uma nova campanha. Não criar scheduler ou serviço de locks novo.

**Axiomas de aceite da correção.**
- **DoD:** a reserva delimita coleta, e os gates locais não exigem campanha integral sem justificativa de risco.
- **Invariants:** benchmark continua sem compilação/ruído concorrente no mesmo host; nenhum gate de segurança ou acabamento é dispensado.
- **Quality standards:** distinguir contagem estática, amostra temporal, teste funcional e inspeção; cada prova tem o custo pertinente.
- **Completeness criteria:** testar coleta exclusiva, revisão sem reserva, dois artefatos estáticos e reuso de dados do mesmo candidato.
- **Success criteria:** frentes disjuntas progridem enquanto não disputam realmente o recurso medido.

### PA-02 — Dependência de contrato não é dependência da feature inteira

**Observação.** `S06` espera `S03`, `S04`, `S05` e `S22` completos. `S04` cobre todas as famílias de primitives V1/V2; `S22` vai além das chaves de texto e inclui testes de acessibilidade/localização. `S11` espera `S09` completo, inclusive sua verificação, embora parte importante de arquivos/diff/terminal possa ser preparada sobre a interface de evidência existente ou estabilizada antes.

O piloto melhorou em relação à v3: possui **15 pré-requisitos**, não 44. Ainda assim, o seletor usa a ordem dos nós, sem favorecer o caminho até ele. Na simulação de tasks com duração unitária, `--jobs 4`, fontes externas satisfeitas e sem validar provas fictícias, foram **42 rodadas**, com piloto selecionado na 19ª e sua revisão na 25ª. O grafo sem limite de recursos tem 21 níveis de precedência. **Isso não é previsão de duração nem promessa de aceleração de 2×**; evidencia a política estática de seleção.

**Correção mínima.** Congelar cedo os pequenos contratos de que os consumidores precisam: nomes dos slots, props/accessors, chaves de texto, estados e eventos. Fazer a implementação depender desse ponto de entrega; deixar verificação cruzada para o aceite correspondente. Favorecer explicitamente a próxima fatia do piloto, sem otimizador genérico. Preservar dependências reais, como identidade/read-model S17 antes de consumo final S18 e autoridade real antes de enablement live.

Não autorizar mudanças concorrentes no mesmo componente shared: se um contrato público mudar, integrar essa mudança primeiro e revalidar os consumidores atingidos. Worktrees não eliminam conflitos semânticos.

**Axiomas de aceite da correção.**
- **DoD:** cada aresta de entrada explica qual artefato ou contrato consome; dependências de fechamento estão na etapa correta.
- **Invariants:** um único writer por faixa de arquivos; consumidor não inventa uma API para ignorar seu fornecedor.
- **Quality standards:** interfaces pequenas, existentes quando possível, sem sistema de slots universal ou abstração preventiva.
- **Completeness criteria:** simular piloto priorizado, contrato ainda ausente, alteração de interface e frentes que só compartilham estilo.
- **Success criteria:** a primeira composição real detecta erros cedo, sem aguardar verificações não pertinentes.

### PA-03 — O ciclo semântico não foi removido de todos os axiomas

**Observação.** Os passos e o DoD de `S25-W1-T1` dizem corretamente que ela produz um candidato para avaliação futura. Porém os critérios continuam:

- `S25-W1-T1-QUALITY_STANDARDS-01`: “Evidência P01–P12 no SHA final; nenhuma regressão empurrada para depois.”
- `S25-W1-T1-QUALITY_STANDARDS-02`: “GateQ01–Q16 em todo app, marca/assets finais e todos estados; código mínimo sem looseends.”

`criterion_evaluation_stage` atribui ambos à própria `S25-W1-T1`. S23 e S24 dependem dessa task. O recibo exige PASS para cada critério. Assim, o produtor ainda pode ser obrigado a provar o resultado de consumidores que dependem dele. A herança de quality standards dos agregadores exige o mesmo cuidado.

**Qualificação.** O grafo declarado é acíclico e percorreu as 66 tasks sinteticamente. O defeito está na coerência entre a etapa de avaliação dos axiomas e o DAG, não no algoritmo topológico. A correção anterior removeu a contradição dos passos, mas não de todos os quality standards.

**Correção mínima.** T1 exige build/smoke locais, identidade do candidato e instrumentação disponível. S23/S24 medem/revisam; S25-T2 exige seus resultados. Os invariantes contínuos de segurança/autoridade permanecem desde o início. Não resolver com “interprete a intenção” ou PASS antecipado.

**Axiomas de aceite da correção.**
- **DoD:** T1 pode encerrar com candidato e provas locais verdadeiras, sem resultado de S23/S24.
- **Invariants:** T2 não encerra com gate final ausente/falho ou em outro candidato.
- **Quality standards:** a fonte exigida por cada critério existe até sua etapa de avaliação.
- **Completeness criteria:** verificar DoD, cinco grupos herdados, IDs, stages, produtor→gates→reparo→aceite.
- **Success criteria:** não é necessário violar um axioma para obedecer ao DAG.

### PA-04 — Slope de memória válido é recusado

**Observação reproduzida.** `BUDGETS.json` configura `residual_slope` com unidade `bytes/minute`, máximo zero e perfil P3. O avaliador permite valores negativos apenas para `MiB/min` e `bytes/min`. A grafia configurada não está entre elas.

Com os demais registros de P10 válidos e pares sintéticos completos:

| Slope candidato | Resultado atual |
|---|---|
| −1.000 bytes/minute | FAIL: negative measurement invalid for nonnegative unit |
| 0 bytes/minute | PASS |
| +1 byte/minute | FAIL pelo máximo zero |

Uma redução de memória não deveria ser recusada como medida impossível. Além da inconsistência de unidade, exigir slope exatamente nulo sem tratar ruído cria um critério frágil para medições reais.

**Correção mínima.** Tipar slope como grandeza assinada e normalizar a unidade no registro existente. Definir a janela, settle e tolerância de ruído a partir das medições; preservar o limite de memória residual e a proibição de crescimento sustentado. Não arredondar artificialmente para zero, apagar outliers ou aumentar o budget para obter PASS.

**Axiomas de aceite da correção.**
- **DoD:** o caso decrescente válido passa e a mensagem errada de unidade desaparece.
- **Invariants:** crescimento sustentado incompatível com os limites continua reprovando.
- **Quality standards:** unidade única, sinal permitido por tipo de métrica e ruído explicitado.
- **Completeness criteria:** casos negativos, zero, positivos, NaN, ruído e amostragem insuficiente.
- **Success criteria:** o gate distingue vazamento/crescimento de estabilidade ou redução legítima.

### PA-05 — “Abaixo de 50 ms” não significa “sem regressão”

**Observação reproduzida.** As regras de P03 são somente absolutas, embora o avaliador receba baseline e candidato pareados. Um conjunto sintético coerente de cinco pares e 200 observações por variante foi aceito com:

| Métrica | Baseline | Candidato | Resultado |
|---|---:|---:|---|
| Input p95 | 8 ms | 49 ms | PASS |
| Hot-tab | 10 ms | 90 ms | PASS |
| Feedback | 8 ms | 40 ms | PASS |

No input, 49 ms é 6,125 vezes 8 ms. O controle com input de 51 ms é reprovado. **Não há erro de aritmética nesse caso:** o avaliador está obedecendo ao contrato absoluto; o contrato é insuficiente para preservar uma aplicação originalmente mais rápida.

**Correção mínima.** Métricas interativas críticas devem atender ao SLO absoluto **e** a um limite de regressão pareada, com piso absoluto de ruído para não punir oscilações insignificantes. Calibrar esse piso no hardware real, sem reduzir a exigência por conveniência. Não aprovar 8→49 ms apenas por permanecer abaixo do teto. O comparador já aceita regras combinadas; não exige outra biblioteca.

**Axiomas de aceite da correção.**
- **DoD:** a política combinada recusa o contraexemplo sem relaxar o teto absoluto.
- **Invariants:** baseline lenta não permite UX ruim; baseline muito rápida não reprova ruído irrelevante.
- **Quality standards:** comparar mesma carga/capacidade/build de produção, ambiente e instrumentação.
- **Completeness criteria:** melhoria, pequena oscilação, regressão material abaixo do teto, violação absoluta e ruído inconclusivo.
- **Success criteria:** desempenho bom é preservado, não apenas contido num limite amplo.

### PA-06 — Matriz extensa não garante cobertura dos consumidores certos

**Observação reproduzida.** O gerador usa registros `ui-surface` atribuídos ao owner. Na fonte atual, três tasks com visual obrigatório geram **zero entradas de cobertura esperadas**: `S03-W1-T2`, `S20-W1-T2` e `S20-W2-T2`. Os registros desses domínios são âncoras de leitura, não seus consumidores visuais.

Uma sonda exclusiva de `validate_captures` para `S20-W1-T2` aceitou um PNG sintético válido de 128×128 com superfície não relacionada. A mesma sonda em S24 foi rejeitada por omitir as 580 entradas esperadas. **Não é prova de bypass do recibo completo, do censo ou do aceite final.** S01 ainda pode corrigir esse mapa; a revisão indica precisamente o contrato que precisa ser fechado antes de consumi-lo.

S24 e o fechamento S25 requerem 580 entradas para 53 superfícies. Isso não implica 580 imagens distintas nem repetir a captura inteira duas vezes: uma captura real pode cobrir vários elementos visíveis, e provas do mesmo candidato podem ser reutilizadas. O problema é ter cobertura volumosa em geral e vazia onde um consumidor específico precisa ser observado.

**Correção mínima.** Associar tema e governança a consumidores/estados reais: primeiro paint, troca de tema, unavailable/HOLD, requisição, erro e decisão quando a capacidade existir. Categoria obrigatória sem expectativa precisa reprovar ou ter delegação explícita a uma prova real de consumidor. Organizar a matriz por cenários e risco; não adicionar um produto cartesiano indiscriminado de screenshots.

**Axiomas de aceite da correção.**
- **DoD:** cada categoria visual obrigatória tem consumidores/casos verificáveis ou delegação rastreável.
- **Invariants:** fonte ausente não vira funcionalidade; imagem gerada não vira captura do produto.
- **Quality standards:** cobertura testa comportamento/estado pertinente e reaproveita a mesma captura quando legítimo.
- **Completeness criteria:** remover consumidor/estado necessário reprova; evidência não relacionada reprova; cenário íntegro passa.
- **Success criteria:** a prova cobre o que o usuário opera, sem campanha inflada e lacunas silenciosas.

## Como executar com menos engenharia de processo

Não recomendo outra arquitetura de UI, mais épicos, centenas de novos critérios ou outro motor de workflows. Manter os cinco axiomas, tornando-os concisos, específicos e avaliados no estágio correto.

A sequência recomendada usa os mesmos responsáveis:

1. Censo do checkout e contrato mínimo: dados, eventos/props, slots e fronteiras; baseline de medição criada uma vez por ambiente/candidato de referência.
2. Tema/base visual e assets oficiais; bridge Dock e Tasks data podem avançar sem esperar traduções completas. Componentes compartilhados têm contrato estabilizado e writer único.
3. Piloto S25 conectado e priorizado. Não esperar migração de configurações/Janitor; não chamar Storybook de piloto operacional.
4. Frentes de implementação disjuntas com no máximo quatro ativas inicialmente. Keys de tradução necessárias são preparadas cedo; auditoria completa é de aceite. Integrações pequenas no writer existente, não branches isoladas por semanas.
5. Cada mudança faz seus testes locais, typecheck, inspeção visual pertinente e revisão. Medição quantitativa reserva a máquina apenas na coleta; não enquanto o agente escreve o parecer.
6. Candidato integrado: comportamento, acessibilidade, visual, performance e native exigidos sobre a mesma identidade de build. Pai agrega a prova já válida, sem obrigar repetir o mesmo trabalho. Mudança posterior relevante invalida as verificações atingidas.

Nenhuma dessas recomendações autoriza medir com o host ocupado, ignorar alteração em contrato, remover testes negativos ou fabricar PASS. Elas retiram espera e duplicação, não rigor.

## Performance do produto: onde investir primeiro

A leitura de `packages/app/src/pages/session/tasks-data.ts` em `bde9005...` mostra `taskParts` percorrendo mensagens/parts e `childStats` percorrendo o histórico de cada child durante a derivação dos cards. É um alvo concreto de perfil: medir quantas entidades e partes são visitadas ao alterar um único child. Não medi seu custo em milissegundos, nem afirmo que todo evento invalida todos os memos.

A timeline já importa `createVirtualizer`, mantém projeção própria e cache de medição. Não substituir essa estrutura por outra lista virtual, novo estado global ou renderer paralelo para uma migração visual. Provar a atualização incremental e a estabilidade da rolagem com as ferramentas existentes.

O caminho recomendado é CSS/tokens sem efeitos recorrentes; derivados granulares e limitados por identidade; cancelamento de trabalho obsoleto; lazy loading no ponto necessário; nenhuma nova view/browser por card; zero polling cosmético. Worker/cache adicional só depois de um trace mostrar a necessidade e o custo de memória. Performance não justifica relaxar a sandbox ou ampliar permissões.

A orientação oficial do Electron prioriza profiling e a remoção dos gargalos medidos; a documentação do Solid descreve reatividade granular e memos que atualizam conforme as dependências. Nenhuma dessas propriedades torna um aplicativo automaticamente rápido. Fontes primárias: [Electron performance](https://www.electronjs.org/docs/latest/tutorial/performance) e [Solid fine-grained reactivity](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity).

**“SOTA” é a direção de engenharia, não uma certificação produzida pelo plano.** O aceite precisa demonstrar responsividade de cauda, startup, CPU em idle, memória estável, rolagem e custo nativo sob a carga-alvo real; ser o melhor entre produtos exigiria ainda uma comparação controlada, que esta revisão não executou.

## Ordem de reparo e reauditoria

Primeiro PA-03/PA-04, que tornam o aceite contraditório ou incorreto; depois PA-05 e os níveis de medição de PA-01; então PA-02 e PA-06. Aplicar aos owners e aos arquivos atuais, regenerando projeções e reconciliando os tickets existentes. **Não abrir outro programa de planejamento.**

Antes de aprovar, repetir as sondas com expectativas corrigidas, preservar os controles que já reprovam dados acima do teto/cobertura incompleta, e demonstrar uma caminhada censo→piloto→frentes→integração→reparo→gates sem uma task exigir seu consumidor futuro. A aprovação do plano corrigido continuará distinta da aprovação do produto.

## Reproduzir

A partir de `specs/orchestra-visual` na revisão auditada:

```sh
python3 reviews/parallelism-performance/audit.py \
  --package . \
  --out /tmp/orchestra-parallelism-review-new.json
```

O arquivo de saída deve ser novo. O script documenta o comportamento da versão auditada e contém assertions dos contraexemplos observados; depois dos reparos, esses resultados devem ser convertidos em regressões de expectativa correta, sem falsificar este registro histórico. Ele não altera `progress.json` e não concede PASS a nenhuma task real.

Resultados resumidos: [RESULTS.json](RESULTS.json). Os cinco axiomas de cada correção acima são condições de reavaliação; **as correções permanecem propostas, não implementadas por esta revisão**.
