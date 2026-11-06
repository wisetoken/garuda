# Garuda contracts

Garuda uses two verified Ethereum mainnet contracts to trade WiseOne Signature NFT stakes and accept payments through Uniswap.

| Contract | Ethereum address / verified source | Repository source |
| --- | --- | --- |
| Stake validator | [`0xb87Cf2cB81Fa97433213d2928c7b3A1424b05317`](https://etherscan.io/address/0xb87Cf2cB81Fa97433213d2928c7b3A1424b05317#code) | [GarudaSignatureSeaportZoneV2.sol](seaport/src/GarudaSignatureSeaportZoneV2.sol) |
| Uniswap payment router | [`0xf040eB4a12cB15585b777dD7Cf26cb9F736aAb1c`](https://etherscan.io/address/0xf040eB4a12cB15585b777dD7Cf26cb9F736aAb1c#code) | [GarudaPurchaseRouter.sol](seaport/src/GarudaPurchaseRouter.sol) |

Both have exact-match source verification on Etherscan and Sourcify. The validator checks the signed stake, ownership, payment currency and fee terms during Seaport settlement. The router combines an exact-output Uniswap swap, stake purchase, NFT delivery and unused-input refund in one transaction.

See the [contract documentation](seaport/README.md) for compiler inputs, deployment records, contract tests and mainnet-fork verification. The [active deployment manifest](seaport/deployments/ethereum-mainnet-v2-with-router.json) pins the addresses, code hashes and one-confirmation policy.
