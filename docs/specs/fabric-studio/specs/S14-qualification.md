# S14 — qualificação, seams e lançamento

**Estado:** proposta técnica; nenhum cenário executado. Não é aprovação de lançamento.  
**Requisitos proprietários:** FS-OPS-009–012; FS-E2E-001–014.

## 1. Responsabilidade e integrações

Demonstrar os requisitos canônicos, não a narrativa do agente. [OWNERSHIP](./OWNERSHIP.md) atribui a responsabilidade de contrato; esta spec integra a prova de todos os IDs, Q02/Q07/Q08/Q09 e [C01–C07](./CONTRACTS.md). Nenhum critério é fechado por contar arquivos, adapters, screenshots ou casos com skip.

Prova separada em três planos: determinística de contrato/componente/domínio em CI; conformidade por operação no Fabric autorizado; julgamento humano H em tarefa real. Um plano não substitui o outro. Os cinco requisitos H continuam humanos mesmo se a sua instrumentação auxiliar puder ser testada.

## 2. Contrato

### Registro de evidência

Cada execução de prova registra requirement ID, caso/versão, spec/contrato/revisão, tipo de evidência, ambiente/versões/identidade/destino permitidos, entradas/limites, resultado esperado e observado, estado, tempo, artefatos sanitizados e alcance. IDs/casos concretos serão conectados aos testes do runner próprio, sem manter outra definição de aceitação. Estado: not-run, running, passed, failed, inconclusive, error; não usar passed para skip ou instrumento indisponível.

Evidência de operação real inclui fonte Microsoft exata/data, CapabilityRef e tupla de qualificação de S03. Não registrar tenant secreto ou tokens no repositório; referências autorizadas e payloads seguem S13. A aprovação documental desta spec não emite QualificationRecord real nem habilita readiness. Prova expirada/incompatível com versão/perfil deixa operação unverified até requalificação.

### Dataset e ambientes de referência

No ambiente autorizado de Q02, criar sandbox e prod-like com IDs diferentes e os mesmos controles de produção. Dados artificiais de pedidos: no primeiro período, pedidos concluídos de 100 e 60, cancelado de 40; total bruto 200 e regra escolhida explicitamente de excluir cancelado produz 160, mantendo os três registros de origem. É um exemplo sintético de teste, não escolha automática de regra do cliente. Adicionar chave duplicada e linha atrasada de 10 em cenário separado, com watermark/versão conhecidos; comparar populações diferentes deve ser inconclusive.

Identidades reais: escritora permitida, leitora Viewer/RLS autorizada, leitora negada e contexto sem acesso. Cada uma autentica pelo fluxo suportado; não inventar impersonation. Fonte/conector/gateway, capacidade, região e rede registrados. Definir budget real e inventário de limpeza antes de criar/rodar; não usar produção existente para descobrir contrato. CI determinística não depende de tenant nem modelo hospedado.

### Jornadas e asserts de saída

Os asserts são instâncias de prova das linhas canônicas, não redução de seu alcance. Handoff pode explicar limite de família, nunca satisfazer as conclusões operacionais abaixo.

| ID | Cenário de prova integrado | Saída / negativo determinante |
| --- | --- | --- |
| FS-E2E-001 | Resolver relatório/resultado sintético e seguir definições/arestas observadas até a regra. | Mapa salvo com regra localizada, origem e lacuna real; não grafo inventado ou completo por ausência de scanner. |
| FS-E2E-002 | Esclarecer status/vigência, preparar diff, testar, preparar produção simulada com baseline/approval próprios e aplicar em rota forte qualificada. | Reconciliação 200→160 no período acordado, origem intacta, readback/efeitos/check separados. Escritor externo deve provocar conflito protegido; sem rota forte, jornada blocked e lançamento impedido. |
| FS-E2E-003 | Induzir falha conhecida e comparar com último sucesso por logs/status/definições disponíveis. | Causa fundamentada ou hipótese explícita; log ausente não inventado; recomendação não remove controles de auth. |
| FS-E2E-004 | Aplicar correção delimitada e reexecutar ocorrência nova após precondição de repetição segura. | Novo ID remoto e conferência do destino ligados à falha original; response loss não vira resend. |
| FS-E2E-005 | Criar carga incremental com fonte/credencial/gateway suportados e agenda Fabric. | Primeira execução real, watermark/atrasos/duplicidade/totais verificados; definição criada sozinha não conclui. |
| FS-E2E-006 | Ler schema, ativar query no engine/identidade escolhidos e responder pergunta reproduzível. | Query/filtros/limites/truncamento e resultado útil, sem plano de mudança obrigatório nem egress implícito. |
| FS-E2E-007 | Revisar acesso por workspace/item/engine/modelo e leitor real, incluindo grupos não resolvidos. | Conclusão limitada encaminhável, sem acesso efetivo universal ou grant automático. |
| FS-E2E-008 | Salvar espaço/rascunho/job, fechar/reabrir e reautorizar observação. | Mesmos refs/rascunho/job ou indisponibilidade real; nenhum replay de comando, approval ou provider IA. |
| FS-E2E-009 | Export/import entre instâncias de operadores diferentes, resolver conta/recursos do destinatário. | Tarefa permitida concluída com autoridade própria, nenhum token/approval/resultado privado transferido. |
| FS-E2E-010 | Dois contextos não-Git com Project.ID.global igual e Locations reais distintas. | Save/reopen/queries/investigação isolados; request direto com outro context/Location negado. |
| FS-E2E-011 | Intenção → preview validado → ação manual → análise IA de recorte permitido da mesma evidência. | Referências/revisões/recibos coerentes, sem universo chat/editor duplicado ou estado presumido. |
| FS-E2E-012 / H | Iniciante de leitura executa tarefa sem roteiro de botões e explica estado/lacunas/próximo passo. | Avaliador humano registra entendimento com rubrica, não autoavaliação do modelo. |
| FS-E2E-013 / H | Profissional conclui tarefa equivalente com IA desligada. | Resultado conferido fora do chat e controles manuais úteis; botões habilitados não bastam. |
| FS-E2E-014 | Resolver dependências/conclusões de T01–T30 e executar os dezoito selecionados em Q08. | Cada inicial distinto conclui tarefa qualificada; demais têm disposição explícita. Handoff/mock/unavailable não contam no mínimo nem no gate de dezoito. |

### Seams prioritárias e instrumentos

| Seam | Prova positiva / contraprova que precisa falhar |
| --- | --- |
| Contexto/autoridade | Contexto/Location corretos acessam; mesmo projeto global ou mesmo nome sem vínculo falha. Remover guard deve quebrar o negativo. |
| Compiler/renderer | Documento válido monta duas tarefas; slot/tipo/props/projeção/ciclo hostis são rejeitados sem efeito. Reorder mantém ID/foco/rascunho, null suspende fonte. |
| OAuth/cache | Callback correto e uma conclusão; replay/troca de contexto negados. Cache válido sobrevive a refresh concorrente/erro obsoleto/herança. |
| Conteúdo/approval | Bytes/digest exatos; alteração em qualquer dimensão não executa. Mesma intenção de layout jamais vira apply. |
| Claim/durabilidade | Dois escritores reais no store obtêm um claim. Queda em cada fronteira, reboot/restore e response loss não duplicam efeito. Provar persistência antes de rede, não simular commit com mock. |
| Sessão/proveniência | Excluir chat conserva fato Studio e observação autorizada; apagar prova necessária bloqueia. Nenhum Tool.Context fabricado. |
| Proteção/retention | Cifrar/abrir sob owner correto; ciphertext trocado de linha/contexto/revisão falha; key loss preserva bytes; expiração limpa cópias locais necessárias sem apagar tombstone. |
| Resultados/check | Instrumento detecta caso ruim conhecido e bom; erro/skip/não execução/população incompatível não passa. HTTP/job success não é negócio verificado. |

Contratos TS/Schema e stubs de seams dependentes devem ser compiláveis antes de uma wave de implementação; não são testados por renderizar Markdown. Fakes/cassettes podem provar parsing/transporte determinístico, nunca conformance com Microsoft ou a força remota da condição. Testes de runtime usam implementação real, DB/guards reais sempre que possível e runners de CI do repositório.

## 3. Estados e falhas

Qualificação por tupla é not-run → running → passed/failed/inconclusive/error. Conflito de versão/perfil torna o registro insuficiente e readiness unverified, não passou “por herança”. Falta de tenant/budget/consentimento é blocked/not-run, não skip com passed. Instrumento que não detecta controle conhecido é error e bloqueia sua conclusão negativa.

Uma falha do gate de produção não autoriza enfraquecer Q07, reduzir os dezoito templates ou remover J08. O lead registra finding e correção; mudança de escopo precisa de decisão explícita. Testar sandbox com proteção fraca não prova prod-like nem consumidor de app publicado.

## 4. Persistência e autoridade

Registros/artefatos autorizados ligam requisito/spec/contrato/capacidade/contexto e data; payload segue retenção e proteção. Resultados reais e fixtures ficam separados por EvidenceMode. Histórico de qualificação não concede direitos de operador ou acesso a dado antigo; reexibição obedece política atual. Não guardar segredos/IDs desnecessários em branches temporárias de CI.

Execução de produto via `bun run test:ci <package> [arquivos...]`, typecheck local por pacote e guards; epic uma vez na campanha. Esta etapa só produziu propostas: não houve suite executável, CI de produto, typecheck de contrato ou tenant test. Nenhum host-model secret é exigido na CI determinística.

## 5. Prova e bloqueios

| ID | Prova proprietária adicional | Limite |
| --- | --- | --- |
| FS-OPS-009 | Auditoria de readiness nega unverified/documentation/fixture e exige QualificationRecord compatível. | Fonte Microsoft não prova integração Studio. |
| FS-OPS-010 | Plano de ensaio autorizado contém identidades/recursos sintéticos/budget/limpeza antes de rodar. | Não é autorização automática para gastar/criar agora. |
| FS-OPS-011 | Introduzir erro/negação conhecida e remover controle protegido produz veredito oposto. | Instrumento fake/skip/error-vazio não sustenta zero problemas. |
| FS-OPS-012 / H | Avaliador registra conclusão, retorno espontâneo na janela definida, intervenção/correção, compreensão da aprovação e tempo total/baseline. | Não medir não vira ausência de retorno; resultado desfavorável é registrado, não ocultado. |

Além dos H acima, FS-EXP-009/010 são aprovados por revisão humana de compreensão/hierarquia conforme S01/S05, nunca por contagem de componentes. O lead conserva responsabilidade de verificar evidência e risco, mas não substitui julgamento humano requerido por sua narrativa.

Bloqueios: contratos/fixtures executáveis, definição de budgets finais medidos de Q09, participantes/rubricas humanos, app registrations/tenant/identidades reais, conformidade driver/endpoint por operação, prova forte SQL e proteção/durabilidade/placement. Sem esses itens, as specs podem ser propostas/revisadas; não ficam congeladas para implementação dependente nem prontas para lançamento por esta tabela.
