# Handoffs duráveis entre as cinco sessões

Este protocolo coordena a campanha `20261111-v1`, com escopo **Orchestra inteiro**.
Um handoff transporta trabalho e evidência; não concede admissão, publicação ou PASS.
Os JSONs abaixo são **templates não executados**. Substitua placeholders somente com dados observados.

## Conteúdo

- Responsabilidade e endereço
- Identidades e entregas
- Evidência e critérios
- Envelope e tentativas
- Descoberta e integração
- Juízes persistentes

## Responsabilidade e endereço

| Sessão | Responsabilidade | Branch própria |
|---|---|---|
| S1 | Inventário do escopo, critérios e envelope econômico | `genesis-chatgpt-s1` |
| S2 | Produção L1–L4, cache/reuse e rebuild | `genesis-chatgpt-s2` |
| S3 | Recuperação, interrupção, retomada e rollback | `genesis-chatgpt-s3` |
| S4 | Host, migração e recusas de compatibilidade | `genesis-chatgpt-s4` |
| S5 | Integração e dois juízes nativos persistentes | `genesis-chatgpt-s5` |

Cada sessão escreve em `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/sN/`.
Use o número real em `sN`. Nenhuma sessão move a branch de outra sessão.
S5 é o único escritor do manifesto agregado `s5/campaign-manifest.json` em sua branch.
Os cinco handoffs separados não são cinco escritores concorrentes de um mesmo ref.
Não suponha filesystem, memória, IDs de subagentes ou processos compartilhados entre chats.
A outra sessão encontra o trabalho por repositório, commit, caminho e hash; mensagens são avisos.

## Identidade que acompanha cada resultado

- `source_revision`: SHA completo do código-base efetivamente lido e executado.
- `candidate_revision`: SHA completo da implementação candidata executada; `null` enquanto inexistente.
- `protocol_revision`: commit e hash dos arquivos desta skill que governaram a tentativa.
- `scope_revision`: referência imutável ao inventário aprovado por S1, com inclusões e lacunas explícitas.
- `criteria_revision`: referência imutável ao catálogo de todos os AC, CC, SC e itens de DoD.
- `handoff_sequence`: contador crescente por sessão; `supersedes` aponta ao handoff anterior.
- `attempt_id`: identidade estável da tentativa, também presente em recibos e reserva econômica.

Referências de evidência têm `{ "commit": "<SHA40>", "path": "<path>", "sha256": "<SHA256>" }`.
Calcule SHA-256 sobre os bytes entregues e registre o tamanho quando houver download externo.
Uma branch ou URL mutável serve para descoberta; a revisão consumida fica fixada por commit/hash.
O commit que contém o handoff pode ser posterior ao `candidate_revision` que ele descreve.
Não exija que um documento contenha o hash de seu próprio commit ou de seus próprios bytes.
Mudança de código, protocolo ou fonte invalida a aplicação automática de vereditos anteriores.
Reutilização exige prova explícita da equivalência relevante; renomear o recibo não produz essa prova.

## Conteúdo mínimo entregue por cada sessão

1. `handoff.json`: identidade, estado, dependências, ponteiros para resultados e economia.
2. `criteria.json`: uma linha por critério atribuído, inclusive os ainda abertos ou não executados.
3. `receipts/`: entradas, invocações, saídas, códigos de término e resultados efetivamente observados.
4. Referências aos patches ou commits de implementação, com arquivos afetados e base exata.
5. Bloqueios objetivos, próxima ação executável e dependências ainda indisponíveis.

S1 entrega o catálogo completo; S5 reconcilia a união das linhas de todas as sessões contra ele.
Critério sem dono, sem linha ou com evidência incompatível permanece lacuna explícita no agregado.
Não declare um critério não aplicável apenas porque seu caminho não foi incluído no trabalho.
Uma atribuição divide responsabilidade; não reduz o escopo de Orchestra inteiro.

### Template de handoff — não é recibo de execução

```json
{
  "schema": "genesis-session-handoff/v1",
  "template": true,
  "campaign": "20261111-v1",
  "session": "sN",
  "handoff_sequence": 1,
  "supersedes": null,
  "source_revision": "<SHA40>",
  "candidate_revision": null,
  "protocol_revision": {"commit": "<SHA40>", "path": "<skill-file>", "sha256": "<SHA256>"},
  "scope_revision": {"commit": "<SHA40>", "path": "<scope-file>", "sha256": "<SHA256>"},
  "criteria_revision": {"commit": "<SHA40>", "path": "<criteria-file>", "sha256": "<SHA256>"},
  "state": "BLOCKED",
  "attempt_id": null,
  "dependencies": [],
  "criteria_ref": null,
  "receipts": [],
  "patches": [],
  "budget_allocation_ref": null,
  "budget_ledger_ref": null,
  "blockers": ["Template: faltam referências e autorização econômica concreta."],
  "next_action": "Resolver as referências e verificar a alocação antes da execução."
}
```

Remova `template` apenas após preencher e verificar os campos; remoção não equivale a aprovação.
Antes do congelamento, referências ainda inexistentes podem ser `null`, acompanhadas da dependência
exata em `blockers`; isso permite publicar capacidades e preparação sem fingir um scope aprovado.
Estados de transporte: `WORKING`, `BLOCKED`, `READY_FOR_JUDGMENT`, `SUPERSEDED` e `INTEGRATED`.
`INTEGRATED` significa incorporado por S5; não significa aceito pelo produto ou pelos juízes.
Registrar `ACCEPTED_SCOPED` e `GLOBAL_REVIEW_READY` como decisões de aceite separadas do transporte.

## Evidência e linhas de critérios

Cada linha identifica o critério original, seu texto/revisão, responsável e revisão candidata julgada.
Preserve os nomes e a semântica de status do catálogo pinado; não crie traduções que enfraqueçam o gate.
Registre separadamente `execution_status` (`NOT_RUN`, `RUNNING`, `COMPLETED`, `FAILED`, `INTERRUPTED`).
Use `INDETERMINATE` para conclusão sem prova suficiente, quando previsto pelo catálogo.
Ausência de execução fica `NOT_RUN`; não pode virar teste reprovado, sucesso ou abstention do produto.

```json
{
  "template": true,
  "criterion_id": "<AC|CC|SC|DoD-id>",
  "criterion_source": {"commit": "<SHA40>", "path": "<catalog>", "sha256": "<SHA256>"},
  "owner": "sN",
  "candidate_revision": null,
  "execution_status": "NOT_RUN",
  "verdict": "INDETERMINATE",
  "production_receipts": [],
  "test_receipts": [],
  "raw_outputs": [],
  "reason": "Template: nenhuma execução observada."
}
```

Um recibo registra entrada real, comando/entry point, configuração pública, ambiente e versões.
Inclua início/fim, exit code ou término por sinal, identidade de processo/run quando observável e saída bruta.
Separe resultado de produção e resultado de teste; um fixture não se torna execução de produção.
Para recusa, nomeie entrada real, motivo observado e ponto de entrada que a emitiu.
Para cache, rebuild, recuperação ou migração, preserve os estados anteriores e posteriores necessários.
Não deduza trabalho concluído da presença de um arquivo, de um log parcial ou de uma citação de código.
Remova segredos antes da publicação e registre a redação; faça o hash dos bytes efetivamente entregues.
Se a redação retirar algo necessário ao veredito, registre a lacuna em vez de presumir a conclusão.

## Envelope econômico e tentativas

S1 fixa um envelope da campanha e pré-aloca quotas lógicas disjuntas para S1–S5.
O prompt do proprietário autoriza o trabalho nativo no escopo: S1 dimensiona e congela limites
operacionais finitos, incluindo correções e juízes, sem pedir de novo permissão para o mesmo trabalho.
Essa autorização não concede gasto com APIs externas nem torna observável uma garantia financeira.
Cada alocação contém unidade, limite, sessão, revisão, regras de reserva/liquidação e atividades cobertas.
As quotas cobrem produção, juiz e eventual retrabalho; a soma não pode exceder o envelope autorizado.
Não interprete número de sites, tarefas ou tentativas como dólares, tokens ou chamadas físicas.
Sem alocação concreta aplicável, registre `BLOCKED` antes de trabalho que consuma a quota.
Cada sessão mantém seu próprio ledger e reserva a unidade lógica antes de iniciar a tentativa.
O recibo de conclusão liquida a mesma reserva; registre o vínculo com `attempt_id` e a evidência.
Timeout/interrupção deixa a reserva `UNCERTAIN` até reconciliação; não a devolva automaticamente.
Não repita uma chamada ao modelo ou juiz para descobrir se a anterior terminou.
Procure primeiro o resultado durável e o estado observado da tentativa original.
Um retry autorizado recebe novo `attempt_id`, nova reserva e ligação explícita à tentativa anterior.
Registre uso físico, tokens e cobrança como `UNKNOWN` quando o host não os expuser.
Zero lógico concluído não significa consumo físico zero; reserva lógica não prova débito financeiro.
O ledger documental não demonstra atomicidade, CAS ou enforcement do produto.
Critérios econômicos exigem os recibos de execução que provem essas propriedades.
Redistribuição exige nova alocação de S1 e aceitação das sessões afetadas; não reaproveite quota ainda incerta.

## Descoberta, consumo e esperas

1. Leia o head da branch da sessão produtora e obtenha `handoff.json` nesse SHA.
2. Fixe esse commit e verifique campanha, sessão, sequência, revisões, hashes e estado.
3. Leia as evidências referidas; não considere a palavra `READY_FOR_JUDGMENT` uma prova de completude.
4. Registre no próprio handoff o commit consumido e o resultado da validação da dependência.
5. Se incompatível ou ausente, nomeie a condição faltante e continue o trabalho independente disponível.

Na sessão ativa, faça no máximo três consultas de descoberta por dependência em um ciclo de trabalho.
Não use espera bloqueante maior que 60 segundos nem polling contínuo sem nova hipótese.
Após esse limite, grave o checkpoint de bloqueio e prossiga em outra tarefa útil ou relate o bloqueio.
Uma nova informação ou retomada explícita permite novo ciclo; isso não cria automação futura.
Não prometa continuar executando depois que o chat parar sem mecanismo de execução realmente ativo.
Planejamento e inspeção podem avançar antes do handoff de S1; execução dependente de escopo/quota aguarda-os.
S3/S4 podem preparar casos independentemente; conclusão integrada aguarda a revisão candidata necessária.
IDs de agentes de outro chat não são endereços de comunicação e não substituem esses handoffs.

## Patches concorrentes e integração por S5

Cada sessão lista arquivos tocados e a base do patch antes de entregar alterações para integração.
Arquivos compartilhados têm ordem e responsável de aplicação definidos por S5.
Sessões diferentes não resolvem o mesmo conflito sobrescrevendo o resultado umas das outras.
S5 confere o head atual antes de escrever; se mudou, releia e reconcilie em vez de forçar o ref.
Uma checagem manual de head não é CAS. Só declare CAS quando a operação real o garantir e houver recibo.
S5 fixa um novo `candidate_revision` após integrar e identifica quais evidências precisam ser refeitas.
Resultados de branches isoladas não provam automaticamente o comportamento da combinação integrada.
O manifesto agregado referencia handoffs imutáveis, critérios reconciliados, lacunas e orçamento reconciliado.
Não copie um status global de uma sessão para as demais, nem encerre linhas só porque houve merge.

## Dois juízes nativos persistentes em S5

S5 mantém dois subagentes nativos distintos, `judge-A` e `judge-B`, durante a campanha ativa.
IDs reais ficam no controle local de S5; os handoffs usam nome, época e recibo durável de revisão.
Cada juiz recebe o mesmo pacote pinado e entrega parecer independente antes de ver o outro parecer.
Scripts validam formato e hashes; não substituem os dois juízes nativos.
O juiz aplica o critério pinado, sem reinterpretá-lo para aceitar uma lacuna ou reduzir o escopo.
O parecer nomeia fonte, protocolo, candidato, critérios avaliados, evidências lidas e lacunas por linha.
Timeout do juiz não é reprovação nem licença para duplicar a interpretação: reconcilie a tentativa original.
Se o host perdeu definitivamente o agente, registre HOLD e a interrupção; recuperar o mesmo agente
é a primeira opção. Nova época e substituição exigem alteração explícita do protocolo pelo proprietário,
com nova reserva e vínculo aos recibos antigos; não criar um terceiro voto silenciosamente.
Reidratar o contexto preserva evidências; não autoriza dizer que o novo agente é o processo antigo.
S5 reconcilia divergências por evidência ou correção; não escolhe o PASS por maioria ou conveniência.
Correção que muda o candidato exige revisão do novo SHA pelos dois juízes nos critérios afetados.
Sem dois pareceres aplicáveis e critérios/economia reconciliados, o manifesto conserva as pendências.
Aceitação dos juízes e publicação/admissão pelo produto são estados distintos, cada um com seu recibo.
