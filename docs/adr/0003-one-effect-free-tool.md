# The model has one tool, and it has no effects

Under Meta's "Rule of Two" (as covered in [Christopher Moravec's episode 59](https://christophermoravec.com/episode-59-poison-pills/)), an AI system should combine at most two of: private data, untrusted input, and the ability to act. The bot takes untrusted input by design, the Profile is public (ADR 0001), and the model's only tool drafts a Handoff message. The Visitor sees the draft, can edit it, and has to press a button to send it, always to Nathan. So the model can't cause anything on its own, and the one action in the system needs a human to approve it.

## Consequences

- Handoff text is written by the Visitor and must stay untrusted all the way through: the notification is sent as plain text, and no agent acts on the contents of a Proposal PR.
- Any new tool has to be checked against the Rule of Two before it's added.
