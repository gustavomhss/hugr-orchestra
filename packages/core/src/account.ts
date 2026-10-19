export * as AccountV2 from "./account"

import { Schema } from "effect"

// Column types for the account tables in ./account/sql. The console Account service that wrote them is gone; the
// tables stay so existing databases keep their migration history.
export const ID = Schema.String.pipe(Schema.brand("AccountID"))
export type ID = Schema.Schema.Type<typeof ID>

export const OrgID = Schema.String.pipe(Schema.brand("OrgID"))
export type OrgID = Schema.Schema.Type<typeof OrgID>

export const AccessToken = Schema.String.pipe(Schema.brand("AccessToken"))
export type AccessToken = Schema.Schema.Type<typeof AccessToken>

export const RefreshToken = Schema.String.pipe(Schema.brand("RefreshToken"))
export type RefreshToken = Schema.Schema.Type<typeof RefreshToken>
