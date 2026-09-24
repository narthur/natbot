# The whole Profile goes in every prompt; no retrieval

Llama 3.3 70B on Workers AI has a 24,000-token context window. Rather than chunking the Profile into Vectorize and retrieving per question, the entire Profile is sent with every prompt, and CI enforces a ~10k-token budget on it so instructions and the Conversation still fit. Retrieval was rejected for now because a chunk that isn't retrieved looks like a fact that doesn't exist, which produces false Handoffs or invented answers; a budget also keeps the Profile concise.

## Considered options

- **Retrieval over Vectorize** — lets the Profile grow without bound. **Recorded as the planned future improvement** for when the Profile outgrows the budget or a larger-context model isn't an option.
