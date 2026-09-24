# Handoff email goes through Mailgun on mail.nathanarthur.com, not Cloudflare Email Routing

Handoff notifications are sent, and Nathan's replies received, through the Mailgun domain `mail.nathanarthur.com`, which already had Mailgun's MX and SPF records in place. Cloudflare Email Routing was the first plan for inbound replies, but it takes over a domain's MX records, and the root domain's MX records point to Proton Mail. Mailgun inbound routes deliver replies to the Worker as signed webhooks. Verifying Mailgun's webhook signature confirms a reply is genuine more strongly than checking the sender's SPF/DKIM would.

## Consequences

- The Worker holds a Mailgun API key (to send) and a webhook signing key (to verify replies) as secrets.
- Visitor replies (v2) go out from the same domain, so its sending reputation is shared with anything else sent from `mail.nathanarthur.com`.
