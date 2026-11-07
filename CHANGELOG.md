# Changelog

## [1.0.0] - 2026-11-8

First release.

### Added

- **Marketplace:** boxes per city, cart, checkout with cash on delivery or sandbox wallet, order tracking with a delivery code, idempotent cancel.
- **Farmers:** lot listing with grading (defect tags and optional photo), earnings ledger, demand forecast, withdrawals.
- **Pricing:** spoilage-based markdown with the farmer floor applied to the payout.
- **Delivery:** zone-based dispatch with nearest-neighbour ordering and 2-opt improvement, capacity-aware runs, rider dashboard with live location, live order updates.
- **Roles:** customer, farmer, rider, hub manager (own hub only) and admin; approvals, staff creation, rider setup, payouts, control-room overview.
- **AI (optional):** photo grading, recipe suggestions and an impact summary through one gateway with rule-based fallbacks, a daily cap and an admin health view.
- **Operations:** scheduled jobs for shelf building, repricing, expiry and payments; public impact page.
- **Experience:** Bangla-first interface with English, dark and daylight themes, mobile tab bar.
- **Delivery tooling:** Dockerfiles, compose profile, CI for lint, tests, build and Docker images.

### Security

- Production refuses placeholder secrets and the sandbox payment provider.
- Hub managers can only read their own hub; riders never see delivery codes.

### Known limitations

- Impact figures are estimates; routing uses zone centres, not street addresses.
- Payments are sandbox-only; no monthly impact email.
- Stock can be left reserved if the server stops mid-checkout or mid-cancel (no reconciliation job yet).
