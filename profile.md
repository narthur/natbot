# Nathan Arthur — Profile

This is everything the bot knows about Nathan Arthur. If something isn't here, the bot doesn't know it.

## Summary

Nathan Arthur is a full-stack web engineer with ten years of professional experience, counted from 2016. He has worked in TypeScript and Node.js since 2019, in React since 2020, and in full-stack TypeScript since 2020. He founded TaskRatchet in 2019 and still runs it, with Stripe billing in production. He was previously Technology Director at AudioVerse. He lives in Bowling Green, Kentucky, USA.

- Email: <nathan@nathanarthur.com>
- Website: nathanarthur.com
- GitHub: github.com/narthur
- LinkedIn: linkedin.com/in/nathanarthur

## Experience

### Pine Peak Digital — founder (March 2024 to present)

Pine Peak Digital is Nathan's web development studio. It builds full-stack web applications for clients and for the studio's own products. Technologies used there include React, TypeScript, Node.js, Astro, Svelte and SvelteKit, Tailwind, Hono and Cloudflare. The studio's own products include narthbugz, an internal time-tracking tool: a SvelteKit web app and a Hono API running on Cloudflare Workers.

### TaskRatchet — founder (March 2019 to present)

TaskRatchet (taskratchet.com) is a productivity app that puts a user's money on the line: the user sets a task with a deadline and a stake, and if they miss the deadline they are charged the stake. Creating tasks is free.

- Nathan wrote the business plan, interviewed prospective users, and validated the idea with a low-code MVP before building the real application.
- He built the React and TypeScript web app and the Node.js and TypeScript backend. The backend was originally Python and he later migrated it to TypeScript. It now runs on Cloudflare Workers, with Cloudflare D1 as the production database since June 2026 (previously Neon Postgres).
- He handles all engineering. He used to handle all support too; a contractor now carries most of it.
- As of September 2026, users have created more than 48,000 tasks, and just under 89% were completed on time.
- It covers its own costs. It is a small, self-sustaining product, not a business at meaningful scale.

**Billing and the charge-contest flow.** When a task goes overdue, TaskRatchet emails the user and places an authorization for the stake. The charge isn't captured until at least two days later. If the user replies to the email (because they did the task but forgot to check it off, had a genuine emergency, or hit a bug), an inbound email Worker marks the task contested and it stops moving through the billing pipeline until support resolves it. Nathan built this because, while he was doing support himself in his spare time, he couldn't always see an email in time to stop a charge. The alternatives, refunding after the fact or letting it become a Stripe dispute, meant a poor user experience, stressed support staff, and lost money on dispute and refund fees. He also built a Slack bot that gives the support contractor pause, resume, cancel and refund commands.

**Reliability.** An early silent failure stopped billing jobs without anyone being alerted; Nathan found out from user reports relayed by support and from revenue falling in Stripe. He afterwards added a scheduled GitHub Actions check that charges are progressing, and per-job heartbeats on the billing jobs.

**Public API.** He built TaskRatchet's public API, first in Python and then ported to TypeScript, documented from OpenAPI schemas at docs.taskratchet.com, so users can integrate against their own data.

**Agent access (September 2026).** Nathan designed and shipped, using Claude Code for implementation, an OAuth 2.1 authorization server (PKCE, dynamic client registration, four fine-grained scopes, rotating refresh tokens, per-grant revocation) and a remote MCP server at api.taskratchet.com/mcp. Money-affecting actions require a server-side preview-then-confirm step with a single-use signed token, because host approval prompts aren't guaranteed by the protocol. He also published an Agent Skill for TaskRatchet and made the docs agent-readable (llms.txt, Markdown versions of each page). Adoption so far is essentially zero; the work is shipped, not yet used.

**npm package.** He published `@taskratchet/sdk`, a TypeScript client, through seven major versions between August 2024 and September 2025, then retired it and moved the client into the web app, having decided the package boundary cost more than it gave.

### AudioVerse — Technology Director, then contract web developer (2018 to June 2025)

AudioVerse (audioverse.org) is a nonprofit media platform with a large library of audio and video recordings. Nathan did contract work from around March 2018, was an employee from November 2019 to July 2022 as Technology Director, and continued as an intermittent contract web developer until June 2025.

- As Technology Director he was team lead over one other developer. In practice that meant working with the executive director and turning that into planned work for the team.
- He oversaw the rebuild of the public website in Next.js and React, implementing an outside design firm's designs, and wrote the majority of its code himself (about 60% of the commits, more than three times the next contributor). Before that, the team had evaluated WordPress for the rebuild; he built custom Gutenberg blocks during that evaluation before concluding WordPress wasn't the right fit.
- He oversaw the rewrite of the GraphQL API backend (NestJS, TypeScript), which the other developer wrote, and later contributed to its maintenance. The schema was generated from the code so the published contract couldn't drift from the implementation.
- He loosely oversaw the project, carried out by an outside team, that built the organization's admin dashboard, a custom CMS.
- He led the planning for a new media transcoding pipeline on AWS (S3, Lambda, AWS Batch, CloudFront) to replace always-on servers that dropped jobs and cost too much. Others implemented it, and the design changed during implementation.

### Beeminder — contract developer (January 2022 to present)

Beeminder is a goal-tracking service and a client of Nathan's. His main project there is the company blog, blog.beeminder.com, whose source is public at github.com/beeminder/blog.

- He rebuilt the blog in Astro, moving it off paid WordPress hosting to free hosting on Render, which also gave the team deploy previews on pull requests. He has written about two-thirds of the repository's commits since mid-2023.
- He built pixelteer, a visual-diffing tool, to catch visual regressions during the rebuild, because Beeminder has custom Markdown rendering that had to be preserved.
- He cut the blog's build time from about 34 seconds to about 2.4 seconds (his own measurement, on his machine) by running one-change-at-a-time timed experiments, keeping four changes and reverting four on the numbers. A CI check now reports the build-time impact of every pull request.

### SimpleUpdates — programmer (August 2016 to June 2019)

SimpleUpdates made a custom CMS for churches. The CMS was already built when Nathan joined; his work was mainly on its themes.

- He built and documented a shared component library, following atomic-design principles, used across the CMS's themes, and moved the existing themes onto it. A fix to a shared component could then usually be copied into the other themes without reworking it, because he never made theme-specific edits to the shared base.
- He pushed for platform features the theme framework needed and got some of them added, including a template function that picks the higher-contrast of two colors against a third, an accessibility feature.
- He wrote a separate service in Python, Flask and SQLite that server-rendered a web page for any church or school in a denominational directory that had no website of its own, and redirected to the organization's own site when it had one.
- He did JavaScript development on a church-management product that never launched.

He also interned at SimpleUpdates in the summers of 2008 and 2009, updating CMS templates to meet web standards.

### Earlier roles

- Prism Web Design (May to July 2016): built the firm's website in Jekyll, wrote bids for contract work, and built a small audio-processing pipeline.
- Young Disciple Ministries, intern (July 2011 to July 2012): online marketing and web development, including rebuilding their online store on Shopify.
- OHA Rechargers, technician (2008 to 2011): rebuilt toner cartridges and handled inventory, finances, customer relations and shipping.

## Education

B.B.A. in Business Administration, Ouachita Hills College, 2012 to 2016, including accounting coursework.

## Projects

- **pa11y-ratchet**: a GitHub Action that prevents accessibility regressions. It compares the count of each accessibility issue type against the base branch and fails if any count goes up, so a backlog too big to fix at once can only shrink. He built it for the AudioVerse website, which launched with a large backlog of scanner-reported issues.
- **autodial**: a hosted service that automatically adjusts Beeminder goal rates for users who connect their accounts through OAuth. It is a Cloudflare Worker serving a React app and running a daily job over every connected account. It had 98 connected accounts as of July 2026 and has taken pull requests from outside contributors.
- **buzz**: a terminal interface for Beeminder, written in Go. The Go was written by AI agents; Nathan holds its quality through tests and CI checks rather than by reading the code.
- **baserow-sdk**: a TypeScript client for the Baserow API. He concluded afterwards that a thin wrapper around the API would have been the better choice.
- **pyminder**: a Python library for the Beeminder API, published on PyPI.
- **Claude Code skills** (github.com/narthur/skills): skills and tooling he builds with the agent and revises as they break down in use.
- This chat bot, whose source and prompt history are public at github.com/narthur/natbot.

## Skills

- **Languages:** TypeScript and JavaScript (daily); Python (has built with it, including TaskRatchet's first API, but doesn't currently work in it); PHP (WordPress themes and plugins, mostly during college; rusty); Ruby (a learner, from the past couple of years in client Rails codebases); SQL.
- **Frontend:** React, Next.js, Astro, Svelte and SvelteKit, Tailwind, React Query, component libraries, accessibility.
- **Backend:** Node.js, Hono, NestJS, GraphQL, REST APIs, OpenAPI, OAuth 2.1 and OIDC, Stripe, MCP servers.
- **Data:** database design and normalization (he owns TaskRatchet's production schema), Cloudflare D1, SQLite, PostgreSQL. He leans on tools and documentation for query optimization.
- **Cloud:** Cloudflare (Workers, D1, KV, R2, Durable Objects) most of all, plus Render, Google Cloud, and some AWS.
- **Tooling and practice:** GitHub Actions and CI/CD, Vitest, Docker (mostly for local development, in the past), observability with Honeycomb, OpenTelemetry and Sentry.
- **AI-assisted development:** He has developed with Claude Code daily since early 2026, and holds quality through automation (tests, CI checks, automated review) rather than manual rigor.

## What he hasn't done

- He has never worked for a large organization. Every employer and client has been small.
- He has not held an on-call rotation.
- His distributed-systems experience is thin, in his own assessment.
- He has not built or maintained a formal design system. He has built component libraries.
- He hasn't shipped a production React Native app, though he has been lightly involved in React Native projects.
- He hasn't worked with enterprise identity features such as SSO, SCIM, or audit logs.
- He hasn't run a user-facing A/B test. His projects haven't had the traffic for statistical power.
- He isn't the maintainer of any open-source project with significant outside usage or contributions.
- On AWS, he planned the AudioVerse transcoding pipeline but didn't implement it.
- He is not conversational in Swedish yet. He has studied it daily on Duolingo since September 2025.

## Views and motivations

- **Why he's looking for a job after contracting.** He enjoys working directly with stakeholders to understand problems and design solutions. But running a very small agency means sales outreach, overhead and unpredictable income, and he'd rather set those aside for technical challenges that push him deeper. He has spent his whole career in very small organizations, which build breadth but rarely leave room to go deep on something.
- **Where he's looking.** He is open to roles in the US and in Europe, with Sweden as a particular focus.
- **What he's proud of.** What his software does for people more than any technical problem he solved: TaskRatchet genuinely helps people who struggle with procrastination, and autodial saves Beeminder users a chore.
- **Quality as code gets cheaper.** He believes that the easier it gets to write and change code, the more developers need to lean on tooling to keep quality from slipping, which means deciding where to add friction, where to remove it, and which tasks stay with the developer.
- **Value for effort.** Every place he has worked has been resource-constrained, so he favors solutions with high value for the effort that keep working without constant maintenance.
- **Metrics.** Measuring is good, but a measure that becomes a target stops being a good measure, so targets imposed from above are often worse than none. Beeminder and TaskRatchet work because people set their own targets and can adjust them.
- **Open source.** He wants open-source alternatives to the big observability and BI vendors to succeed, and publishes his own tools openly.
