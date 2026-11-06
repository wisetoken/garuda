# Contract test fixtures

This package preserves a deployment test's source, compiler input and regression fixtures. The live Garuda contracts and their verified addresses are documented in [the marketplace contract package](../seaport/README.md).

The source and compiler input are kept together for reproducible bytecode checks and saved-order cancellation compatibility. Run these commands from this directory:

```sh
npm ci
forge test
node verify-mainnet.mjs
```

The verification script reads Ethereum state and sends no transactions.
