import { encodeFunctionData, getAddress, type WalletClient } from 'viem';
import { mainnet } from 'viem/chains';
import type { Account, Wallet } from 'thirdweb/wallets';

type TransactionWallet = Pick<WalletClient, 'account' | 'chain' | 'getChainId' | 'writeContract' | 'signTypedData'>;

/** Match deployment's direct account call: no SDK RPC preparation before the wallet. */
export function directTransactionWallet(signer: Account, wallet: Wallet): TransactionWallet {
  const address = getAddress(signer.address);
  function assertAccount() {
    if (wallet.getAccount()?.address.toLowerCase() !== address.toLowerCase() || wallet.getChain()?.id !== 1)
      throw new Error('Wallet or network changed. Review the action again on Ethereum.');
  }
  return {
    account: {address, type:'json-rpc'},
    chain: mainnet,
    getChainId: async () => { assertAccount(); return 1; },
    writeContract: async call => {
      assertAccount();
      const requestedAccount = typeof call.account === 'string' ? call.account : call.account?.address;
      if ((requestedAccount && requestedAccount.toLowerCase() !== address.toLowerCase()) || (call.chain && call.chain.id !== 1))
        throw new Error('Transaction account or network does not match the review.');
      const data = encodeFunctionData(call as Parameters<typeof encodeFunctionData>[0]);
      const result = await signer.sendTransaction({chainId:1, to:call.address, data, value:call.value ?? 0n});
      return result.transactionHash;
    },
    signTypedData: async data => {
      assertAccount();
      const domain = data.domain as {chainId?: number | bigint} | undefined;
      const requestedAccount = typeof data.account === 'string' ? data.account : data.account?.address;
      if (requestedAccount && requestedAccount.toLowerCase() !== address.toLowerCase())
        throw new Error('Signature account does not match the review.');
      if (domain?.chainId !== undefined && Number(domain.chainId) !== 1)
        throw new Error('Signature network does not match the review.');
      return signer.signTypedData(data as Parameters<Account['signTypedData']>[0]);
    },
  };
}
