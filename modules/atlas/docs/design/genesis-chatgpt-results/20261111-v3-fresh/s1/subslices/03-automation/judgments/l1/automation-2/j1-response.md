## J1 — automation-2: REQUEST_EVIDENCE

Recebidas as **3/3 partes**, encerradas por **FIM_DO_LOTE**. O parecer cobre **§4–5**, bytes UTF-8 **[17553,30077)** de `producers/automation/body.md`, e a evidência literal recebida. Não usei ferramentas nem acessei arquivos.

**O corpo preserva diferenças importantes entre providers, explicita efeitos parciais e delimita a autoridade de tokens, acknowledgments e bytes transferidos. A seleção recebida demonstra várias dessas distinções, mas deixa sem suporte literal suficiente outros contratos centrais de comandos, recursos, transporte e download.** A decisão é **REQUEST_EVIDENCE**. Ainda não há contradição factual demonstrada que imponha `FIX-FIRST`.

### Resultado por critério pertinente

| Critérios | Decisão neste lote | Localização e justificativa |
|---|---|---|
| **GO-A1, CC3** — entendimento transferível, contratos e consequências | **REQUEST_EVIDENCE** | §4–5 oferecem comparações úteis e consequências concretas. Faltam os ramos que sustentam várias elegibilidades, pós-condições e limites descritos nas tabelas. |
| **GO-A2, GO-A4, GO-I1** — construção cumulativa, reúso e preservação | **REQUEST_EVIDENCE**, por pendência compartilhada | O novo lote complementa a explicação de §1–3 e permite fechar subclaims anteriores. A reconciliação histórica de RE-AUT1-01 continua aberta. |
| **GO-A3, QS2, QS3** — consulta, utilidade e simplicidade | **PASS, restrito ao recorte** | A divisão entre comandos, recursos e transporte facilita localizar a diferença relevante sem presumir equivalência entre providers. Os limites acompanham as operações a que se aplicam. |
| **GO-A5, GO-I2, GO-I8** — validade, autoridade e suficiência | **PASS, restrito ao recorte** | O texto distingue versão observada de versão declarada, fingerprint de CAS remoto, acknowledgment de instalação/conclusão e header de digest de verificação criptográfica. |
| **GO-A6, QS1, QS5, QS6** — fidelidade e evidência verificável | **REQUEST_EVIDENCE** | Há afirmações sustentadas diretamente, mas também garantias de fluxo e ausência de comportamento que não podem ser verificadas pelos recortes disponíveis. |
| **QS4, CC7** — arquitetura, persistência e disposição | **REQUEST_EVIDENCE** | A separação entre ledger e saída sensível está clara, mas a cadeia que a assegura, os lifecycles de streams e a disposição das fontes precisam dos complementos abaixo. |
| **CC1, AC01** — necessidades e população reconciliadas | **REQUEST_EVIDENCE** | A cobertura por fonte continua pendente. RE-AUT1-01 deve incluir agora a disposição pertinente a §4–5, sem criar outra matriz concorrente. |
| **GO-A7, GO-I7** — fronteiras e governança | **PASS, restrito ao recorte** | Nenhum efeito externo é inferido como autorizado. O corpo preserva ownership, papel nativo, limites de escopo e separação entre credenciais nativas e destinos assinados. |
| **AC04** — produção real sobre fontes e tratamento de limites | **REQUEST_EVIDENCE** | Há tratamento concreto de stale, efeitos parciais, redaction e incerteza. A evidência ainda não permite concluir toda a suficiência declarada. Não exijo execução de produto nesta fase. |

### Efeito sobre pedidos anteriores

A evidência deste lote **fecha o subpedido de RE-AUT1-06 referente ao acknowledgment dos retries GitHub**: A19, `commands/run.ts`, linhas 21–27, retorna somente `runID`; `commands/job.ts`, linhas 24–33, retorna os IDs conhecidos sem nova tentativa. Em conjunto com A17, isso sustenta a limitação de confirmação genérica descrita em §3.2.

A23 e A31 também sustentam a parcela de **RE-AUT1-05** referente a schedule GitHub na branch padrão, exigência de commit/sourceVersion e encaminhamento como `source.write`. **A verificação dos dois editores YAML permanece aberta.** Os demais pedidos anteriores não são encerrados por essas confirmações parciais.

### Pedidos obrigatórios de evidência

Fornecer os intervalos decisivos e os chamadores necessários para completar cada cadeia; não é preciso repetir os trechos já recebidos.

#### RE-AUT2-01 — Comandos GitHub

**Localização:** §4.1; A18–A19; `github/commands/common.ts`, `workflow.ts`, `run.ts`, `job.ts` e parser de inputs dispatch.

**Pergunta exata:** o fluxo de comando aplica as elegibilidades, precondições e validações de resposta atribuídas a cada linha da tabela?

- **Esperado:** comprovar a cadeia de autoridade e fonte imediatamente relevante ao envio.
- **Observado:** estão demonstrados recusa por scopes clássicos observados, comparação de conta, environment input, dispatch 204 unattributed, retries, cancel/forceCancel e parte de job retry.
- **Evidência necessária:** autoridade sobre repository/permissões/arquivamento e chamada de revisão do ator próxima ao envio; rejeição de campos/precondições extras; prova de dispatch na branch padrão e na ref selecionada; limites e regras de inputs; validação do dispatch 200; enable/disable, delete e approveFork, incluindo sua releitura final. Para job retry, fornecer a vinculação inicial do job ao run admitido.

#### RE-AUT2-02 — Comandos GitLab

**Localização:** §4.2; A20–A22; `gitlab/commands/*`.

**Pergunta exata:** quais ramos sustentam roles desconhecidos, políticas específicas, inputs autoritativos e diferenças entre pipelines, jobs e bridges?

- **Esperado:** verificar elegibilidade e identidade sem importar semântica GitHub.
- **Observado:** há suporte para projeto nativo, endpoint distinto de trigger, gate 18.1 para inputs fornecidos, recusa de MR fork sem placement e algumas regras de run/job. Outros contratos da tabela não aparecem.
- **Evidência necessária:** `role`, políticas de variables/cancelamento e recusa de attempt/resourceVersion; validação local dos inputs/includes/constraints/defaults; pós-condição de pipeline de MR; validação compartilhada do acknowledgment de pipeline; branches de job retry/play/cancel/erase e prova de **jobID diferente** no retry; percurso limitado de bridges e gates de versão. Incluir a cadeia de planejamento → único envio principal → qualificação do retorno.

#### RE-AUT2-03 — Secrets, configuração, environments e policy

**Localização:** §4.3; A23–A27; domínios de variables, environments, deployment review e policy.

**Pergunta exata:** os recursos conservam identidade, redaction, precondições e limites de configuração conforme descrito?

- **Esperado:** distinguir conteúdo legível, material secreto, metadados de versão e efeitos remotos representáveis.
- **Observado:** A24 demonstra regras de hidden create e descarte do valor refletido após write; A25 demonstra reviewers read-only em casos não representáveis; A26 demonstra o caminho de pending review por environments/runID. Restam partes substanciais da tabela.
- **Evidência necessária:** redaction na leitura, incluindo estado hidden desconhecido; identidade key+environment_scope e significado literal de `Repository`; criptografia sealed box e zeroização local; rename/movimento de scope; configuração GitHub de reviewers/refs/timer; deleção de environment GitLab e regras de aprovação de deployment; ramo de roteamento de ambos os kinds em `resources.ts`; implementação que separa policy/retention local de controles remotos.

A afirmação sobre não persistir `CommandOutput` sensível deve ser completada junto de RE-AUT1-06, mediante a cadeia de schema/retorno/persistência, sem supor apagamento universal da memória.

#### RE-AUT2-04 — Caches, runners, schedules e artifacts

**Localização:** §4.3; A28–A31 e A37.

**Pergunta exata:** quais controles completam as garantias de seleção exata, ownership, efeitos limitados e saída efêmera desses recursos?

- **Esperado:** verificar que identidade e impacto são preservados antes e depois das mutações.
- **Observado:** estão demonstrados representação de cache GitLab, seam GraphQL, ownerProject de runner via GraphQL, recusa de delete com outros projetos, schedule play unattributed, precondições de schedule GitHub e keep GitLab com expiry nula.
- **Evidência necessária:** inventário/correspondência para delete de cache GitHub; ownership e controles de labels/runners GitHub, JIT/registration e saída sensível; gates/enrollment GitLab e restrições sobre runners herdados/externos; owner/take-ownership/update de schedule GitLab e tratamento de falha após fase aplicada; editores YAML citados; ramo efetivo de delete de artifact GitHub e reconhecimento dos estados indisponíveis no caminho de mutação.

#### RE-AUT2-05 — Transporte autenticado e classificação de falhas

**Localização:** §5; A32–A34; `actions/transport/*`.

**Pergunta exata:** a construção e o lifecycle do transporte sustentam ausência de shell, snapshot por pedido, qualificação de glab, tratamento TLS e classificação segura das falhas?

- **Esperado:** demonstrar onde uma falha ainda prova não envio e onde a possibilidade de HTTP mantém o resultado ambíguo.
- **Observado:** A32 mostra coerência host/origin; A33 identifica campos do snapshot e parte da resolução de identidade; A34 mostra o classificador e a transição TLS para `http_possible`. Não aparecem os percursos completos.
- **Evidência necessária:** argv/stdin/ambiente e detecção de CLI ausente; parser de headers/JSON e tratamento de saída incompleta; qualificação exata de **glab 1.118.0 e commit**; leitura limitada/regular de CA e par certificado/chave; reutilização do mesmo snapshot na verificação do ator e write; estado/classificação de falhas após `http_possible`; construção e validação do upload multipart.

A propriedade “pegajosa” precisa do fluxo de estados e erro, além do comentário que a descreve.

#### RE-AUT2-06 — Transferência, URLs assinadas e EOF

**Localização:** §5.1; A35–A36; `actions/output/*` e streams de transporte.

**Pergunta exata:** qual cadeia completa garante seleção vinculada, renovação antes de qualquer byte, ausência de credenciais no destino assinado e término válido da transferência?

- **Esperado:** poder distinguir metadados preliminares, bytes parciais e transferência terminada corretamente.
- **Observado:** A35 demonstra ownership de artifact/job e recusas de erased/expired; A36 demonstra uma renovação read-only com revalidação e recursão com `renew=false`. O trecho de `download.open` aceita qualquer status 2xx, enquanto o corpo afirma que partial content não solicitado é recusado no caminho qualificado.
- **Evidência necessária:** resolução completa dos targets, attempts e single-file paths; chamador que habilita a renovação e mantém a fronteira antes da emissão; construção HTTPS efetiva em `signed.ts`, validação de cada redirect e limites; **ramo posterior que recusa 206/partial content não solicitado**; parsing/sanitização de headers e filename; watchdogs/finalizadores sob backpressure e verificação do exit do child após EOF.

A aceitação de 2xx no helper, isoladamente, não demonstra defeito no caminho completo. A localização da recusa de partial content é necessária para decidir a fidelidade da afirmação.

### Pontos já demonstrados que devem ser preservados

- **Dispatch 204 não atribui run:** A18, `workflow.ts`, linhas 31–47.
- **Force-cancel tem gate específico de host/API:** A19, `run.ts`, linhas 29–35.
- **Trigger mantém token no corpo e endpoint próprio:** A20, `launch.ts`, linhas 33–52.
- **Falha após fase aplicada permanece unknown:** A23, `config-common.ts`, linhas 153–169.
- **Owner de runner não deriva da ordem das assignments:** A29, linhas 249–261.
- **Schedule play não produz pipelineID por inferência:** A30, linhas 112–121.
- **Stderr e status incompleto não bastam para rejeição definitiva:** A34, `response.ts`, linhas 56–76.
- **Keep de artifact exige evidência específica de expiry removida:** A37, linhas 45–58.

**Estado preservado:** os lotes anteriores continuam `REQUEST_EVIDENCE`, com os subclaims fechados explicitamente acima. Não há aceite global, operação Atlas inferida ou binding de runtime. Permanecem abertas as obrigações operacionais **AC02/03/05/06/07/08/09/10**, os 50 IDs globais e os demais lotes.