# 1. Offline, pre-scraped Knowledge Base shipped in-repo

Date: 2026-07-14
Status: Accepted (records current reality)

## Context

The reference tools (api/component/wiki search) need the Enfusion API surface
and wiki content to answer queries. That content originates in the Arma
Workbench's bundled doxygen HTML docs (and the BI wiki). Options were: fetch/
parse docs live per query; generate an index locally on install; or scrape once
and ship a pre-built index.

## Decision

Ship a **pre-scraped, offline KB** in the repo and npm package under `data/`
(~52 MB `data/api` + ~7 MB `data/wiki`, plus small curated `kb`/`recipes`/
`patterns`). The scraper (`npm run scrape`) regenerates `data/api` and the
Doxygen portion of `data/wiki`; the result is committed. Reference tools read it
directly with zero network calls.

## Consequences

- **Good:** reference tools work offline and with zero latency; no dependency on
  a live docs site or a local Workbench install for research-only use.
- **Bad:** ~60 MB of generated data lives in git and npm; the shipped index is
  **frozen at whatever engine version was last scraped**, so a fork user on a
  newer Workbench gets stale API data.
- Regenerating the scraped half locally on first run (to fix staleness and slim
  the package) is a candidate future change — see the wayfinder map's
  *Not yet specified*. This ADR records today's behaviour, not that target.
