# L2 — Contratos de extensão, CodeMode e OpenAPI

**Chave:** `s1.subslice05.extension-contracts.l2` · **Need:** `component` · **Scope:** `orchestra.s1`.
**Fonte do produto:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Propósito e fronteira

Um host pode oferecer uma ferramenta por um contrato de plugin, incorporá-la a uma árvore CodeMode ou derivá-la de OpenAPI. Essas superfícies têm contratos distintos; a presença de uma definição não estabelece autorização do usuário nem instalação bem-sucedida. Esta síntese combina apenas os L1 aceitos P1–P3 para orientar a construção e a revisão da fronteira local. O aceite de Tools/host continua pendente. Não são afirmados loader, política de permissão ou fluxo Core novos.

## Primeiro escolha a superfície de autoria

No legado de `@orchestra/plugin`, `Hooks` pode conter mapa de ferramentas e o helper `tool` preserva a definição recebida. Os argumentos usam Zod; o host fornece o contexto de execução, a publicação de metadados e a porta de pedido de permissão. O contexto distingue `agentID` estável de identidade exibida e pode carregar binding readonly de projeto, diretório, workspace, sessões, mensagem e call; parte desse binding é opcional para hosts legados. Tipos não demonstram que o host preencheu ou fiscalizou esses valores. [P1]

As superfícies V2 Effect e Promise já existem. Ambas definem ID e setup; os helpers não implementam o carregador. Registros Effect requerem Scope e devolvem disposal em Effect; registros Promise devolvem disposal assíncrono. O contexto corrente oferece transformações e `reload`; request/variant continuam abertos a opções de provider. O plano Effect propõe APIs futuras e não substitui as declarações atuais. [P1]

TUI tem cliente Orchestra tipado, rotas, diálogos, estado, keymaps, slots, tema e ciclo de aborto/disposal próprio; sua API de comandos é compatibilidade depreciada. Ausência de cliente no contexto V2 de servidor não implica ausência na TUI. `Config.plugin` dos wire types congelados também não equivale a `Config.Info.plugins` do schema atual. Para uma mudança, selecione explicitamente entry point e consumidor antes de adaptar tipos. [P1]

## Sequência para expor ferramentas a CodeMode

1. **Decidir a autoridade no host.** Determine quais ferramentas o usuário e a Session podem usar e implemente essa decisão nas ferramentas/portas do host. Esse passo é obrigação de integração: P1–P3 não fornecem prova do mecanismo Core correspondente. Não converta descoberta de ferramenta em autorização.
2. **Construir uma árvore explícita.** `CodeMode.make` prepara ferramentas e índice; `execute` executa um programa. TypeScript é transpilado, Acorn analisa JavaScript e o interpretador próprio fornece builtins controlados e referências às ferramentas. Não há filesystem, ambiente, rede, módulo ou processo ambiente. A autoridade externa entra nas ferramentas fornecidas. [P2]
3. **Escolher o contrato real de validação.** Effect Schema valida/transforma nos limites declarados. JSON Schema fornece assinatura, sem validador de runtime genérico. Ambos atravessam a fronteira de dados simples. Expor `fetch` ou credenciais como globais modifica essa fronteira e não é uma integração sustentada por P2. Mantenha transporte e resolução de credenciais em capacidades do host; não anuncie segredos como campos de entrada do modelo. [P2–P3]
4. **Aplicar limites intencionais.** Timeout, número de calls e bytes de saída não têm defaults. Valores fornecidos precisam ser inteiros seguros, timeout de pelo menos um e os demais não negativos. Configuração inválida pode lançar durante construção, antes do Effect de resultado. O host deve distinguir essa falha de construção de um diagnóstico de programa. [P2]
5. **Observar resultado e falha.** Calls começam em fibers supervisionados, com concorrência fixa de oito. O sucesso do programa drena calls pendentes; falhas não tratadas viram diagnósticos. Causas desconhecidas do host são sanitizadas e `ToolError` oferece mensagem deliberadamente segura para o modelo. Interrupção do host é preservada. Um timeout não demonstra rollback nem exactly-once dos efeitos de uma ferramenta. [P2]

Uma entrada incompatível com o JSON Schema descritivo não ganha validação genérica só por estar no catálogo. O mantenedor precisa apontar o validador do handler/adaptador e observar sua falha. Se depois ocorrer timeout, preserve o diagnóstico e a distinção entre falha do programa e interrupção; não deduza que nenhuma call começou. Esse é um limite operacional do contrato, não um teste realizado nesta produção. [P2]

Na passagem de dados, ciclos, objetos host não simples, nomes de propriedades bloqueados e profundidade acima de 32 são recusados. Dates/URLs suportados pelo sandbox viram strings; Map/Set/RegExp viram objetos vazios; referências do runtime e promises não resolvidas não escapam como dados comuns. Valores numéricos não finitos são normalizados na cópia de saída. Uma promise assenta uma vez e os combinadores permitidos são explícitos; encadeamento `.then/.catch/.finally` não é suportado. [P2]

`maxOutputBytes` trunca valor/log serializado e marca truncamento. A mensagem explicativa e o envelope externo impedem tratá-lo como limite de todos os bytes retornados. O orçamento de descoberta é estimado e `$codemode.search` continua disponível. Esses mecanismos não substituem controle de acesso. [P2]

## OpenAPI: da operação representável ao resultado

`OpenAPI.fromSpec` primeiro planeja operações representáveis e mantém razões precisas das operações puladas. A URL base segue opção explícita, servidor da operação, do path e do documento. Precisa ser HTTP(S) absoluta, sem query/fragmento não suportado ou template de servidor não resolvido. Parâmetros, bodies, encodings, respostas e segurança fora das formas suportadas podem excluir a operação; não descarte a lista de skips para anunciar cobertura completa da spec. [P3]

As ferramentas geradas usam JSON Schema. O adaptador HTTP ainda verifica campos obrigatórios, formas dos valores e serialização antes de resolver credenciais. Segmentos de path são codificados; vazios, `.` e `..` são recusados e placeholders restantes falham. Isso prova validação específica de construção do pedido, sem criar uma validação geral de input ou de response schema. [P3]

Objetos de requirements de segurança são alternativas; dentro de um objeto as exigências são conjuntas. Ausência de credencial permite tentar outra alternativa, enquanto falha do resolver aborta. Credenciais conflitantes em header/query são recusadas; headers de credencial resolvidos vêm depois dos headers do modelo. Essa ordem conserva o resolver como capacidade do host. Não registra uma conexão real nem prova que o host aplica toda política de destino necessária. [P3]

A leitura de resposta tem teto fixo de 50 MiB, conferido no content length declarado e nos chunks consumidos. Falha de parse JSON vira erro de ferramenta e o resumo de status não bem-sucedido é limitado. Decodificar UTF-8 e fazer parse de JSON não valida response schema. Restrições de redirect, tratamento completo de segurança malformada, validação de resposta e controles configuráveis de tamanho permanecem trabalho indicado pelo TODO. [P3]

## Como decidir uma mudança

Se a mudança é de assinatura ou lifecycle de plugin, revise P1 e o entry point exato; peça a evidência aceita do loader antes de garantir ordering, replay, descarte ou instalação. Se muda dados, budgets ou supervisão do interpretador, revise P2 e só os ramos afetados. Se altera spec, autenticação ou HTTP, revise P3, seus skips e a ordem validação → credencial → pedido → leitura. Use fixtures apenas na profundidade já declarada; reabra uma fonte adicional quando a afirmação nova depender dela.

Preserve o conjunto de 323 paths e as 39 entradas metadata-only. O grande espécime OpenAPI de 637.024 bytes não foi lido semanticamente e excede o limite de 256.000 bytes do observador Atlas documentado. N04 impede afirmar conformidade exaustiva do interpretador; N06 mantém essas fixtures não observadas. N03 permanece sem execução de ferramenta, rede, replay, CI ou consumidor. X01 conserva limites de promises, envelope e respostas/redirects. C-N01-host/R2 ficam pendentes; o aceite local deste texto não aprovará capacidades Core nem autorizará L3/L4.

## Proveniência exata

Os predecessores pertencem a `native-package.c-r1-v2.json`, commit `a8df22ae3a140c58c63f62ce2a634c84f415c943`, SHA-256 `6fb6ce93ba167d667f97e987032c9a3d4d8e293653848e2d924c992121ed2060`, no prefixo `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/`.

| Ref | Predecessor aceito | SHA-256 do corpo |
| --- | --- | --- |
| P1 | `s1.runtime.plugin.l1` | `9c3110e3b15b35e85285cab7f9440b6711110aaac8a1ca936c7ca86263c1e382` |
| P2 | `s1.runtime.codemode.l1` | `be8899d897dec584e7e74c597483dff9417dd1511e00e757e86a05378248487f` |
| P3 | `s1.runtime.codemode_openapi.l1` | `0f906322c8952eb43396870be8fea15b2d47146df43a9d604cfd39c9cb293977` |

Esses corpos conservam os vínculos de fonte de plugin, interpretador e `src/openapi` no pin. Nenhuma releitura ampla ou fonte Core não aceita entrou na síntese. `fragment-metadata.json` fixa as três dependências, receita, limites e referências de cobertura; links de consulta não se tornam dependências novas.
