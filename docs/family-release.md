# Mixed-audience release: implementation and gates

Local development only, 4 November 2026. This is not a compliance certification.

## Experience

One neutral age-band question precedes authentication. No exact birthday is
collected. Older users continue through existing sign-in. Under-13 players use
generated aliases and skip identity/photo/country onboarding. They can play solo
immediately, or ask a parent to approve online access. The ranked ladder stays
shared. Consent setup is not silently replaced with an adult checkbox or PIN.

Child accounts have no Google login, CAPTCHA, engagement heartbeat or product
analytics. Essential multiplayer state, game statistics and rank are retained.
Child recipients receive pseudonyms instead of freeform names. All private and
ranked messages are server-allowlisted presets. Parent settings independently
control online access, reactions and rematches. Withdrawn or expired consent
blocks access, including new queue allocations. Profiles cannot override child
aliases through the Data API. Server state, not localStorage or user metadata,
is authoritative for known accounts.

Self-declared age bands cannot prevent a fresh visitor lying about age, or someone
clearing device storage and creating another account. Do not describe this as
verified age assurance. Regional age thresholds (including India) and the actual
target countries need review; “13+” is not a universal consent exemption.

## Verification adapter (not yet configured)

`FAMILY_VPC_URL` must be an operator-controlled HTTPS adapter for a reviewed real
verifiable parental consent provider. `FAMILY_VPC_KEY` is server-only.
`FAMILY_VPC_VERIFICATION_ORIGINS` explicitly allowlists the hosted verification origins.
The adapter receives POST `{operation,noticeVersion,...}`. It must enforce abuse limits, replay/expiry,
parent authentication, retention, consent notices and ownership of child records.
Never use the test fake in a deployment.

- `begin`: accepts `deviceHash`; returns `session`, `verificationUrl`. Do not send
  child names, emails, exact birthdates, analytics or gameplay. Pending requests
  must expire within 24 hours and be deleted by the adapter.
- `verify`: accepts `session`, `deviceHash`; only after genuine VPC returns
  `{verified:true,receipt,guardian,deviceHash,noticeVersion,expiresAt,online,social,rematches}`.
  Receipt/guardian are opaque identifiers, not email addresses. Default scopes off
  unless the parent explicitly approves them. Refuse expired/revoked receipts.
- `parent`: accepts a short-lived `credential`, returns verified guardian identity.
  Management credentials must include a future `expiresAt`, be limited to the parent and be revoked on logout.
  The adapter's hosted verification UX must provide a secure way to return or
  obtain that credential. The current local controls accept it in a password field;
  polished authenticated redirect/handoff awaits the chosen provider.

Kamayuu binds redemption to a random 256-bit device secret (only hash goes to
verification). Receipt allocation is idempotent and device-bound. Only after
verified consent does the server provision a Supabase account with an internal
non-deliverable email and random password. A magic-link token is exchanged on the
server; only the child access/refresh tokens return to the initiating device.
No real child email or identity document enters Kamayuu. Service keys stay on Edge.
Post-consent verification URLs must use a reviewed allowlisted provider host.

## Release gates still open

1. Choose and contract a VPC provider; confirm its SDK/API terms permit child use,
   configure its adapter, rate limits and verified parent management handoff.
   Test real approval, refusal, expiry, retry, device mismatch, revocation and deletion.
2. Review regional consent thresholds, target countries and child/adult age bands.
   Review parent notice, processor agreements and public legal drafts with the operator.
3. Approve retention periods and configure/test scheduled cleanup for expired
   consent requests, inactive child accounts, game payloads and revoked receipts.
   Revoked receipt tombstones currently remain to prevent replay. Deletion clears
   account/game records but processor backups/log retention needs confirmation.
4. Add/report/block moderation appropriate to public profiles and online safety;
   test hostile names, reactions and repeated rematch harassment across two devices.
5. Publish approved privacy, parent notice and deletion pages only with release
   permission. Email requests must actually be monitored. Configure Play Data safety,
   Families, target audience, IARC and account deletion declarations accurately.
6. Deploy family migrations and all Edge endpoints together before enabling the
   release website; old endpoints do not enforce this policy. Never deploy only UI.
7. Complete on-device Android auth/gameplay/background/network tests. The Capacitor
   app now embeds the game and family UI; offline practice does not load the hosted
   website. Approve and deploy the ranked worker and backend separately. Public
   privacy/deletion pages still need approved hosting. Native Google also requires
   Android OAuth registration for the package and installed signing certificate.
8. Verify real leaderboard/home standings on staging with humans and AI rivals.
   Local placeholders have been replaced with service results and an Unranked fallback.

Sources: [Google Play Families](https://support.google.com/googleplay/android-developer/answer/9893335),
[FTC parental consent](https://www.ftc.gov/business-guidance/privacy-security/verifiable-parental-consent-childrens-online-privacy-rule),
[FTC COPPA FAQs](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
