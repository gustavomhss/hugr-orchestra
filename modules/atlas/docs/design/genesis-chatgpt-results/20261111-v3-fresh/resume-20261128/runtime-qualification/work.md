# Runtime S4 — fila e auditoria da entrega

Execução: `6746cb98-f844-45ae-a604-c638ae7b8094`.
Escopo atribuído: Runtime S4/R09, preparação integral dos pacotes congelados
S1-03 e S2. O briefing de Gustavo separa esta missão da revisão dos quatro L4
de conhecimento S4 e das operações próprias de binding/publicação dos domínios.

O runtime permaneceu em `db9b4235022c4df32fe3bfd4faeea8adcd69abb7`.
O HEAD inicial foi `af0ed426b8caf0d95772e1fb174d34bab86399c4`.
Os controles executados estão em `09a4c4afc7aab2f9a153eb059d13df0ecf15595c`.
O `handoff.json` identifica separadamente o payload; não há SHA autorreferente.

## Matriz de obrigações próprias

| Critério | Estado | Evidência principal |
| --- | --- | --- |
| Q01 Identidades/materialização | PASS | input-lock, recibos por arquivo, audit-final-evidence e manifest-reference-audit |
| Q02 S1-03 completo | PASS | run 46114652347: 12 artefatos, 694 observações, seis grandes, 707 checks do kernel |
| Q03 S2 completo | PASS | mesmo run: 13 artefatos, 626 observações, três grandes, 640 checks do kernel |
| Q04 Arquivo inacessível real | PASS | terceiro worktree, uid 1001, EACCES, exit 1, sem candidate, permissões restauradas |
| Q05 Gates comuns compatíveis | PASS | run 43343953480 no próprio db9b423, 278 testes/27 arquivos/22 mutações; limites históricos preservados |
| Q06 Limites/escopo | PASS | 2 MiB inclusive, +1/cauda/identidades antigas/recuperação nos controles comuns; estados separados por operação |
| Q07 Reprodução e revisão | PASS | README, manifesto final, dois pareceres finais ligados aos mesmos hashes; selagem e releitura exigidas para conclusão |

Os dois juízes finais cobrem Q01–Q07: `/root/s4_release_j1` e
`/root/s4_release_j2`. Identidades, pedidos, respostas integrais, hashes e vínculos
estão em `judgments/acceptance.json`. O pacote base e o delta documental permitem
reconstruir exatamente os corpos que receberam. Os agentes de auditoria mecânica
não contam como juízes formais.

## Correções e história preservada

O primeiro run falhou no harness após S1-03 passar: a ordem de enumeração das
required keys de S2 foi indevidamente exigida como ordem de execução. A correção
separou a igualdade do conjunto obrigatório da ordem dos artefatos. Nenhum insumo,
quantidade, limite, gate original ou código do runtime foi alterado para passar.
Os arquivos originais desse run continuam em `evidence/attempt-1/`.

J1 registrou HOLD porque usou uma ferramenta somente para confirmar prontidão
antes de receber o pacote. O protocolo exige o mesmo par para correções; o mesmo
juiz repetiu integralmente a avaliação sem ferramentas e registrou PASS. O HOLD,
a ocorrência e a correção continuam preservados, sem reclassificação retroativa.
Somente avaliações posteriores sem ferramentas integram o aceite final.

A auditoria de referências encontrou a falta de `.orchestra/` na regra textual de
paths da raiz. Apenas essa frase mudou; os mesmos dois juízes reavaliaram o delta
e aprovaram o hash final. Não houve execução de produto nova para essa documentação.

O plano `qualification-plan.json` permanece NOT_RUN como registro anterior à
execução. O run inicial permanece FAILED e o primeiro parecer J1 permanece HOLD
como história; nenhum deles é pendência técnica atual nem aprovação retroativa.
Os NOT_RUN de binding, publicação, index/read são estados reais de operações fora
do escopo atual e não são convertidos em PASS.

## Gates e limites de consumo

Guards novos: 78 regras, 0 gate, 5 warnings, 0 errors, contra origin/dev
`3aaa5e0645f99940b66ee90d28aef93166f09ab1`. Quatro warnings já existiam; o novo
é o ZIP da primeira tentativa, preservado como evidência. Esse resultado pertence
ao commit de qualificação. Os commits de recibos e documentação não são descritos
como nova execução dos guards ou da suíte comum.

Os ZIPs novos têm os digests originais verificados contra a API e ficam preservados
neste payload. Os ZIPs comuns antigos expiraram; seu log original foi recuperado
e preservado. O SHA histórico de origin/dev é desconhecido. A versão de Node nos
controles comuns e no novo prepare está registrada separadamente.

Os novos testes de produto ocorreram apenas em Actions. O trabalho local executável
foi inspeção, montagem de arquivos e verificação mecânica de hashes/JSON/ZIP, sem
rodar Atlas. Uso de tokens, tentativas internas de modelo e cobrança permanece
UNKNOWN; chamadas pagas externas nesta execução: zero. O ledger conserva os usos
novos observáveis e não zera a história da campanha.

## Obrigações de outras frentes

S1 e S2 devem consumir este release por SHA, preparar candidates nas próprias
raízes e realizar o binding exato, a publicação e os consumidores reais exigidos
por seus escopos. Os votos deste release não são aprovações de binding de domínio.
Os quatro L4 de conhecimento S4 continuam com sua frente responsável.
Integração global pertence a ROOT; merge e ativação permanecem decisão de Gustavo.

Não há obrigação técnica própria aberta após os pareceres finais. O estado final
da entrega está no handoff selado e só é anunciado após conferir a branch e os
bytes no GitHub.
