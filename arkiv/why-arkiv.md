# Why Arkiv

A stake owner needs another person to discover a listing; a buyer needs their bid to be discoverable by that owner. These signed, time-limited offers are useful shared data. Arkiv makes the envelopes queryable by collection, NFT, maker and expiry without giving another client access to our PostgreSQL database. Other tools can inspect the same published offer and its signature through the public SDK or explorer.

With only a private database, users would depend on our API to retrieve these published envelopes. Arkiv adds an independent read path and explicit expiration. Garuda uses that path in its Market, rather than only recording an audit log. [Run the query](schema.md#query) or inspect [the live entities](evidence.md).

We retain signed orders and their original Ethereum publication anchors in PostgreSQL. Discovery is independently readable, but Garuda execution still depends on those anchors and the market service. We do not claim a fully server-independent order book. Resetting an anchor on re-publication could incorrectly revive a signature after the NFT transferred away and back.

Ethereum keeps NFT custody, WISE balances, allowances, counters, cancellations and atomic settlement. Private publisher credentials, wallet sessions and personal data are not stored on Arkiv. Short-lived stake snapshots are display caches only. The server owns Arkiv entities; the user owns and signs the Ethereum position/order. Those are different guarantees.
