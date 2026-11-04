# India-first release status — 4 November 2026

The owner selected India first and then deferred child online play. Under-13 users
receive local practice only. KWS and parent-verification onboarding are deferred;
no KWS account or agreement is required for this version.

## Implemented

- One remembered age choice; children go directly to practice without parent setup.
- Under-13 online panels offer practice, and sign-in/child account enrollment are blocked.
- Deployed server policy and queue trigger reject known under-13 accounts regardless
  of historical consent flags. Parent begin/redeem is disabled before provider calls.
- Draft privacy/parent/deletion pages describe offline-only child play.
- Ranked worker uses single-use 30-second hashed tokens; live invocation and access
  checks passed. Its reusable Vault credential is rejected.
- Android OAuth identity exists. Google basic identity-only sign-in is exempt from
  the generic test-user allowlist; branding needs homepage/privacy/terms URLs.

## Still required

1. Review India age treatment. The DPDP Act defines children as under 18; the
   November 2025 commencement notification phases relevant substantive sections in
   18 months after publication. Confirm dates, exceptions, teen treatment and other
   applicable duties. Offline-only under 13 does not establish 13–17 compliance.
2. Finalize retention/deletion operations, support and report/block moderation. Policy
   pages and the age-gated website are now public; Google Branding URLs are saved.
   The old unknown-age server exception has been removed.
3. Run authenticated ranked matches end to end: human priority, bot fallback, rating,
   leaderboards, rematches and reconnect, with hosted jobs actually processing.
4. Rebuild Android package with this UI policy. Existing 0.2.0 APK/AAB artifacts predate
   it. Complete hardware auth/storage/offline/background/inset/network checks. The
   phone is currently remote from the laptop; do not expose ADB publicly.
5. Configure Play listing/signing and Play certificate OAuth, India availability,
   audience/Families, IARC, Data safety, deletion and applicable testing requirements.

Ranked and its schedule remain off. The website was published from 08b1435. No main
merge or Play upload has occurred. This checklist is implementation status, not legal certification.

Sources: [Google OAuth states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview),
[DPDP Act](https://www.indiacode.nic.in/bitstream/123456789/22037/2/a2023-22.pdf),
[commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf),
[Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).
