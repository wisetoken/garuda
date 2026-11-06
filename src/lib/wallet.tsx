import { createContext, useContext, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createThirdwebClient } from 'thirdweb';
import { ethereum } from 'thirdweb/chains';
import { AutoConnect, ThirdwebProvider, useConnectModal, useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { Wallet, LogOut } from 'lucide-react';
import { installThirdwebRpcFailover } from './rpc-failover';
import { ThemeProvider, useTheme } from './theme';
import { thirdwebAppMetadata, thirdwebConnectModal, thirdwebDarkTheme, thirdwebLightTheme, thirdwebWallets } from './wallet-config';
import '../components/wallet-connect.css';
import { useAppToast } from '../components/AppToast';

const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim();
export const thirdwebClient = clientId ? createThirdwebClient({ clientId }) : undefined;
if (clientId) installThirdwebRpcFailover(clientId);
const queryClient = new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}});
const WalletContext = createContext<{connect:()=>Promise<void>;connecting:boolean}>({connect:async()=>{},connecting:false});
function WalletAccess({children}:{children:ReactNode}) {
  const {connect,isConnecting} = useConnectModal();
  const {theme} = useTheme();
  const {showToast} = useAppToast();
  async function open() {
    if (isConnecting) return;
    if (!thirdwebClient) { showToast('Wallet connection is not configured. Please try again later.', {tone:'error'}); return; }
    try {
      await connect({
        client: thirdwebClient,
        wallets: thirdwebWallets,
        chain: ethereum,
        chains: [ethereum],
        theme: theme === 'light' ? thirdwebLightTheme : thirdwebDarkTheme,
        appMetadata: thirdwebAppMetadata,
        ...thirdwebConnectModal,
      });
    } catch (cause) {
      // Thirdweb closes the picker by rejecting without an error.
      if (cause !== undefined) showToast('Connection was not completed. You can try again.', {tone:'error'});
    }
  }
  return <WalletContext.Provider value={{connect:open,connecting:isConnecting}}>
    {thirdwebClient && <AutoConnect client={thirdwebClient} wallets={thirdwebWallets} />}{children}
  </WalletContext.Provider>;
}
export function AppProviders({children}:{children:ReactNode}) {
  return <QueryClientProvider client={queryClient}><ThirdwebProvider><ThemeProvider><WalletAccess>{children}</WalletAccess></ThemeProvider></ThirdwebProvider></QueryClientProvider>;
}
export const useWalletAccess = () => useContext(WalletContext);
export function WalletButton() {
  const account=useActiveAccount(), wallet=useActiveWallet();
  const {disconnect}=useDisconnect();
  const {connect,connecting}=useWalletAccess();
  const [open,setOpen]=useState(false);
  return <div className="wallet-controls">
    <button className="wallet-button" type="button" aria-expanded={account ? open : undefined} onClick={()=>account?setOpen(!open):void connect()} disabled={connecting}><Wallet size={16} aria-hidden="true" />{account?`${account.address.slice(0,6)}…${account.address.slice(-4)}`:connecting?'Connecting…':'Connect wallet'}</button>
    {open && account && wallet && <div className="wallet-popover"><span>{account.address}</span><a href={`https://etherscan.io/address/${account.address}`} target="_blank" rel="noreferrer">View on Etherscan ↗</a><button onClick={()=>{disconnect(wallet);setOpen(false);}}><LogOut size={16}/> Disconnect</button></div>}
  </div>;
}
