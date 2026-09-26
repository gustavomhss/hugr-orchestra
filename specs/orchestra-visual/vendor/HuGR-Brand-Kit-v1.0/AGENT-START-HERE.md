# HuGR — comece aqui, agente

**Estado: visual aprovado. Trabalho restante: integração e evidências, não redesign.**  
Identidade: v1.0 · Handoff: 1.0 · Data: 26/09/2026.

## 1. Decisão que não deve ser reaberta

Última orientação do proprietário: **“visualmente ta tudo otimo, so quero deixar o trabalho mais mastigado pra outra sessao”.**

Preserve o kit visual atual. As sugestões anteriores de refinar curvas, iluminação, microícones, tipografia, paleta ou linguagem gráfica **não são backlog autorizado**. Não recrie, trace, gere, otimize ou reexporte a marca por iniciativa própria. Diferenças entre a referência raster e o vetor já estão documentadas; não são uma tarefa a corrigir neste handoff.

A entrega acrescenta documentação, inventário e verificação. Todos os **295 arquivos originais** permanecem inalterados, incluindo código, tokens, templates, fontes vetoriais, galeria e manual. A referência de procedência continua em `reference/approved-reference.png`; os assets de uso são os SVGs e exportações do kit.

## 2. Leitura mínima, nesta ordem

| Arquivo | Serve para | Quando ler |
|---|---|---|
| `AGENT-START-HERE.md` | Decisão, limites e primeiro passo | Sempre |
| `11-handoff/INTEGRATION-RUNBOOK.md` | Escolha de assets, comandos, WPs e critérios | Sempre |
| `11-handoff/STATUS-AND-EVIDENCE.md` | Separar prova existente de teste pendente | Antes de declarar qualquer item pronto |
| `11-handoff/ASSET-MAP.json` | Caminhos, tamanhos, variantes, hashes e equivalências | Consultar a seção necessária; não despejar inteiro no contexto |
| `11-handoff/SESSION-STATE.template.md` | Registro da execução e continuidade | Copiar para a área de documentação do projeto |
| `11-handoff/PROMPT-NOVA-SESSAO.md` | Mensagem inicial reutilizável | Para abrir outra sessão |

`START-HERE.html` continua sendo a galeria visual. `08-guidelines/HuGR-Brand-Guidelines.pdf` é o manual. Só abra páginas específicas se houver uma dúvida de uso; não é necessário reauditar o desenho antes de integrar.

## 3. Primeiro passo executável

Na raiz extraída `HuGR-Brand-Kit-v1.0/`, rode:

```sh
python3 11-handoff/verify_handoff.py
```

Requer Python 3.9+; usa apenas a biblioteca padrão, sem rede, instalação ou alteração de arquivos. Código 0 significa integridade e relações locais verificadas, **não integração no produto aprovada**. Código 1 indica falha na verificação; erros de uso da CLI retornam 2.

Depois identifique o projeto de destino, a stack, o diretório público, o mecanismo de tema e os comandos de validação **no próprio projeto**. Nenhum repositório, branch, domínio ou stack de destino foi escolhido nesta entrega. Use o contexto e os conectores autorizados para resolver isso; pergunte apenas pelo que continuar ambíguo. Não escolha um repositório pelo histórico de outros projetos.

## 4. Limites de mudança

**Permitido, quando a integração for autorizada:** copiar assets, adaptar caminhos e imports, fazer um wrapper fino, selecionar variantes existentes pelo tema, preencher conteúdo real e mesclar metadados/manifesto. Registrar testes e evidências.

**Não autorizado por este handoff:** alterar o desenho, inventar variantes, renomear produtos, redesenhar telas, refazer a UI inteira, criar backend, adicionar bibliotecas só para exibir a marca, inventar métricas/contatos/domínios, publicar ou fazer deploy. Ações externas exigem autorização pertinente à sessão de execução.

Mantenha o pacote-base intacto. Adaptações de configuração ocorrem nas **cópias do projeto**, nunca nos masters. Não use `--overwrite` como resposta automática a um conflito e não descarte alterações preexistentes do usuário.

## 5. Caminho padrão — não uma presunção sobre o projeto

Em um projeto que sirva arquivos de `public/` na raiz do site:

- Origem copiável: `07-web/brand/` → destino convencional: `public/brand/`.
- Header claro: `logos/hugr-horizontal-compact-primary.svg`; escuro: `...-inverse.svg`.
- Espaço reduzido: símbolo existente; para 16 px, favicon existente, sem redesenho.
- React é opcional. `07-web/components/HuGRLogo.tsx` usa SVG externo via `<img>`.
- `07-web/head.html` é referência para mesclagem, não um bloco para duplicar sem inspeção.

A pasta web tem **36 arquivos**, dos quais **25 são logos SVG**. Ela é um subconjunto dos **42 SVGs de logo** do kit: leia o runbook antes de pedir uma composição ausente ao componente.

## 6. Como encerrar e passar adiante

Conclua os WPs aplicáveis do runbook com evidências. Teste no projeto real; não repita como se fossem atuais os testes históricos do kit. Separe `PASS`, `FAIL`, `NOT_RUN`, `BLOCKED` e `N/A` com justificativa. Não chame a integração de concluída enquanto algum requisito obrigatório estiver sem prova.

Atualize o registro de sessão com arquivos alterados, comandos, resultados, caminho das evidências, bloqueios e **uma próxima ação concreta**. Isso permite continuar sem reler esta conversa inteira.
