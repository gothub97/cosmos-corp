#!/usr/bin/env bash
# Mission 04 validator. Mix of file-state checks and history grepping.

set +e

HIST="${HISTFILE:-$HOME/.bash_history}"
mkdir -p /tmp/.cosmos
mark()  { touch "/tmp/.cosmos/$1"; }
done_q() { [ -f "/tmp/.cosmos/$1" ]; }

# counted_orders - orders-count.txt exists and contains either 12 or 13 (header
# included or not - both are correct interpretations of "row count").
if ! done_q counted_orders; then
  if [ -f "$HOME/work/orders-count.txt" ]; then
    val="$(tr -d '[:space:]' < "$HOME/work/orders-count.txt" 2>/dev/null | head -c 16)"
    case "$val" in
      12|13) mark counted_orders ;;
    esac
  fi
fi

# appended_log - app.log contains the literal string `deploy ok` AND still has
# the lines we set up (so the player used >> rather than > and clobbered).
if ! done_q appended_log; then
  if [ -f "$HOME/work/app.log" ] \
     && grep -Fq 'deploy ok' "$HOME/work/app.log" \
     && grep -Fq 'app booted' "$HOME/work/app.log"; then
    mark appended_log
  fi
fi

# piped_to_grep - history shows a pipe whose right-hand side is grep, with
# something earlier feeding orders.csv (or grep itself reading orders.csv).
if ! done_q piped_to_grep; then
  if grep -Eq '\|[[:space:]]*grep[[:space:]]+' "$HIST" 2>/dev/null \
     || grep -Eq 'grep[[:space:]]+EU[[:space:]]+([./~]*|/home/dev/)?work/orders\.csv' "$HIST" 2>/dev/null; then
    mark piped_to_grep
  fi
fi

# wrote_eu_orders - eu-orders.txt exists, only contains lines mentioning EU,
# and contains at least one row.
if ! done_q wrote_eu_orders; then
  f="$HOME/work/eu-orders.txt"
  if [ -f "$f" ] && [ -s "$f" ]; then
    # Every non-empty line must contain EU. If grep finds any line *without* EU,
    # the file fails.
    if ! grep -Ev '(^$|EU)' "$f" >/dev/null 2>&1; then
      mark wrote_eu_orders
    fi
  fi
fi

exit 0
