#!/usr/bin/env bash
# Mission 05 setup - fakes a small repo with a known number of .md files and a
# known number of TODO lines so the validator can check the counts.

set -euo pipefail

mkdir -p /tmp/.cosmos
rm -f /tmp/.cosmos/found_md_files \
      /tmp/.cosmos/grepped_todo \
      /tmp/.cosmos/counted_todos

rm -rf "$HOME/repo" "$HOME/repo-md.txt" "$HOME/todos.txt" "$HOME/todo-count.txt" 2>/dev/null || true

mkdir -p "$HOME/repo/docs" "$HOME/repo/src" "$HOME/repo/scripts"

# Three .md files. Two of them carry TODOs.
cat > "$HOME/repo/README.md" <<'EOF'
# cosmos-svc

Tiny demo service.

TODO: write a real intro.
EOF

cat > "$HOME/repo/docs/architecture.md" <<'EOF'
# Architecture

The auth flow goes through cosmos-auth.

TODO: diagram the request lifecycle.
TODO: cover the failure modes.
EOF

cat > "$HOME/repo/docs/runbook.md" <<'EOF'
# Runbook

Step 1: page Sage.
Step 2: re-run the smoke tests.
EOF

# Source files - none .md, but they contain TODOs in comments.
cat > "$HOME/repo/src/main.py" <<'EOF'
def main():
    # TODO: parse CLI args
    print("hello cosmos")

if __name__ == "__main__":
    main()
EOF

cat > "$HOME/repo/src/util.py" <<'EOF'
def slugify(s):
    # TODO: handle unicode
    return s.lower().replace(" ", "-")
EOF

cat > "$HOME/repo/scripts/deploy.sh" <<'EOF'
#!/bin/bash
# TODO: actually deploy
echo "pretending to deploy..."
EOF
chmod +x "$HOME/repo/scripts/deploy.sh"

# Quick math: 3 .md files, 6 TODO lines (1 + 2 + 0 + 1 + 1 + 1 = 6).
# Validator accepts a count of 6.

cd "$HOME"
exit 0
