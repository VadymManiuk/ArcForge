# ArcOrigin security and readiness

ArcOrigin is currently a testnet product. The contracts, indexer, and web app have not completed an independent external audit and must not be presented as mainnet-ready.

## Current safeguards

- Launch tokens have fixed supply and no owner, mint, pause, blacklist, or transfer-tax hooks.
- The factory caps creator allocation at 20% and trading fees at 10% per side.
- Curve trades use `ReentrancyGuard`, `SafeERC20`, exact-amount approvals in the UI, and caller-provided minimum output.
- Factory launches, trades, holders, and fees shown as onchain data are validated against the configured factory and Arc Testnet events.
- API routes validate token addresses, cache RPC work, throttle refreshes, and return stale confirmed snapshots rather than simulated onchain values.
- The production app applies CSP, clickjacking, MIME-sniffing, referrer, permissions, and HSTS headers.

## Mainnet blockers

These items are required before accepting real-value mainnet use:

1. Independent Solidity audit and remediation of all findings.
2. Property/fuzz testing for curve invariants, rounding, graduation, and reserve solvency.
3. Multisig ownership for the factory, registry, and fee vault; add a timelock for fee changes.
4. A defined graduation and liquidity-migration design. The current curve permanently closes buys at graduation while sells remain available against its USDC reserve.
5. Verified source code and reproducible deployment artifacts for every mainnet contract.
6. Redundant authenticated RPC providers, monitoring, alerting, and an incident-response runbook.
7. Rate limiting at the edge and persistent indexing if public traffic outgrows the current in-process cache.
8. A legal/compliance review appropriate to supported jurisdictions and token-launch functionality.

## Reporting a vulnerability

Do not disclose an exploitable issue publicly before the maintainers have had a reasonable opportunity to investigate. Include the affected component, reproduction steps, impact, and any suggested mitigation in a private report to the repository owner.
