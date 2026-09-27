# Fechamento de widgets — revisão do contrato 4.3

**Escopo desta entrega:** decisões de produto, fronteiras de frontend, consumers de cobertura, critérios e navegação para execução pelo Codex. Não é implementação da interface. Revisão feita pelo mesmo assistente em passagem distinta, sem auditor externo.

## Decisões e fontes

WIDGETS.md fecha nove seções e28cenários de produto: checklist de todowrite, revisão de arquivos, evidência de testes, quatro panes do Dock, Tasks, Atividade, ações de conclusão, atalhos de features e microacabamento/custo integrado. As fontes foram lidas no commit `bde9005056e17d6495ce1270a2f25ca811b69e43`; a tabela do contrato aponta para arquivos e símbolos concretos, não para nomes de módulos presumidos.

Descobertas que mudaram as decisões:

- Todowrite já existe e retorna metadata.todos. SessionTodo.Info não tem ID nem timestamp individual. O checklist usa snapshots qualificados, distingue input proposto de confirmação e não transforma completed em prova independente.
- Shell retorna output e metadata.exit/truncated/outputPath. metadata.output é preview. O parser inicial reconhece somente o rodapé Bun elegível com fixtures da versão do repo; outros comandos têm output-only final e honesto. “Arquivos executados” não é “arquivos aprovados”.
- O caminho session.shell observado não aceita workdir. Repetição não fabrica `cd`, altera quoting ou usa PTY para bypass: confirma comando/contexto compatível; fora disso oferece copiar/abrir terminal com razão explícita.
- Create PR é handoff assistido e revisável no composer, sem rede, commit, push ou publicação ao clicar. Isso evita criar mais um login/cliente GitHub só para a faixa de ações. O label/tooltip explicita o efeito.
- AppsPanel já possui Hide/Select/CloseTab e eventos. Pane switch preserva controller/tab/profile; Docs é documentação local lazy, Terminal usa o PTY atual e não nasce automaticamente.
- Janitor reportnull não comprova ausência de problemas e abrir o resumo não pode montar PocketChat. Atividade distingue fonte de janela/servidor e não apresenta browser/scanner como agente.

## Mudança no plano, sem outro programa

Mantidos143nós,4frentes,10issues,25subissues,38WPs,66tasks e1.974IDs de critérios. Todos os cinco grupos de axiomas continuam explícitos. Cada unidade afetada recebe as seções Wxx e cenários WKxx pertinentes e as obrigações no estágio correto. As projeções dos39tickets são regeneradas da mesma fonte.

Nenhuma aresta de dependência, prioridade do piloto, gate de performance/nativo, lease de codegen, estágio de critério ou budget foi alterado. O piloto permanece com11pré-requisitos e56combinações de captura. Novos estados finais de Tasks não foram herdados acidentalmente pelo piloto: os bindings congelam seu escopo mínimo existente.

Permissão adicional de S01 é limitada à correção de bindings em WIDGETS.md, preservando semântica/autoridade. As demais permissões de arquivo que faltavam foram acrescidas: use-session-commands.tsx e teste para S25; teste de orchestra-activity para S18. Não houve permissão transversal de backend. Fontes de SDK/protocolo permanecem read-only fora das W2 existentes. Os seis consumers adicionados são checklist, Atividade, Files, Docs, Terminal no Dock e faixa de ações; UI56 permanece fonte de dados, não uma superfície visual.

## Revisão adversarial da própria correção

1. Um primeiro patch desativaria guards4.2 por mudar o número da versão. Os guards de quiet-host/tier, marca e cobertura foram explicitamente preservados para4.3; teste negativo verifica reserva indevida da máquina.
2. O primeiro patch de catálogo de widgets quebrava a resposta de erro para SURFACES com shape inválido. Um teste adversarial existente falhou; a validação de shape foi corrigida sem remover o teste.
3. Uma instrução adicionada a S23-T1 usava “medir” quando a task só prepara a coleta. Foi corrigida para preparar instrumentação; S23-T2 conserva a campanha, e o teste específico evita essa regressão.
4. O fixture antigo dizia filesPassed e exibia Janitor idle sem relatório. O fixture novo permanece explicitamente sintético, com filesExecuted, shape real do checklist e sem row de saúde fictícia. Nenhum comando da fixture é executado pelo carregamento.
5. Novos consumers não são considerados existentes/ligados só porque têm filename. As capturas exigem os estados; a leitura de fontes permanece separada de runtime proof. Os22testes novos verificam contratos/cobertura, não WK01–WK28 no produto.

## Evidência e reprodução

Localmente passaram211testes disponíveis (os189de core/PA mais22novos). Os13testes de navegação já existentes no repositório não estão na cópia local derivada do ZIP; a publicação deve executar a suíte completa no checkout real do GitHub antes de afirmar o total remoto. Use o relatório `QA-GITHUB.json` para o resultado efetivo, não uma soma presumida.

```sh
# CWD: specs/orchestra-visual no checkout
python3 tools/verify_brand.py
python3 tools/validate_plan.py
python3 tools/render_maps.py --check
python3 tools/render_issues.py --check
python3 -m unittest discover -s tools -p 'test_widget_contracts.py' -v
python3 -m unittest discover -s tools -p 'test_*.py' -v
```

A revisão preserva master e kit byte a byte. A fixture muda somente para expressar os novos contratos e invalida provas dependentes antigas; nenhum recibo real foi reetiquetado. product_execution permanece NOT_RUN. Não houve frontend, build, benchmark de Orchestra, Electron, chamada de modelo ou teste de permissões reais nesta entrega.

S01 ainda verifica o checkout e as fontes; S02/S11 capturam exemplos reais do Bun; a implementação posterior mede budgets no hardware do usuário. Esses passos são verificação de bindings já decididos, não autorização para deixar Docs/PR/checklist/Atividade sem definição. Nenhuma decisão de UI exige construir infraestrutura nova de backend nesta revisão.
