export * as CapabilityServiceProviders from "./providers"

import { Wildcard } from "../../util/wildcard"
import type { CapabilityDiscovery } from "../catalog/discovery"

export const names = Object.freeze([
  "cloudflare", "supabase", "vercel", "neon", "railway", "sentry", "grafana", "globalping", "linear", "stripe", "netlify", "prisma_postgres",
] as const)
export const platformNames = Object.freeze(names.map((provider) => `platform_${provider}`))

// Metadata-only presets transcribed from pinned Hermes manifests. See PROVENANCE.md.
const defaultExcluded: Readonly<Record<string, readonly string[]>> = Object.freeze({
  cloudflare: Object.freeze([
    "docs", "*_radar_*", "*_accounts_magic_*", "*_accounts_mnm_*", "*_accounts_cni_*", "*_accounts_teamnet_*",
    "*_accounts_cloudforceone_*", "*_accounts_dlp_*", "*_accounts_devices*", "*_accounts_dex_*",
    "*_accounts_datasecurity_*", "*_accounts_emailsecurity_*", "*_accounts_scim_*", "*_accounts_gateway*",
    "*_accounts_zerotrust_*", "*_accounts_one_*", "*_accounts_brandprotection_*", "*_accounts_intel_*",
    "*_accounts_urlscanner_*", "*_accounts_vuln_scanner_*", "*_zones_securitycenter_*", "*_accounts_securitycenter_*",
    "*_zones_api_gateway_*", "*_zones_schema_validation*", "*_zones_token_validation*", "*_zones_waiting_rooms*",
    "*_accounts_addressing_*", "*_accounts_shares*", "*_accounts_slurper_*", "*_zones_web3_*",
    "*_accounts_flagship_*", "*_zones_secondary_dns_*", "*_accounts_secondary_dns_*", "*_user_load_balancers*",
  ]),
  neon: Object.freeze(["search", "fetch", "list_docs_resources", "get_doc_resource", "query_logs", "list_log_fields",
    "list_log_field_values", "provision_neon_auth", "configure_neon_auth", "get_neon_auth_config"]),
  railway: Object.freeze(["railway-agent"]),
  grafana: Object.freeze(["ask_assistant", "agento11y_*"]),
  globalping: Object.freeze(["help", "compareLocations", "limits"]),
  prisma_postgres: Object.freeze(["search_prisma_documentation"]),
})

/** Filters metadata only. Original full-envelope generation and byte count remain authoritative. */
export function filterCatalog(provider: string, catalog: CapabilityDiscovery.VendorList): CapabilityDiscovery.VendorList {
  if (!names.some((name) => name === provider)) return { ...catalog, tools: [] }
  const excluded = Object.hasOwn(defaultExcluded, provider) ? defaultExcluded[provider] : []
  return { ...catalog, tools: catalog.tools.filter((tool) => !excluded.some((pattern) => Wildcard.match(tool.name, pattern))) }
}
