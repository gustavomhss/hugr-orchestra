# Receita v3 — correção de cache em L4 maintenance §2.8

Correção original por `/root/s3_l4_producer` em `2026-11-28T06:59:38Z`, execução `15cc9853-0e71-4950-8813-0bfb66f82c8a`. Estado no momento da correção: `REVIEW_REQUIRED`. O produtor não concede PASS ou aceite.

## Escopo autorizado

O pedido literal está em `correction-v3-request.md`. A principal transmitiu o único achado `L4-M1-CACHE-NEGATIVE` de J1: o item §2.8 confundia rejeição de cache adulterado com falha final da extração. A referência de J1 foi preservada no pedido; seu arquivo não precisou ser aberto. Nenhum oracle nem material J2 foi lido.

A fonte pública pinada `modules/maestro/coordination/src/seat-skill-root.ts` foi lida diretamente nas linhas 90–132. Ela reutiliza somente cache cujo digest corresponde, preserva o contrato de lock, reconstrói a árvore quando necessário e verifica o digest após publicação. O hash integral do arquivo foi calculado apenas para identidade; o produto não foi executado.

## Preservação anterior à edição

Antes de editar maintenance, os doze arquivos ativos da entrega v2 foram copiados byte a byte para `revisions/v2/`: os quatro corpos e os oito registros/receitas/diffs existentes. O arquivo v1 anterior continua em `revisions/v1/`. Nenhum registro original ou recibo v2 foi sobrescrito.

## Única substituição

No corpo maintenance, somente o item §2.8 mudou de:

```text
8. Verifique negativos: arquivo fora da root, invalid UTF-8, symlink/escape, gerado manualmente divergente e cache adulterado devem falhar.
```

para:

```text
8. Verifique negativos: arquivo fora da root, invalid UTF-8, symlink/escape e gerado manualmente divergente devem falhar. Para cache adulterado, a validação deve rejeitar a reutilização da cópia antiga; a extração deve reconstruir e validar uma cópia íntegra quando possível, sob o contrato de lock. A adulteração por si só não exige falha final da extração: erro final somente se a recuperação falhar, inclusive a aquisição do lock ou a verificação da cópia reconstruída. [Fonte: `modules/maestro/coordination/src/seat-skill-root.ts:90–100,118–128`.]
```

Todos os demais bytes de maintenance permanecem iguais. Entry, ownership e operational permanecem byte-idênticos ao conjunto v2. As datas da produção original no corpo não foram alteradas; a data desta correção pertence a seu recibo específico.

## Reprodução e verificação documental

1. Conferir bytes/SHA-256 de `revisions/v2/bodies/l4-maintenance.md` contra `correction-v3-response.json`.
2. Aplicar exatamente uma ocorrência da substituição literal registrada em `substitution`, sem normalizar espaços ou newlines.
3. Comparar os bytes UTF-8 produzidos com o maintenance ativo, seu hash v3 e o limite de 16.000 bytes.
4. Recalcular o unified diff v2 arquivada → maintenance ativo e comparar com `changes-v3.diff`.
5. Conferir os outros três corpos e todos os registros preexistentes contra as cópias v2; conferir também que a fonte estática permaneceu intacta.

Essas verificações documentais foram realizadas. Produto, testes, runtime, build, CI, live e Atlas continuam `NOT_RUN`. GitHub não foi utilizado. J2 permanece independente em sua avaliação de v2; esta correção não presume seu voto nem o altera. O novo conjunto de quatro hashes exige revisão externa e permanece `REVIEW_REQUIRED`.
