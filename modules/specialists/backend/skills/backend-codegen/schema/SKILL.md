---
name: backend-codegen-schema
description: "Engines that generate or check code from a schema: Protocol Buffers, OpenAPI, AsyncAPI or JSON Schema."
when: "The packet assigns artifacts generated from, or checks on, a .proto module, an OpenAPI or AsyncAPI document, or a JSON Schema."
not-when: "SQL, database-derived types or Kubernetes manifests (open backend-codegen-sql or backend-codegen-kube)."
---

# Schema engines

Open the one engine the packet assigns. Each leaf gives its pin, inputs, command and outcomes.
