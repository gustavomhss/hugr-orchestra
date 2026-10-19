# FIX-02 · Narrow the review record before reading `member`

Model: `opencode-go/deepseek-v4.1-flash`
Lane: FIX · Depends on: FIX-01
Worktree: the lane worktree given by the runner. Work only there.

## Goal
The atlas CI typecheck stops reporting `packages/adapter-io/test/native-memory-proposal.test.ts(80,24): error TS2339: Property 'member' does not exist on type 'ReviewRecord'.`

## Read first
- `modules/atlas/packages/adapter-io/test/native-memory-proposal.test.ts:74-81`

## Change
1. In `modules/atlas/packages/adapter-io/test/native-memory-proposal.test.ts`, replace the line
   ```ts
       expect(records[1]?.member).toBe("jimmy")
   ```
   with
   ```ts
       const proposal = records[1]
       expect(proposal?.kind === "memory-proposal" ? proposal.member : undefined).toBe("jimmy")
   ```

## Touch only
- `modules/atlas/packages/adapter-io/test/native-memory-proposal.test.ts`

## Done when
- `grep -c 'records\[1\]?.member' modules/atlas/packages/adapter-io/test/native-memory-proposal.test.ts` prints `0`.

## Do not
- Run tests, typecheck, builds or installs. Commit, push or switch branches.
