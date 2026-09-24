# Handoff email goes through Mailgun on mail.nathanarthur.com, not Cloudflare Email Routing

Handoff notifications are sent, and Nathan's replies received, through the Mailgun domain `mail.nathanarthur.com`, which already had Mailgun's MX and SPF records in place. Cloudflare Email Routing was the first plan for inbound replies, but it takes over a domain's MX records, and the root domain's MX records point to Proton Mail. Mailgun inbound routes deliver replies to the Worker as signed webhooks. Verifying Mailgun's webhook signature confirms a reply is genuine more strongly than checking the sender's SPF/DKIM would.

## Consequences

- The Worker holds its own domain-scoped Mailgun sending key and the webhook signing key as secrets. It doesn't reuse the newsletter Worker's key, so either key can be revoked without breaking the other Worker.
- The domain is shared with the newsletter Worker (`rss-to-email`, which serves `mail.nathanarthur.com` over HTTP and sends from `newsletter@`). The two share sending reputation and Mailgun's per-domain suppression lists: someone who marks the newsletter as spam won't receive a v2 Handoff answer either. That's acceptable at Handoff volumes.
- Inbound routes must match only Handoff reply addresses, so nothing sent to the newsletter's addresses reaches the bot.
