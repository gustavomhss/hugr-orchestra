#!/usr/bin/env bash
# Publishes packages/omni to its read-only mirror (github.com/gustavomhss/hugr-omni) as a linear replay of dev.
#
#   script/omni-mirror.sh <commit> <mirror-url> [--push]          # dev: replay up to <commit>
#   script/omni-mirror.sh <commit> <mirror-url> --tag <name>      # tag: point <name> at <commit>'s mirror commit
#
# The mirror's main up to 415038b is omni's own history (the split recorded by the subtree import). After it, every
# first-parent commit of dev that changes packages/omni becomes one mirror commit: that tree, the original author,
# committer, dates and message, plus an `Orchestra-Commit: <sha>` trailer. The commit is fully determined by its
# source, so a re-run makes the same SHAs and a push is always a fast-forward of what the last run pushed.
# `git subtree split` did the same job, but on dev's history it overflows dash's recursion limit and runs past an hour.
#
# The mirror is read-only: its main must carry the tree of the Orchestra commit named in its newest trailer (or be
# 415038b itself). Anything else means someone committed to the mirror, and the script stops without pushing.
set -euo pipefail

PREFIX=packages/omni
OMNI_V01=415038bd22e37059fcd7fa20c2c96507b2e92c18 # git-subtree-split of the import commit d051d34691
IMPORT_MAINLINE=39f25ccb2e61fcb8e46249d424bee5afb4dafb82 # git-subtree-mainline: dev's first parent before the import

fail() {
  echo "::error::$*" >&2
  exit 1
}

[ $# -ge 2 ] || fail "usage: $0 <commit> <mirror-url> [--push | --tag <name>]"
target=$(git rev-parse --verify "$1^{commit}") || fail "$1 is not a commit"
mirror=$2
mode=${3:-}

git fetch -q --no-tags "$mirror" "+refs/heads/main:refs/omni-mirror/main" || fail "cannot fetch the mirror's main"
main=$(git rev-parse refs/omni-mirror/main)

# The Orchestra commit a mirror commit was made from (empty for omni's own history).
source_of() {
  git log -1 --format='%(trailers:key=Orchestra-Commit,valueonly,separator=%x0A)' "$1" | tail -1
}

# Where the replay resumes, after checking that the mirror's main is exactly what an earlier run pushed.
from=$(source_of "$main")
if [ -z "$from" ]; then
  [ "$main" = "$OMNI_V01" ] || fail "the mirror's main $main is neither omni v0.1 nor a replayed commit: the mirror has a commit Orchestra does not; port it to $PREFIX"
  from=$IMPORT_MAINLINE
else
  [ "$(git rev-parse "$main^{tree}")" = "$(git rev-parse "$from:$PREFIX")" ] ||
    fail "the mirror's main $main does not match $PREFIX at $from: the mirror has a commit Orchestra does not; port it to $PREFIX"
fi

if [ "$mode" = --tag ]; then
  name=${4:?the tag name}
  # The newest mirror commit made from an ancestor of the tagged commit carries the tagged commit's tree.
  tagged=""
  while read -r mirrored src; do
    if [ -n "$src" ] && git merge-base --is-ancestor "$src" "$target"; then
      tagged=$mirrored
      break
    fi
  done < <(git log --first-parent --format='%H %(trailers:key=Orchestra-Commit,valueonly,separator=)' "$main")
  [ -n "$tagged" ] || fail "no mirror commit is made from $target or an ancestor of it: let the dev mirror run first"
  [ "$(git rev-parse "$tagged^{tree}")" = "$(git rev-parse "$target:$PREFIX")" ] ||
    fail "the mirror's commit for $target ($tagged) does not carry its $PREFIX: let the dev mirror run first"
  echo "tag $name -> $tagged (from $target)"
  git push "$mirror" "$tagged:refs/tags/$name" || fail "the mirror refused tag $name: it exists at another commit; tags are never moved"
  exit 0
fi

# A re-run of an older push, once a newer run has mirrored past it, has nothing to do.
if git merge-base --is-ancestor "$target" "$from"; then
  echo "the mirror already holds $target (it is at $from): nothing to push"
  exit 0
fi
git merge-base --is-ancestor "$from" "$target" || fail "$from (the mirror's source) is not an ancestor of $target"

head=$main
tree=$(git rev-parse "$main^{tree}")
made=0
for commit in $(git rev-list --first-parent --reverse "$from..$target"); do
  next=$(git rev-parse -q --verify "$commit:$PREFIX") || continue
  [ "$next" = "$tree" ] && continue
  IFS=$'\x1f' read -r an ae ad cn ce cd < <(git log -1 --format='%an%x1f%ae%x1f%ad%x1f%cn%x1f%ce%x1f%cd' --date=raw "$commit")
  head=$(
    { git log -1 --format=%B "$commit" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'; printf '\nOrchestra-Commit: %s\n' "$commit"; } |
      GIT_AUTHOR_NAME=$an GIT_AUTHOR_EMAIL=$ae GIT_AUTHOR_DATE=$ad GIT_COMMITTER_NAME=$cn GIT_COMMITTER_EMAIL=$ce \
        GIT_COMMITTER_DATE=$cd git commit-tree "$next" -p "$head"
  )
  tree=$next
  made=$((made + 1))
done

if [ "$head" = "$main" ]; then
  echo "$PREFIX is unchanged since $from: nothing to push"
  exit 0
fi
echo "replayed $made commit(s): mirror main $main -> $head"
if [ "$mode" = --push ]; then
  git push "$mirror" "$head:refs/heads/main" ||
    fail "the mirror refused the fast-forward: it has a commit Orchestra does not; port it to $PREFIX"
  echo "the mirror's main is $head"
fi
