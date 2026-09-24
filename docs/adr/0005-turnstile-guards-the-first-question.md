# Turnstile guards a Conversation's first question, not the connection

The money is spent on model calls, not on connections: a bot that opens a WebSocket and never asks costs almost nothing, and the per-IP connect limit already bounds that. So when Turnstile is added, its token will travel with the Visitor's first question, and the answer module will verify it before spending the daily Budget, then record in the Conversation that it passed. Verifying at connect time was rejected: Turnstile tokens are single-use and expire after five minutes, so every reconnect (a sleeping tab, a dropped network) and every `get-messages` load would need a fresh token, all to guard the cheap path.

## Consequences

- The Worker's front door (`src/worker/index.ts`) stays a path check plus the per-IP limit. Don't move human verification there.
- `conversation-path.ts` is kept as its own file because its test is the only thing proving that visitors can't reach the Budget Durable Object through `routeAgentRequest`.
