#!/bin/sh
# Append each user prompt to PROMPTS.md (assignment requires prompt history).
# Background-task notifications and subagent reports also fire UserPromptSubmit; skip them.
jq -r 'select(.prompt | test("^<(task-notification|agent-message)[ >]") | not)
  | "## " + (now | strflocaltime("%Y-%m-%d %H:%M:%S")) + "\n\n" + .prompt + "\n"' \
  >> "$CLAUDE_PROJECT_DIR/PROMPTS.md"
