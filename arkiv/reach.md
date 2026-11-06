# Reach

## Who this is for

Garuda serves existing WiseOne Signature NFT stake owners and people who want to buy those positions. An owner whose plans change can offer the entire stake for sale; a buyer can compare principal, shares, remaining duration and asking price, or place a purchase bid. The stake keeps its original timeline when ownership changes. Finding a counterparty is not guaranteed.

Arkiv is part of that everyday flow: For sale and Purchase bids use Arkiv discovery by default. Users see offers, filters, publication status and entity links without needing to understand the database. The standalone backup additionally lets a user find published orders and perform supported recovery actions if Garuda's application service is unavailable.

## Evidence of use, and its limits

The [timestamped live evidence](evidence.md) records two available listings and one bid from two distinct maker addresses on the morning of 6 November 2026. Later that day, the local browser displayed four listings and two bids after recovery from an RPC limit. These are separate observations of changing, expiring data—not daily-user, retention, customer or trading-volume metrics.

The feature addresses an existing stake-owner workflow, but we have not yet demonstrated sustained demand through measured active users or completed user interviews. We do not use WISE ecosystem balances or testnet entity counts as substitutes for adoption.

## Can judges try it today?

Yes, through the repository and local app. A public hosted marketplace URL has not been verified for this submission.

1. Follow [Run locally](../README.md#run-locally): Node.js 22.12+, PostgreSQL, the deployment configuration, Ethereum RPC and app client ID are required. Start `npm run server` and `npm run dev` in separate terminals.
2. Open `http://127.0.0.1:3212/market`. Browse listings and bids, use the indexed filters, and inspect an entity link. Initializing an empty database does not import the operator's existing orders; the hosted marketplace path checks records against its stored publication anchors.
3. To inspect the published integration without a copy of our database, use the [direct Arkiv query](schema.md#query) and [entity receipts](evidence.md). Records expire, so historical examples may no longer appear. An RPC access key is recommended; writes additionally require a funded Rabdi publisher.
4. Build and open the [standalone backup](../docs/backup-access.md) to inspect its independent recovery path. Viewing the interface requires no transaction. Wallet actions use real Ethereum unless a documented disposable-fork test is being run.

## After Mumbai

The intended next phase is to keep building Garuda as a WiseOne extension: improve provider reliability and deployment setup, validate the experience with stake owners and buyers, and complete the security and release work for a public launch. Arkiv remains the shared discovery layer in that plan. Advanced trading and lending are later scope, not launched features.

We have not set a verified release date or committed usage target. Success should be measured by owners publishing offers, buyers finding suitable positions, and users completing trades or recovery—not by the number of entities we publish ourselves.
