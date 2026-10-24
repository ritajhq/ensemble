#!/bin/sh
# Sets the first operator's password. The operator exists from khatm's first
# start (its email is the manifest's `admin_email`), with the `operator` role
# and no password, so nobody can sign in until this has run. The password is
# read from stdin, or asked for when there is a terminal:
#
#   ens delivery task platform operator-password
#   printf '%s' "$PASSWORD" | ens delivery task platform operator-password
set -eu

for var in project artifact email; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then
    echo "operator-password: missing required env: $var" >&2
    echo "Run it as a task, which supplies it from the manifest:" >&2
    echo "  ens delivery task platform operator-password" >&2
    exit 1
  fi
done

if [ -t 0 ]; then
  printf 'Password for %s: ' "$email" >&2
  stty -echo
  trap 'stty echo' EXIT
  read -r password
  stty echo
  printf '\n' >&2
else
  read -r password
fi

if [ -z "$password" ]; then
  echo "operator-password: the password is empty." >&2
  exit 1
fi

# -T: no terminal in the container; khatm reads the password from stdin.
printf '%s' "$password" |
  docker compose -f "$artifact" -p "$project" exec -T auth khatm users set-password "$email"
echo "Set the password of $email; sign in at the platform's host." >&2
