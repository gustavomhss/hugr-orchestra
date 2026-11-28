# Rodada 3 — promessas de jornadas e contratos públicos

Agente novo `sol_thiel`, modelo explícito `gpt-6.1-sol`, lente de promessa versus implementação. Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Três novos P2 segundo julgamento do lead. Nenhum vendor, provider, teste ou runtime executado. T3 foi apontado pelo lead e confirmado independentemente; não duplica E14 de formato de exportação.

## T1 — P2: UI exige GitLab 18.1 para pipeline sem inputs

**Confiança alta.** A copy shipped em [`actions-dialogs-copy.ts:5`](../../packages/app-shell/src/i18n/actions-dialogs-copy.ts#L5) oferece Run e informa ausência de inputs. Catálogo GitLab não exige 18.1 para dispatch comum. dispatch-data.ts:118–126 produz definitions vazias; input-definitions.ts:26–62 as converte em {}.

[`actions/dialogs.tsx:121`](../../packages/app-shell/src/orchestra/actions/dialogs.tsx#L121) envia inputs:parsed.value mesmo vazio. launch.ts:31–36 passa isso a GitLabCommandInputs; inputs.ts:21–27 trata qualquer supplied definido como uso do recurso inputs e native.ts:100–106 exige >=18.1.

**Cenário:** GitLab 17.9/18.0, projeto com YAML simples sem spec.inputs/includes; confirmar Run sem campos. O objeto vazio criado pela UI bloqueia dispatch suportado quando inputs é omitido. Também exige consulta de metadata desnecessária.

**Mitigadores:** falha antes do POST; nenhum pipeline duplicado. Backend/cliente aceitam omissão e GitLab >=18.1 não sofre essa restrição de versão. **Correção/teste:** omitir inputs quando não há definição, mantendo gates para inputs reais. Diálogo → transport em GitLab 17.9 deve enviar POST sem inputs nem metadata gate específico desse recurso.

## T2 — P2: payload aceito pelo CLI excede limite do parser SSE público

**Confiança alta.** [`generated/client.ts:587`](../../packages/client/src/generated/client.ts#L587) rejeita buffer >1.048.576 unidades UTF-16 antes de separar frames nas linhas 594–609. O contrato de prompt/eventos não impõe teto equivalente. O gerador, não o arquivo gerado, é o lugar da correção.

**Cenário real:** run --attach com PNG de aproximadamente 800 KiB. [`handlers/run.ts:303`](../../apps/cli/src/commands/handlers/run.ts#L303) aceita até 10 MiB e cria data URI inline para servidor remoto; base64 no PromptAdmitted ultrapassa o limite SSE. Mesmo chunks pequenos somam um evento grande; um chunk grande com vários frames pequenos também pode ser recusado antes do split.

**Consumidor:** turn.ts:39–41 usa sessions.events e suprime o erro. Durante a execução o usuário perde live output; histórico só é recuperado após wait em linhas 51–55. Não é perda durável nem o mecanismo E2 de reconexão. Não se afirma consumer ativo do wrapper equivalente da app-shell.

**Correção/teste:** separar frames completos antes do limite do resto incompleto; alinhar tamanho admitido e tamanho por evento ou mudar contrato de mídia. Alterar tooling/httpapi-codegen e regenerar, nunca editar generated. Attachment aceito deve reaparecer no SSE; chunking de frames pequenos deve ser indiferente; stream excessivo sem delimitador continua bounded.

## T3 — P2: importar transcript inicia modelo enquanto restaura o conteúdo

**Confiança alta na execução involuntária; Busy depende da ordem.** [`commands.ts:75`](../../apps/cli/src/commands/commands.ts#L75) promete import de transcript, sem opção de executar. [`handlers/import.ts:32`](../../apps/cli/src/commands/handlers/import.ts#L32) cria Session e chama synthetic por texto, omitindo resume:false.

[`session.ts:608`](../../packages/core/src/session.ts#L608) registra synthetic e chama resumeDetached por default; linhas 346–354 disparam execution.resume. Coordinator inicia force=true e runner/llm.ts:619–627 executa turno mesmo sem inbox. [`to-llm-message.ts:152`](../../packages/core/src/session/runner/to-llm-message.ts#L152) apresenta o texto como user e o runner materializa ferramentas normais.

**Cenário:** arquivo no formato nativo, ID novo, Location válida e modelo configurado. Import envia texto histórico ao provider e pode produzir respostas durante a restauração. Se o turno mantém ownership, synthetic seguinte recebe Busy; o import não espera, retenta ou desfaz o prefixo. Repetição falha pelo ID já existente.

**Impacto:** custo/envio indevidos, contexto contaminado e importação parcial. Ferramentas autorizadas podem produzir efeitos, mas isso não foi reproduzido; permissões/sandbox/ToolSafety continuam aplicados. Sem modelo, o drain pode apenas registrar falha.

**Calibração:** o Sol propôs P1 por conversão de restauração em execução. O lead registra P2 pelo efeito determinístico comprovado e mantém efeitos de ferramenta como impacto condicionado, sem afirmar bypass ou exploração executada.

**Correção/teste:** resume:false durante toda restauração, sem provider run; tratar atomicidade/idempotência do import separadamente. Importar vários textos pelo servidor real com provider observável deve produzir zero chamadas de modelo/host/tool, todos os textos presentes e nenhuma resposta nova.

## Matriz de jornadas

First-run/pasta/trust/init Git, status/login Claude, Workspaces criar/listar/selecionar/remover, integrações/targets/idempotência, Actions binding/stale revision/source review e sdk-next constructor/router foram rastreados ou amostrados sem novo achado fechado nesses trechos. Login real, operações vendor completas e execução embedded não foram verificados.

Falhas novas: Actions sem inputs (T1), SSE com arquivo aceito (T2) e import nativo (T3). UI export/import é E14; modelos/protocolos/variantes são E6/E7, sem duplicação. Copy de workspace diz own branch enquanto implementação usa detached HEAD, mas não se fechou defeito funcional suficiente; permaneceu fora da contagem. Não há opinião de mercado, falta genérica de moat ou mero gap de documentação contado como bug.
