# Requirements — capacidades, descoberta e consultas

Todos os itens são propostas; M = cenário mecânico futuro, não executado. Inventário de cobertura não é prova de implementação.

## Catálogo preparado

| ID / método | Obrigação | Aceitação observável | Contraprova | Origem / pendências |
| --- | --- | --- | --- | --- |
| FS-CAP-001 / M | Toda ação operacional deve corresponder a capacidade preparada e identificável. | Controle manual e ferramenta IA resolvem operação conhecida, com entradas/saídas e efeitos descritos. | A IA não inventa endpoint, usa HTTP arbitrário ou cria ferramenta para contornar capacidade ausente. | D:P02; D:I02; D:§7.1 |
| FS-CAP-002 / M | Suporte deve ser avaliado por operação e contexto, não só por família. | Alterar identidade, geração/formato, permissões, capacidade ou rede reavalia a disponibilidade pertinente. | “Fabric conectado” ou CRUD do item não habilita todas as suas operações. | D:§7.3; D:A14; F:F01–F33 |
| FS-CAP-003 / M | Readiness deve distinguir estados e motivos de indisponibilidade. | Usuário diferencia não suportado, não verificado, sem autenticação, negado e pronto/degradado. | Recibo antigo de conexão ou ferramenta descoberta não prova autorização atual. | D:§7.1; D:§4.4 |
| FS-CAP-004 / M | Recurso de tipo desconhecido não deve ganhar comportamento mutante genérico. | Inventário pode apresentar metadados seguros com tipo/limitação explícitos. | Editor JSON ou botão universal não altera item cujo contrato não foi qualificado. | F:regra de cobertura; D:I02 |
| FS-CAP-005 / M | Cada capacidade deve declarar seus limites de efeito e operação. | Antes do uso, é possível conhecer precondições, dados, consumo, concorrência, cancelamento, retry e recuperação aplicáveis. | Uma ação chamada “consulta” não é classificada como leitura só pelo rótulo. | D:§7.1; D:§11.2 |
| FS-CAP-006 / M | Contrato conflitante/experimental deve bloquear claims não demonstrados. | Rota/geração e política de preview ficam explícitas; operação não qualificada não aparece como pronta. | URL `/v1`, anúncio de workload ou documentação conveniente não substitui qualificação da ação exata. | F:C01; F:C06; D:Q12 |
| FS-CAP-007 / M | Falta de suporte não deve provocar escalada implícita. | Indisponibilidade resulta em explicação ou handoff seguro permitido. | Não há fallback silencioso para browser, shell, outro usuário ou identidade mais privilegiada. | D:I11; D:§7.2 |

## Descoberta e dependências

| ID / método | Obrigação | Aceitação observável | Contraprova | Origem / pendências |
| --- | --- | --- | --- | --- |
| FS-DIS-001 / M | Descoberta deve respeitar escopo, paginação e orçamento. | Listagem informa continuidade/limite/falhas e só percorre o escopo autorizado. | Abrir workspace não baixa todas as definições nem faz scan integral de dados. | D:§12.1; D:I13 |
| FS-DIS-002 / M | Recursos devem manter identidade remota não ambígua. | Itens de mesmo nome em destinos diferentes continuam separados e selecionáveis. | Rename não troca o alvo e exclusão não reatribui o ID histórico a outro item. | D:§12.1; D:I05 |
| FS-DIS-003 / M | Relações devem informar proveniência e confiança. | Cada aresta distingue fonte explícita, extração, inferência, declaração do usuário ou desconhecido, com contexto/instante. | Aprovar uma explicação de IA não promove inferência a fato observado. | D:I06; D:§12.2; D:D07 |
| FS-DIS-004 / M | Cobertura do grafo deve permanecer explícita. | Falta de permissão ou visibilidade fora do escopo aparece como lacuna de descoberta. | Não encontrar consumidor fora do workspace não é apresentado como “nenhuma dependência”. | D:J01; D:§12.2; F:F24 |
| FS-DIS-005 / M | Observações devem indicar idade e alcance da informação. | Snapshot antigo mantém data/identidade e pode exigir atualização antes de nova decisão. | Memória/histórico não se apresenta como status remoto atual ou preflight válido. | D:I06; D:§12.2 |
| FS-DIS-006 / M | Mapeamento de ambiente deve ser explícito e revalidável. | Teste e produção são destinos resolvidos, mostrados antes de comparação ou ação. | Sufixo no nome, alias importado ou seleção de outro painel não muda silenciosamente o destino aprovado. | D:§12.3; D:A07 |

## Queries e observação

| ID / método | Obrigação | Aceitação observável | Contraprova | Origem / pendências |
| --- | --- | --- | --- | --- |
| FS-DAT-001 / M | Consulta de dados deve depender de ativação compatível com seu alcance. | Operação dormante pede execução; metadados preconsentidos e observação de job seguem seus escopos próprios. | Mount, foco e seleção não concedem consentimento novo para leitura custosa. | D:§13.4; D:A04 |
| FS-DAT-002 / M | Restrição de leitura deve ser efetiva no domínio/engine escolhido. | Consulta permitida respeita os direitos reais da identidade e a classificação da capacidade. | Prefixo `SELECT`, nome de comando ou afirmação do modelo não autorizam SQL/KQL com efeitos. | D:§11.2; D:J05; F:F17 |
| FS-DAT-003 / M | Resultado deve informar contexto, limites e erros parciais. | Usuário vê schema, filtros, instante, identidade, truncamento e falhas relevantes. | HTTP de sucesso ou primeiras linhas não se apresentam como resultado completo se há erro/limite. | D:§13.1; D:J05 |
| FS-DAT-004 / M | Dados volumosos devem ser consultados/transferidos dentro de limites explícitos. | Limite atingido produz paginação, truncamento ou interrupção nomeada. | Dataset inteiro não é embutido indiscriminadamente em eventos da UI ou histórico IA. | D:§13.1; D:§18.2; D:Q09 |
| FS-DAT-005 / M | Cache deve ser isolado por autoridade e contexto de dados. | Duas identidades/RLS ou contextos diferentes não compartilham resultado privado por ID de tabela igual. | Reusar conexão SP, query ou recurso não prova que outro operador pode ver o material. | D:§13.2; D:A06; D:Q03 |
| FS-DAT-006 / M | Cache deve respeitar política de revalidação e revogação conhecida. | Escopo alterado/retarget invalida o material pertinente; idade e autorização são reavaliadas antes de exibir. | Conteúdo histórico não é licença perpétua de acesso nem promessa de revogação remota instantânea. | D:§13.2; D:Q03 |
| FS-DAT-007 / M | Observações equivalentes devem evitar trabalho remoto duplicado indevido. | Painéis compatíveis na mesma autoridade podem reutilizar observação; remount não gera nova execução. | Deduplicação não atravessa identidade/destino nem transforma dois jobs deliberados num só. | D:§13.3; D:I13 |
| FS-DAT-008 / M | Painéis ocultos não devem consumir continuamente sem política de serviço explícita. | Poll/refresh do painel pausa quando aplicável e acompanhamento de job autorizado tem dono visível separado. | Fechar aba não inicia nova consulta nem concede observação durável implícita. | D:§13.3; D:§13.4 |
| FS-DAT-009 / M | Atualizações devem respeitar limites e backoff do serviço. | Throttle e `Retry-After` produzem espera/estado visível dentro do budget. | Não alternar identidades nem atualizar todos os painéis ao foco para contornar limite. | D:§13.3; D:Q09 |
| FS-DAT-010 / M | Consumo de scan e volume transferido devem ser distinguidos. | Preview/exportação informa que retornar poucas linhas não comprova baixo custo de engine. | Paginação não é apresentada como garantia de scan barato ou preço exato. | D:§13.1; D:§19.3 |
| FS-DAT-011 / M | Consultas devem ter limites e cancelamento com alcance honesto. | Timeout/limite encerra ou sinaliza o controle possível; cancel solicitado depende da confirmação suportada. | Abortar request local não se apresenta automaticamente como parada do processamento remoto. | D:§13.1; D:Q09 |
| FS-DAT-012 / M | Atualização recorrente deve ser visível e pausável sem fechar o espaço. | Com painel aberto e ativação válida, usuário identifica recorrência ativa, pausa novos ciclos mantendo resultado/contexto e só os retoma deliberadamente dentro da política vigente. | Cancelar só o request atual, ocultar painel ou desconectar não substitui o controle; pausar observação não afirma cancelar workload remoto. | D:§13.4; D:I13; crítica RC2-01 |
| FS-DAT-013 / M | Gráficos devem conservar a semântica dos dados sem inventar agregação de negócio. | Medida exibida corresponde à query ou regra de transformação identificável e adequada aos dados; falta de regra/dados para agregar produz limitação explícita. | Média simples de percentuais sem pesos não vira “margem da empresa”; tabela correta, props válidas e alternativa acessível não legitimam o valor inventado. | D:§9.1; D:I06; crítica RC5-01 |
