# ArcOrigin

ArcOrigin is a USDC-native token launch and discovery layer for Arc. This repository contains a Next.js product interface and a local, tested Solidity protocol implementation for fixed-supply launches and virtual-reserve bonding curves.

## Current status

- Frontend: real Arc Testnet approval/launch flow with typed mock/indexed market-data boundaries.
- Contracts: deployed to Arc Testnet; source is tested but not independently audited.
- Arc Testnet: chain ID `5042002`, RPC and Arcscan configured.
- Official Arc Testnet USDC: `0x3600000000000000000000000000000000000000`; ArcOrigin deployment addresses are recorded in `deployment/arc-testnet.json`.

Demo market data, token addresses, transactions, holder metrics, and revenue figures are clearly labeled in the UI. Nothing in this repository is an audit claim or investment advice.

## Local development

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm contracts:compile
pnpm contracts:test
pnpm dev
```

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Contracts

The deployed Arc Testnet contracts retain their original `ArcForge*` Solidity names. The ArcOrigin product rebrand does not alter deployed bytecode, ABIs, or token identity.

- `ArcForgeToken`: fixed supply, immutable creator/factory, immutable launch metadata, no owner controls.
- `ArcForgeBondingCurve`: virtual-USDC-reserve constant product buys/sells with min-output protection. New deployments close buys at graduation while keeping sells available so holders retain an exit path.
- `ArcForgeFactory`: validates launches, collects a fixed launch fee, deploys token and curve, records creators.
- `ArcForgeFeeVault`: pulls and records real ERC-20 fees by source; withdraws only to the visible recipient.
- `ArcForgeCreatorRegistry`: creator metadata and factory-recorded launch counts.
- `MockUSDC`: unrestricted minting for local tests only.

The MVP sets a 20% maximum creator allocation, a 25 USDC launch fee, and 1% buy/sell fees. Liquidity migration remains a documented placeholder and is not implemented. The active Arc Testnet V2 Factory uses pool-favoring reserve rounding and keeps post-graduation sells open. Tokens created by the legacy Factory retain their original curve behavior and remain indexed and tradeable through their deployed curves.

### Deploy to Arc Testnet

The deployment script pins and validates Circle's official Arc Testnet USDC contract, chain ID, token symbol/decimals, contract bytecode, and deployer gas balance before sending transactions. Copy `.env.example` to `.env`, populate `FEE_RECIPIENT` and `DEPLOYER_PRIVATE_KEY`, then:

```bash
pnpm contracts:test
pnpm deploy:arc-testnet
pnpm verify:arc-testnet
```

The deployment script refuses placeholders and writes a gitignored local manifest. The public testnet manifest contains no secrets. Arcscan source verification and an independent audit are still required before any mainnet use.

Factory-only upgrades use separate deployment and activation commands so the new Factory can be inspected and the dual-factory indexer deployed before `CreatorRegistry` is changed:

```bash
pnpm deploy:arc-testnet:v2
pnpm deploy:arc-testnet:v2:activate
```

## VPS deployment

On Ubuntu, install Node.js 20, nginx, Certbot, pnpm, and PM2. Clone the repository, then:

```bash
pnpm install --frozen-lockfile
pnpm contracts:compile
pnpm contracts:test
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Copy `deploy/nginx.arcorigin.conf` to `/etc/nginx/sites-available/arcorigin`, symlink it into `sites-enabled`, validate with `nginx -t`, reload nginx, then request TLS:

```bash
certbot --nginx -d arcorigin.xyz -d www.arcorigin.xyz
```

Run package and OS upgrades deliberately rather than unattended on a production host; validate the build after upgrades and retain a rollback artifact.

## Production work still required

1. Confirm official Arc mainnet and USDC addresses.
2. Independent smart-contract audit and formal deployment review.
3. Contract source verification on Arcscan.
4. Durable event indexer and PostgreSQL persistence.
5. Live buy/sell routing for indexed tokens and resilient transaction-state recovery.
6. Graduation/migration design, implementation, and tests.
7. Monitoring, rate limiting, backups, and incident response.

Not financial advice. Token launches are risky.
