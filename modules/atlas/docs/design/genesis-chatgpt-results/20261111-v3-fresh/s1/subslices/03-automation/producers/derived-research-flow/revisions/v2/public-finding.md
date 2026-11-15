# RF-J2-F01 — condição de início do build

Achado público do juiz J2 sobre research-flow L2 v1 (16980 bytes, SHA256 a4b50fa9ae0b781dbea831aefcb98cb099f93167d4a7a584dc88878fc93bc044), critérios QS-1, CC-3, GO-A1 e GO-A6.

F3 diz: “Sem shard aberto, dispara build detached e responde building/unavailable com motivo.” Isso atribui o disparo a todos os casos sem shard aberto. O predecessor aceito R8.1 condiciona o início à presença do extrator e à ausência de build em curso, além da falta que demanda construção. Receber index_unavailable/index_building não demonstra por si que a consulta iniciou uma construção.

Correção necessária: restaurar em F3 o caráter condicionado do início e separar o resultado building/unavailable do fato de iniciar trabalho; ajustar a linha correspondente de E1 se necessário. Evidência suficiente já está no predecessor aceito, que permanece PASS. Não é necessário abrir fonte bruta, executar produto ou alterar implementação. Nenhum outro achado obrigatório ou pedido de evidência foi apontado para este L2.
