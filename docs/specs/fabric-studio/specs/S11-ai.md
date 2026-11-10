# S11 — IA contextual e projeção segura

**Estado:** proposta técnica; não congelada para implementação.

**Requisitos proprietários:** FS-AI-001–006; FS-PRV-001–002; FS-PRV-004; FS-INT-002.

## 1 Responsabilidade e integrações

S11 transforma intenção em proposta contextual revisável; não executa um engine Fabric nem possui autorização, compilador de composição ou dispatcher remoto. Consome [CONTRACTS](CONTRACTS.md), especialmente C01–C04/C07, e a divisão de [OWNERSHIP](OWNERSHIP.md). Fontes: [IA e operação](../requirements/06-ai-and-operation.md), [autoridade e dados](../requirements/02-authority-and-data.md), [continuidade](../requirements/05-evidence-and-continuity.md) e [decisões Q03–Q13](../requirements/DECISIONS.md).

- S02 resolve owner, ContextRef, Location real e identidade atual; S03 fornece operações catalogadas/readiness, nunca grants.
- S04 recebe toda proposta como entrada não confiável e é o único compilador autoritativo do workspace. S05 apresenta preview/diff e preserva trabalho manual.
- S06/S07 fornecem referências e observações autorizadas; S08–S10 possuem revisão, aprovação, despacho e evidência. S11 só os consome pelas mesmas regras das ferramentas manuais.
- S13 controla retenção e exclusão; S12 controla exportação. Consentimento para IA não habilita exportação nem persistência adicional.
- A futura contribuição reside em `modules/fabric`; composição Server instala ferramentas na Location. Nenhuma alteração de API pública é produzida por esta spec.

## 2 Contrato

### 2.1 Intenção, proposta e identidade compartilhada

**FS-AI-001.** Entrada: objetivo do operador na sessão existente, ContextRef atual, WorkspaceRef/revisão quando houver e referências selecionadas autorizadas. Referência ambígua ou informação indispensável ausente produz esclarecimento, sem inventar endpoint/recurso. Saída útil é proposta de documento/diff com ferramentas conhecidas, argumentos tipados e referências resolvidas; a proposta passa por S04 antes de preview aceito/salvamento. Rejeição entrega diagnósticos revisáveis. Construir, validar ou reorganizar o layout produz **zero efeitos Fabric**, inclusive queries.

**FS-AI-003.** Uma consulta manual entra na investigação como referência ao mesmo ResultHandle/recurso/observação, não cópia independente em chat. Proposta de mudança aponta à revisão exata mantida por S08 e aos recibos de S09; modelo não regenera conteúdo executável depois da aprovação. Mudança concorrente de revisão exige revisão explícita da proposta. Uma referência não garante acesso ao conteúdo que ela identifica.

**FS-AI-005.** Cada ferramenta é um valor canônico `Tool.make` com entrada/saída validadas e `toModelOutput`, registrado por `Tools.Service` na Location pelo composition root. A leaf captura os serviços Location necessários, resolve entrada e aplica permissões antes de leitura/efeito; sua origem vem da invocação real, não de campo enviado pelo modelo. Filtering do catálogo e readiness não autorizam execução. Não criar registry global, executor paralelo, callback de autorização no registry, HTTP/shell genérico ou skill/MCP que contorne o domínio.

A saída de domínio contém referências completas e qualificadas de C01/C02 e erros tipados pertinentes; não confundir falha com lista vazia. Somente erros esperados são traduzidos; interrupções e defeitos preservam sua natureza. A projeção para modelo remove referências/metadados não autorizados, assim como payloads; o resultado de domínio também não pode carregar segredo para o settlement/transcrito. Bounding genérico do registry limita volume, não é barreira de privacidade.

### 2.2 Consentimento e projeção antes da admissão

**FS-PRV-001/002; FS-AI-002.** Egress de conteúdo Fabric inicia desligado. Antes de qualquer inserção em prompt ou transcrito durável, avaliar no backend: tarefa, ContextRef/geração, identidade/conexão, política vigente, provedor/modelo selecionado, superfície/destino, classe e recorte exatos, limites e exclusões apresentados ao operador. Autorizar recorte não autoriza outro recurso, identidade, provedor ou tarefa. Aprovação de mudança não substitui esse consentimento.

| Classe de entrada | Tratamento para modelo |
| --- | --- |
| Metadados, nomes, schema | Também são dados; só o recorte permitido e explicitamente consentido. |
| Código/definição | Somente trechos consentidos; preservar integridade ou rejeitar excesso, sem corte silencioso. |
| Rows/amostras/logs | Somente amostra exata permitida; exibição local/seleção de handle não implica envio. |
| Credencial, token, cache MSAL, campo restrito | Sempre excluído; consentimento não sobrepõe proibição. |
| Classificação desconhecida ou autorização não demonstrada | Excluir, inclusive metadados; pedir esclarecimento ou oferecer caminho manual. |

Aplicar a mesma avaliação a resultados de ferramentas, referências de memória, erros e trechos remotos, **antes** de captura durável. Não admitir conteúdo bruto para redigir depois. Entrada do operador que inclua conteúdo Fabric precisa desta avaliação antes de `SessionV2.prompt`; preferir referências locais e seleção explícita a colagem irrestrita. O limite inicial Q09 é 32 KiB de conteúdo Fabric por pedido, em bytes UTF-8 da projeção efetiva, ou o limite menor da política/provider; excesso resulta em `limit` e escolha deliberada de recorte menor. Não reenviar automaticamente material truncado.

O pedido identifica o provider/modelo realmente aplicado ou o erro correspondente. Falta de recurso/falha desse provider preserva editor/composição e não dispara fallback para outro destino. Antes do envio, informar que apagar cópia local não recolhe o que o provider já recebeu. Revogação/troca de identidade, destino ou política invalida a elegibilidade do recorte anterior; reavaliar antes do próximo envio.

**FS-PRV-004.** Nome, notebook, HTML, row, log, documento importado e resposta de ferramenta são dados não confiáveis. Não promovê-los a instruções de sistema, permissão, código de host ou HTML privilegiado. A proposta derivada continua submetida ao schema estrito S04; links/textos remotos não ampliam catálogo nem escolhem destinos autenticados. Conteúdo ativo não é executado por preview. Uma instrução maliciosa que chegue ao modelo ainda não pode atravessar a autorização da leaf.

### 2.3 Sessão e explicação

**FS-INT-002.** Reusar `SessionV2.prompt(...)`: admissão durável de uma entrada antes do `SessionExecution.wake(sessionID)` advisory; `resume: false` permanece admit-only. Runner serializado promove entradas em fronteiras seguras. Retry de message ID só reconcilia sessão, conteúdo e delivery mode idênticos; conflito não vira nova execução. Manter semântica steer/queue e allowance existentes, sem fila própria.

`SessionExecution` continua process-global por Session ID; runner, modelo, registry, permissões e filesystem continuam Location-scoped. Reusar Session ID adota seu placement real; não mover sessão por declaração nem preencher `Location.workspaceID` com workspace Fabric/Studio. Preservar um `llm.stream(request)` por turno no runner e o contrato existente de ExecutionHost quando aplicável; sem loop próprio, ponte legacy ou sessão/invocação fictícia para ação manual. Recuperar observação de job após crash não acorda provider nem reenvia comandos.

**FS-AI-006.** Explicação cita observações/trechos permitidos com idade, contexto, revisão e `EvidenceKind`/`EvidenceMode` C02. Distinguir inferência de fato, amostra de população e lacuna de falha de validação. Não aprovar checks por narrativa nem promover fixture/demo a real. Em erro de autenticação, sugerir renovação/solicitação de acesso pertinente; nunca remover TLS, RLS, autenticação ou outro controle como correção, mesmo prometendo aprovação futura.

## 3 Estados e falhas

As etapas abaixo são fluxo interno explicativo, não novo enum/DTO público:

| Transição | Condição e resultado |
| --- | --- |
| Intenção → esclarecimento ou proposta | Resolver contexto/referências; ambiguidade não inicia efeito remoto. |
| Conteúdo candidato → projeção permitida | Política e consentimento exatos vigentes; proibidos ficam fora inclusive do transcrito. Sem recorte, trabalhar sem dados Fabric ou manualmente. |
| Entrada sanitizada → admissão V2 → turno | Lifecycle existente; indisponibilidade/negação impede esse avanço, preservando trabalho local. |
| Proposta → compilação S04 → revisão humana | Diagnósticos mantêm proposta editável; sucesso valida declaração, não executa fonte/comando. |
| Referência histórica → revalidação | Autoridade atual e retenção permitem ler; caso contrário, `denied`, `expired` ou `unavailable` C02, nunca execução implícita. |

Provider indisponível usa motivo C02 pertinente, sem troca silenciosa. Política insuficiente, scope negado e limite excedido permanecem distinguíveis. Cancelar turno não confirma cancelamento de job Fabric. Resposta tardia de contexto/identidade anterior não é admitida como resultado atual nem reutilizada como consentimento.

## 4 Persistência e autoridade

**FS-AI-004.** Memória guarda referências de trabalho e proveniência permitidas, não snapshots de grants ou novas observações. Na retomada, resolver owner/store/contexto, revisão, identidade, política e idade antes de mostrar ou propor acesso; ausência de rede não atualiza estado remoto. Um histórico válido continua histórico. Reconnect não submete intenções, reexecuta provider ou renova ativação/consentimento automaticamente.

Conteúdo Fabric não ganha segunda retenção por entrar no chat: admissões persistentes precisam obedecer Q03 e a proteção de S13; sem capacidade demonstrada de respeitar proteção/expiração, não admitir esse conteúdo sensível, mesmo com consentimento. Exclusão/expiração invalida referências ao payload; não reconstruí-lo de cópia em transcrito, saída gerenciada ou diagnóstico. Preservar apenas fatos mínimos cuja política permita; perda de prova é `unavailable`, não permissão nova.

A autoridade da ferramenta é capturada na invocação real e reavaliada no boundary correspondente, nunca serializada na memória. Deny do agente não é convertido em ação de operador. Ação manual independente usa autoridade própria de C04, sem fabricação de Tool.Context.

## 5 Prova e bloqueios

Todos os casos são **futuros e não executados**; cada linha exige asserções sobre o boundary real, não só prompt ou mock do autorizador.

| ID / seção | Caso positivo futuro | Caso negativo futuro |
| --- | --- | --- |
| FS-AI-001 / 2.1 | Tarefa suportada produz documento contextual aceito por S04, ou esclarecimento necessário rastreável. | Recurso ambíguo/endpoint inventado é rejeitado; montar proposta não faz chamada Fabric. |
| FS-AI-002 / 2.2 | Provider selecionado recebe somente recorte permitido e é identificado no resultado. | Provider falho não envia a outro; mudança de policy/identidade barra recorte antigo e mantém manual. |
| FS-AI-003 / 2.1 | Consulta manual e proposta apontam aos mesmos recurso/handle/revisão/recibo. | Revisão alterada após review impede executar conteúdo regenerado/diferente. |
| FS-AI-004 / 4 | Retomada revalida referência e mostra idade da evidência. | Grant revogado/conteúdo expirado não reaparece como atual; reconnect não despacha nada. |
| FS-AI-005 / 2.1 | Ferramenta instalada na Location correta aplica leaf policy e devolve referências completas/erro tipado. | Chamada direta a ferramenta visível mas negada não produz efeito; manifesto/MCP não instala executor universal. |
| FS-AI-006 / 2.3 | Diagnóstico cita evidência permitida e lacunas; auth failure orienta recuperação compatível. | Narrativa não aprova check e não recomenda remover proteção; fixture continua fixture. |
| FS-PRV-001 / 2.2 | Recorte exato consentido aparece no pedido e somente ele. | Exibir resultado local não altera prompt/transcrito nem causa egress. |
| FS-PRV-002 / 2.2 | Metadados/código/amostra permitidos são distinguíveis na exposição apresentada. | Segredo/restrito/desconhecido, inclusive nome, não aparece em entrada durável, tool part ou request. |
| FS-PRV-004 / 2.2 | Texto remoto benigno é exibido como dado e proposta segue compilador. | Injeção em row/notebook/HTML não altera política, executa host/DOM privilegiado nem envia bearer. |
| FS-INT-002 / 2.3 | Admissão V2 precede wake; retry exato reconcilia; observação retoma sem turno novo. | Reuso conflitante falha; reboot/job recovery não reinicia modelo nem cria invocação manual fictícia. |

**BLOCKER S11-EGRESS (freeze):** demonstrar projeção anterior a todos os pontos de captura durável, incluindo entrada V2, tool parts, erros e managed outputs. Bounding do registry não fecha esta prova; falta de seam suficiente volta ao lead, sem novo DTO público local.

**BLOCKER S11-RETENÇÃO (freeze/ativação de dados):** S13 e o lifecycle de transcrito precisam demonstrar expiração/exclusão sem cópias paralelas e proteção de payload; até lá, conteúdo Fabric sensível não entra em transcrito persistente.

**BLOCKER S11-REGISTRO (freeze):** demonstrar instalação Location pelo composition root sem dependência reversa Core→Fabric, invocação real e checagem da leaf. Base inspecionada: `packages/core/src/tool/AGENTS.md` e invariantes V2 de `AGENTS.md` no HEAD `9fcb899d50867c1ddc3f25d8345ac9fd8009d788`; documentação não é prova de integração.

**BLOCKER S11-QUALIFICAÇÃO (ativação/lançamento):** provar caminho do provider selecionado, consentimento e negativos de política com fixtures determinísticas; qualquer ensaio hospedado depende de autorização/budget separados. Não há claim de teste, hook de relay ou prontidão operacional nesta entrega.
