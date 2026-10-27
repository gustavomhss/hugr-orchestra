export * as ActionsResourcesCopy from "./actions-resources-copy"

// Copy for Actions resources, artifacts and caches.
export const dict = {
  "orchestra.actions.resources.failed": "{{resource}} could not be loaded",
  "orchestra.actions.resources.failedDetail": "The provider request failed. Check the connection and sign-in, then refresh.",
  "orchestra.actions.cacheUsage.total": "Active usage is {{size}} across {{count}} cache keys, as reported by the provider.",
  "orchestra.actions.cacheUsage.totalOne": "Active usage is {{size}} across 1 cache key, as reported by the provider.",
  "orchestra.actions.scheduleUnreadable": "Workflow source could not be read",
  "orchestra.actions.scheduleProblem.not_found": "The workflow file is not on the default branch.",
  "orchestra.actions.scheduleProblem.source_unresolved": "The provider did not confirm this file at the default-branch commit.",
  "orchestra.actions.scheduleProblem.source_conflict": "The file changed while it was being read.",
  "orchestra.actions.scheduleProblem.metadata_truncated": "The provider truncated the file listing.",
  "orchestra.actions.scheduleProblem.invalid_input": "The workflow YAML could not be parsed.",
  "orchestra.actions.cacheUsage.listed": "The listed keys total {{size}}.",
} as const

export const dictBr: Record<keyof typeof dict, string> = {
  "orchestra.actions.resources.failed": "Não foi possível carregar {{resource}}",
  "orchestra.actions.resources.failedDetail": "A requisição ao provedor falhou. Verifique a conexão e o login e atualize.",
  "orchestra.actions.cacheUsage.total": "O uso ativo é de {{size}} em {{count}} chaves de cache, conforme informado pelo provedor.",
  "orchestra.actions.cacheUsage.totalOne": "O uso ativo é de {{size}} em 1 chave de cache, conforme informado pelo provedor.",
  "orchestra.actions.scheduleUnreadable": "Não foi possível ler a origem do workflow",
  "orchestra.actions.scheduleProblem.not_found": "O arquivo do workflow não está na branch padrão.",
  "orchestra.actions.scheduleProblem.source_unresolved": "O provedor não confirmou este arquivo no commit da branch padrão.",
  "orchestra.actions.scheduleProblem.source_conflict": "O arquivo mudou enquanto era lido.",
  "orchestra.actions.scheduleProblem.metadata_truncated": "O provedor truncou a listagem de arquivos.",
  "orchestra.actions.scheduleProblem.invalid_input": "Não foi possível interpretar o YAML do workflow.",
  "orchestra.actions.cacheUsage.listed": "As chaves listadas somam {{size}}.",
}
