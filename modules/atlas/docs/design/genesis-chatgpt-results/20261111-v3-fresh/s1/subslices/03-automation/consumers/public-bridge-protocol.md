# Protocolo público dos consumidores S1-03

Este procedimento implementa as perguntas e quotas congeladas em `public-cases.json`; não muda perguntas, respostas esperadas ou critérios. Nenhum resultado de caso está antecipado aqui. Cada caso usa contexto nativo novo, sem fonte bruta, oracle reservado, texto de juízes ou respostas de outros consumidores.

## Acesso e pedidos

Use somente respostas reais de `ownership.index` e `ownership.read`, executadas pela principal através da ponte que chama a CLI oficial do release S4. Não use ferramentas próprias, filesystem, rede, memória de outros casos ou conhecimento geral como evidência deste produto. A separação é por contexto e protocolo; não há alegação de filesystem sandbox.

Solicite uma operação de cada vez, em JSON visível:

```json
{"operation":"index","query":{"scope":"orchestra.s1","need":"flow"}}
```

Para ler, forneça exatamente uma seleção, `key` ou `need`, e um limite de bytes positivo. `section` é opcional e deve usar o título exato de uma seção depth2 obtido pela navegação disponível. Exemplo de forma, sem resposta de domínio:

```json
{"operation":"read","query":{"scope":"orchestra.s1","key":"CHAVE_DO_ARTEFATO","maxBytes":12000}}
```

O retorno inclui pedido, exit code e stdout/stderr originais da CLI. O envelope não substitui a resposta Atlas. Solicitações inválidas ou acima da quota são recusadas pela ponte e não se tornam consultas Atlas fictícias. A principal preserva pedidos, respostas, bytes encaminhados e recibos.

## Quotas e uso direto

Por caso: no máximo **2 consultas index**, **5 consultas read** e **60.000 bytes UTF-8 efetivamente devolvidos**, incluindo o envelope da ponte. Os limites são os congelados antes da produção. Um pedido de read não pode ultrapassar o saldo de bytes do caso; não se estima uso de tokens a partir desses números.

Comece pelo index pertinente ao pedido. O despacho identifica os intermediários previstos no plano público, apenas por chave. Solicite leitura direta de cada uma dessas chaves dentro da quota para registrar o caminho realmente disponível, mesmo que uma consulta anterior tenha retornado HOLD. Uma tentativa recusada não conta como consumo do corpo nem como satisfação da obrigação de uso direto.

Se o index estiver disponível, use suas seções e links para uma leitura pequena e aprofunde somente quando o problema exigir. Se houver indisponibilidade do store ou de uma seleção, mantenha a razão exata e não trate fonte indisponível como ausente. Não leia versões históricas para apresentá-las como atuais.

## Resposta do consumidor

Depois das consultas necessárias, responda à pergunta somente com apoio no conteúdo efetivamente recebido. Identifique as consultas que sustentam a resposta, as incertezas e o que não pôde ser determinado. Uma recusa da porta pode demonstrar impedimento de acesso; ela não demonstra a resposta de domínio nem um PASS do caso, inclusive no caso de abstenção.

Não emita aceite da missão, binding, manutenção ou conclusão global. Os mesmos dois juízes da execução avaliarão o resultado contra os critérios e respostas reservadas que permanecem fora deste contexto. Campos físicos de uso/cobrança não expostos são UNKNOWN.
