# Garuda Signature Seaport V2

This is the multi-currency replacement candidate for the WISE-only validator at `0xf8a4719a149227a9a15456a62ac49baa8b95554d`. It validates Signature NFT sales through canonical Seaport 1.6. It holds no funds and performs no transfers itself.

**Status: V2 validator and Uniswap payment router deployed and verified on Ethereum; activation remains pending.** The validator is [`0xb87Cf2cB81Fa97433213d2928c7b3A1424b05317`](https://etherscan.io/address/0xb87Cf2cB81Fa97433213d2928c7b3A1424b05317), created in [this transaction](https://etherscan.io/tx/0x04221e79de4f28593b784afa47cbf58af24022002ab3c131b30d30b6e2a786aa). Its creation code, runtime, immutable settings and 12 confirmations were checked against the local build; the [verified manifest](deployments/ethereum-mainnet-v2.json) records the deployment. [Sourcify](https://repo.sourcify.dev/1/0xb87Cf2cB81Fa97433213d2928c7b3A1424b05317) reports an exact match for both creation and runtime source verification. The payment router is [`0xf040eB4a12cB15585b777dD7Cf26cb9F736aAb1c`](https://etherscan.io/address/0xf040eB4a12cB15585b777dD7Cf26cb9F736aAb1c), created in [this transaction](https://etherscan.io/tx/0x4346472779a6d0aca7f60de4a534b47feba7295ca02a5341cd77e096e6694f26), with [verified source](https://repo.sourcify.dev/1/0xf040eB4a12cB15585b777dD7Cf26cb9F736aAb1c). Its code and bindings match the local build. The local API uses the [combined manifest](deployments/ethereum-mainnet-v2-with-router.json); V2 remains paused until the guardian completes activation.

## Payment currencies and Uniswap

V2 binds an ERC-20 payment address into every signed offer. The NFT, seller, stake snapshot, asset epoch, price and fee terms remain bound as before. Seller proceeds and fees must use that same payment token. The underlying stake is still WISE; the adapter's `WISE()` field identifies the staking protocol, not a settlement-token restriction.

The contract permits token contract addresses with standard exact-transfer behavior; it does not certify arbitrary token code. The app accepts WISE, WETH and USDC when its verified manifest declares `paymentSchemaVersion: 2`. Additional currencies require compatibility checks and a registry update. Fee-on-transfer, rebasing, malicious and other incompatible tokens are outside that supported set. Native ETH is not a V2 payment item; it can fund a swap or be wrapped into WETH.

The [purchase router](src/GarudaPurchaseRouter.sol) adds atomic Uniswap payments without changing the validator. Buyers can pay in ETH, WETH, USDC or WISE; an exact-output swap obtains the seller's chosen currency. The router fulfills the Seaport listing to itself, satisfying the zone's ownership check, then delivers the NFT to the buyer and refunds unused input. A failed purchase reverts the swap. It has fixed protocol targets, a curated token set, no administrator and no persistent approvals. Bids still require their maker's settlement-token balance and Seaport allowance; they cannot rely on an absent maker approving a later swap.

## Contract changes

The proof is now ten ABI words (320 bytes): kind, seller, token ID, stake ID, stake state hash, epoch, amount, fee basis points, fee recipient, and **payment currency**. `PAYMENT_SCHEMA_VERSION()` returns `2`. `SaleValidated` includes the payment currency. V1 proofs are rejected. Price and fee math uses the payment token's raw units, including USDC's six decimals.

Ownership, original stake terms, exact fees, cancellation epochs, Seaport code-hash checks and the guardian pause remain enforced. The guardian can pause activity but cannot rewrite the immutable fee or treasury. Source files for the stake adapter were reused from WiseOne's existing adapter; the payment schema and V2 validation are the new work here.

## Verification

From the repository root:

```sh
npm ci --prefix contracts/seaport
forge test --root contracts/seaport
forge build --root contracts/seaport
```

Twenty-one tests pass, including three fuzz tests with 512 cases each. They cover currency substitution, fee mismatches and rounding, changed stake state, unauthorized calls, pause, cancellation epochs, old proofs and excluded payment addresses.

For real-contract settlement verification, start a disposable fork:

```sh
anvil --fork-url https://ethereum-rpc.publicnode.com --chain-id 31337 --host 127.0.0.1 --port 18751
```

Then run `node --import tsx scripts/verify-seaport-v2-fork.mjs`. At fork block **26,356,017**, it completed listings and accepted bids in WISE, WETH and USDC for Signature stakes #20 and #53: **12 settlements**, exact balances and fees, preserved underlying stake snapshots, and replay rejection. Cancelled orders and V1 proofs were also rejected. The script checks Anvil and chain ID, uses fresh local accounts, and reverts its changes. The runner uses the production `publishSale`, `fillSale`, `cancelSale`, signature codec and receipt checks. It also verifies that V2 activation is blocked until V1 is paused. [Recorded results](deployments/fork-verification.json).

## Deployment review

[Unsigned deployment review](deployments/v2-deployment-review.json) contains the constructor values, creation data, source-input hash and gas estimate. [Standard compiler input](deployments/v2-standard-input.json) is ready for source verification after an address exists. Refresh the review with `node --import tsx scripts/prepare-seaport-v2-deployment.mjs`; it performs read-only RPC calls and writes an unsigned file. `GARUDA_DEPLOYER` can select a different public sender address without changing the guardian.

The prepared constructor retains:

| Setting | Value |
| --- | --- |
| Network | Ethereum mainnet |
| Guardian | `0x22079A848266A7D2E40CF0fF71a6573D78adcF37` |
| Fee | 50 basis points (0.5%), charged in the order currency |
| Treasury | `0xB8d92F2E8D1A98c18cDe85e49a0F11e3c64D0a68` |
| Initial state | Paused |
| Seaport | `0x0000000000000068F116a894984e2DB1123eB395` |
| Signature NFT | `0x48791DbDFB38bAA58e48329148C321bF33B3c1e1` |

[`DeployGarudaV2.s.sol`](script/DeployGarudaV2.s.sol) deploys only; it never activates the validator. A mainnet deployment requires the operator's wallet signature and ETH for gas. No private keys are used by the preparation or verification scripts.

## Deploy with a browser wallet

Open the local app at `/garuda/?screen=deploy`. The first card prepares the reviewed V2 creation payload and refreshes the gas estimate for the connected wallet. **Deploy validator** requests a contract-creation transaction from that wallet; no backend signer or private key is used. After 12 confirmations and bytecode/binding checks, the second card enables **Deploy payment router** against the verified zone.

The screen saves submitted transaction hashes locally and accepts a replacement hash for recovery. It never automatically resends a deployment. Public Solidity sources are submitted to [Sourcify API v2](https://docs.sourcify.dev/docs/api/) after bytecode verification. The status only says source-verified when both creation and runtime match. Etherscan verification remains separate: use the supplied Standard JSON Input download, Solidity v0.8.30+commit.73712a01 and MIT license.

The local helper writes `deployments/ethereum-mainnet-v2.json` after zone verification and `deployments/ethereum-mainnet-v2-with-router.json` after router verification. The latter pins the router address and runtime hash. Neither file changes the running API configuration. The local endpoints are absent from production builds.

The third card, **Activate the new market**, prepares two separate guardian-wallet actions: **Pause V1 trading**, then **Activate V2 market**. It requires verified sources for both contracts and an API configured with the exact combined manifest. Activation stays disabled until the V1 pause has 12 confirmations. Each action rechecks the deployed code, wallet, chain and exact pause/unpause calldata before requesting a signature. Submitted transaction hashes are saved for reload recovery; replacement hashes can be entered manually.

## Application migration and activation

The app now has the V2 proof codec and ABI, token decimals and approvals, currency selection, balances and receipts, USD estimates, and currency-aware API/Arkiv validation. Uniswap funding targets the selected order currency. WISE-only behavior remains active for a V1 manifest; no placeholder V2 address is shipped.

After the wallet deploys the reviewed contract, run:

```sh
node --import tsx scripts/finalize-seaport-v2-deployment.mjs 0xDEPLOYMENT_TRANSACTION_HASH
```

This read-only script checks the deployment transaction against compiled creation code, runtime code against the source artifact, immutable bindings, confirmations and paused state. It writes `deployments/ethereum-mainnet-v2.json` and separate unsigned guardian transactions for V1 retirement and V2 activation. Point `GARUDA_DEPLOYMENT_FILE` at the verified manifest and restart the API only after confirming the intended cutover. Verify the source on Etherscan using the supplied compiler input.


Existing signatures commit to V1's address and proof hash, so they cannot be edited into V2 offers. The market links to the existing backup tool for V1 cancellation; makers must sign new V2 offers. The backup tool keeps its pinned V1 configuration for that recovery path. Asset epochs are local to each zone: V2 transfers do not invalidate V1 signatures. As part of cutover, the guardian must pause V1 before enabling V2; otherwise older offers may remain executable, including after an NFT returns to a previous owner. Seaport cancellation remains available when the old zone is paused.

After deployment, verify the source and immutable values, configure the verified V2 manifest, retire V1 trading, then have the guardian activate V2. These actions have not been broadcast by this preparation.
