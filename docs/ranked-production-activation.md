# Ranked production activation — 4 November 2026

The owner explicitly requested deployment and activation for production testing.
The current web release is already published at https://kamayuu.builtbygsv.in/.

Activated at 2026-11-04 11:44:31 UTC (17:14:31 India time):

- lotus_ranked.settings.enabled = true, season launch-v1, region ap-south-1.
- Cron job kamayuu-ranked-worker active = true, schedule every 2 seconds.
- Five tiers, 15 enabled bot profiles and 180 stable fictional rival identities.
- Existing human-first pairing, fast bot fallback, first-entry AI disclosure,
  ratings, reactions and rematches are unchanged.
- Age setup remains required. Known under-13 players remain offline-only.

Both flags were changed in one transaction and read back as true. The first four
observed scheduler runs succeeded. A single-use-token worker HTTP smoke call was
returned HTTP 200 with paired=0 and processed=0 while the queue was empty.
No synthetic players, matches, ratings or consent records were inserted. A full
live human gameplay pass was not claimed before activation; the owner requested
testing on production. Existing automated coverage is recorded in the validation docs.

## Try it

Refresh the site, select the correct age group if prompted and sign in. Choose
Quick Match → Ranked, read the AI matchmaking notice and choose Find match. Older
cached clients may need a full refresh. Native Android packaging and Play release
are separate from this web activation.

## Operational stop

To stop new ranked admission and pause scheduled processing together:

```sql
begin;
update lotus_ranked.settings set enabled=false where singleton=true;
select cron.alter_job((select jobid from cron.job where jobname='kamayuu-ranked-worker'),active:=false);
commit;
```

Pausing the worker also pauses ongoing games; investigate and deliberately resolve
active matches before a longer shutdown. Preserve account/match data. This note
is a rollback instruction, not an automatic pause or cleanup job.
