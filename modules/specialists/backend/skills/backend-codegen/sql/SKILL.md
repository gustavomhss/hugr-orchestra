---
name: backend-codegen-sql
description: "Engines that generate types from SQL or a database, or check SQL and migrations."
when: "The packet assigns sqlc, SQLx, Kysely or gocqlx output, or names a SQL or migration check."
not-when: "API schemas or Kubernetes manifests (open backend-codegen-schema or backend-codegen-kube)."
---

# SQL engines

Open the one engine the packet assigns. Each leaf gives its pin, inputs, command and outcomes.
