# Receita v2 — correção de navegação L4 entry

Correção original por `/root/s3_l4_producer`, em `2026-11-28T06:42:02Z`, execução `15cc9853-0e71-4950-8813-0bfb66f82c8a`. Estado no momento da correção: `REVIEW_REQUIRED`; não há voto semântico nem aceite concedido pelo produtor.

## Pedido e evidência

`correction-request.md` preserva literalmente o finding documental da principal. A principal atestou a existência e a identidade por bytes/hash dos seis nomes de pareceres finais nos refs `19b909e` e `f083a29`. Este produtor recebeu os nomes pelo pedido; não leu arquivos de julgamento, não consultou GitHub e não interpretou votos. O inventário adicional autorizado em `s3-provenance/verification.json` não foi necessário e não foi aberto.

## Preservação anterior à correção

Antes de gravar entry v2, foram copiadas byte a byte as oito peças da entrega v1 para `revisions/v1/`: quatro corpos, `request.md`, `response.json`, `recipe.md` e `changes.diff`. Os registros originais no diretório principal também permanecem intactos. O `response.json` ORIGINAL conserva os hashes da produção v1; para o conjunto vigente, usar `correction-response.json`, que identifica entry v2 e os três corpos inalterados. A receita original documenta sua própria produção v1 e não foi reescrita para mascarar a correção.

## Única substituição

Substituir uma única ocorrência do bullet de §3:

```text
- decisões J1/J2 L1: `judgments/judge-1-L1-A.json` ... `judgments/judge-2-L1-C.json`
```

por:

```text
- decisões J1/J2 L1: `judgments/J1-L1-A-v1-final.md`; `judgments/J2-L1-A-v1-final.md`; `judgments/J1-L1-B-v2.json`; `judgments/J2-L1-B-v2.json`; `judgments/J1-L1-C-v3.json`; `judgments/J2-L1-C-v3.json`
```

Nenhum outro byte do entry muda, inclusive as datas da produção original. A data desta correção fica no recibo próprio. Os corpos ownership, maintenance e operational permanecem idênticos à v1.

## Reprodução documental

1. Conferir o hash do entry v1 em `revisions/v1/bodies/l4-entry.md` contra `correction-response.json`.
2. Aplicar a única substituição literal registrada em `substitution`; exigir exatamente uma ocorrência.
3. Codificar em UTF-8 sem normalizar espaços/newlines e comparar os bytes com `bodies/l4-entry.md` e seu hash v2.
4. Gerar o unified diff v1 arquivada → entry ativo e comparar com `changes-v2.diff`.
5. Conferir os três corpos inalterados e os quatro registros originais contra as cópias v1 e hashes registrados.

Essas verificações foram realizadas apenas sobre artefatos documentais. Não houve execução do produto, testes, build, runtime, CI, live ou Atlas. Os quatro corpos ativos continuam sujeitos ao par de revisão independente, que será acionado pela principal.
