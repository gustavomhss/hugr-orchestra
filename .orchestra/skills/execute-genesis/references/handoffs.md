# Handoffs das cinco fatias paralelas

## Identidade, domínio e destino

A campanha lógica continua sendo `20261111-v1`. Esta revisão usa `protocol_epoch:
parallel-v2` e `results_epoch: 20261111-v2-parallel`; a mudança não inicia um orçamento
vazio nem apaga tentativas. Antes de continuar uma sessão existente, executar
[a migração](migration.md). Um handoff transporta resultados e evidência; não concede
admissão, publicação, aceite semântico ou aprovação de CI.
Aplicar também [completion.md](completion.md): checkpoint é continuação de trabalho,
não uma entrega concluída.

Cada `sN` conserva a branch `genesis-chatgpt-sN` e escreve novos resultados em
`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/sN/`.
Os resultados em `20261111-v1/` permanecem intactos. Escritas de código seguem o mapa
[parallel-partition.json](parallel-partition.json), não o antigo papel por fase da
sessão. Nenhuma sessão move ou sobrescreve a branch de outra.

As cinco fatias são verticais: cada uma inventaria seu domínio, produz L1–L4 conforme
as dependências reais, usa seu par de juízes, corrige, prepara consumidores e executa
as provas disponíveis. **Não aguardar escopo final, quota ou liberação de S1/S5 para
iniciar essas atividades locais.** `scope_revision` é o contrato finito da própria
fatia, derivado da partição comum. A falta de um artefato externo bloqueia somente
seus consumidores concretos; registrar o artefato e continuar as demais unidades.

Todas as cinco sessões entregam ao **root, na conversa principal**, responsável pela
integração final. S5 executa seu domínio CLI/infra/transversal e mantém somente seus
juízes locais; não aprova o trabalho das demais nem conduz a união final. O root usa
um par independente `integration/J1` e `integration/J2`. A branch
`genesis-chatgpt-final` será criada somente quando a integração for executada; os
recibos agregados ficam em
`modules/atlas/docs/design/genesis-chatgpt-results/20261111-v2-parallel/integration/`.
O kit não afirma que essa branch, esses agentes ou a integração já existem.

Não pressupor filesystem, processos, memória ou IDs de subagentes compartilhados
entre chats. Transporte entre sessões ocorre por referências Git imutáveis e hashes.
Um aviso de disponibilidade não é evidência. IDs de outro chat são proveniência,
não endereços chamáveis. Arquivos de coordenação não substituem o store, os tipos
ou as portas governadas do Atlas.

## Quatro revisões distintas

| Campo | Significado | Regra |
| --- | --- | --- |
| `source_revision` | Baseline do inventário: `1cde2ff7a71bcf7aecb5d030917b577165135d38` | Nunca substituir pelo HEAD de transporte. Fontes alteradas têm referências próprias nos artefatos. |
| `observed_branch_head` | HEAD completo observado ao iniciar a publicação | Serve de lease e descoberta; não identifica necessariamente o código executado. |
| `candidate_revision` | Commit completo da implementação efetivamente executada/julgada | `null` até existir. Não inferir candidato de um patch preparado ou build da baseline. |
| `artifact_revision` | Commit completo que contém os bytes entregues | Fica no handoff de selagem, criado depois do commit de payload. Pode diferir dos anteriores. |

`protocol_revision` fixa commit, caminho e SHA-256 da skill usada. `partition_ref`
fixa o mapa de propriedade. `scope_revision` fixa domínio, necessidades, artefatos
obrigatórios, dependências e exclusões justificadas da fatia. Registrar
`ownership_scope_ids` exatamente como no mapa, sem inventar outra partição ou
converter caminho omitido em fora de escopo. Fontes, receitas e autoridades de cada
artefato têm bindings próprios; a baseline comum não os substitui.

Uma referência externa tem a forma abaixo. Preencher com valores observados; SHA de
commit tem 40 caracteres, SHA-256 tem 64. Hash é dos bytes efetivamente entregues,
com tamanho quando disponível. Branch e URL mutável servem somente para descoberta.

```json
{
  "commit": "<SHA40 completo>",
  "path": "<caminho no repositorio>",
  "sha256": "<SHA256 dos bytes>",
  "bytes": null
}
```

Uma evidência consumida mantém seu commit mesmo se a branch avançar. Não declarar
equivalência de fontes, receitas, contratos ou decisões só porque o nome do arquivo
permaneceu igual. Código executado, artefatos lidos e contexto de julgamento devem
ter identidades verificáveis próprias.

## Publicar payload e selagem sem autorreferência

1. Ler o HEAD `B` da própria branch, os handoffs existentes e qualquer trabalho novo.
   Montar a mudança sobre `B`; nunca resetar a branch para o commit do kit.
2. Congelar bytes de contratos, artefatos, pedidos/respostas visíveis, recibos,
   decisões e ledger. Criar commit de payload `P`, descendente de `B`.
   `artifact-manifest.json` lista caminhos e hashes do payload, sem declarar o próprio
   SHA-256 ou o próprio commit ainda desconhecido.
3. Criar commit de selagem `H`, descendente de `P`, contendo `handoff.json`.
   Nele, `artifact_revision` é `P`; referências aos arquivos do payload usam `P`.
   Calcular o hash do manifesto antes de escrever o handoff. `supersedes` aponta
   ao handoff anterior por commit/caminho/hash. `H` não contém seu próprio SHA.
4. Atualizar somente a própria branch de `B` para `H` com lease `expected_sha=B`
   quando a operação suportar essa comparação. Verificar a resposta e reler em `H`.
   Se a branch mudou, não forçar: preservar os commits preparados, reler a evolução
   e reconciliar antes de nova publicação. Leitura seguida de escrita não é CAS.
   Sem atualização condicional disponível, não alegar lease; manter o payload e
   registrar a publicação bloqueada até existir forma segura de atualizar.
5. O leitor descobre `H` e calcula o hash do handoff em seus próprios recibos. Se for
   necessário persistir recibo de publicação, criá-lo em commit posterior `R`,
   referindo `H`; nunca reescrever `H` para inserir seu próprio hash.

`B`, `P`, `H` e `R` são nomes explicativos, não valores aceitáveis em recibos reais.
Payloads e selagens posteriores recebem identidades novas. Arquivos podem evoluir no
novo prefixo, mas decisões antigas continuam apontando aos bytes antigos. O root
consome uma selagem fixada; não persegue `R` ou qualquer novo HEAD durante a integração.

## Pacote mínimo e estados independentes

Entregar handoff, contrato local, manifesto de artefatos, critérios, plano lógico
local, ledger, roster/decisões e recibos referidos. Checkpoints parciais são válidos;
campos inexistentes ficam `null` com a lacuna exata. Listas de artefatos obrigatórios
e critérios não podem ficar vazias num pacote declarado completo. Inventário e
planos não equivalem a ownership produzido.

O registro ativo [criteria.json](criteria.json) atribui **50 critérios**, incluindo
GO-A, GO-I, AC, CC, SC, QS e DoD, com fonte normativa fixada no baseline. O catálogo
v1 de S1 em `73ad904a850bdf40011a39c6823b13125cc56142`, SHA-256
`b8360a60c51e06497f327068421737595064aecdf662f2ab1e63d4aa433c5816`, continua preservado
como evidência histórica, sem depender dele para iniciar o domínio. A atribuição
por fase foi substituída pela partição v2. Para cada ID, registrar `local_obligation`,
`local_status`, `local_evidence` e separadamente `global_complement`, `global_status`,
`global_owner`. `DEFERRED_TO_INTEGRATION` cabe somente no complemento exclusivamente
global; não adia prova local nem dispensa requisito por pertencer ao agregado.
ROOT reconcilia a união.

Registrar separadamente, com os recibos correspondentes:

| Dimensão | Estados úteis | O que sua conclusão não demonstra |
| --- | --- | --- |
| `native_produced` | `NOT_RUN`, `IN_PROGRESS`, `COMPLETE` | Aceite pelos juízes ou ingestão pelo Atlas. |
| `semantic_accepted` | `NOT_REVIEWED`, `HOLD`, `FIX_FIRST`, `ACCEPTED_SCOPED` | Leitor real utilizável ou CI aprovado. |
| `imported` | `NOT_RUN`, `FAILED`, `IMPORTED` | Publicação, ativação ou leitura pronta. |
| `reader_usable` | `NOT_RUN`, `HOLD`, `READY` | Cobertura global e consumidores completos. |
| `mechanical` | `NOT_RUN`, `PARTIAL`, `FAILED`, `COMPLETE` | Aceite semântico; listar gates exatos executados. |
| `global` | `NOT_READY`, `READY_FOR_GLOBAL_REVIEW`, `ACCEPTED_GLOBAL` | Aceite do dono, landing ou ativação de produção. |

`BLOCKED_AFFECTED` descreve uma operação/subconjunto, não uma obrigação de parar a
fatia. Publicação Git concluída não muda essas dimensões. `ACCEPTED_GLOBAL` só pode
ser registrado pelo root com evidência da união; nunca é copiado de parecer local.
`PASS` mantém o sentido do critério original, sem virar estado genérico de transporte.

`DELIVERY_COMPLETE` exige todas as obrigações da fatia atendidas: população e artefatos
obrigatórios cobertos, produção real, ambos os juízes aplicáveis, correções e nova
avaliação concluídas, consumidores reais e todos os gates locais exigidos executados
com resultado suficiente. Inventário, proposta, checkpoint ou PASS semântico isolado
não autoriza esse estado. Persistir a fila de trabalho restante e continuar até
esgotar as obrigações próprias, conforme `completion.md`.

Se uma obrigação local for realmente impossível com as capacidades disponíveis,
registrar `INCOMPLETE_BLOCKED`, operação e rota tentadas, evidência da impossibilidade,
artefatos/critérios afetados e condição exata de desbloqueio. Prosseguir nas outras
obrigações; não apresentar esse checkpoint como handoff de conclusão. A integração
global posterior pelo root fica explicitamente diferida e não absorve trabalho local
inacabado. Um bloqueio de operação e uma entrega concluída são estados diferentes.

### Template de handoff — não executado

```json
{
  "schema": "genesis-session-handoff/v2",
  "template": true,
  "campaign": "20261111-v1",
  "protocol_epoch": "parallel-v2",
  "results_epoch": "20261111-v2-parallel",
  "session": "sN",
  "branch": "genesis-chatgpt-sN",
  "final_integration_owner": "root",
  "handoff_sequence": 1,
  "supersedes": null,
  "observed_branch_head": "<SHA40 observado antes da publicacao>",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "candidate_revision": null,
  "artifact_revision": "<SHA40 do payload ja criado>",
  "protocol_revision": {"commit": "<SHA40 do kit v2>", "path": ".orchestra/skills/execute-genesis/SKILL.md", "sha256": "<SHA256>"},
  "partition_ref": {"commit": "<SHA40 do kit v2>", "path": ".orchestra/skills/execute-genesis/references/parallel-partition.json", "sha256": "<SHA256>"},
  "ownership_scope_ids": ["<id atribuido a sN na particao>"],
  "scope_revision": null,
  "criteria_catalog_ref": {"commit": "<SHA40 do protocolo v2>", "path": ".orchestra/skills/execute-genesis/references/criteria.json", "sha256": "<SHA256>"},
  "criteria_ref": null,
  "artifact_manifest_ref": null,
  "migration_ref": null,
  "judge_roster_ref": null,
  "judgment_refs": [],
  "budget_plan_ref": null,
  "ledger_ref": null,
  "receipt_refs": [],
  "patch_refs": [],
  "consumed_dependencies": [],
  "state": "WORKING",
  "completion_state": "IN_PROGRESS",
  "completion_checklist_ref": null,
  "remaining_work_queue_ref": null,
  "readiness": {
    "native_produced": "NOT_RUN",
    "semantic_accepted": "NOT_REVIEWED",
    "imported": "NOT_RUN",
    "reader_usable": "NOT_RUN",
    "mechanical": "NOT_RUN",
    "global": "NOT_READY"
  },
  "missing_gates": [],
  "blockers": [],
  "next_action": "Preencher o contrato local, conciliar tentativas existentes e produzir a primeira unidade independente."
}
```

Remover `template` somente depois de preencher/verificar dados reais. Cada item de
`missing_gates`/`blockers` registra operação, artefato/capacidade faltante, IDs de
artefatos e critérios afetados, referência da evidência e próxima ação. Não substituir
isso por “aguarda S1/S5”. Distinguir gates locais, de implementação/CI e da união.
Falta de CI não proíbe produção nativa e revisão semântica autorizadas; também não
pode ser contada como gate executado.

### Template de manifesto de artefatos — não executado

Referências `payload_path` são locais ao commit de payload indicado pela selagem.
Resolvê-las exclusivamente nesse commit, nunca no HEAD. Referências a fontes e a
outras entregas usam `commit/path/sha256` completos.

```json
{
  "schema": "genesis-artifact-manifest/v2",
  "template": true,
  "campaign": "20261111-v1",
  "protocol_epoch": "parallel-v2",
  "results_epoch": "20261111-v2-parallel",
  "session": "sN",
  "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "candidate_revision": null,
  "scope_id": "<id do contrato local>",
  "required_artifact_ids": ["<artifact-id>"],
  "artifacts": [
    {
      "artifact_id": "<artifact-id>",
      "ownership_scope_id": "<id da particao>",
      "layer": "L1",
      "need_id": "<necessidade concreta>",
      "body": {"payload_path": "<caminho completo no novo prefixo>", "sha256": "<SHA256>", "bytes": null},
      "source_refs": [{"commit": "<SHA40 da fonte efetivamente lida>", "path": "<fonte>", "sha256": "<SHA256>"}],
      "authority_ref": null,
      "recipe_ref": null,
      "dependency_artifact_ids": [],
      "accepted_dependency_refs": [],
      "producer_request_ref": null,
      "producer_response_ref": null,
      "production_receipt_ref": null,
      "judgment_refs": [],
      "runtime_receipt_refs": [],
      "execution_status": "NOT_RUN",
      "semantic_status": "NOT_REVIEWED"
    }
  ],
  "missing_required_artifact_ids": ["<artifact-id>"],
  "cross_scope_dependencies": []
}
```

Preencher corpo, origem, receita, autoridade e dependências antes de julgar o artefato
como completo. Guardar pedidos/respostas visíveis originais, nunca raciocínio privado.
Uma dependência semântica exige corpo/manifesto aceito compatível; link de navegação,
por si só, não cria dependência de reconstrução.

Cada linha de `criteria.json` mantém ID original, catálogo, papel local/global,
candidato e manifesto avaliados, `execution_status`, veredito, evidência e lacunas.
Conservar `NOT_RUN` e `INDETERMINATE` onde cabíveis. Não converter ausência de teste
em falha observada, sucesso ou recusa emitida pelo produto. Recibos incluem entrada,
comando/entry point, configuração pública, ambiente, versões, início/fim, saída bruta,
exit code/sinal e identidade de processo/run quando observável. Fixture e
`git apply --check` não são produção. Registrar redações de segredos; se retirarem
evidência decisiva, manter a conclusão pendente.

## Economia e dois juízes por fatia

Cada fatia congela plano lógico local finito antes dos novos despachos: produção,
dois juízes, consumidores, correções e retomadas necessárias. Incluir ledger v1 e
suas reservas no saldo da campanha; ver [migração](migration.md) para bootstrap-v2/48
ou revisão posterior observada. O plano pode ser ampliado por revisão explícita e
finita da própria fatia, no trabalho nativo já autorizado, sem nova aprovação de S1.
Registrar motivo, delta, total e continuidade; não transferir reserva incerta,
duplicar saldo ou reapresentar uso antigo como zero. O root reconcilia a união no
fechamento, sem virar aprovador prévio de cada plano.

Reservar por `attempt_id` antes do despacho e liquidar a mesma reserva com o resultado.
Preservar estados pendentes/incertos até evidência de reconciliação. Migração, timeout
ou mudança de chat não cancela tentativas nem autoriza repetir a chamada para descobrir
o resultado. Trabalho adicional distinto recebe identidade, reserva e vínculo novos,
após verificar risco de duplicação. Tentativas físicas, tokens e billing permanecem
`UNKNOWN` quando não observáveis. Contabilidade lógica não prova enforcement do produto
nem teto financeiro; não autoriza APIs pagas externas.

Nomear pares por epoch/fatia, por exemplo `parallel-v2/sN/J1` e `parallel-v2/sN/J2`.
Persistir IDs reais e recibos; manter o par nas correções. Ambos recebem o mesmo pacote
pinado, aplicam todos os critérios obrigatórios pertinentes e emitem decisões
independentes antes de ver o outro parecer. Seguir [judging.md](judging.md).
Não chamar revisão de autoria de aceite independente nem alegar diversidade de modelo
pela existência de dois contextos. Perda de agente exige reconciliação e disposição
explícita de continuidade; não criar terceiro voto para contornar veto. Os dez papéis
locais não constituem dez votos sobre um único artefato.

## Consumo, espera e integração pelo root

1. Descobrir o HEAD da branch produtora e fixar o handoff nesse SHA.
2. Verificar campanha/epochs, sessão, sequência, protocolo, partição, contrato local,
   manifesto, hashes e dimensões de prontidão relevantes à operação desejada.
3. Ler a evidência e registrar referência exata consumida, compatibilidade e lacunas.
   `READY_FOR_JUDGMENT` ou `ACCEPTED_SCOPED` sem bindings não basta.
4. Continuar trabalho independente se faltar dependência. Consultar novamente o
   HEAD e recibos relevantes antes de concluir que o impedimento persiste; não fazer
   polling contínuo nem esperas bloqueantes maiores que 60 segundos. Checkpoint não
   promete execução futura após o chat parar.

Uma quantidade arbitrária de consultas não demonstra impossibilidade. Após registrar
uma dependência indisponível, continuar a fila local de produção, correção, revisão,
consumidores e gates independentes. Encerrar com pendência local somente como
`INCOMPLETE_BLOCKED` e com o impedimento real demonstrado, nunca como conclusão.

O root fixa um manifesto de integração com uma selagem selecionada de cada uma das
cinco fatias, payloads, partição e critérios. O conjunto é imutável durante o ciclo:
novas entregas entram na próxima revisão, salvo substituição explícita do conjunto
com invalidação das provas afetadas. Não fazer merge de “latest” durante testes ou
julgamento, nem revalidar tudo porque um HEAD avançou somente recibos.

Patches relacionam base completa, arquivos afetados e proprietário na partição.
O dono do arquivo resolve sua alteração; trabalhos de outro domínio são propostas
referenciadas, sem overwrite. S4 recebe as propostas Atlas reutilizáveis de v1;
alterações fora de sua propriedade seguem o owner map. O root preserva esses vínculos,
fixa o candidato integrado e identifica as provas a repetir. Aplicabilidade textual
não demonstra correção funcional ou CI aprovado.

O root cria seu par independente `integration/J1` e `integration/J2` para examinar
a mesma união pinada, critérios globais, interfaces e conflitos. Não reutilizar um
produtor ou juiz local como se fosse esse contexto independente. Ambos têm seus
próprios IDs, reservas e recibos. Aceites locais continuam válidos somente em seus
bindings; não são PASS global por concatenação. Alteração relevante de corpo, código,
fonte, autoridade, receita ou contrato exige revisão/provas afetadas no novo candidato.

O manifesto final registra `final_integration_owner: root`, branch
`genesis-chatgpt-final`, referências das cinco entregas, candidato, decisões do par
independente, todos os 50 critérios, economia conciliada e lacunas exatas. Usar payload
e selagem separados também nessa branch. Gates de runtime, recuperação, CI,
consumidores, landing e ativação têm estados/recibos próprios. Nada se encerra só
porque houve merge ou porque os cinco chats entregaram handoffs.
