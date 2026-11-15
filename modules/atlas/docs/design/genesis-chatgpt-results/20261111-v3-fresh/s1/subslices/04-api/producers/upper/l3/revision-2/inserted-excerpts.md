# Trechos inseridos exatos — revisão 2

## L3-02

```markdown
Dependências de construção devem ser acíclicas: rejeitar ciclos. A navegação pode conter ciclos, mas cada consulta deve ter limite definido de leituras/contexto e evitar revisitar artefatos já percorridos.
```

## L3-01

```markdown
### Exemplos locais congelados de comparação

Os cenários abaixo fixam a aplicação da regra; não relatam alterações ou verificações executadas.

**EX-L3-01 — propagar (S1-04-M1).** Num candidato que acrescenta um campo público a `session.prompt`, falta a evidência obrigatória de encaminhamento pelo handler. A comparação fica congelada assim: corpo igual; autoridade API igual; validade `supported` → `blocked`; novo gap de encaminhamento; evidência pertinente antes vinculada e agora indisponível para sustentar o candidato. O resultado visível mudou apesar do Markdown igual. Propagar a revalidação aos dependentes de construção e manter os claims afetados em HOLD; links de navegação não ampliam esse conjunto.

**EX-L3-02 — parar (S1-04-M2).** Uma alteração de comentário na receita muda sua versão de input e o recibo da geração. Neste cenário, a revalidação sob o contrato atual confirma o contrato de `session.prompt` e compara todos os componentes do resultado: corpo igual; autoridade igual; validade `supported` preservada; gaps iguais; identidades de evidência pertinentes usadas pelo consumidor iguais. A versão da receita alterada pertence somente ao input/recibo deste caso, não à evidência visível do contrato. Confirmada a identidade canônica validada igual, atualizar recibos e bindings auditáveis e parar a interpretação downstream. Bytes gerados iguais, sozinhos, não autorizam essa decisão; se a receita integrar a evidência visível ou qualquer componente mudar, esta condição de parada deixa de valer.
```

## L3-03

```markdown
Cada leitura apresentada como atual deve vincular as versões exatas dos artefatos a um manifesto aceito de escopo e de fechamento das dependências, válido para os inputs e contratos atuais. Sem esse vínculo, a leitura atual fica em HOLD. Uma consulta histórica deve ser identificada como histórica e não pode ser apresentada como atual apenas por ter sido aceita anteriormente.
```

