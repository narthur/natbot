#!/bin/sh
# Append each user prompt to PROMPTS.md (assignment requires prompt history).
# Times are US Central, as the PROMPTS.md header says, whatever the machine's timezone.
# Background-task notifications and subagent reports also fire UserPromptSubmit; skip them.
TZ=America/Chicago jq -r 'select(.prompt | test("^<(task-notification|agent-message)[ >]") | not)
  | "## " + (now | strflocaltime("%Y-%m-%d %H:%M:%S")) + "\n\n" + .prompt + "\n"' \
  >> "$CLAUDE_PROJECT_DIR/PROMPTS.md"
