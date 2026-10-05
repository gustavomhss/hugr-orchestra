import { lookupRosterMember, type RosterMember } from "./roster"

export type RouteGrant = Pick<RosterMember, "memberId" | "role" | "abilityClass" | "returnCard" | "forbiddenActions">

export type RouteGrantLookup =
  | { status: "ROUTED"; grant: RouteGrant }
  | { status: "HOLD"; reason: "malformed-member-id" | "unknown-member-id" | "forged-member-id" }

export function lookupRouteGrant(memberId: unknown): RouteGrantLookup {
  const member = lookupRosterMember(memberId)
  if (member.status === "HOLD") return member
  if (member.member.memberId === "maestro") return { status: "HOLD", reason: "forged-member-id" }
  return {
    status: "ROUTED",
    grant: {
      memberId: member.member.memberId,
      role: member.member.role,
      abilityClass: member.member.abilityClass,
      returnCard: member.member.returnCard,
      forbiddenActions: member.member.forbiddenActions,
    },
  }
}
