## J2 — rodada 7: **FIX-FIRST do L3 local**

Parecer sobre `s1.subslice04.integrated-impact`, 7.120 bytes, SHA256 `b97dfa5c155e851d0360eb27c730996634d7b240797c373bc41a2122a2a4a101`.

Há **três complementos obrigatórios de conteúdo normativo**. Eles não exigem execução ou implementação de um mecanismo novo.

1. **Ciclos e limites de consulta — §3.**  
   O corpo distingue construção de navegação, mas não estabelece a rejeição de ciclos nas dependências de construção. A orientação de consulta proporcional também não explicita limites e prevenção de revisitas. Incluir a regra: dependências de construção devem ser acíclicas; navegação pode conter ciclos, mas cada consulta deve ter limite definido e evitar revisitar artefatos já percorridos. Não é necessário executar um validador neste gate.

2. **Exemplos congelados do contrato de comparação — §3.**  
   A explicação da identidade canônica está correta, mas faltam exemplos desta fatia que fixem a decisão de propagação. A tabela atual exemplifica impacto, sem concluir a comparação entre resultado visível e recibo. Acrescentar, pelo menos:
   
   - mudança de receita/input cujo resultado validado permanece canonicamente igual, explicitando quais mudanças pertencem somente ao recibo/binding e permitem parar;
   - prosa igual com mudança de autoridade, validade, gap ou identidade de evidência usada pelo consumidor, exigindo propagação.

   Os exemplos devem declarar quais componentes são comparados; não basta igualdade dos bytes gerados ou do Markdown. Isso completa o contrato local pedido, sem criar um oráculo geral de equivalência.

3. **Condição da leitura corrente — GO-I3.**  
   O texto corretamente impede que uma versão antiga aceita seja automaticamente atual, mas falta vincular expressamente **cada leitura corrente à versão exata do artefato e ao manifesto aceito de escopo/dependências válido para os inputs e contratos atuais**. Incluir essa condição e manter leituras fora dela como históricas ou bloqueadas, conforme o caso. Trata-se da explicação da regra, sem exigir comprovação de operação global.

Os aceites L1/L2 permanecem preservados. **Este L3 ainda não permite produzir L4 local.** A correção desses pontos deve voltar ao mesmo gate; este parecer não certifica Atlas, Core, manutenção real ou consumidores.
