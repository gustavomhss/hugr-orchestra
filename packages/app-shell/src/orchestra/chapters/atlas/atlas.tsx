import { useLocation } from "@solidjs/router"
import { createMemo } from "solid-js"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { parseAtlasRoute } from "./atlas-route"

// Placeholder until the chapter frame (task A18a) replaces this file: it only parses the sub-route.
export default function AtlasPage(_props: ChapterPageProps) {
  const location = useLocation()
  const route = createMemo(() => parseAtlasRoute(location.pathname, location.search))
  return <div class="atlas-scope" data-component="orchestra-atlas" data-atlas-view={route().view} />
}
