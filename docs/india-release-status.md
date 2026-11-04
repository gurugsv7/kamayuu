# India-first release work

Owner selected India first on 4 November 2026. The phone is away from the laptop;
previous local Wi-Fi ADB access is not assumed usable. No public release or ranked
activation is implied by this checklist.

## Completed in this follow-up

- Replaced reusable worker authorization with single-use 30-second tokens, stored
  only as hashes. Player roles cannot mint/read/consume credentials. The worker
  cannot mint them. A live worker invocation returned 200, consumed the token, and
  the obsolete Vault credential was rejected. All 25 database tests passed.
- Inspected Google Audience, Data Access and Branding. Audience is External/Testing.
  No sensitive or restricted scopes are configured. Google says basic identity-only
  sign-in is exempt from the test-user allowlist. Publishing is disabled because
  the branding configuration is incomplete; homepage/privacy/terms URLs are blank.
- Confirmed Epic's current licensing page lists KWS parent verification, age
  verification and consent management as free at any scale, under a separate license.
  No provider account, agreement acceptance or child-data transmission was performed.

## Work to finish, in dependency order

1. Evaluate KWS verification methods for India and its consent-management API.
   The existing generic adapter is not a working KWS integration. Obtain approved
   developer/product credentials after the operator reviews the separate agreement.
   Integrate signed webhooks, device-bound session redemption, consent scopes,
   authenticated parent redirects and withdrawal. Never accept a browser redirect
   or a child checkbox as proof. Keep parent identity documents with the provider.
2. Review India-specific age treatment and notices. India's DPDP Act defines a
   child as under 18; it does not use a universal under-13 threshold. The November
   2025 commencement notification phases sections 3–17 (including section 9) in
   18 months after publication; the Rules similarly phase Rule 10. Confirm operative
   dates, exceptions and other applicable duties with the operator's legal reviewer.
   Do not describe all DPDP parental-consent obligations as already effective today.
   The current `13_17` branch is not proof of an India-ready child policy. Resolve
   teen treatment, analytics and consent before a public mixed-audience release.
3. Approve data-retention periods, notices and actual deletion handling. Implement
   scheduled retention and public report/block handling, then test abuse/revocation
   through both ranked and private-table paths. Migrate legacy unknown-age clients.
   Existing drafts and provider stubs do not satisfy these tasks by themselves.
4. Publish reviewed privacy/parent/account-deletion pages at the operator's domain;
   then fill Google's homepage/privacy/terms fields and review its publishing and
   brand-verification flow. Keep basic sign-in scopes. No paid Google Cloud billing
   account is assumed necessary just because the console displays a billing notice.
5. Run authenticated controlled matches: human priority, fast bot fallback, complete
   games, ratings/leaderboards, rematches, disconnect/reconnect and consent withdrawal.
   Verify the hosted worker with real pending jobs and measure actual response times.
   Prior smoke tests with zero jobs do not establish gameplay readiness. The earlier
   rollback-only live database fixture test never ran; do not report it as passing.
6. Run Android account selection/cancellation, refresh/Keystore, first offline launch,
   background/audio, insets/keyboard and network tests. Use local ADB when both devices
   share a network, or deliver an approved test APK through a suitable test channel.
   Never expose wireless ADB directly to the public internet.
7. Configure Play package/listing, app signing and its certificate's Android OAuth
   client, India availability, audience/Families, IARC, Data safety and account deletion.
   Check the account's testing requirements in Play Console. Upload to internal testing
   before public rollout. Developer verification alone is not app approval.

Keep one neutral age question and immediate offline practice. Invoke the parent flow
only when an applicable child account requests online access. Return a verified parent
to their controls automatically instead of requiring manual credential copying.

## Sources checked 4 November 2026

- [Epic pricing/licensing](https://onlineservices.epicgames.com/licensing)
- [KWS setup](https://dev.epicgames.com/docs/kids-web-services/kws-get-started)
- [Google OAuth state and basic identity exception](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [DPDP Act](https://www.indiacode.nic.in/bitstream/123456789/22037/2/a2023-22.pdf)
- [Act commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
- [DPDP Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
