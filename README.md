# Kamayuu

A memory card game with offline practice and a human-first ranked 1v1 ladder.

This development branch includes a **bundled Capacitor Android app**, ranked tiers
from Bronze to Diamond, stable AI rivals, rematches and child-safety infrastructure.
Under-13 players use offline practice only; parental verification is deferred.
It is a release candidate. The Supabase foundations and ranked matchmaking are active for production testing;
the website is published at https://kamayuu.builtbygsv.in/ from this branch.
The Play release is still pending.

```sh
npm ci
npm run dev:mobile -- --host 0.0.0.0
```

Use Node 22.13+; Node 24 was tested. The browser preview shares the game's UI and
rules. The installed Android app also provides offline assets, native Google
sign-in, Android Keystore storage, haptics and native lifecycle handling.

- [Continue from Dot or a cloud computer](docs/mobile-cloud-setup.md)
- [Validation and remaining release checks](docs/development-verification.md)
- [Parent/child safety setup and release gates](docs/family-release.md)
- [Android project](android/README.md)
- [Backend deployment status](docs/backend-deployment.md)

Signing keys, passwords and server credentials are intentionally excluded from
the repository. Public client configuration and the public upload certificate are
included. Android OAuth is registered for the local release certificate. The
India age-policy review, release checks and on-device verification remain required
before a Play release.
