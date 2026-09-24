#!/bin/sh
# Append each user prompt to PROMPTS.md (assignment requires prompt history).
jq -r '"## " + (now | strflocaltime("%Y-%m-%d %H:%M:%S")) + "\n\n" + .prompt + "\n"' \
  >> "$CLAUDE_PROJECT_DIR/PROMPTS.md"
