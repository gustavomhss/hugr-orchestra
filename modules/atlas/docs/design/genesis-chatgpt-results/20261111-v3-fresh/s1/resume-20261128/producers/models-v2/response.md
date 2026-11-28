# Correção v2 de `s1.core.models` pronta para revisão

Produzi o delta mínimo em [body.md](sandbox:/workspace/scratch/dd08f46a3e40/agents/correct_models/body.md): **4200 bytes UTF-8**, SHA-256 `5a789d39a00798ca0f99384f38315b58a1bbe7dbe0e0d3f9366104a1d0b98091`.

- **F01:** a exigência `model.api.url !== undefined` agora aparece explicitamente para as três alternativas OpenAI-compatible: API nativa, `@ai-sdk/openai-compatible` e `@openrouter/ai-sdk-provider`. Os ramos OpenAI Responses e Anthropic Messages foram preservados.
- **F02:** a chave de cache SDK agora inclui `providerID`, `api` e `options`.
- A cadência foi limitada à construção da route quando `resolve` executa; o texto não afirma frequência por turno sem inspeção do chamador.

Foram aplicadas exatamente três substituições; o restante do corpo original permaneceu intacto. O SHA-256 original conferido é `4af060adbf07f6e7e759bd8574793155c5676fd87fbef77125c70cc618ffdcfe`.

[delta.json](sandbox:/workspace/scratch/dd08f46a3e40/agents/correct_models/delta.json) registra antes/depois e hashes; [recipe.json](sandbox:/workspace/scratch/dd08f46a3e40/agents/correct_models/recipe.json) registra as fontes literais realmente lidas e seus limites. Pedido e resposta originais acompanham o delta.

Estado **REVIEW**. Não houve acesso a oracle ou pareceres privados, teste, execução de modelo, escrita remota ou commit. Nenhum PASS foi declarado.
