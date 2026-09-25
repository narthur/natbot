# The whole Profile goes in every prompt; no retrieval

The bot's model on Workers AI (originally Llama 3.3 70B, with a 24,000-token context window) must see the whole Profile. Rather than chunking the Profile into Vectorize and retrieving per question, the entire Profile is sent with every prompt, and CI enforces a ~10k-token budget on it so instructions and the Conversation still fit. Retrieval was rejected for now because a chunk that isn't retrieved looks like a fact that doesn't exist, which produces false Handoffs or invented answers; a budget also keeps the Profile concise.

## Considered options

- **Retrieval over Vectorize** — lets the Profile grow without bound. **Recorded as the planned future improvement** for when the Profile outgrows the budget or a larger-context model isn't an option.

## Update (2026-09-25)

The model is now Qwen 3.8 27B, chosen by the adversarial eval, and its context window is 262,144 tokens. Fit is no longer why the ~10k-token budget exists. It stays for its other two reasons: the whole Profile is input on every call, so its size is the main cost of an answer, and a budget keeps the Profile concise.
