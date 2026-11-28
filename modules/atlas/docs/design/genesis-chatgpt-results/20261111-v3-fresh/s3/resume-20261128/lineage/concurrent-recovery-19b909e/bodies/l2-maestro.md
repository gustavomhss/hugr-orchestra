# Maestro — entendimento local L2: autoridade, aprovação e skills

Fonte fixa: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`. Predecessor aceito: `s3-l1-maestro`; fronteiras de skills/adapters também consultam `s3-l1-integrations`. Oracle congelado: `oracles/L2-all.json`, casos L2-A1 e L2-A2. Este corpo explica contratos locais observados; não declara execução do produto, aprovação de runtime nem publicação Atlas.

## 1. Modelo mental mínimo

Maestro é o conductor e integrador. Ele escolhe seats, prepara contexto, mantém vínculos entre plano, aprovação, dispatch e resultado e usa as portas governadas. Não se torna executor central de Sessions, implementador de produto ou aprovador do próprio trabalho. A autoridade efetiva nasce da composição do host, da identidade persistida e dos gates; nome de agente, prosa do prompt, label configurável ou um ID copiado não a concedem.

A identidade operacional relevante é o `ComposedActor` do baseline: `projectId + sessionId + memberId`. O `memberId` canônico permanece `maestro`, `backend`, `archie`, `jimmy` etc.; labels são apresentação. A Task lógica e a child Session são identidades relacionadas, não substitutas. O host percorre Sessions persistidas, recusa ciclo, projeto diferente ou ausência e aplica o profile/seat nativo antes das permissões adicionais.

Há quatro camadas que precisam ser separadas em qualquer diagnóstico:

1. **Intenção e plano:** playbooks, guides e work package dizem o que se pretende fazer.
2. **Identidade e autorização:** actor, revisão, aprovação, reservation e permission snapshot dizem quem pode tentar.
3. **Execução:** Core cria/retoma a child Session e o execution host traduz turns e ferramentas.
4. **Aceite:** recibos, cold review, checks e decisão do owner dizem o que foi observado; nenhum deles é produzido apenas porque o plano existe.

## 2. Aprovação existente, mas prompt ou child mudou — caso L2-A1

Uma aprovação governada não é uma permissão genérica para “qualquer tarefa parecida”. O caminho permitido é:

1. O plano/contexto/policy/task atuais são materializados e hasheados. A apresentação ao owner deve ser a revisão exata, na mesma Session.
2. A primeira resposta genuína do owner depois da apresentação é interpretada. Resposta sintética, ambígua, anterior ou em outra Session não aprova.
3. A autorização preserva revisão, validação, contexto, policy e task hashes. Alterar o prompt, escopo, intent hash, seat ou permissão torna o binding incompatível.
4. Antes de criar o trabalho, o host compara o seat e a intenção pedidos com a autorização. Um mismatch deve recusar sem reservar outro child.
5. A reservation é write-once para a child Session exata e guarda o permission snapshot. Antes do primeiro provider turn, `beforeTurn` revalida ou consome a autorização.
6. Resume estrito só continua trabalho retido do mesmo projeto/member e filho direto esperado.

Portanto, se o prompt ou a child Session proposta mudou, o sistema não deve ampliar a autorização nem reaproveitar silenciosamente a approval. O resultado correto é HOLD/recusa com o mismatch; o operador volta à revisão/aprovação correspondente. Repetir o mesmo token ou renomear a ferramenta não muda o binding.

A cadeia não transforma toda Task em governada: `governed` é um modo explícito. Quando usado, porém, nenhuma allow rule do provider ou texto do modelo substitui os gates Orchestra.

## 3. Novo companion UTF-8 em uma skill — caso L2-A2

O arquivo autoral entra sob a árvore declarada, por exemplo `modules/specialists/backend/skills/backend-implement/...`. O impacto local correto é:

- O membership da raiz e os bytes do novo arquivo tornam-se inputs. Nome precisa ser portável, arquivo regular, UTF-8 e sem symlink/escape.
- `SeatSkillContent` valida a árvore e o contrato de conteúdo. O grant é da root seat-scoped e cobre seus descendentes; adicionar companion não cria novo seat nem nova autoridade.
- `seatSkillsModule`/`seatSkillsFiles` lê as árvores declaradas e regenera o módulo virtual `orchestra-seat-skills.gen.ts` para os builds Bun e Node. O gerado não é editado manualmente.
- Em execução de fonte, a árvore é lida no lugar. Em build compilado/sidecar, `SeatSkillRoot` exige o embed, valida membership e extrai cache por versão/digest. Cópia íntegra pode ser reutilizada; parcial ou adulterada é reconstruída sob lock.
- Uma orientação que precisa estar disponível ao seat em runtime deve estar na árvore embarcada. Uma skill de manutenção em `.orchestra/skills/` pode orientar contribuidores, mas não substitui o payload do seat.
- O owner da árvore mantém o texto. O owner do gerador/empacotamento mantém validação, virtual module e extração. Maestro coordena a mudança; não ganha implementação de produto ou autoaceite.

Links para Relay ou outros componentes são navegação até que o conteúdo desses resultados consuma realmente os bytes. Navegação não deve provocar rebuild/invalidação de um resultado Relay independente.

## 4. Decisões locais de manutenção

| Mudança | Fonte de verdade | Não fazer | Evidência mínima |
| --- | --- | --- | --- |
| Label de seat | config `agent.<id>.name` / `labelEnv`, com validação | renomear ID canônico, hardcodear label em routing | resolver mostra ID estável e label esperado |
| Novo seat/role | roster + definição + profile/gates | copiar ID de seat nativo em agente customizado | composição, permissão e teste negativo de caller |
| Novo tool governado | registry/schema + owner gate + ToolSafety + playbook sincronizado | achar que descrição/prompt autoriza | owner correto passa; caller errado e estado incompleto recusam |
| Mudança de approval | objetos versionados e hashes atuais | aceitar reply antiga ou reservation diferente | revisão, reply, child e permission snapshot vinculados |
| Mudança de skill | árvore autoral + gerador + extraction | editar `*.gen.ts` ou apenas docs repo-only | membership/bytes, build e cache extraído coerentes |

## 5. Falhas e limites

Se a Location abre com warning e sem seats nativos, o roster textual não prova disponibilidade. Se o profile nega shell/edit/publish, uma instrução de prompt não reabre a capacidade. Se `writePaths` está vazio, o trabalho é read-only; path absoluto, `..` e symlink escape são recusados. No Windows, não presumir a mesma garantia adicional de read sandbox observada em macOS/Linux.

Este L2 é estático. Não prova que uma approval foi exercitada, que o módulo virtual foi reconstruído, que um binário extraiu a árvore ou que CI passou. Esses estados permanecem `NOT_RUN` até recibo real.
