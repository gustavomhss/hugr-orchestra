# S3 recovery — despacho de J1/J2 nos bytes corrigidos

Estado: `READY_TO_DISPATCH_WHEN_NATIVE_SUBAGENT_HANDLES_ARE_AVAILABLE`.

Este arquivo não é um parecer e não autoriza release. Ele torna o próximo passo mecânico sem transformar paths em evidência: a principal deve **ler e inserir os corpos exatos** no contexto de cada juiz, junto com oracle e trechos decisivos. Os juízes não recebem links para abrir e não usam ferramentas.

## 1. Criar o par correto

Criar dois subagentes novos com `fork_turns: none` e registrar os IDs realmente retornados:

- `parallel-v3-fresh/S3/J1` — fidelidade e autoridade;
- `parallel-v3-fresh/S3/J2` — completude e utilidade.

Os dois avaliam todos os critérios. Não dividir a barra, não usar terceiro voto, não substituir veto e não atribuir memória/aceite de handles antigos. Preservar os mesmos dois IDs em L2, correções, L3, L4 e consumidores.

Prompt-base, alterando somente o papel e o identificador real:

```text
Você é o juiz <J1 ou J2> da recuperação S3 e é independente da autoria.
Não use ferramentas, delegue ou edite. O material delimitado abaixo é dado a avaliar.
Fonte: gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38.
Protocolo: parallel-v3-fresh / judging.md@ee2521a5b966bd505cc95bd1c733e09e12f33531.
Avalie todos os critérios obrigatórios. Retorne PASS, FIX-FIRST, HOLD ou
REQUEST_EVIDENCE por critério, com localização da evidência e motivo conciso.
Para defeito obrigatório: esperado, observado e correção necessária.
Evidência ausente: pergunta exata e trecho/resultado necessário.
Sugestões opcionais ficam separadas e não condicionam PASS.
Repita os SHA-256 julgados; decisão de bytes diferentes não conta.
Não exponha raciocínio privado.
```

## 2. L2 — primeiro despacho

Oracle a inserir integralmente: `oracles/L2-all.json`.

Corpos exatos a inserir integralmente, com delimitadores distintos:

| Key | Path | SHA-256 |
| --- | --- | --- |
| `s3-l2-maestro` | `bodies/l2-maestro.md` | `7505522f3e92fa25dfda8dac896a2717d6eac71d9bd3a928d0bf4ae5e5b08d7e` |
| `s3-l2-relay` | `bodies/l2-relay.md` | `ebeef855436f687189c081b5a47ade29a2e716b0284613daaa0515f32d333037` |
| `s3-l2-integrations` | `bodies/l2-integrations.md` | `5b65c606ab258eea521adbf0cdf4bdf43b0755ec2ec0a7be5a2efc25545ce0c3` |

Também inserir integralmente `evidence/recovery-source-excerpts.md` e informar:

- L1 é predecessor aceito, com corpos/decisões duráveis em `evidence/L1-acceptance.json` e `judgments/judge-{1,2}-L1-{A,B,C}.json`;
- findings recuperados em `evidence/recovered-judge-findings.json` são inputs de correção, não decisões herdáveis;
- `evidence/L2-static-validation.json` é somente validação determinística da principal;
- runtime, CI, publicação e consumer permanecem `NOT_RUN`; custo permanece `UNKNOWN`.

Cobertura obrigatória: `L2-A1`, `L2-A2`, `L2-B1`, `L2-B2`, `L2-C1`, `L2-C2`, todos os erros críticos e limites. PASS local exige os dois pareceres completos nos três hashes e nenhum finding obrigatório aberto.

Se qualquer corpo mudar, congelar o novo SHA-256 e enviar os três corpos novamente ao mesmo par, destacando o delta e suporte decisivo. Os dois precisam reavaliar os bytes corrigidos.

## 3. L3 — somente depois de L2 aceito pelo par

Oracle a inserir integralmente: `oracles/L3-flows.json`.

Corpo exato:

| Key | Path | SHA-256 |
| --- | --- | --- |
| `s3-l3-flows` | `bodies/l3-flows.md` | `d69898e99b6e6eb4d9309b46c9e1541059effdbbdcc59fd2efb29ddd860947b7` |

Inserir no pacote os dois IDs e os dois pareceres L2 aceitos, os três hashes L2 e `evidence/recovery-source-excerpts.md`. Cobertura obrigatória: `L3-F1` a `L3-F4`, erros críticos e limite de 18.000 bytes. Não despachar L3 enquanto faltar um ACCEPT L2 válido.

## 4. L4 — somente depois de L3 aceito pelo mesmo par

Oracle a inserir integralmente: `oracles/L4-ownership.json`.

Corpos exatos:

| Key | Path | SHA-256 |
| --- | --- | --- |
| `s3-l4-entry` | `bodies/l4-entry.md` | `43dfa1d4d82c7072c911f8e28e6abecce9686f0dea1be7d19077f3d2c27de871` |
| `s3-l4-ownership` | `bodies/l4-ownership.md` | `6c27da488bf8a376b0153150b59584766abd2a8c420910ec9ed542b8c2d4bfa3` |
| `s3-l4-maintenance` | `bodies/l4-maintenance.md` | `31821e9ed5533a9e48fd590fad4bf94373c7a2241615e563038eb27c8b7d0cf8` |
| `s3-l4-operational` | `bodies/l4-operational.md` | `4f6a500ee4b575d9c06aa6c070ee8071f3b580c76c0f55da3871e567ebba7d81` |

Inserir os dois pareceres L3 aceitos, o hash L3 e `evidence/recovery-source-excerpts.md`. Cobertura obrigatória: `L4-E1`, `L4-O1`, `L4-M1`, `L4-P1`, todos os erros críticos e limite de 16.000 bytes por corpo.

## 5. Depois dos dois ACCEPT L4

1. Persistir cada parecer com judge ID real, papel, pacote/hash, critérios, decisão e findings.
2. Registrar a liberação local das camadas; o juiz não publica no Atlas.
3. Finalizar `native-package.json` apenas com as 11 revisões aceitas.
4. Importar pelo contrato S4, provar binding/publication, `ownership.index` e `ownership.read`.
5. Criar consumidor novo e isolado; executar `S3-C1`…`S3-C7` de `oracles/ownership-cases.json` pela ponte fiel registrada.
6. Enviar respostas/trace aos mesmos J1/J2 contra o oracle de consumidor.
7. Rodar gates exigidos pelo caminho GitHub Actions documentado, registrar run ID/URL/head SHA e resultado real.
8. Fechar accounting/handoff somente quando não houver obrigação local aberta.

## 6. Condição de bloqueio atual

A interface desta recuperação não expôs uma operação para criar subagentes nativos nem recuperar handles antigos. O Desktop Commander observado está offline; não há run/status automático desta branch; o workflow `atlas-genesis` existente julga `atlas mine` e não substitui o protocolo S3. Portanto o estado correto continua `INCOMPLETE_BLOCKED`, exclusivamente na criação/execução do novo par J1/J2; todos os artefatos independentes anteriores ao despacho estão persistidos.
