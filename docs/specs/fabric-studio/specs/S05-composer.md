# S05 — Compositor Solid e continuidade da interação

**Estado:** proposta técnica; não congelada para implementação.
**Requisitos proprietários:** FS-UI-001–010; FS-HIS-001–002; FS-OPS-002

## 1 Responsabilidade e integrações

S05 instancia ferramentas Solid confiáveis a partir de S04, sem interpretar código nem criar executor/registry de autorização. Consome [CONTRACTS.md](./CONTRACTS.md), C01–C03/C06–C07, e as aceitações canônicas de [01-experience.md](../requirements/01-experience.md), [05-evidence-and-continuity.md](../requirements/05-evidence-and-continuity.md) e [06-ai-and-operation.md](../requirements/06-ai-and-operation.md). S02 fornece contexto; S06 recursos; S07 ativação/ResultHandle; S08/S09 confirmação/efeitos; S13 proteção e retenção. Não duplica seus contratos.

UI futura no chapter Fabric de `packages/app-shell`, com `createStore`, APIs i18n tipadas e carregamento lazy conforme Q05. A especificação visual autoritativa é `packages/app-shell/src/orchestra/DESIGN.md` no baseline: quiet glass, sem rim/sheen/grain, tokens apenas, uma ação primária saturada, sem glass sobre glass. Mocks e skills anteriores não a sobrepõem. Esta etapa não muda UI nem requer runtime/QA visual.

## 2 Contrato

### 2.1 Identidade e superfícies de estado

A entrada é ContextRef + WorkspaceRef + documento efetivo validado de S04; são os tipos de C01/C03, não outro DTO de montagem. O renderer resolve component ID/revision no registry Solid confiável. Tool ID identifica uma instância dentro desse espaço/contexto; nome, slot, posição, aba e seleção não são chaves de instância.

| Superfície | Forma/semântica proposta | Atualização permitida |
| --- | --- | --- |
| Composição durável | `layout.overrides` de S04: order/activeTab/sizes/collapsed/toolPins/resourcePins/locked | Candidato inspecionável; salvar por WorkspaceRef/expectedRevision, nunca por efeito de resize responsivo |
| Instância local | Store por tool ID contendo seleção tipada, foco/scroll, loading, ResultHandle vigente e geração de leitura | Estado efêmero, não serializado na declaração; C03/S07 governam fonte/resultados |
| Edição local | Buffer por tool ID + recurso original resolvido + revisão de definição original, marca dirty e recuperação | Escrita local protegida; nenhum autosave remoto; alteração de alvo não reaproveita buffer sujo |
| Proposta de organização | Base WorkspaceRef, documento candidato e diff de S04 | Aceitar/rejeitar/desfazer apenas composição; sem replay de ação Fabric |

Forma wire de preferências exemplificativa, subordinada ao schema de S04: `{"order":{"main":["editor"],"support":["results","schema"]},"activeTab":{"support":"results"},"sizes":{"main":3,"support":2},"toolPins":["editor"],"resourcePins":{"editor":"alvo"},"locked":true}`. `alvo` é alias a resolver, não referência autorizada importável. Nenhum desses campos armazena foco, dados, aprovação ou ActivationRef.

Instâncias ficam em hosts Solid estáveis por ID. Mover o host/painel não destrói o owner do editor/fonte nem troca a key por índice de lista. Trocar recipe muda arranjo, não instancia novamente ferramentas preservadas. Remover ferramenta é uma decisão distinta e, se dirty, exige conservar/descartar explicitamente antes de liberar seu buffer. Troca real de revisão incompatível do componente passa por proposta/migração S04, não por remount silencioso.

### 2.2 Contratos por requisito

| ID | Contrato específico |
| --- | --- |
| FS-UI-001 | Mover/redimensionar/recolher/trocar aba preserva owner/tool ID, buffer, seleção e estado da consulta. Hosts inativos podem pausar pintura, nunca refazer consulta por mount/foco. |
| FS-UI-002 | `toolPins` fixa presença/organização; `resourcePins` fixa alias de recurso revalidável e mostra que a ferramenta não acompanha a seleção ligada. Recurso fixado tem precedência explícita sobre binding; conflito fica visível, sem nova seleção global implícita. Editor dirty nunca retargeta, mesmo sem pin. |
| FS-UI-003 | `locked` impede rearranjo automático assistido; proposta continua revisável sem aplicação. Aceitar/rejeitar/desfazer manipula documento por CAS; inversão de layout não toca comandos/recibos. |
| FS-UI-004 | Layout compacto é projeção transitória de viewport, com abas/sheet quando os mínimos não cabem; retornar restaura os pesos/ordem/pins salvos. Só gesto explícito de salvar preferência altera revisão. |
| FS-UI-005 | Cada controle tem nome e caminho por teclado; menus oferecem mover/promover/recolher e splitters ajustáveis, sem exigir drag. Âncora de foco guarda tool ID + controle + item/recurso, não índice DOM. Fechar inspector/voltar retorna ao invocador; remoção usa vizinho pertinente ou cabeçalho da mesma ferramenta. |
| FS-UI-006 | Estado inclui texto e semântica; indicadores usam cor só como redundância. Mapa/gráfico expõe tabela/texto com as mesmas relações, cobertura e incertezas; ícones/abas/pins anunciam nome e estado. |
| FS-UI-007 | Copy, erro e label acessível passam por `language.t(...)`; contagem por `language.plural(...)`, sem montar gramática/selecionar locale na feature. Título do usuário é texto literal escapado. Tema/tokens e reduced motion preservam leitura e controles sem depender de animação. |
| FS-UI-008 | Seleção de leitura ancora em identidade estável da linha/chunk, revisão e offsets do texto escolhido. Append não reordena/muta o trecho; cópia usa os mesmos bytes selecionados, não índice visual. Não seguir tail enquanto há seleção; virtualização mantém a faixa acessível ou snapshot autorizado em memória. |
| FS-UI-009 | Assistência pode recolher/ocultar/restaurar sem remover ferramentas, buffers ou contexto. Seu controle de restauração é alcançável por teclado; esconder chat/atividade não esconde avisos obrigatórios. |
| FS-UI-010 | Confirmação é chrome/control confiável do app vinculado a contexto/efeito/revisão de S08/S09, fora da árvore de conteúdo remoto. Template não move/oculta avisos de destino, autorização ou unknown; botão desenhado por row/texto nunca confirma. |
| FS-HIS-001 | Ordem/abas/tamanhos/pins têm fonte única na revisão pessoal de S04. Autosave de composição, se solicitado, usa a mesma revisão/CAS; foco/scroll/loading não originam save nem reconciliam como preferência. |
| FS-HIS-002 | Autosave local cifrado de buffer dirty é visível e recuperável por sete dias de inatividade, conforme Q03; conservar no trabalho salvo é ação explícita. Recuperar mantém recurso/revisão originais e oferece revisar conflito; não grava remotamente nem muda alvo pelo nome. |
| FS-OPS-002 | Entrada Orchestra sem Studio não importa editores/drivers Fabric. Chapter e componentes usam loaders lazy; só componente necessário carrega editor pesado, só operação autorizada necessita driver server-side. Importar template não baixa executável ou cria bridge/processo. |

### 2.3 Layout, foco e seleção durante atualização

Recipes de S04 mantêm uma ferramenta principal ativa, uma aba de apoio ativa e inspector opcional; não há mosaico ilimitado. Mínimos vêm do registry/token atual. Quando não cabem, apoio/inspeção viram abas/sheet mantendo navegação e acesso a todas as ferramentas. Quantidade simultânea proposta: até três regiões de conteúdo, sem contar chrome/assistência; isso não altera o limite de ferramentas em abas. Breakpoints e orçamento final exigem prova, não números de mock.

Antes de aplicar um diff, capturar âncora de foco e verificar dirty/IDs removidos. Aplicar alterações de organização em lote no store; depois restaurar o controle/item correspondente se existir. Se não existir, escolher controle equivalente da mesma ferramenta e anunciar a mudança. Saltar ao início do chapter não é fallback aceitável. Atualizações de status usam anúncios resumidos, não leitura de cada linha que chega.

Append de logs/resultados preserva IDs e texto selecionado; ordenar/filtrar/substituir snapshot é ação distinta e não pode fingir continuidade de seleção. Caso retenção/revogação invalide o trecho, invalidar seleção com motivo e desabilitar cópia do payload indisponível; não copiar outra linha silenciosamente nem reter conteúdo contra S13. O caso normal de streaming deve preservar texto/rows para leitura/cópia, não só foco/índice/job ID.

## 3 Estados e falhas

Carregamento local: documento validado → loader necessário → ferramenta montada; falha no loader mantém documento/ID e informa indisponibilidade com próximo passo, sem componente genérico. Documento inválido segue S04 e não monta parcialmente. Disponibilidade conhecida bloqueada não impede ferramentas independentes válidas.

Editor: limpo → editar localmente → dirty → autosave local protegido ou memória com aviso → recuperação/revisão. Ao solicitar outro alvo enquanto dirty, conservar alvo/buffer e oferecer nova ferramenta ou decisão explícita sobre o rascunho; só depois resolver o novo recurso. Perda de acesso impede operações/dados novos; não converte nome semelhante em destino substituto.

Fonte: seleção requerida vazia → suspensa; compatível + ativação vigente → leitura por S07; contexto/argumentos mudam → geração invalidada antes de aceitar outra resposta. Reordenar, focar ou restaurar assistência não ativa/renova consulta. Resposta tardia exige correspondência do contexto completo de S04/S07, não somente resourceID.

Salvar organização: base atual → CAS → nova WorkspaceRef; conflito → preservar local/base/salvo e pedir reconciliação, sem last-writer-wins. Desfazer após save cria candidato contra revisão atual; com concorrência também exige reconciliação. Falha local de autosave mostra buffer ainda em memória e impede alegar recuperação durável.

## 4 Persistência e autoridade

S13 possui envelope cifrado/retention no Database Orchestra existente; S05 pede armazenamento local de buffer com ContextRef, tool ID e recurso original qualificados, não cria arquivo/banco paralelo. Sem proteção demonstrada, rascunho sensível fica só em memória, com aviso de perda ao fechar; isso bloqueia qualificação de recuperação, não é autosave cifrado simulado. Limpeza/revogação conhecidas obedecem S13, inclusive cópia de seleção em memória.

Trocar servidor/conta/contexto fecha acesso ao store da instância anterior e invalida gerações antes de montar o novo. Recuperação só após resolver owner/contexto atual; dois contextos sem Git, ainda com projeto global igual, não compartilham buffers ou preferências por implicação. Abrir revisão salva não restaura seleção/fetch/grants nem aprovação; refs fixadas são revalidadas por S02/S06.

O compositor recebe referências/estados, não bearer/principal para autenticar-se. Controles manuais invocam o mesmo domínio confiável; não sintetizam Tool.Context ou modelo para operar. S08/S09 seguem donos dos efeitos e consentimento; a distinção visual não enfraquece nenhum deny.

## 5 Prova e bloqueios

Testes e observações a seguir são futuros. Aceitação canônica permanece nos requirements; cenas de renderer exigem app real, teclado e leitor, não apenas snapshot de markup.

| ID | Teste futuro / entrada positiva → asserção | Entrada negativa → asserção |
| --- | --- | --- |
| FS-UI-001 | `composer-stable-host`: editor dirty e query, mover/aba/resize → mesmo owner, texto/seleção/result handle | key por índice/remount → teste detecta perda ou leitura adicional |
| FS-UI-002 | `composer-distinct-pins`: pin posição vs recurso e seleção B → organização fixa vs alvo A explícito | editor A dirty sem pin recebe B → não retargeta nem salva em B |
| FS-UI-003 | `composer-lock-undo`: bloquear, propor, rejeitar/aceitar/desfazer → revisão/layout esperado | desfazer após comando concluído → nenhum replay/cancel/rollback remoto |
| FS-UI-004 | `composer-responsive-overlay`: desktop→compacto→desktop → mesmos overrides salvos | colapso automático → não gera save nem troca pesos duráveis |
| FS-UI-005 | `composer-keyboard-anchor`: mover e fechar inspector via teclado → foco no controle/recurso equivalente | remover controle focado → destino pertinente anunciado, nunca início do chapter |
| FS-UI-006 | `composer-accessible-evidence`: mapa/status com leitor → relações e estado textual disponíveis | remover cor/desenho → significado continua; ícone sem nome falha |
| FS-UI-007 | `composer-language-theme-motion`: idiomas/contagens, light/dark/reduced motion → mesmas funções/copy tipada | título de usuário igual a chave → não traduzido; movimento desligado não esconde estado |
| FS-UI-008 | `composer-stream-selection`: selecionar texto/rows e anexar páginas virtualizadas → Ctrl/Cmd+C copia trecho original | inserir linhas antes ou reciclar DOM → nunca copia novo texto no índice antigo |
| FS-UI-009 | `composer-optional-assistance`: ocultar/restaurar chat e atividade → buffers/contexto e uso manual intactos | tentativa de ocultar aviso obrigatório junto → aviso permanece alcançável |
| FS-UI-010 | `composer-trusted-confirmation`: revisão confiável preparada → controle exibe destino/efeito exatos antes de confirmar | row hostil com botão falso/template que esconde unknown → não confirma e aviso permanece |
| FS-HIS-001 | `composer-preference-cas`: salvar revisão pessoal e reabrir → ordem/abas/pins corretos | loading/foco de outra aba ou revisão antiga → não sobrescreve composição |
| FS-HIS-002 | `composer-draft-recovery`: interromper e reabrir dentro de sete dias → buffer cifrado recuperado no alvo original | mesmo nome/outro contexto, prazo vencido ou cifra ausente → não retargeta nem promete persistência |
| FS-OPS-002 | `composer-lazy-boundary`: trace sem Studio e depois editor necessário → só chunks pertinentes no momento devido | galeria/import/foco → nenhum driver browser/download/processo/fetch remoto novo |

**BLOCKER S05-RENDERER:** falta prova do host Solid estável ao mover entre slots/recipes, da virtualização com seleção/cópia e do foco por teclado/leitor; snippets/markup não são prova. **BLOCKER S05-DRAFTS:** S13 ainda deve demonstrar envelope cifrado, isolamento e expiração necessários à recuperação de Q03. **BLOCKER S05-LAZY-BUDGET:** traces de bundle/import e ensaio separado renderer/backend/Microsoft, com baseline sem Studio, faltam para congelar mínimos/breakpoints/budget; nenhum desempenho é alegado aqui.
