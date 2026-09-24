# natbot

A chat-first resume: hiring managers and recruiters ask questions about Nathan Arthur's career and get answers instead of reading a document.

## Language

**Profile**:
The curated, public record of Nathan's career that the bot knows, and the only thing it knows. Derived from the private career record and reviewed by Nathan before publishing.
_Avoid_: knowledge base, corpus, resume data

**Career record**:
Nathan's private, canonical career data, which includes material that must never reach a Visitor (salary history, coaching notes, private reasoning).
_Avoid_: career data, source of truth

**Conversation**:
One Visitor's ongoing exchange with the bot, resumed when they return from the same browser. Forgotten entirely, everything said in it, after 30 days without a new question.
_Avoid_: session, chat, thread

**Handoff**:
A question the Profile can't answer, which the Visitor chooses to pass to Nathan, optionally with a way to reach them.
_Avoid_: lead, ticket, escalation, unanswered question

**Proposal**:
A suggested addition to the Profile, made from Nathan's answer to a Handoff, that stays out of the Profile until Nathan approves it.
_Avoid_: draft, suggestion, pending edit

**Starter question**:
One of a few questions, chosen by Nathan, that a Visitor can click to begin a Conversation.
_Avoid_: suggested prompt, example question

**Visitor**:
A person chatting with the bot, typically a recruiter or hiring manager.
_Avoid_: user, candidate, client
