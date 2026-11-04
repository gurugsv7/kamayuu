# First release: under-13 offline practice

The owner changed scope on 4 November 2026: under-13 users have local practice only.
KWS/provider integration and parent onboarding are deferred. Do not configure a
verification provider or offer parent approval as a way to unlock this release.

One remembered age-group question sends users straight to the game. Under-13
users skip Google, CAPTCHA and identity/profile onboarding. Online entry panels
explain the age restriction and offer practice. No parent-credential form appears
in settings. Product engagement analytics remains disabled for known children.

The shared server policy denies all known under-13 accounts even if old consent
flags are true. Parent begin/redeem endpoints return 403 before calling a provider
or creating an account. The database queue trigger independently rejects children.
Historical consent code and management/deletion APIs are retained for future work;
they do not authorize child gameplay in this release. No real child accounts or
queue entries existed at rollout. No account or consent records were deleted.

The age-gated website has now been published and the old private-table unknown-age
exception removed from the server. Old cached clients need to refresh and complete
age setup. Self-declared age can be falsified; do not describe it as verified age
assurance. See publication-2026-11-04.md for the exact deployed versions.

## Remaining release work

- Review India age treatment and commencement dates; under 13 is not a universal
  legal threshold. Resolve teen consent/analytics before an India public release.
- Finalize and publish reviewed privacy, parent information and deletion pages;
  verify retention/deletion, support handling and moderation.
- Test real ranked/leaderboard/rematch/reconnect flows and native Android auth.
- Configure Play India availability, target audience/Families, Data safety, account
  deletion and content rating accurately. Keeping practice for children means the
  app still has a child audience; do not declare it adult-only.

The current APK/AAB candidate predates this UI change until explicitly rebuilt.
See backend-deployment.md and india-release-status.md for deployment/testing limits.
