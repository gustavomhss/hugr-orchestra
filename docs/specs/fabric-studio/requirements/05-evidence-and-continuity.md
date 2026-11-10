# Requirements — evidências, continuidade e compartilhamento

Todos os itens são propostas; M = cenário mecânico futuro, não executado. “Persistido”, “observado” e “verificado” não são sinônimos.

## Validação e evidências

| ID / método | Obrigação | Aceitação observável | Contraprova | Origem / pendências |
| --- | --- | --- | --- | --- |
| FS-VAL-001 / M | Validação deve ter pergunta, critério e alcance identificáveis. | Antes/depois do check, usuário identifica ambiente, identidade, população/amostra e condição de aceitação. | Narrativa “parece certo” ou número de checks não comprova uma afirmação de negócio. | D:§16; D:I07 |
| FS-VAL-002 / M | Confirmação de API e readback devem ter alcance separado da correção de negócio. | A alteração de definição pode estar observada enquanto o dado continua não validado. | Exit value “success”, 202 ou job concluído não aprova automaticamente os dados. | D:§16; D:A12 |
| FS-VAL-003 / M | Check não executado, falho ou inconclusivo não deve passar. | Falta de acesso, instrumento quebrado ou comparação impossível preserva o estado correspondente. | Ausência de rows por erro não é interpretada como “zero problemas”. | D:§16; D:A12 |
| FS-VAL-004 / M | Reconciliação deve usar contextos comparáveis ou declarar limitação. | Comparar totais registra filtros, identidade, período e versão/watermark relevantes. | Comparação de populações diferentes não recebe aprovação silenciosa. | D:J05; D:§16 |
| FS-VAL-005 / M | Critérios de negócio devem superar mera contagem quando a afirmação exige conteúdo. | Conferência de receita identifica exclusões e reconciliação adequadas à regra escolhida. | Row count igual não é apresentado como equivalência semântica completa. | D:J02; D:§16 |
| FS-VAL-006 / M | Evidência deve conservar proveniência, idade e correlação com o trabalho. | Resultado aponta para revisão, operação/observação e contexto que o produziram. | Evidência antiga não é reutilizada como aprovação de outra revisão ou destino. | D:I06; D:§16; D:§19.2 |
| FS-VAL-007 / M | Evidência simulada deve permanecer distinguível de execução real. | Fixtures, exemplos, documentação e tenant real são identificados no resultado/histórico. | Mock ou fonte Microsoft não se torna recibo de operação bem-sucedida do usuário. | D:§16; D:§24.2 |

## Continuidade, portabilidade e exclusão

| ID / método | Obrigação | Aceitação observável | Contraprova | Origem / pendências |
| --- | --- | --- | --- | --- |
| FS-HIS-001 / M | Preferências duráveis devem ter propriedade/revisão consistente. | Ordem, abas, tamanhos e pins salvos reaparecem ligados à revisão pessoal correta. | Estado efêmero de loading/foco não sobrescreve a organização persistida. | D:§9.3; D:§17.1 |
| FS-HIS-002 / M | Rascunhos devem ser preservados conforme política explícita de salvamento e recuperação. | Interrupção ou troca de contexto permite recuperar/decidir sobre edições pendentes sem retargetar o conteúdo. | Rascunho de um recurso não é salvo remotamente em outro por nome igual. | D:§8.4; D:§17.2; D:Q03 |
| FS-HIS-003 / M | Retomar espaço deve revalidar referências e acesso atuais. | Composição salva reaparece com contexto válido, dados autorizados ou estados de indisponibilidade. | Documento salvo não restaura grants, tokens expirados ou aprovação consumida. | D:J07; D:A13 |
| FS-HIS-004 / M | Compartilhamento deve permitir handoff seguro do trabalho. | Destinatário recebe receita/referências sanitizadas e resolve acesso/destinos com sua identidade. | Resultado privado, credencial ou autoridade do remetente não passa a pertencer ao destinatário. | D:J07; D:§17.3; T:T21; D:Q10 |
| FS-HIS-005 / M | Excluir espaço deve ser independente de excluir recursos Fabric. | Limpeza de composição/rascunho mostra seu alcance local sem executar mutação remota. | Usuário não apaga tabela/job/workspace por remover seu painel ou espaço salvo. | D:§19.4; D:I01 |
| FS-HIS-006 / M | Desconectar deve interromper o uso local da conexão sem fingir apagar efeitos remotos. | Novos acessos autenticados e observações locais pertinentes param; jobs/agendas remotos têm estado/controle separados. | Desconectar não revoga retrospectivamente exportação nem confirma cancelamento de workload. | D:§19.4; D:§15.3 |
| FS-HIS-007 / M | Usuário deve poder inspecionar e limpar o conteúdo mantido conforme política. | Classes de dados salvos, prazos e efeitos de limpeza são compreensíveis e executáveis no escopo autorizado. | Exclusão que remove prova necessária segue o comportamento de proveniência definido, sem esconder o impacto em jobs. | D:§19.4; R:RT-02; D:Q03 |
| FS-HIS-008 / M | Portabilidade deve preservar limites do que está sendo exportado. | Pacote de composição/definições informa versões, referências a resolver e conteúdo que não inclui. | Exportação/Git não é anunciada como backup/restauração integral de dados, credenciais e ambiente. | D:§17.2; F:F27 |
| FS-HIS-009 / M | Espaços e evidências locais autorizados devem ser acessíveis offline dentro da política aplicável. | Sem rede, material disponível localmente cuja autorização/retenção permitem leitura reabre com idade e limite de status remoto explícitos. Conteúdo ausente ou que exija reautorização online fica indisponível com motivo. | Falta de rede por si só não bloqueia material autorizado local; acesso offline não restaura grant revogado conhecido, inicia execução nem cria fila oculta. | D:§4.4; D:I06; D:I12; D:Q03; crítica RC4-01 |
