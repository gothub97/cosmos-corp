#!/usr/bin/env bash
# Mission 02.04 setup - builds a repo with two side branches deliberately
# arranged so:
#   • topic/banner produces a *fast-forward* when merged into main.
#     (main has not advanced since banner branched off, so merging just
#      slides the main label forward.)
#   • topic/footer produces a *three-way* merge.
#     (footer branched off main BEFORE main got its own follow-up commit,
#      so the histories have diverged and a merge commit is required.)
#
# Layout after setup (oldest at bottom):
#
#                 topic/banner  o---o
#                              /
#   main  o---o (advanced)----+        <-- main is here
#              \
#               +---o  topic/footer
#
# Sequence matters: we make the divergent footer branch FIRST, then the
# README follow-up commit on main, THEN branch off banner from main's
# new tip so banner has nothing to fast-forward over.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/did_ff_merge \
      /tmp/.cosmos/did_three_way_merge \
      /tmp/.cosmos/history_is_correct

mkdir -p "$HOME/work"
rm -rf "$HOME/work/repo"
mkdir -p "$HOME/work/repo"
cd "$HOME/work/repo"

git init -q -b main

# c1: the common ancestor.
cat > README.md <<'EOF'
# Cosmos Corp Site

Tiny static site we're going to evolve over a few branches.
EOF
git add README.md
git commit -q -m "Initial site"

# topic/footer branches off c1 with one commit (c2). main does NOT see this.
git switch -q -c topic/footer
cat > footer.txt <<'EOF'
© Cosmos Corp - All wormholes reserved.
EOF
git add footer.txt
git commit -q -m "Add footer line"

# Back on main, advance with a follow-up commit (c3). NOW main has moved
# past topic/footer's branch point - guaranteeing a 3-way merge later.
git switch -q main
echo "" >> README.md
echo "Branches: see topic/banner and topic/footer." >> README.md
git add README.md
git commit -q -m "Mention upcoming branches in README"

# topic/banner branches off CURRENT main (c3) with two commits (c4, c5).
# main will not advance again before the player's merge, so banner can
# fast-forward in.
git switch -q -c topic/banner
cat > banner.txt <<'EOF'
=========================
  COSMOS CORP - WELCOME
=========================
EOF
git add banner.txt
git commit -q -m "Add ASCII banner"

cat >> banner.txt <<'EOF'

(Tagline: We make space mundane.)
EOF
git add banner.txt
git commit -q -m "Add banner tagline"

# Land on main, ready for the player.
git switch -q main

exit 0
