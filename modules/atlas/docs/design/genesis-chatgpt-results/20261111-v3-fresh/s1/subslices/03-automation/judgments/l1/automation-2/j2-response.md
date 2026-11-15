## REQUEST_EVIDENCE — automation-2, §4–5

**J2 — completude/utilidade.** Recebidas as três partes e **FIM_DO_LOTE**. Este parecer cobre o recorte declarado `[17553,30077)` de `producers/automation/body.md` e os trechos A18–A37 transportados.

O corpo conserva diferenças importantes entre providers e explica consequências práticas: retry não cria uma tentativa conhecida, fingerprint local não equivale a CAS remoto, configuração em fases pode deixar efeitos parciais, cache GitLab não significa remoção física e schedule play não identifica uma pipeline. Vários desses limites estão diretamente sustentados.

**A decisão é REQUEST_EVIDENCE**, porque faltam ramos decisivos para confirmar o restante das tabelas, o tratamento de credenciais/streams e parte do contrato de download. Não há erro material demonstrado suficiente para **FIX-FIRST**.

### Avaliação por critérios pertinentes

| Critérios | Localização | Avaliação e fundamento |
| --- | --- | --- |
| GO-A1, GO-A2, QS2, QS3 | §4.1–4.3; §5.1 | **Favorável no conteúdo observado.** As tabelas apresentam diferenças que alteram escolha, implementação e conclusão permitida, sem nivelar artificialmente GitHub e GitLab. |
| GO-A3, GO-A4, QS6 | Referências A18–A37 | **REQUEST_EVIDENCE.** A rota de aprofundamento existe, mas os intervalos recebidos não cobrem vários contratos afirmados. O reúso histórico permanece associado a RE-AUT1-01. |
| GO-A5, GO-A6, GO-I2, GO-I7, GO-I8 | §4.3 e §5 | **Atendidos no enquadramento observado.** O texto distingue autorização observada, versão, identidade, efeitos parciais, integridade e confirmação; não transforma metadados ou conteúdo importado em autoridade nova. |
| QS1, QS5, CC3, AC04 | §4–5 | **REQUEST_EVIDENCE.** Há base literal real para muitos claims; outros dependem de funções apenas chamadas, comentários ou intervalos omitidos. |
| QS4, GO-I1, CC7 | §4.3: segredo/saída/ledger; §5: lifecycle | **Parcialmente sustentados.** A não persistência de saídas sensíveis depende também do contrato completo do ledger; lifecycle e retenção de identidade precisam dos trechos solicitados. |
| CC1, AC01 | Tabelas de comandos/recursos; população automation | **REQUEST_EVIDENCE.** A cobertura pertinente deve integrar a disposição individual solicitada em RE-AUT1-01. Não deduzo completude da extensão das tabelas. |
| GO-A7 | Limites do lote | **Compatível com a fase.** O material não autoriza operação Atlas, consumo ou binding de runtime. |

### Evidência necessária

**RE-AUT2-01 — Elegibilidade e acknowledgment dos comandos**  
**Localização:** §4.1–4.2; A18–A22.

**Pergunta:** quais ramos implementam as precondições e os resultados das linhas das tabelas que ainda não foram demonstrados?

**Falta:**

- GitHub: prova de `workflow_dispatch` na branch padrão e na ref selecionada; parser/validação de inputs e seu limite; validação da resposta 200 atribuída; ramos enable/disable, delete e approveFork; posição da revalidação do ator no caminho de envio.
- GitLab: funções de role, política de variables/cancelamento e recusa dos campos sem significado; validação de includes/constraints/defaults de inputs; confirmação da pipeline de MR; ramos de job/bridge, sobretudo novo jobID no retry e classificação de readback pós-envio.
- `GitLabCommandShared.pipeline`: campos efetivamente produzidos e validações de identidade, necessários para confirmar também a ausência de tentativa fabricada.

**Já sustentado:** A18 demonstra environment por identidade e dispatch 204 sem atribuição; A19 demonstra retry GitHub sem nova tentativa e gate de force-cancel; A20–A21 demonstram distinção trigger/pipeline, gate 18.1 para inputs explícitos e recusa de MR de outro source project; A22 demonstra parte de roles, delete vazio e regras de job.

---

**RE-AUT2-02 — Recursos e limites de representabilidade**  
**Localização:** §4.3; A23–A31 e A37.

**Pergunta:** os caminhos de leitura e mutação sustentam todas as assimetrias usadas para orientar o mantenedor?

**Falta:**

- Variables/secrets: leitura/redação GitLab, identidade por key+scope e recusa de `Repository` como alias; caminhos GitHub de chave pública, sealed box e rename; wrapper que zera o array local.
- Environments/deployment review: resolução de reviewers GitHub, aplicação separada de refs/proteção, tratamento do timer ausente; delete GitLab com estado parado; prova de approvals pendentes e elegibilidade para aprovação.
- Policy: ramos de leitura/escrita além do schema mostrado, incluindo preservação de enabled/selected e limites da retenção local.
- Caches: caminho GitHub de delete por ID/key com suficiência do inventário.
- Runners: restrições de labels, JIT com grupo explícito, saída sensível/ack e enrollment GitLab com gate de versão.
- Schedules: owner/role e fases de inputs/variables GitLab; continuação do editor GitHub e chamada efetiva de publicação. Para o helper de autoria, permanece a parte correspondente de RE-AUT1-04.
- Roteamento de `deployments` em `resources.ts` e comportamento de `C.selection` ao receber esse kind, para completar a prova da assimetria explicitamente destacada.

**Já sustentado:** A23 comprova comparação local de versão e falha desconhecida após fase anterior; A24 comprova hidden create e descarte da resposta com valor; A25 demonstra reviewers não representáveis e ausência de filtro de refs na proteção GitLab; A28 demonstra invalidação de namespace; A29 demonstra ownership GraphQL e recusa de delete com outros projetos; A30 comprova play sem pipelineID; A31 demonstra precondições de source/default branch; A37 comprova keep GitLab com expiry nula.

---

**RE-AUT2-03 — Transporte, snapshot e classificação da falha**  
**Localização:** §5; A32–A34.

**Pergunta:** quais ramos completos sustentam a qualificação de CLI/TLS, a continuidade do snapshot e a classificação após possível envio?

**Falta:**

- `transport/cli.ts`: argv, stdin JSON, ausência de shell e ambiente de prompts/pager/debug.
- `transport/credentials.ts`: verificação de **glab 1.118.0** e prefixo do commit; obtenção/validação de token, OAuth, CA e par certificado/chave.
- `transport/gitlab.ts`: caminho de mutação no qual o mesmo snapshot verifica o ator e envia a escrita. O trecho recebido mostra `resolve`.
- `transport/http.ts`: validação dos arquivos TLS e classificações que dependem de `http_possible`, inclusive falhas posteriores de TLS e redirects.
- `transport/process.ts`: finalização, watchdog, encerramento sob backpressure, verificação de exit no EOF e limites efetivamente aplicados.
- Caminho de upload multipart: admissão de rota/filename e manejo de backpressure.

**Já sustentado:** A34 demonstra que diagnósticos brutos não saem pelo classificador e exige resposta completa/exit normal/status qualificado para rejeição definitiva. O trecho HTTPS mostra configuração de verificação e a transição para `http_possible`; falta a utilização completa dessa fase nas falhas.

---

**RE-AUT2-04 — Transferência, renovação e metadados de saída**  
**Localização:** §5.1; A35–A36.

**Pergunta:** o caminho público de transferência preserva identidade, não reenvia após emissão parcial e valida EOF/headers conforme descrito?

**Falta:**

- `output/target.ts`: ramos GitHub e seleção de run/job/attempt/artifact, validação de single-file e recusas de combinações não suportadas.
- Chamador de `download.open`: habilitação da renovação permitida e ponto em que a resposta passa a emitir bytes. O helper mostrado tem `renew=false` por default; a possibilidade efetiva de uma renovação depende do chamador.
- `output/signed.ts`: validação integral de destino/hops, criação do request sem credenciais nativas e limite de redirects.
- Implementação de `transfer/transferInfo` e parsing de headers: watchdog/fechamento, tratamento de EOF inválido, tamanho/tipo/digest/range, sanitização de filename e recusa de partial content não solicitado.

**Já sustentado:** A35 demonstra ownership e estados erased/expired para GitLab e a checagem de ownership de artifact GitHub; A36 demonstra renovação read-only condicionada a 401/403/404, revalidação de alvo e bloqueio de nova renovação recursiva. Não solicito download ou provider real.

### Atualização dos pedidos anteriores

- **RE-AUT1-06 — retry GitHub:** a parcela referente ao acknowledgment sem nova tentativa está **suprida por A19**. Continuam faltando o serviço de reconciliação/combinação e a parte pertinente do helper GitLab.
- **RE-AUT1-04 — schedules:** A23/A31 suprem parte das precondições e do roteamento de publicação. A implementação dos editores e os demais contratos de autoria continuam pendentes.
- **RE-AUT1-01 — cobertura/reúso:** permanece aberto e pode atender conjuntamente os recortes automation, sem duplicar o envio.

### Estado do parecer

**Defeito obrigatório comprovado:** nenhum por ora.  
**Sugestões opcionais:** nenhuma condicionante adicional.

Este lote permanece em **REQUEST_EVIDENCE**. Não há aceite automático da união automation-1/automation-2; também não há impedimento criado por ausência de execução explicitamente externa à fase L1. Obrigações operacionais, 50 IDs globais e binding de runtime continuam abertos.