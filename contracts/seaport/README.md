# Garuda stake validator and Uniswap payment router

The stake validator checks Signature NFT listings and bids in WISE, WETH or USDC through canonical Seaport 1.6. It holds no funds and performs no transfers itself. The purchase router lets buyers pay with ETH, WETH, USDC or WISE while the seller receives the currency in the signed listing.

**Status: deployed, source-verified on Etherscan and Sourcify, and activated on Ethereum mainnet.** The [activation observation](deployments/activation-verification.json) records the marketplace active at block **26,356,378** on 6 November 2026. The local API uses the [combined manifest](deployments/ethereum-mainnet-v2-with-router.json).

| Contract | Ethereum address / Etherscan exact match | Deployment transaction | Sourcify exact match |
| --- | --- | --- | --- |
| Stake validator | [`0xb87Cf2cB81Fa97433213d2928c7b3A1424b05317`](https://etherscan.io/address/0xb87Cf2cB81Fa97433213d2928c7b3A1424b05317#code) | [Creation transaction](https://etherscan.io/tx/0x04221e79de4f28593b784afa47cbf58af24022002ab3c131b30d30b6e2a786aa) | [Creation and runtime](https://repo.sourcify.dev/1/0xb87Cf2cB81Fa97433213d2928c7b3A1424b05317) |
| Uniswap payment router | [`0xf040eB4a12cB15585b777dD7Cf26cb9F736aAb1c`](https://etherscan.io/address/0xf040eB4a12cB15585b777dD7Cf26cb9F736aAb1c#code) | [Creation transaction](https://etherscan.io/tx/0x4346472779a6d0aca7f60de4a534b47feba7295ca02a5341cd77e096e6694f26) | [Creation and runtime](https://repo.sourcify.dev/1/0xf040eB4a12cB15585b777dD7Cf26cb9F736aAb1c) |

Creation code, runtime and immutable settings match the local build. Both use Solidity **v0.8.30+commit.73712a01**, optimizer **200 runs**, **Cancun**, and the **MIT** license. The [source verification record](deployments/source-verification.json) links to both verified contracts. All app transaction and deployment flows require **one Ethereum confirmation**.


## Payment currencies and Uniswap

The validator binds an ERC-20 payment address into every signed offer. The NFT, seller, stake snapshot, asset epoch, price and fee terms remain bound as before. Seller proceeds and fees must use that same payment token. The underlying stake is still WISE; the adapter's `WISE()` field identifies the staking protocol, not a settlement-token restriction.

The contract permits token contract addresses with standard exact-transfer behavior; it does not certify arbitrary token code. The app accepts WISE, WETH and USDC when its verified manifest declares `paymentSchemaVersion: 2`. Additional currencies require compatibility checks and a registry update. Fee-on-transfer, rebasing, malicious and other incompatible tokens are outside that supported set. Native ETH is not a V2 payment item; it can fund a swap or be wrapped into WETH.

The [purchase router](src/GarudaPurchaseRouter.sol) adds atomic Uniswap payments without changing the validator. Buyers can pay in ETH, WETH, USDC or WISE; an exact-output swap obtains the seller's chosen currency. The router fulfills the Seaport listing to itself, satisfying the zone's ownership check, then delivers the NFT to the buyer and refunds unused input. A failed purchase reverts the swap. It has fixed protocol targets, a curated token set, no administrator and no persistent approvals. Bids still require their maker's settlement-token balance and Seaport allowance; they cannot rely on an absent maker approving a later swap.

## Contract changes

The proof is now ten ABI words (320 bytes): kind, seller, token ID, stake ID, stake state hash, epoch, amount, fee basis points, fee recipient, and **payment currency**. `PAYMENT_SCHEMA_VERSION()` returns `2`. `SaleValidated` includes the payment currency. Incompatible payment proofs are rejected. Price and fee math uses the payment token's raw units, including USDC's six decimals.

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

Then run `node --import tsx scripts/verify-seaport-v2-fork.mjs`. At fork block **26,356,017**, it completed listings and accepted bids in WISE, WETH and USDC for Signature stakes #20 and #53: **12 settlements**, exact balances and fees, preserved underlying stake snapshots, and replay rejection. Cancelled orders and incompatible proofs were also rejected. The script checks Anvil and chain ID, uses fresh local accounts, and reverts its changes. The runner uses the production `publishSale`, `fillSale`, `cancelSale`, signature codec and receipt checks. It also verifies activation prerequisites. [Recorded results](deployments/fork-verification.json).

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

Open the local app at `/garuda/?screen=deploy`. The first card prepares the reviewed V2 creation payload and refreshes the gas estimate for the connected wallet. **Deploy validator** requests a contract-creation transaction from that wallet; no backend signer or private key is used. After one confirmation and bytecode/binding checks, the second card enables **Deploy payment router** against the verified zone.

The screen saves submitted transaction hashes locally and accepts a replacement hash for recovery. It never automatically resends a deployment. Public Solidity sources are submitted to [Sourcify API v2](https://docs.sourcify.dev/docs/api/) after bytecode verification. The status only says source-verified when both creation and runtime match. The current deployments also have Etherscan exact matches. For a new deployment, Etherscan verification is a separate submission using the supplied Standard JSON Input, Solidity v0.8.30+commit.73712a01 and MIT license.

The local helper writes `deployments/ethereum-mainnet-v2.json` after zone verification and `deployments/ethereum-mainnet-v2-with-router.json` after router verification. The latter pins the router address and runtime hash. Neither file changes the running API configuration. The local endpoints are absent from production builds.

The third card, **Activate the market**, requires verified sources for both contracts, an API configured with the exact combined manifest, and completed deployment prerequisites. The guardian confirms setup and activation transactions in the wallet, with one confirmation required for each. Each action rechecks the deployed code, wallet, chain and exact pause/unpause calldata before requesting a signature. Submitted transaction hashes are saved for reload recovery; replacement hashes can be entered manually.

## Application configuration and activation

The app now has the V2 proof codec and ABI, token decimals and approvals, currency selection, balances and receipts, USD estimates, and currency-aware API/Arkiv validation. Uniswap funding targets the selected order currency.

After the wallet deploys the reviewed contract, run:

```sh
node --import tsx scripts/finalize-seaport-v2-deployment.mjs 0xDEPLOYMENT_TRANSACTION_HASH
```

This read-only script checks the deployment transaction against compiled creation code, runtime code against the source artifact, immutable bindings, confirmations and paused state. It writes `deployments/ethereum-mainnet-v2.json` and unsigned guardian transactions for deployment setup and activation. Point `GARUDA_DEPLOYMENT_FILE` at the verified manifest and restart the API only after confirming the intended cutover. Verify the source on Etherscan using the supplied compiler input.


Signed orders commit to a specific validator address and proof hash. Changing deployment configuration requires new signatures; existing signed orders cannot be rewritten. The independent recovery tool retains the pinned configuration needed to cancel saved orders. Seaport cancellation remains available when a validator is paused.

After deployment, verify the source and immutable values, configure the verified manifest, complete deployment prerequisites, then have the guardian activate the market. The deployment and activation above have been completed by the guardian wallet; these preparation scripts do not broadcast transactions.
