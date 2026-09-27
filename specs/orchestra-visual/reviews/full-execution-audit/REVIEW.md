# Revisão adversarial integral — execução, paralelismo e aceite

**Parecer: manter a arquitetura, a direção visual, os widgets e os responsáveis. Corrigir as bordas de validação abaixo antes de tratar o fluxo como autoaprovável; a PR #232 não está aprovada para merge por esta auditoria. O censo S01 pode ser iniciado com as raízes publicadas preservadas e revisão humana/agente real.**

Esta é uma revisão, não uma v4.4 nem uma declaração de implementação. Não altera PLAN, budgets, assets, dependências ou progresso. As correções continuam propostas. Não cria épicos, WPs, widgets ou um novo scheduler.

[Épico #215](https://github.com/gmhelmold/HuGR-Orchestra/issues/215) · [PR #232](https://github.com/gmhelmold/HuGR-Orchestra/pull/232) · [Resultados estruturados](RESULTS.json) · [Reprodutor](probes.py)

## O que foi realmente examinado

Plano e ferramentas fixados em `3c97621681b119105be8b7982ba663b0d701fd83`, contrato 4.3. Fontes de produto consultadas em `1a235323361717d13a44d3c184bad13649f59e60`. Snapshot programático obtido pelo próprio GitHub: pacote completo com 506 arquivos, árvore Git completa e 4.771 arquivos UTF-8 selecionados do produto. Ter esses arquivos disponíveis não significa que cada linha do monorepo recebeu revisão manual.

A revisão cruzou todos os 143 nós, os cinco grupos de axiomas, o DAG das 66 tasks, scopes e leases, tickets/relacionamentos, WIDGETS, SPEC, CONTRACTS, budgets/cobertura, executor, censo, atribuição Git, recibos e seletor. A leitura de código de produto foi focalizada nas fontes e fronteiras relevantes; não foi uma auditoria completa do motor de agentes. O mock foi aberto visualmente e seu hash conferido.

Os 248 testes existentes passaram de novo no checkout do GitHub e localmente. Sondas separadas exercitaram entradas defeituosas em cópias e repositórios Git temporários. Nenhuma prova sintética foi inserida no progresso real. Não foi iniciado o Orchestra, instalado novo runtime, medido o Mac, executado Electron ou rodado benchmark de interface. A leitura de uma CI existente é distinguida de um novo teste do produto.

Revisão feita pelo mesmo assistente em passagem adversarial distinta, não por auditor externo independente.

## Resultados positivos — não reabrir estas decisões

- Os 39 corpos canônicos estão contidos integralmente nos tickets correspondentes. Foram lidos 40 tickets com o épico principal, 39 vínculos pai/filho e 59 dependências, sem divergência em relação à projeção desejada.
- Os 505 arquivos listados no manifesto original tiveram hashes corretos; nenhum arquivo do pacote ficou sem inventário. O master mantém `e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d` e a marca continua íntegra.
- Os 1.974 IDs de critérios e cinco grupos por nó permanecem. O estágio errado de uma task continua sendo recusado. Não encontrei um novo ciclo na configuração publicada e não reapresento o PA-03 anterior como se ainda estivesse aberto.
- Nos 1.009 pares sem precedência transitiva, incluindo confronto com caminhos da árvore de fonte, a única colisão declarada é S19-W2-T1/S20-W2-T1, protegida pelo lease de codegen. Isso não certifica independência de comportamento de todos os componentes.
- O piloto mantém 11 pré-requisitos. Uma caminhada sintética com falha e repetição de S23 percorreu as 66 tasks. Ela não mede duração, utilização ou speedup real; não modela o tempo da coleta exclusiva.
- P03 agora recusa o controle 8→49 ms. Preservação de arquivos, source stale no seletor, categorias obrigatórias, consumidores visuais e gates finais continuam protegidos pelos controles existentes. Não é necessário trocar a stack, a virtualização, o browser ou a persistência.

## Achados e prioridades

| ID | Natureza | Prioridade | Local principal |
|---|---|---|---|
| EX-01 | Censo pode validar cobertura vazia ou estreitada | Alta, antes do aceite S01 | `tools/census.py:8–34` |
| EX-02 | Validação direta não distingue atualidade do candidato de atribuição histórica | Média, antes de automatizar encerramento | `tools/source_proof.py`, `validate_evidence.py`, `select_work.py` |
| EX-03 | Aplicação/estágio de axioma ancestral pode mudar sem validar ou vincular a prova | Média, endurecimento do contrato | `effective_contract.py:23–28`, `validate_plan.py`, `executor.py` |
| H-01 | Evidência explicitamente sintética não é recusada na fronteira de submissão | Reforço antes de aceite de produto | `validate_evidence.py` / modo de submissão |
| E-01 | Hash integral de WIDGETS invalida frentes não relacionadas | Eficiência; não bloqueia descoberta | `effective_contract.py:34–36` |
| CI-01 | Guard Atlas da PR falhou por procedência não alcançável | Bloqueador de merge, não regressão visual | `foundation/atlas/OWN-SNAPSHOT.json` |

### EX-01 — O censo pode ser aprovado por não procurar nada

`discover` depende diretamente de `scan_roots`, e `check` valida apenas o universo devolvido por essa varredura. Não existe verificação de que as raízes mantêm o escopo obrigatório da migração.

Em Git temporário com `packages/app/src/app.tsx` realmente rastreado:

| Configuração | Resultado de `check` |
|---|---|
| Raízes publicadas, arquivo sem classificação | Reprova corretamente |
| `scan_roots: []`, `files: []` | Nenhum erro |
| Raiz inexistente | Nenhum erro |
| Mesmas raízes com `/` final | Nenhum erro: o prefixo testado ganha `//` e não encontra os arquivos |
| Raízes normais e classificação correta | Nenhum erro, controle positivo |

O caso de barra final é especialmente relevante: não depende de alguém tentar burlar o plano. Uma normalização comum de caminho já produz uma cobertura vazia. `--census-strict` usa essa função; registrar arquivos/classificações não fecha esse buraco se o universo pesquisado foi reduzido.

**Correção mínima:** normalizar caminhos, validar lista não vazia e cobertura das raízes obrigatórias, recusar raiz inexistente ou estreitamento silencioso. Exceções de escopo continuam explícitas por arquivo ou por decisão revisada; não aumentar o projeto além das superfícies contratadas.

**DoD:** os três negativos reprovam e a classificação correta passa. **Invariants:** descoberta não modifica fonte nem transforma ausência de busca em ausência de UI. **Quality standards:** paths canônicos, cobertura declarada confrontada com Git e diagnóstico acionável. **Completeness criteria:** lista vazia, raiz errada, barra final, raiz obrigatória retirada, UI nova e censo válido. **Success criteria:** S01 não pode ficar verde simplesmente porque deixou de olhar a aplicação.

Responsável de contrato: S01/#144; reparo concentrado no censo/validador existente. Não exige outro crawler ou serviço.

### EX-02 — O mesmo recibo é aceito diretamente e recusado ao retomar

A função de footprint comprova a atribuição BASE..HEAD do recibo e preservação do trabalho do usuário. Já a compatibilidade desse HEAD com alterações posteriores é conferida separadamente por `source_errors` no seletor.

Reprodução em repositório temporário:

1. Criar baseline, alterar `tasks-data.ts` no scope de S17, commitar e gerar recibo sintético coerente.
2. A validação direta com `--repo` aceita a atribuição dessa revisão.
3. Fazer outro commit limpo modificando o mesmo arquivo.
4. A validação direta ainda aceita. O seletor recusa com `STALE: relevant source changed since verification`.

**Não é um bypass do seletor:** `resume`/`select` fazem a recusa correta. O problema é operacional: a CLI direta chama a fonte de verificada, mas não distingue prova histórica de prova compatível com o candidato atual. Um executor que siga somente o comando de validação do recibo pode interpretar esse PASS como autorização de fechamento.

**Correção mínima:** reutilizar a checagem já existente de atualidade na entrada de submissão, ou retornar campos/status explicitamente diferentes para atribuição histórica e frescor do candidato. Não criar outra implementação concorrente da mesma política. Preservar exceções legítimas de marcos históricos e mudanças não relacionadas.

**DoD:** a validação de aceite e a retomada concordam sobre fonte atualizada. **Invariants:** prova histórica não é apagada nem reetiquetada; histórico válido não equivale a candidato atual. **Quality standards:** um único caminho de decisão e identificação explícita da revisão. **Completeness criteria:** alteração relevante commitada, dirty relevante, documento não relacionado e marco histórico. **Success criteria:** o executor não recebe dois significados incompatíveis de PASS.

Responsável: tooling de evidência/S02 e integração/aceite S25. Não mudar o critério de performance ou afrouxar o seletor.

### EX-03 — Metadados de aplicação dos axiomas ancestrais ficam fora da checagem efetiva

O pacote por task apresenta `axiom_application` e `criterion_evaluation_stage` dos ancestrais. Porém o manifesto efetivo inclui do ancestral os textos de invariantes/qualidade e dependências, não esses metadados. O validador aplica a regra de estágio aos nós task, não aos agregadores.

Na cópia sintética do plano, alterar `S25.axiom_application` para exigir encerramento antes do produtor e inserir uma etapa ancestral `NOT-A-VALID-STAGE` não gera erro; o digest efetivo de `S25-W1-T1` permanece igual. Em contraste, mudar o estágio da própria task para o avaliador futuro é corretamente recusado.

**Qualificação importante:** não encontrei esse estágio inválido no plano publicado. A sonda demonstra uma lacuna na proteção contra regressão e na consistência entre o contexto mostrado ao LLM e o contrato vinculado à prova. Não estou alegando outro ciclo textual atual.

**Correção mínima:** usar uma política única e validada de aplicação dos axiomas; vincular ao digest os campos ancestrais que o executor consome e recusar IDs de estágio inválidos. Pode-se manter o texto convencional existente com regra tipada/constante; não é necessário construir um analisador semântico de prosa.

**DoD:** a mutação de etapa/aplicação é recusada ou altera a identidade do contrato de modo explícito. **Invariants:** encerramento de pai nunca vira pré-requisito de seu produtor. **Quality standards:** contexto e prova consomem a mesma autoridade. **Completeness criteria:** etapa inexistente, etapa futura, alteração de aplicação e controle de task já protegido. **Success criteria:** mudar a regra que o LLM deve obedecer não mantém uma prova antiga silenciosamente válida.

### H-01 — Uma fixture declarada não deve entrar como prova de produto

As bibliotecas de teste precisam aceitar números/imagens sintéticos para testar formatos e gates. Isso é correto. Entretanto, a fronteira usada para validar recibos de produto não recusa sequer os marcadores explícitos `synthetic: true`.

Uma sonda de `S25-W1-T2`, com atribuição a um Git temporário real, relatório numérico sintético, manifesto de capturas sintético e log que diz `NOT product proof`, foi aceita estruturalmente por `validate_receipt(..., repo=...)`.

**Não é descoberta de fraude ou de um frontend falsamente aprovado no repositório.** As tasks reais continuam sem PASS. O sistema já informa que hashes não autenticam métricas e imagens. O reforço é mais limitado: impedir o reaproveitamento acidental de artefatos que se declaram exclusivamente de teste. Remover um marcador não autenticaria o restante; revisão e execução reais continuam indispensáveis.

**Correção mínima:** separar avaliação de fixture em teste da submissão de evidência de produto. Recusar marcas explícitas de teste/demo na submissão, mantendo os testes de baixo nível e sem adicionar servidor de atestação.

**DoD:** fixture declarada não entra no aceite de produto. **Invariants:** benchmarks do app podem usar dados de workload sintéticos; isso é diferente de inventar medições/capturas. **Quality standards:** classificar origem da evidência, não proibir fixtures de cenário. **Completeness criteria:** avaliador unitário continua testável; medições reais sobre fixture de cenário são aceitas; medições fabricadas marcadas são recusadas. **Success criteria:** o Codex não pode reutilizar por engano os arquivos de `test_support` como resultados reais.

### E-01 — A disjunção de arquivos ainda não é disjunção de revalidação

Modificar só a seção W07 em uma cópia de `WIDGETS.md` alterou o digest de **40 tasks**. **28 delas não têm W07 nas seções atribuídas**, incluindo trabalho de dados e marcos do piloto. A mutação de controle foi um comentário local; uma mudança semântica confinada à mesma seção tem o mesmo cone de hashing.

O mecanismo é conservador, não permissivo: ninguém ganha escrita indevida. Também não afirmo que 40 suítes precisem ser executadas de novo; provas precisam ser analisadas e reemitidas conforme o contrato. Ainda assim, esse acoplamento gera coordenação e reduz o benefício dos pacotes por task.

**Recomendação simples primeiro:** concluir S01, congelar as normas antes do trabalho paralelo e parar de editar documentos operacionais por estética durante a execução. Se uma mudança realmente necessária continuar provocando revalidação excessiva, delimitar WIDGETS pelos trechos comuns + seções atribuídas, usando a extração literal que já existe. Não introduzir compressão semântica, watcher, outro registry ou invalidação baseada em suposição.

**DoD:** alteração local tem impacto explicitado, sem reset indiscriminado. **Invariants:** norma comum ou contrato compartilhado alterado continua invalidando seus consumidores reais. **Quality standards:** identificadores estáveis e escopo determinístico. **Completeness criteria:** seção local, preâmbulo comum e dependência cruzada conhecida. **Success criteria:** frentes independentes não gastam a rodada inteira revalidando uma nota sem efeito em seu trabalho.

Isso é melhoria de eficiência, não motivo para adiar o primeiro censo em busca de um novo sistema perfeito.

### CI-01 — A PR tem uma falha real fora da reforma visual

No job Atlas `108568928270`, run `36301092484`, associado ao head auditado, falhou **Run Atlas guards**:

```text
own-snapshot-guard: FAIL
snapshot sourceRevision is not a Git commit reachable from HEAD:
508f7770901d8ba950ee403e198249140491e421
```

O checkout do job usa `fetch-depth: 0`; portanto o próprio log não sustenta resolver isso simplesmente aumentando fetch-depth. A mesma `sourceRevision` já está em `foundation/atlas/OWN-SNAPSHOT.json` na `dev` fixada em `1a2353...`. A PR documental não altera Atlas/Genesis. Trata-se de um bloqueio de procedência/herança da base, não evidência de que o tema ou os widgets quebraram o produto.

**Antes do merge:** o responsável por Atlas deve corrigir a procedência pelo fluxo real de geração/verificação e repetir o guard. Não trocar o SHA arbitrariamente para HEAD, não retirar o gate, não usar os 248 testes Python como substitutos. A auditoria não alterou esse arquivo nem fez merge.

**DoD:** CI do candidato correto passa com procedência verdadeira. **Invariants:** nenhum bypass de gate ou origem fabricada. **Quality standards:** distinguir falha herdada, regressão e cancelamento. **Completeness criteria:** conferir sourceRevision, ancestralidade, blobs e run posterior do guard. **Success criteria:** o planejamento é integrado à dev sem esconder um check vermelho.

## Simplicidade e performance — decisão final da revisão

Não recomendo mais épicos, camadas de estados, linguagens ou testes de forma apenas para aumentar um número. Há uma base útil, mas a parte operacional já é volumosa: os pacotes por task registrados variam de 22.398 a 101.397 bytes, mediana 60.493 bytes. São bytes de contexto, não tokens medidos. O tamanho maior pode ser legítimo para o integrador; não é um defeito de runtime do Orchestra.

A próxima redução deve ser de duplicação e procura: uma entrada operacional curta, leitura das normas atuais e histórico acessível apenas quando pertinente. Não cortar os cinco axiomas nem esconder decisões para prometer um pacote pequeno. Não gerar 66 cópias estáticas de documentos e não construir outro gerenciador para executar esse gerenciador.

A arquitetura de performance proposta continua adequada como direção: reutilização de virtualização/controllers, um read model de Tasks, atualizações por entidade, parsing após conclusão, caches limitados, sem polling cosmético, sem multiplicação de browser/PTY, e orçamento absoluto mais proteção contra regressão. **Nenhuma medição desta auditoria demonstra SOTA no produto.** A primeira prova real precisa ser do aplicativo bonito e completo, com as cargas e limites já definidos.

## Próximo passo delimitado

Corrigir EX-01 e alinhar a entrada de aceite EX-02; endurecer EX-03/H-01 nas funções existentes; resolver CI-01 na frente responsável. E-01 pode começar com congelamento disciplinado dos contratos, sem reescrever o tooling. Depois executar o ciclo real S01→S02→piloto, em vez de iniciar outra rodada ampla de planejamento.

A descoberta S01 não precisa esperar mudanças de layout, implementação de W2 ou alegações de runtime. A aceitação automática e o merge não devem ser tratados como concluídos enquanto estas ressalvas estiverem abertas.

## Reprodução e proveniência

Execute o reprodutor com o pacote auditado (ou com suas normas/ferramentas intactas) e saída nova:

```sh
python3 reviews/full-execution-audit/probes.py \
  --package . \
  --out /tmp/orchestra-full-audit-new.json
```

CWD: `specs/orchestra-visual`. O script faz mutações somente em cópias e repositórios temporários; não altera o plano/progresso real nem acessa GitHub. Ele reproduz o comportamento atual para documentar os achados; após reparos, as expectativas devem ser convertidas em regressões corretas, sem falsificar este relatório histórico.

[RESULTS.json](RESULTS.json) registra identidades, controles, integridade, grafo, evidência do CI e limites. A extração usou o [run de snapshot](https://github.com/gmhelmold/HuGR-Orchestra/actions/runs/36301357365) e a leitura de logs usou [run de evidência CI](https://github.com/gmhelmold/HuGR-Orchestra/actions/runs/36302162065). A primeira tentativa dessa leitura falhou no redirecionamento de log; a chamada foi corrigida para não encaminhar Authorization ao host de armazenamento. Isso não foi uma falha do produto nem uma mudança de seu CI.

Os workflows auxiliares de auditoria são temporários e não devem permanecer na entrega. O snapshot/relatório desta revisão não altera os contratos anteriores nem concede PASS a qualquer task real.
