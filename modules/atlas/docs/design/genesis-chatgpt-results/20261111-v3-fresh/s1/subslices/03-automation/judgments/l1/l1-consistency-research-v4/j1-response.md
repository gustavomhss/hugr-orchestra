## J1 — PASS semântico para `s1.core.research` L1 v4

**Juiz:** `parallel-v3-fresh/S1-03/J1`  
**Execução:** `34269cf4-d631-41c5-a30b-85b0ec217390`  
**Corpo:** 64.106 bytes; SHA256 `c3925ca6e27465598796ef21815e79980277d4c3194a8b2fda7cf433700675d1`; Git blob `69fda8b4a63d5480b7d78e8f915e1d90fb8a2b8b`.  
**Fonte investigada:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

Recebido o lote completo até o `FIM_DO_LOTE` externo. **Aceito a suficiência semântica do corpo inteiro v4, R0–R14**, reutilizando a avaliação anterior dos trechos inalterados e examinando a substituição de R8.1 contra o ramo literal completo fornecido.

### ROOT-R-L1-F01 — FECHADO

**Localização:** R8.1, condição de disparo do build detached.  
**Critérios:** QS-1, CC-3, GO-A1, GO-A5 e suficiência local AC-01.

A redação corrigida preserva as três condições efetivamente cobradas por `open`: `missing && !building && ctx.extract`. Também distingue os estados que a formulação anterior confundia:

- **Shard atual ausente com fallback stale utilizável:** pode haver disparo de build mesmo que a consulta ainda disponha de shard retido.
- **Build já em andamento ou ausência de `ctx.extract`:** a chamada pode devolver erro sem iniciar outro build.
- **Nenhum shard no escopo:** `index_unavailable` é devolvido antes do ramo de disparo.
- **Nenhum shard utilizável:** o código escolhe `index_building` ou `index_unavailable` conforme progresso, extractor e falha anterior; o erro, isoladamente, não demonstra uma nova execução iniciada por essa chamada.

Essas distinções decorrem diretamente de **RB-S002/E24, `query.ts` 176–225**, incluindo a saída inicial, a seleção de fallback, o cálculo de `missing`/`building`, o `forkDetach` condicionado e os retornos subsequentes. O novo texto sustenta essas condições sem converter inspeção estática em execução observada.

### Registro do julgamento e alcance

**Meu PASS anterior do v3 deixou passar a afirmação incondicional.** Preservo esse parecer como histórico e não atribuo aos bytes antigos a condição agora expressa no v4. O aceite corrente está vinculado à identidade v4 acima.

A principal informou a verificação da substituição única, dos segmentos preservados e da inversa integral. O procedimento congelado antes da aplicação, a herança dos inputs anteriores e o registro separado do bootstrap com `SyntaxError` conservam a proveniência sem transformar o manifesto posterior em receita anterior. Não realizei ferramentas ou hashing nesta revisão.

**Achados obrigatórios abertos neste L1 v4: nenhum. Evidência adicional necessária: nenhuma.** Os demais critérios pertinentes mantêm a avaliação anterior no conteúdo inalterado.

Este parecer não aceita nem atualiza automaticamente o L2: a mudança de predecessor e o corpo derivado exigem sua revisão própria. Execução de produto, binding Atlas, consumidores, manutenção e união permanecem fora deste PASS semântico.