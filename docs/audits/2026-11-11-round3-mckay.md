# Rodada 3 — lifecycle Live e perfis desktop

Agente `sol_mckay`, modelo `gpt-6.1-sol`. Snapshot `e70717ac937f26d38dbf9235860597f86447fa09`. Cinco novos P2, com confiança alta por leitura estática. O lead conferiu lifecycle/captura/transcrição/cliente e handler de exclusão. Nenhum Electron, STT, teste ou runtime executado. M15 exige chamada da API preload pelo renderer autorizado; não se encontrou consumidor de UI e não se alega ataque remoto.

## M11 — P2: Stop durante startup não cancela a captura que ainda vai começar

[`live-loop.ts:309`](../../apps/desktop/src/main/live-loop.ts#L309) marca starting antes dos awaits; running considera esse estado ativo. O atalho em live-ipc.ts:27 então chama stop no segundo acionamento. Mas stop em linhas 332–336 só atua quando meeting.senses já existe.

**Sequência:** Start aguarda servidor/Session/permissão/captura; usuário manda Stop; stop retorna sem invalidar startup; begin continua e instala captura nas linhas 344–389.

**Impacto:** áudio começa a ser capturado/transcrito depois da parada explícita. Não há bypass de permissão: o problema é a intenção autorizada de parar não alcançar o trabalho em preparação. starting evita dois starts, mas não cancela; o AbortController posterior não governa startSenses.

**Correção/teste:** tentativa com geração/cancelamento e cleanup de recursos adquiridos tardiamente. Segurar begin numa barreira, chamar Stop e liberar; exigir ausência de captura ativa e nenhum running publicado depois.

## M12 — P2: deadline de stop STT não encerra socket nem entrega tardia

[`live-transcriber.ts:133`](../../apps/desktop/src/main/live-transcriber.ts#L133) envia CloseStream e espera close ou três segundos. Se timer vence, retorna sem fechar socket ou remover handlers. stopped só afeta close/reconnect; onmessage em linhas 83–104 ainda entrega finals.

**Cenário:** engine STT ignora/atrasa CloseStream. Caller considera parada concluída, mas conexão/callbacks persistem. Finals podem chegar depois de flush/meeting stop e callbacks antigos podem atualizar overlay sem checar se a meeting ainda é atual em live-loop.ts:158–173.

**Limite:** captura de áudio é parada antes; este item não afirma microfone continuando a gravar. **Correção/teste:** terminar conexão e entrega ao acabar a janela de flush. Fake STT que ignora CloseStream e envia final tardio deve resultar em socket fechado e zero eventos posteriores. O fake atual fecha imediatamente e mascara a ordem.

## M13 — P2: stop com segmentos pendentes entra em retry sem possibilidade de entrega

[`live-meeting-client.ts:64`](../../apps/desktop/src/main/live-meeting-client.ts#L64) transforma falha de append em sucesso da promise e agenda retry; stop em linhas 101–105 aguarda essa promise e encerra a meeting mesmo com pending. [`meeting.ts:125`](../../packages/core/src/session/meeting.ts#L125) recusa append depois de time_ended.

**Sequência:** último append falha transitoriamente; stop funciona; retry tenta segmentos numa meeting já encerrada e recebe ended permanentemente, rearmando timer a cada dois segundos. Falha de append em voo também pode assentar depois do clearTimeout de stop e rearmar timer.

**Impacto:** pendências ficam apenas em memória e não são recuperáveis pelo endpoint normal; perdem-se ao sair. Timers/requisições de reuniões antigas podem persistir. O contador unsent é devolvido e registrado em log: não se afirma que o código promete sucesso total ou esconde esse contador, mas não há recuperação durável ou término do retry impossível.

**Mitigadores:** IDs estáveis tornam retry idempotente enquanto meeting aberta; não autorizam append posterior. **Correção/teste:** protocolo recuperável de finalização, persistência de pendências ou janela autorizada de entrega, com fim explícito de retries quando não podem funcionar. Testar append falho seguido de stop bem-sucedido, inclusive falha assentada depois da limpeza.

## M14 — P2: capturas concorrentes restauram opacity inconsistente do overlay

[`live-frame.ts:14`](../../apps/desktop/src/main/live-frame.ts#L14) captura opacity, põe zero e restaura snapshot no finally, sem coordenar chamadas. O lifecycle permite Look concorrente antes de send instalar sua proteção em live-loop.ts:192–196/244/277–279.

**Interleaving:** A lê 1 e põe 0; B lê 0; A termina e restaura 1; B termina e restaura 0. Overlay fica transparente depois de ambas concluírem. show/reassert não restaura esse valor.

**Impacto:** estado, respostas e controles ficam invisíveis nas plataformas onde opacity é efetiva. **Correção/teste:** serialização da operação ou contagem/ownership com snapshot inicial único. Duas capturas com barreiras, concluindo A antes de B, devem restaurar a opacity original. Finally isolado não serializa snapshots compartilhados.

## M15 — P2 condicionado: excluir perfil default pela API impede startup seguinte

[`ipc-app-dock.ts:316`](../../apps/desktop/src/main/ipc-app-dock.ts#L316) aceita default como profileID e grava deleting/deleted. Preload expõe appDockDeleteProfile; não foi encontrado consumer de UI. O bootstrap em ipc-app-dock.ts:69 chama ensureActive(default) incondicionalmente; [`app-dock-profile-registry.ts:247`](../../apps/desktop/src/main/app-dock-profile-registry.ts#L247) recusa tombstone. Erro escapa e startup em index.ts:498–507 sai com código 1.

**Cenário:** renderer autorizado exclui default, ou processo interrompe após markDeleting. Próximo lançamento falha mesmo havendo outros perfis. Não é caminho de página remota: Dock remoto não recebe preload.

**Mitigador:** impedir reutilização da partition apagada é correto; falta política de perfil reservado ou alternativa no bootstrap. **Correção/teste:** recusar exclusão de identidade reservada ou escolher identidade nova sem ressuscitar storage. Excluir/interromper default e executar bootstrap real; exigir abertura normal ou recusa prévia da operação.

## Cobertura e descartes

Leitura de main/preload/renderer, wrappers de frame/origin, IPC Live/Dock/WSL/stores, navegação/protocolo/deep links/download, permissões/captura/STT/segmentação e guest forwarding. Main/Dock têm sandbox/contextIsolation e nodeIntegration=false; Dock remoto não recebe window.api. Deep link new-session preenche draft, sem auto-submit encontrado. Downloads usam chooser/frame/limites e protocolo valida host/containment.

Não se promoveu ausência isolada de origin check a ataque sem entrada remota capaz de invocar IPC. Store amplo não é ataque por si do cliente autorizado. Não se repetiram owned serve, drafts, publicação ou supervisor. Sem Electron/browser/matriz de OS ou prova exaustiva de cada método Dock.
