import { Format } from "@orchestra/core/format"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const FormatterHandler = HttpApiBuilder.group(Api, "server.formatter", (handlers) =>
  handlers.handle("formatter.status", () => response(Format.Service.use((format) => format.status()))),
)
