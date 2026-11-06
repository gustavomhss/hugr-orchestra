# Rastreabilidade — desenho → requirements

Índice de cobertura, não segunda definição de aceitação. Obrigações, aceitação, contraprovas e pendências são canônicas nos arquivos 01–08. Um vínculo indica onde a demanda foi decomposta, não comprova suficiência ou implementação; a crítica independente está em [CRITIC.md](./CRITIC.md).

P/I/J/A/D/Q são IDs de [DESIGN.md](../DESIGN.md), F/C de [COVERAGE.md](../COVERAGE.md), T de [TEMPLATES.md](../TEMPLATES.md), RT/FAB da [review](../REVIEW.md). Intervalos são inclusivos e não omitem seus membros. Famílias com tratamento/handoff explícito não contam como tarefa executada ou template qualificado.

## Direção, invariantes e jornadas

| Origem | Requisitos canônicos |
| --- | --- |
| P01 | FS-EXP-001–002; FS-INT-006; FS-FAB-030 |
| P02 | FS-CAP-001–007; FS-FAB-002 |
| P03 | FS-DEC-001–015; FS-UI-001–010; FS-EXP-010 |
| P04 | FS-EXP-003; FS-AI-001; FS-E2E-011 |
| P05 | FS-TPL-001–006; FS-E2E-014 |
| P06 | FS-E2E-001–011; FS-FAB-001–031 |
| P07 | FS-EXP-004; FS-UI-009; FS-AI-003; FS-INT-001; FS-E2E-013 |
| P08 | FS-OPS-009–012; estado e ordem em README.md e CRITIC.md (governança documental, não comportamento executável) |
| I01 | FS-DEC-003–004; FS-HIS-005 |
| I02 | FS-CAP-001–006; FS-DEC-005 |
| I03 | FS-AUT-006–007; FS-INT-001 |
| I04 | FS-AUT-004–005; FS-TPL-005; FS-DEC-003 |
| I05 | FS-EXP-006–007; FS-AUT-002–003; FS-AUT-013; FS-AUT-015; FS-DIS-002; FS-DIS-006 |
| I06 | FS-DIS-003–005; FS-DAT-013; FS-VAL-006; FS-AI-004; FS-AI-006; FS-HIS-009 |
| I07 | FS-RUN-005; FS-VAL-001–007 |
| I08 | FS-CHG-003–008 |
| I09 | FS-CHG-009–010; FS-RUN-001–015 |
| I10 | FS-DEC-011; FS-UI-001–004; FS-HIS-001–002 |
| I11 | FS-AUT-012; FS-PRV-004; FS-CAP-007; FS-INT-005 |
| I12 | FS-PRV-001–006; FS-DAT-005–006 |
| I13 | FS-DEC-009; FS-DAT-001; FS-DAT-007–012; FS-OPS-005–007 |
| I14 | FS-AUT-011; FS-INT-002–005; FS-OPS-002–003 |
| J01 | FS-E2E-001; FS-DIS-001–005 |
| J02 | FS-E2E-002; FS-CHG-001–011; FS-VAL-001–006 |
| J03 | FS-E2E-003–004; FS-AI-006; FS-RUN-001–014 |
| J04 | FS-E2E-005; FS-FAB-010–013; FS-RUN-012; FS-INT-006 |
| J05 | FS-E2E-006; FS-DAT-001–011 |
| J06 | FS-E2E-007; FS-FAB-016–019; FS-AUT-010 |
| J07 | FS-E2E-008–009; FS-HIS-001–008; FS-RUN-008–011 |
| J08 | FS-EXP-005; FS-AUT-013; FS-E2E-010 |

## Critérios do desenho

| Origem | Requisitos canônicos |
| --- | --- |
| A01 | FS-DEC-001–002; FS-DEC-010 |
| A02 | FS-DEC-002–007; FS-DEC-014; FS-PRV-004 |
| A03 | FS-DEC-006–009; FS-UI-001–002; FS-HIS-002 |
| A04 | FS-DEC-004; FS-DAT-001; FS-DAT-008 |
| A05 | FS-AUT-006–007; FS-INT-001 |
| A06 | FS-AUT-004; FS-AUT-009; FS-DAT-005–006 |
| A07 | FS-CHG-003–006; FS-DIS-006 |
| A08 | FS-CHG-005; FS-CHG-007 |
| A09 | FS-RUN-001–006; FS-RUN-013 |
| A10 | FS-RUN-008–011; FS-E2E-008 |
| A11 | FS-RUN-007; FS-RUN-012; FS-HIS-006 |
| A12 | FS-RUN-005; FS-VAL-001–007; FS-OPS-011 |
| A13 | FS-TPL-005; FS-HIS-003–004; FS-E2E-009 |
| A14 | FS-EXP-008; FS-CAP-002–004; FS-DEC-013 |
| A15 | FS-DEC-008–009; FS-AUT-013; FS-DAT-005–009 |
| A16 | FS-EXP-004; FS-PRV-004; FS-AI-002 |
| A17 | FS-UI-004–008; FS-EXP-010 |
| A18 | FS-FAB-001–031; FS-E2E-014 |
| A19 | FS-E2E-001–006; FS-OPS-009–012 |
| A20 | FS-OPS-005–007; FS-OPS-013; FS-PRV-003; FS-DAT-004; FS-DAT-009–011 |
| A21 | FS-EXP-005; FS-AUT-013; FS-E2E-010 |
| A22 | FS-EXP-004; FS-EXP-009; FS-TPL-006; FS-E2E-012–013 |

## Decisões de direção propostas

São direções herdadas, não specs congeladas. Questões abertas têm registro separado em [DECISIONS.md](./DECISIONS.md).

| Origem | Requisitos canônicos |
| --- | --- |
| D01 | FS-DEC-003–004; FS-CHG-002–004 |
| D02 | FS-DEC-001–002; FS-DEC-005–010 |
| D03 | FS-INT-001; FS-AUT-006–007 |
| D04 | FS-CAP-001; FS-CAP-006–007; FS-INT-005; FS-FAB-026 |
| D05 | FS-AUT-001–003; FS-AUT-008 |
| D06 | FS-RUN-001–009 |
| D07 | FS-DIS-003–005; FS-VAL-006 |
| D08 | FS-HIS-004; FS-TPL-005; FS-AUT-014 |
| D09 | FS-DEC-011; FS-UI-001–004; FS-AI-001 |
| D10 | FS-INT-002–005; FS-OPS-003 |
| D11 | FS-AUT-013; FS-E2E-010 |

## Famílias e limitações Fabric

Todas as linhas também dependem de FS-CAP-001–007, FS-FAB-001–002 e FS-OPS-009–010. A tabela aponta as diferenças que a abstração comum não pode ocultar.

| Origem | Requisitos canônicos específicos |
| --- | --- |
| F01 | FS-DIS-001–002; FS-FAB-003 |
| F02 | FS-FAB-003–004 |
| F03 | FS-FAB-005 |
| F04 | FS-FAB-006 |
| F05 | FS-FAB-006; FS-DAT-002 |
| F06 | FS-FAB-006 |
| F07 | FS-FAB-007 |
| F08 | FS-FAB-008 |
| F09 | FS-FAB-009 |
| F10 | FS-FAB-010; FS-RUN-012 |
| F11 | FS-FAB-011 |
| F12 | FS-FAB-012 |
| F13 | FS-FAB-013 |
| F14 | FS-FAB-012 |
| F15 | FS-FAB-014; FS-FAB-017 |
| F16 | FS-FAB-015–016 |
| F17 | FS-FAB-022 |
| F18 | FS-FAB-022 |
| F19 | FS-FAB-023 |
| F20 | FS-FAB-015 |
| F21 | FS-FAB-024 |
| F22 | FS-FAB-024 |
| F23 | FS-FAB-025 |
| F24 | FS-FAB-018; FS-DIS-003–005 |
| F25 | FS-FAB-016–017 |
| F26 | FS-FAB-019–020 |
| F27 | FS-FAB-016; FS-FAB-021; FS-HIS-008 |
| F28 | FS-FAB-026; FS-AI-005 |
| F29 | FS-FAB-027 |
| F30 | FS-FAB-027 |
| F31 | FS-FAB-028 |
| F32 | FS-FAB-029 |
| F33 | FS-FAB-030–031 |
| C01 | FS-FAB-011; FS-CAP-006 |
| C02 | FS-FAB-008 |
| C03 | FS-FAB-014; FS-FAB-017 |
| C04 | FS-FAB-021; FS-CHG-009–010 |
| C05 | FS-FAB-004; FS-AUT-002; FS-OPS-001; FS-PRV-001–005 |
| C06 | FS-CAP-006; FS-OPS-008–009 |

## Templates propostos

FS-TPL-001–006 e FS-E2E-014 valem para o catálogo inteiro. Vínculos abaixo não qualificam os templates; identificam a semântica e os resultados que suas futuras specs devem concretizar, mantendo a conclusão própria descrita em TEMPLATES.md.

| Origem | Requisitos canônicos específicos |
| --- | --- |
| T01 | FS-E2E-001; FS-DIS-003–005 |
| T02 | FS-DIS-001–002; FS-E2E-001 |
| T03 | FS-E2E-006; FS-DAT-001–011 |
| T04 | FS-E2E-005; FS-FAB-010–013 |
| T05 | FS-FAB-008; FS-CHG-002–005; FS-RUN-005 |
| T06 | FS-FAB-006; FS-DAT-001–011; FS-E2E-006 |
| T07 | FS-FAB-010–011; FS-E2E-002 |
| T08 | FS-E2E-003; FS-AI-006 |
| T09 | FS-E2E-004; FS-RUN-001–008 |
| T10 | FS-DIS-005; FS-RUN-005; FS-FAB-012 |
| T11 | FS-VAL-001–006; FS-E2E-002 |
| T12 | FS-VAL-004–005; FS-DAT-003; FS-FAB-014 |
| T13 | FS-FAB-014; FS-E2E-002; FS-VAL-001–006 |
| T14 | FS-FAB-015–016; FS-E2E-001 |
| T15 | FS-OPS-007; FS-OPS-012; FS-FAB-005; FS-VAL-001 |
| T16 | FS-FAB-019–020; FS-OPS-005 |
| T17 | FS-E2E-007; FS-FAB-016–017 |
| T18 | FS-E2E-007; FS-FAB-016–019 |
| T19 | FS-FAB-017; FS-VAL-001–006 |
| T20 | FS-FAB-016; FS-FAB-021; FS-CHG-002–010 |
| T21 | FS-HIS-003–004; FS-HIS-008; FS-E2E-008–009 |
| T22 | FS-FAB-015; FS-FAB-022; FS-FAB-029 |
| T23 | FS-FAB-023 |
| T24 | FS-FAB-024; FS-VAL-001; FS-VAL-006 |
| T25 | FS-FAB-024; FS-CHG-002–005 |
| T26 | FS-FAB-025; FS-FAB-029; FS-DIS-003–005 |
| T27 | FS-FAB-009 |
| T28 | FS-FAB-012; FS-E2E-005 |
| T29 | FS-FAB-007; FS-FAB-027; FS-FAB-030 |
| T30 | FS-FAB-028; FS-RUN-012 |

## Correções da cold review aceitas

| Origem | Requisitos canônicos | Estado nesta etapa |
| --- | --- | --- |
| RT-01 | FS-RUN-001–004; FS-OPS-004 | Obrigação explicitada; identidade, exclusão de envio e retenção a decidir em Q04/Q03. |
| RT-02 | FS-RUN-010; FS-HIS-007; FS-OPS-004 | Obrigação explicitada; contrato de proveniência/observação a decidir em Q04/Q03. |
| FAB-01 | FS-FAB-016; FS-FAB-017; FS-FAB-021 | Disposição e consumidor publicado incluídos sem confundir com Fabric Apps. |
| FAB-02 | FS-FAB-031 | Pacotes setoriais nomeados sem prometer compreensão/execução integral. |
| Restrição Capacity Metrics | FS-FAB-020 | Fonte externa não suportada não é adaptador nativo admissível. |
| Restrição Dataflow Execute | FS-FAB-011 | Parâmetro de aplicar mudanças explícito e qualificado, sem inferir default. |

## Crítica dos requirements

| Origem | Requisitos canônicos | Tratamento |
| --- | --- | --- |
| RC1-01 · DESIGN §4.4 | FS-RUN-015 | Sem fila offline oculta; reconexão não é consentimento para enviar. |
| RC1-02 · DESIGN §8.3/§8.5/§9.1 | FS-DEC-014 | Rejeitar incompatibilidade semântica mesmo entre IDs conhecidos. |
| RC2-01 · DESIGN §13.4 | FS-DAT-012 | Recorrência visível e pausa deliberada sem fechar o espaço. |
| RC2-02 · DESIGN §11.1 | FS-AUT-015 | Renovação concorrente não perde material válido por resposta obsoleta. |
| RC2-03 · DESIGN §9.4 | FS-UI-008 | Conteúdo selecionado para copiar não muda quando chegam linhas. |
| RC4-01 · DESIGN §4.4 | FS-HIS-009 | Acesso offline a material local autorizado, sem fingir autorização/status remoto. |
| RC4-02 · DESIGN §1.4/§4.2/§9.1 | FS-UI-009 | Assistência IA pode ser recolhida sem perder trabalho. |
| RC4-03 · DESIGN §19.2 | FS-OPS-013 | Telemetria operacional das dimensões técnicas explícitas. |
| Conferência do lead · DESIGN §8.3/§8.4/§17.2 | FS-DEC-015 | Edição visual/avançada e declaração efetiva/normalizações inspecionáveis. |
| Conferência do lead · DESIGN §9.3/§9.4 | FS-UI-010 | Confirmação confiável e avisos obrigatórios não controlados por conteúdo remoto. |
| RC5-01 · DESIGN §9.1 | FS-DAT-013 | Gráfico não inventa agregação de negócio. |
| RC6-01 · DESIGN §8.2.1/§12.3/A03 | FS-DEC-006 | Bindings declarados são caminho exclusivo de propagação. |
| RC6-02 · DESIGN §19.2 | FS-OPS-012 | Avaliação humana também registra dimensões de valor e tempo contra baseline. |
| RC8-01 · DESIGN §9.4 | FS-UI-005 | Teclado com retorno ao contexto de foco, não reset para controle acessível aleatório. |
| RC10-01 · DESIGN §8.2.1 | FS-DEC-008 | Seleção vazia suspende a fonte dependente, não só oculta/invalida resultado. |
| RC11-01 / RC12-01 · DESIGN P03 | FS-DEC-001 | Composição explicitamente Solid, não só visualmente nativa. |
| RC11-02 · DESIGN J03 | FS-AI-006 | Diagnóstico não recomenda remover proteções por erro de autenticação. |
| RC12-02 · DESIGN §8.1/§9.1 | FS-CHG-011 | Edição local não escreve remotamente por autosave implícito. |
| RC14-01 · DESIGN §1.4/J04 | FS-INT-006 | Nenhum runtime/engine concorrente de pipelines/dados no Studio, nem mesmo opcional e visível. |

## Leitura reversa

A coluna “Origem / pendências” de cada requisito é o índice reverso normativo. Obrigações derivadas recebem a seção de origem e permanecem propostas. Q01–Q13 estão cobertas por DECISIONS.md: as direções foram escolhidas pelo TechLead após delegação do proprietário, com qualificação e contratos ainda a demonstrar. S01–S14 não são critérios e não foram escritas nesta etapa. O mapa não escolhe packages, WPs ou lançamento; as decisões posteriores de localização/recorte estão explicitamente em Q05/Q08, sem alterar obrigações canônicas.
