#!/bin/zsh
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue;; esac
  key="${line%%=*}"; val="${line#*=}"; val="${val%\"}"; val="${val#\"}"
  export "$key=$val"
done < .env.local
exec "$@"
