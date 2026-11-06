# Play Data safety working inventory — 6 November 2026

This is source-audited preparation, not a submitted or certified declaration.
The Play form must cover all supported ages and app variants, not only offline
practice. Confirm provider processing and final Console wording before submission.

| Data | Observed use | Declaration preparation |
| --- | --- | --- |
| Google email/name and account identifier | Google ID token exchanged with Supabase Auth | Personal info: email, name, user IDs; account management/authentication |
| Display name, avatar selection, user ID | Profiles and opponent/leaderboard identity | Personal info/user IDs and app functionality; names can be visible to other players |
| Age band | Remembered locally; registered server-side for online accounts | Other personal info; access/safety policy enforcement |
| Match actions, results, rating, rematches | Authoritative game services and ranked history | App activity/gameplay; functionality and abuse prevention |
| Session IDs, events, visible-session heartbeats | lib/analytics.ts sends to lotus-game for eligible signed-in users | App activity/app interactions; analytics; currently enabled for ages 13+ |
| Support correspondence | User-initiated email to builtbygsv@gmail.com | Review support-related personal info and message collection in final form |
| Provider request/security logs | Google/Supabase hosting and authentication | Confirm actual provider retention and fields; do not assert zero collection |

No advertising SDK, advertising-ID request, contacts, location, camera or microphone
collection was identified in the app source/dependency and manifest review. Android
Credential Manager dependencies add biometric/fingerprint permissions; the app
does not request or receive raw biometric data. Do not equate manifest permissions
with collection without examining the actual API behavior.

Native auth tokens use Android Keystore-backed AES-GCM storage; backup is disabled.
App transport uses HTTPS and cleartext traffic is disabled. Offline practice uses
bundled assets/fonts and requires no account. Under-13 currentSession returns null,
native Google sign-in is blocked, and family analytics permission is false.

Deletion entry exists at Settings → Delete my online account, calling the authenticated
lotus-family delete_account command. The function invokes family_purge before
Supabase Auth deletion. Local synthetic purge tests pass; a disposable real-account
end-to-end verification remains required. External instructions exist at
https://kamayuu.builtbygsv.in/delete-account.html.

Do not select "no data collected." Do not automatically classify service-provider
processing as sharing: review Google's service-provider exception and whether each
recipient processes solely on the developer's behalf. Player-visible names and
leaderboards also need consideration under user-initiated/public disclosure rules.
Optional versus required must reflect actual feature choices and final form wording.

Open checks: Google/Supabase SDK declarations, hosting log retention, support
retention/ownership checks, moderation of player-supplied names, teen analytics and
India age-policy review, app-access instructions and live deletion verification.

Source: https://support.google.com/googleplay/android-developer/answer/10787469
Implementation: lib/account.ts, lib/analytics.ts, lib/family.ts,
lib/family-policy.mjs, lib/native.ts, KamayuuIdentityPlugin.java,
AndroidManifest.xml, app/page.tsx and lotus-family/index.ts.
