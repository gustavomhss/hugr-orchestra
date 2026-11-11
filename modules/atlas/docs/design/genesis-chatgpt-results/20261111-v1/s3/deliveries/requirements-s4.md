# Entrega S3 → S4: integração de leitura, ativação e migração

Este é um pacote de preparação bloqueado; não há candidato de produto ou observações de leitor para certificar o host. Consumir o commit/hash indicados no handoff, e não a branch móvel.

## Portas e observações exigidas

- A ativação passa por `composeRuntime(...).check`, `runtime.handler.handle("atlas-emit", ...)` e a decisão real de `commitProjection`. Não usar `persistProjection` nem inserir uma projeção manual para preparar um controle válido.
- O readback e o índice são `runtime.ownership.read/index`. Guardar o retorno integral, incluindo manifesto/result/body/receipt e `historical`. Não substituir HOLD por uma leitura direta de CAS.
- Validação local cobre a closure exigida; corrupção do manifesto/autoridade compartilhados cobre todas as leituras dependentes. O controle independente deve ter binding S1 que comprove sua independência.
- Em drift/rebuild falho, uma projeção antiga legível continua sujeita aos inputs atuais. Um reader separado deve observar HOLD quando o binding deixou de valer.
- `historical:true` não seleciona arbitrariamente uma geração antiga e não serve conteúdo untrusted. Ele preserva validação de integridade/reviews/dependências.
- O retorno `emitted:true` sozinho não demonstra a seleção pedida. O caso A → B → A precisa do readback exato por causa do achado de DEDUP descrito na proposta.

## Estado entregue

Treze formas de cenário estão preparadas em `cases/`; nenhuma tem processo/resultado de produto. A proposta de recusa evita reportar reativação não aplicada, mas não implementa restore nem rollback compatível. Arquivos compartilhados permanecem na base; S5 precisa integrar e devolver candidate SHA antes das provas afetadas.

S4 não deve converter estes casos preparados em AC-09/10 PASS. Vincular scope, fonte, candidato, autoridade, reader/caller, estado antes/depois, saída e erro efetivo. Entregar as observações novas a S5 no mesmo candidato. O recebimento e o consumo deste pacote ainda precisam de recibo próprio de S4.
