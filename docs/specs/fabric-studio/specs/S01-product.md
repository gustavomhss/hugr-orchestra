# S01 — produto, entrada e percurso de trabalho

**Estado:** proposta técnica; não congelada para implementação ou lançamento.  
**Requisitos proprietários:** FS-EXP-001–004; FS-EXP-006–010.

## 1. Responsabilidade e integrações

Transformar intenção/template/trabalho salvo em espaço contextual útil, sem transformar o Studio em wizard universal ou chat obrigatório. Aplica Q08/Q10/Q11 e [C01–C03](./CONTRACTS.md). S02 possui identidade/placement; S04/S05 compilam/renderizam; S12 conserva receitas; S14 julga compreensão/utilidade.

Chapter `fabric` carrega lazy no servidor/perfil selecionado. Entrada sem projeto abre bootstrap autenticado de contexto Studio, não tela de criar Git. A criação de área gerenciada/Location pertence a S02; somente depois de resolver contexto monta SDK/ModelsProvider para aquela Location. Não adicionar o chapter a `serverWideChapters` como substituto dessa resolução. Troca de servidor destrói instância efêmera anterior e exige resolver o novo contexto; não retargeta comando ou editor em silêncio.

## 2. Contrato

O controller possui `mode: demo | real`, ContextRef opcional, objetivo, caminho de entrada e referência da composição. Demo tem catálogo/fixtures separados; nenhum objeto demo pode ser argumento de operação real. Mudar para real exige nova resolução e confirmação dos destinos, nunca mudar o rótulo dos recibos.

Entrada por intenção oferece proposta estruturada validada; template oferece parâmetros/preview; recente carrega revisão salva e revalida referências. Entrada avançada por recurso/consulta dispensa assistência e plano de mudança. UI apresenta objetivo, conexão/tenant, identidade efetiva, ambiente e estado; detalhes técnicos são inspecionáveis sob demanda. “Solução” é agrupamento de recursos com proveniência, não sinônimo de workspace Microsoft nem limite presumido de lineage.

| Estado do controller | Entrada / saída permitida |
| --- | --- |
| `bootstrapping` | Espera servidor/perfil; sem chamadas Fabric nem falso “sem conexão” antes de storage pronto. |
| `demo` | Fixtures identificadas; pode personalizar composição demo, sem credencial real ou recibo operacional. |
| `context-required` | Escolher/criar contexto autorizado; nenhuma referência importada concede owner/Location. |
| `connection-required` | Conectar ou usar rascunho/local autorizado; login Microsoft não é licença de consulta. |
| `composing` | Resolver intenção/template e compilar documento; zero efeitos Microsoft. |
| `working` | Ferramentas manuais úteis; ações passam pelo domínio e ativação/consentimento adequados. |
| `recoverable-error` | Preserva rascunho e mostra erro/próximo passo; não inventa vazio, reenvio ou sucesso. |

Os nomes são estados locais de UI, não novos estados wire ou de job. Capability Availability permanece C02; uma tela working pode conter ferramenta indisponível conhecida. Não permitir que layout/template esconda identidade/destino ou risco desconhecido.

## 3. Estados e falhas

| Condição | Resposta obrigatória |
| --- | --- |
| Recurso ambíguo | Seletor com tenant/workspace/tipo e ID; nenhum lookup por nome “mais parecido” dispara ação. |
| Fonte parcial/antiga | Cobertura, instante e ação de atualização apropriada; não presumir inventário completo. |
| Sem direito / rota ausente | Motivo específico e próximo passo/deep link seguro; não pedir Admin para tudo. |
| IA indisponível/modelo limitado | Manter composição/rascunho, controles manuais e provedor selecionado; sem fallback externo implícito. |
| Offline | Mostrar material local autorizado de S13 e status histórico; não agenda comandos a enviar depois. |
| Job em execução | Referência observável de S09; fechar a ferramenta não cancela o remoto. |
| Troca de conta/destino | Invalidar geração e fontes dependentes antes de exibir resposta nova; editor sujo mantém dono antigo até decisão. |

Não adotar roteiro fixo de publicar: uma leitura pode concluir com evidência reprodutível; uma investigação pode terminar em hipótese limitada; uma mudança exige plano/aprovação próprios. Progressão de navegação não autoriza efeito.

## 4. Persistência e autoridade

Persistem receita/revisão e contexto permitido, não autorização, resultado demo como real ou estado de loading. Usuário de leitura encontra tarefas úteis com seus direitos reais; usuário especialista pode fixar detalhes técnicos sem impor IDE inteira a consumidor de relatório. Serviço de domínio é o mesmo para manual/IA, com origem preservada.

A especificação visual vigente é `packages/app-shell/src/orchestra/DESIGN.md`; CSS vigente prevalece em divergência. Quiet glass, tokens, uma ação saturada e sem rim/sheen/grain no chrome/content. Mock HTML não é fonte de produção. S05 implementa semântica visual/acessível; valores/novos componentes não são congelados por screenshots fictícios.

## 5. Prova e bloqueios

Casos abaixo refinam a prova, sem substituir aceitação/contraprova canônicas. Nenhum executado.

| ID | Caso futuro / assert principal | Negativo / limite |
| --- | --- | --- |
| FS-EXP-001 | `entry.selected-server`: chapter usa exatamente o perfil resolvido no shell. | Bootstrap de outro servidor não herda conexão. |
| FS-EXP-002 | `entry.demo-separation`: demo produz somente EvidenceMode demo. | Forçar referência demo no domínio real é rejeitado antes da rede. |
| FS-EXP-003 | `entry.three-paths`: intenção/template/recente chegam ao mesmo controller/compositor. | Consulta manual não cria ChangeRevision por obrigação de navegação. |
| FS-EXP-004 | `entry.no-model`: query manual autorizada conclui com modelo indisponível. | Rascunho e botões não dependem de stream IA. |
| FS-EXP-006 | `entry.target-visible`: identidade/tenant/alvo correspondem ao request admitido. | Rótulo produção não resolve outro ID. |
| FS-EXP-007 | `entry.ambiguous-name`: dois itens iguais exigem escolha explícita. | Não usar primeiro retorno. |
| FS-EXP-008 | `entry.truth-states`: induzir denied/partial/stale/offline/unknown produz estados e passos distintos. | Erro/paginação não vira lista vazia completa. |
| FS-EXP-009 | Sessão humana: iniciante explica objetivo, evidência, limite e próximo passo sem ler IDs. | Autoavaliação IA ou screenshot não aprovam H. |
| FS-EXP-010 | Revisão humana nas tarefas/janelas/temas representativos reconhece principal/apoio/inspeção/ação. | Cor/posição gerada não pode criar prioridades concorrentes. |

Bloqueios: integração real do bootstrap/chapter/Location; componentes reais/manual query; avaliação H registrada; benchmarks/AA de S05/S13; ambiente e operações qualificados de S14. Demo ou prova estrutural não fecham esses itens.
