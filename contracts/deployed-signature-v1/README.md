# Deployed Signature stake validator (V1)

This is the source for Garuda’s deployed Ethereum Signature stake validator, [`0xf8a4719a149227a9a15456a62ac49baa8b95554d`](https://etherscan.io/address/0xf8a4719a149227a9a15456a62ac49baa8b95554d#code).

[`SignatureSeaportZone.sol`](src/SignatureSeaportZone.sol) validates listings and purchase bids fulfilled through canonical Seaport 1.6. It checks the signed stake snapshot, ownership, order epoch, payment and fee recipients. Seaport transfers the NFT and payment; the validator never holds either asset. This deployed version settles in **WISE**, with a **0.5% fee**. WETH or USDC settlement requires a different validator and newly signed orders.

## Source and deployment records

| File | Purpose |
| --- | --- |
| [SignatureSeaportZone.sol](src/SignatureSeaportZone.sol) | Seaport authorization, settlement checks, cancellation epochs and pause control |
| [WiseSignatureAdapter.sol](src/WiseSignatureAdapter.sol) | Reads the underlying Signature stake and binds its state into the order |
| [ICollateralAdapter.sol](src/ICollateralAdapter.sol) | Shared snapshot interface |
| [Contract tests](test/SignatureSeaportZone.t.sol) | Ownership, stake changes, payment rules, fees, cancellation, pause and replay checks |
| [Deployment manifest](deployments/ethereum-mainnet/sales-deployment.json) | Ethereum addresses, code hashes, fee terms and deployment block |
| [Verification record](deployments/ethereum-mainnet/verification.json) | Recorded Etherscan/Sourcify verification and activation snapshot |
| [Compiler input](deployments/ethereum-mainnet/SignatureSeaportZone.standard-input.json) | Complete Solidity standard JSON input, including dependency source |
| [Deployment script](script/DeploySales.s.sol) | Original constructor configuration; creates a paused validator |

The source is preserved exactly as compiled for this deployment: **Solidity 0.8.30**, Cancun EVM, optimizer enabled with **200 runs**, and **OpenZeppelin 5.4.0**. The verification record includes the compiler-input SHA-256. Its activation fields describe the recorded block; use the read-only check below for current owner and pause state.

## Reproduce the checks

From the repository root, with Node.js and Foundry installed:

```sh
npm ci
npm ci --prefix contracts/deployed-signature-v1
forge test --root contracts/deployed-signature-v1
node contracts/deployed-signature-v1/verify-mainnet.mjs
```

The verification script uses the repository’s `viem` dependency and a public Ethereum RPC. It checks every source file against the archived compiler input, compares the compiled runtime and metadata with deployed bytecode outside Solidity’s immutable slots, and separately checks those immutable values against the deployment manifest. It also verifies the complete live runtime hash and reports the block, owner and pause state. It requires no wallet and sends no transaction.

On **6 November 2026**, all **8 contract tests** passed, including **512 fuzz cases**. The live source check passed at Ethereum block **26,355,821**, with runtime hash `0xb51f77575ad30e33113473e6f54b1619c218c895ceb34aa79aa4af896aed1ee2`.

Publishing this package does not redeploy or change the contract. The source is MIT-licensed; the tests and source match check are verification tools, not an independent security audit.
