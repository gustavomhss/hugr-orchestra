# PERFORMANCE — contrato P01–P12

Status: objetivos de engenharia propostos em resposta à exigência explícita do usuário. Não são medições existentes nem promessa de resultado já alcançado. Gates valem no perfil/hardware congelado em S02. Nenhuma execução ou medição do produto foi feita na preparação desta revisão; o hardware-alvo deve ser registrado na execução local.

## Regras

- Medir build de produção. Vite dev/HMR e tracing invasivo não são o baseline de release.
- Usar a suite `packages/app/e2e/performance` existente. Hoje ela é diagnóstica, manual e não reprova por budgets de máquina; S02 adiciona comparação/threshold no escopo Orchestra. Não alterar os benchmarks atuais para chamá-los falsamente de gates.
- Comparar base/head no mesmo hardware, energia, runtime, viewport, fixture, cache profile e capacidade. Rede/modelo remoto não entram na latência da UI.
- Guardar JSON bruto e denominador; p95/p99 de amostras, não “média parece boa”. Alternar A/B e repetir 5 pares de runs; startup pelo menos20 observações por variante e latência de interação pelo menos200. Identificar cold/hot separadamente.
- Não apagar outliers sem causa documentada. Ambiente ruidoso invalida a rodada, não muda o budget. Regra relativa considera a dispersão: usar margem de confiança bootstrap ou mediana dos deltas pareados; não escolher o melhor run.
- Nada de “60 fps comprovado” a partir de RAF gaps. São sinais do main thread, não dropped frames do compositor. Usar tracing nativo quando a afirmação exigir compositor/processos.
- Uma regressão dentro do cone desta migração deve ser corrigida. Baseline já ruim não aprova UX ruim: SLO absoluto continua FAIL; registre/remedeie o hotspot com dono, sem ampliar silenciosamente o projeto inteiro.

## Cargas

| Perfil | Carga reproduzível |
|---|---|
| P0 | Janela estável, sessão carregada, zero tarefa ativa, sem browser externo. Coleta de idle por60s após60s de settle. |
| P1 | 8sessões×8subagentes; sessão ativa com10k mensagens/50k parts;100eventos/s em batches controlados; uma aba Dock com página local de fixture permitida. Input, seleção, permissões, troca abas e resize continuam disponíveis. |
| P2 | Stress separado:1000 arquivos alterados, diff100k linhas,1000 modelos, log10MiB, rajada200events/s por10s. Não precisa exibir todo conteúdo; precisa virtualizar/truncar honestamente e recuperar. |
| P3 | Soak30min;50ciclos de sessão/overlay/profile/resize/close; mesmo número final de views e dados. Medir5min idle apóssettle/GC instrumentado em teste. |

## Budgets

| ID | Objeto | Limite de entrega | Prova |
|---|---|---|---|
| P01 | Peso incremental | JS inicial gzip<=+60KiB; CSS<=+12KiB; nenhuma nova dependency runtime; assets decorativos<=300KiB total; decode de decoração<=4MiB/janela | Manifest de bundle/asset sizes comparado à base |
| P02 | Startup | Primeira UI estável do renderer p95<=1500ms em cold local e regressão pareada<=5% ou50ms, o maior; boot nativo separado<=5% ou100ms | Cold/hot em build release; rede/provider separada |
| P03 | Resposta local | Keydown->paint p95<=50ms/p99<=100ms P1; hot-session-tab->conteúdo correto p95<=100ms; menu/input feedback<=50ms | Timing de evento e marcador de paint, identidade do conteúdo validada |
| P04 | Streaming/main-thread | p95 callback RAF gap<=20ms e p99<=50ms no perfil60Hz; zero nova long task>100ms atribuível à camada visual em janela10s; scripting<=8ms/frame p95 | Chrome trace e coleta longa; rotular RAF como diagnóstico |
| P05 | Custo incremental | Um delta não rescaneia transcript completo ou todas sessões; nenhuma remontagem de mensagem não alterada; limite de recomputações instrumentado por ID | Probe de dirty keys e contador de renders/projeções |
| P06 | Trabalho pesado | Diff/markdown/highlight/network snapshot só por alteração/seleção; cancelar stale request e não aplicar resultado de revisão anterior | Profiler + teste de inversão de resposta e artefato grande |
| P07 | DOM/caches | Montar só janela visível+overscan; aumento10× de histórico não aumenta DOM montado>20%; caches bounded com eviction explícita, nenhum Map sem lifecycle novo | DOM counts/heap/read-model inspection em P1/P2 |
| P08 | Idle | Zero polling/timers/processos novos para cosmética; ticker único<=1Hz somente com item live visível; listeners/observers removidos no unmount; CPU incremental P0<=1 ponto percentual de um core | Inventário timers/listeners e cpu attribution com engine idle |
| P09 | Dock/native | Nenhuma view/browser session extra por card, tema ou layout; sem snapshots/capturas periódicas; bounds<=1 update efetivo/frame e apenas em mudança; cap20inativas não cresce | Electron process/view counters, resize/overlay native tests |
| P10 | Memória | Heap estabilizado incremental<=20MiB e RSS do grupo shell<=+32MiB ou+10%, o maior; após50ciclos crescimento residual<=5MiB e sem tendência crescente; páginas externas contabilizadas separadamente | Heap/RSS before-after e slope; não somar memória de site como tema |
| P11 | Observabilidade | Medição ausente, ambiente incompatível ou sample insuficiente produz NOT_RUN/FAIL; nunca PASS; comandos sem screenshot/proof não comprovam polish | Mutação dos registros e gate de schema |
| P12 | Igualdade do produto testado | Mesmos assets, efeitos, funções e build na comparação visual e no benchmark; sem benchmark-only fast path | SHA/bundle hash + revisão de flags |

Percentuais relativos não substituem SLO absoluto. Os limites são defaults do plano: alterações exigem decisão explícita com medição e justificativa, não ajuste automático pelo agente para passar.

## Estratégia antes de otimizar

1. Não introduzir custo: tema por CSS, eventos existentes, DOM virtualizado, imports lazy, assets estáticos.
2. Medir e atribuir custo à mudança: diff de callbacks, layout/paint, sync IPC e hierarquia de subscribers.
3. Reduzir recomputação e subscriptions por entidade. Não trocar tudo por cache global nem workers por reflexo.
4. Se parsing pesado já usa worker, reutilizar. Novo worker só quando perfil prova necessidade e não duplica memória sem budget.
5. Respeitar reduced-motion; transições120/180ms não podem animar width/layout/blur. Em resize, atualizar geometria diretamente.
6. Corrigir hotspots no owner original; S23 mede e reprova, não faz refactor cruzado de todo repositório.

## Fontes verificadas

- `packages/app/e2e/performance/README.md` em `30d951f...`: suite manual de produção, perf diagnóstica, RAF não comprova compositor.
- `packages/app/src/pages/session/timeline/message-timeline.tsx`: virtualizer/projection/measurement cache já existem.
- `packages/desktop/src/main/app-dock.ts`: partitions, throttling, cap de inativas e lifecycle já existem.

Nenhum desses fatos prova que os budgets acima já são atendidos.

## Avaliador quantitativo v4

BUDGETS.json é o registro quantitativo usado pelo tooling. tools/evaluate_performance.py já implementa avaliação determinística; S02 implementa a COLETA sobre a suíte do aplicativo, não outro avaliador manual. tools/validate_evidence.py recalcula o relatório de cada categoria performance PASS.

Método: percentil nearest-rank no conjunto de observações; limites relativos sobre mediana dos deltas pareados; cada par guarda ordem AB/BA e amostras de ambas variantes. Exigir cinco pares, vinte observações de startup por variante e duzentas de interação por variante. Nenhum resultado acima do teto ou par discordante é aprovado: discordância que impedir conclusão vira INCONCLUSIVE dentro da métrica e reprova o gate até nova rodada. Não alegar intervalo de confiança estatístico calculado quando só houve essa regra conservadora.

O registro contém unidades, janela/perfil, ambiente, versão do avaliador, hash de budgets, baseline/candidato e manifesto de build. Registrar OS/arquitetura/CPU/RAM/runtime/DPR/viewport/energia/cache/tracing. Rede e modelo remoto não entram na medida da interface. Bruto ausente, NaN/Infinity, ambiente diferente, perfis alterados ou pouca amostra reprovam.

Hash de build deve ser calculado pelo produtor a partir dos artefatos de produção ordenados (path+hash de conteúdo). Não usar título de PR ou SHA de código como substituto da identidade dos artefatos compilados. Mesmo build deve ser capturado e medido. Esse vínculo não autentica logs: revisão compara os manifests e comandos reais.

Memória separa heap JS, RSS shell/main e páginas externas. Registrar memória compartilhada, settle e GC instrumentado; incluir observação sem GC forçado para não esconder crescimento normal. CPU idle usa denominador explícito de um core. RAF gaps são diagnóstico do main thread, não prova de frames apresentados.

Fixtures de tools/test_support.py são sintéticas e servem somente aos testes do avaliador. Não as registrar como benchmark do produto. O exemplo exato do formato e os comandos estão em RECEIPTS-v4.md e tools/README.md.
