# Gates de freeze e ativação

**Estado: gates abertos; a prova parcial FND não equivale a fechamento.** Este índice não é backlog opcional ou waiver. Specs propostas podem ser revisadas; implementação dependente não é despachada como se um gate estivesse satisfeito. A aceitação continua nos requirements. Evidências parciais posteriores estão em [FOUNDATION.md](./FOUNDATION.md).

| Gate | Dono / specs | Evidência necessária e consequência |
| --- | --- | --- |
| B-CONTRACT | Lead / todas, especialmente S02/S04/S07/S09/S10 | Schema/DTOs/HttpApi/stubs compiláveis, identidade única dos contratos, Client gerado e seam tests. Markdown e shapes ilustrativas não provam compilação. |
| B-CONTEXT | S02/S06/S11 | Owner/store/context/Location e vínculo de sessão sob requests diretos; dois contextos não-Git com projeto global igual e mapa de ambientes versionado. Sem prova, isolamento/retomada não congelam. |
| B-CREDENTIAL | S02 | Extensão explícita de cache opaco Credential/Integration, callback vinculado, refresh CAS, herança e recuperação, MSAL/Bun conformes; sem fake refresh nem segredo no SDK. |
| B-DURABILITY | S09/S13 | Commit de intenção/claim antes da rede com FULL/flush no mesmo store, concorrência de dois clientes, crash/response loss, restart e restore fence. NORMAL atual não é prova de power-loss durability. |
| B-PROVENANCE | S09 | Observação autorizada independente da retenção do chat; exclusão da prova necessária bloqueia sem forjar contexto/adotar legado. |
| B-PROTECTION | S13/S02 | Envelope contextual e guard pré-decrypt, troca de ciphertext/revisão detectada, key-loss sem sobrescrita, descoberta de dados selados nas novas tabelas antes de criar chave, limpeza/cópias/backups e anti-replay de restore. Não é resolvido só por chamar CredentialCipher.seal. |
| B-EGRESS | S11/S13 | Projeção antes de toda admissão/captura durável, inclusive entradas/tool parts/managed output/erros; política, consentimento e retenção sem cópia paralela. Sem prova, dado sensível não entra no transcrito/modelo. |
| B-RENDERER | S04/S05/S12 | Componentes Solid reais, compiler único, host estável entre slots, foco/seleção virtualizada, CAS/merge e pacote portátil; AA/i18n/temas/janela/avaliações H. |
| B-ENGINE | S03/S07/S10 | Endpoint/geração/identidade/scopes/roles exatos, conformidade drivers/Bun, leitura efetiva, snapshots e instrumentos com controle bom/ruim/quebrado. Fonte Microsoft não é ensaio real. |
| B-STRONG-WRITE | S03/S08/S14 | Ao menos uma rota real cuja precondição e escrita sejam atômicas contra escritor externo em produção/prod-like. Se ausente, bloquear J02/T20 e lançamento integrado, sem handoff contado ou relaxamento Q07. |
| B-BUDGET | S04/S07/S12/S13 | Limites finitos de Q09/C08 exercitados abaixo/no/acima, incluindo buffers/aggregate memory, fila, disco, tombstones e exportação; registrar budgets finais medidos. Seeds escolhidos não são SLOs medidos. |
| B-TENANT | Lead / S02/S03/S14 | Registros Entra/redirects/publisher aplicável, identidades, tenant/workspaces autorizados, dados sintéticos, budget e limpeza. Falta bloqueia operação, não é skip verde. |
| B-RELEASE | Lead / S14 | Dezoito templates Q08 e J01–J08 concluem tarefas reais no escopo publicado, 200 requisitos têm prova pertinente e cinco H têm julgamento humano; ausência de suporte não satisfaz resultado. |

## Escolhas de integração já feitas nesta rodada

C08 authoring-2 resolveu a representação da listagem raiz, o mapa de ambientes, refs compartilhados/preparação de checks, pacote portátil, fluxo JSONL limitado e seeds adicionais finitos. Esses pontos não aguardam escolha do implementador. Continuam faltando codecs/SQL/ensaios acima; ninguém deve marcar os gates fechados por haver uma definição textual.

## Recorte de implementação posterior

Depois da revisão destas propostas, o lead prepara contratos compiláveis e provas determinísticas de fundamento antes de cortar uma wave de produto. Fases posteriores continuam change-scoped/CI conforme AGENTS; não se inicia uma frota que assume OAuth, autoridade ou polling genéricos já existentes. Gates de tenant/driver/escrita forte também precisam de evidência real antes dos claims pertinentes.

Após nova autorização começou [FND](./FOUNDATION.md), limitado aos schemas de referências/observações C01/C02. Isso contribui para B-CONTRACT, mas não o fecha: ainda faltam documento/compiler, handles, mudança/comando/jobs/checks, HttpApi/Client e seams de runtime. Os outros gates continuam abertos; decodificar um ID ou uma Availability não prova autorização ou qualificação.
