# Conventions

The house style this repository holds itself to. It is the `taste` facet's source: the Awareness slab
grounds that facet to `CONVENTIONS.md@sha`, so this file is read by the product and not only by people, and
an edit to it moves the facet's drift state. Keep it short — a convention nobody can recite is not one.

## Claims

- **A claim carries its derivation, or it does not ship.** A number in prose rots; a number with the command
  that reproduces it can be checked by a stranger. Where no gate holds a figure, say so next to the figure.
- **Label every weight-bearing claim** as measured, inferred, or assumed. "It should work" is assumed.
- **Refusing beats guessing.** A door that cannot decide abstains loudly. "Could not check" and "nothing
  found" must never be the same value.

## Gates

- **A gate must be able to fail.** Every guard has teeth tests that plant the defect and assert red, and an
  anti-vacuity case: a check that reads zero items fails rather than reporting everything fine.
- **A gate-selecting field is derived, never chosen.** If a value picks which check runs, the door computes
  it; the payload does not announce it.
- **Never silence a gate.** Correct the ledger it names, with the reason written down.
- **The prose around a gate reaches exactly as far as the gate does.** A sentence claiming more than the
  check performs is worse than no sentence, because it stops the reader from checking.

## Tests

- **Mutation-probe anything load-bearing.** Break the implementation deliberately; if the test stays green it
  is a decoration. Report what was probed.
- **Assert the specific error**, never a bare "it threw" — a bare throw assertion passes on the wrong error.
- **A concurrency test must actually be concurrent.** Sequential subprocesses observe nothing.
- **Replace a pin, never delete it.** When a parked behaviour ships, the test that documented its absence
  becomes the test that asserts its presence.

## Code

- **One file, one seam.** Split along a real boundary, never to dodge the line ceiling.
- **Extract on the second caller, not the first.** Duplicating a defence into two files is how they drift
  into disagreeing.
- **Write the WHY where the next reader will stand.** Record rejected alternatives so nobody re-litigates
  them from the diff.
- **State bounds in the file that has them.** A guarantee with an unstated limit is an overclaim.
