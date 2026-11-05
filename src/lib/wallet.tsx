import { createContext, useContext, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createThirdwebClient } from 'thirdweb';
import { ethereum } from 'thirdweb/chains';
import { AutoConnect, ThirdwebProvider, darkTheme, useConnectModal, useActiveAccount, useActiveWallet, useDisconnect } from 'thirdweb/react';
import { createWallet } from 'thirdweb/wallets';
import { Wallet, LogOut } from 'lucide-react';
import { installThirdwebRpcFailover } from './rpc-failover';

const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim();
export const thirdwebClient = clientId ? createThirdwebClient({ clientId }) : undefined;
if (clientId) installThirdwebRpcFailover(clientId);
const wallets = [createWallet('io.rabby'), createWallet('io.metamask'), createWallet('com.coinbase.wallet'), createWallet('com.trustwallet.app'), createWallet('io.zerion.wallet')];
const queryClient = new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}});
const WalletContext = createContext<{connect:()=>Promise<void>;connecting:boolean;error:string}>({connect:async()=>{},connecting:false,error:''});
function WalletAccess({children}:{children:ReactNode}) {
  const {connect,isConnecting} = useConnectModal();
  const [error,setError] = useState('');
  async function open() {
    setError('');
    if (!thirdwebClient) { setError('Wallet connection needs a public Thirdweb client ID in the app configuration.'); return; }
    try { await connect({client:thirdwebClient, wallets, chain:ethereum, chains:[ethereum], theme:darkTheme({colors:{modalBg:'#111214',accentText:'#35b8b4',accentButtonBg:'#00b0aa',primaryButtonBg:'#00b0aa'}}),appMetadata:{name:'WiseOne | Garuda Extension',url:window.location.origin,logoUrl:window.location.origin+'/wiseone-logo.png'},size:'compact',title:'Connect to WiseOne',showThirdwebBranding:false}); }
    catch { setError('Connection was not completed. You can try again.'); }
  }
  return <WalletContext.Provider value={{connect:open,connecting:isConnecting,error}}>
    {thirdwebClient && <AutoConnect client={thirdwebClient} wallets={wallets} />}{children}
  </WalletContext.Provider>;
}
export function AppProviders({children}:{children:ReactNode}) {
  return <QueryClientProvider client={queryClient}><ThirdwebProvider><WalletAccess>{children}</WalletAccess></ThirdwebProvider></QueryClientProvider>;
}
export const useWalletAccess = () => useContext(WalletContext);
export function WalletButton() {
  const account=useActiveAccount(), wallet=useActiveWallet();
  const {disconnect}=useDisconnect();
  const {connect,connecting,error}=useWalletAccess();
  const [open,setOpen]=useState(false);
  return <div className="wallet-controls">
    <button className="wallet-button" type="button" aria-expanded={account ? open : undefined} onClick={()=>account?setOpen(!open):void connect()} disabled={connecting}><Wallet size={16} aria-hidden="true" />{account?`${account.address.slice(0,6)}…${account.address.slice(-4)}`:connecting?'Connecting…':'Connect wallet'}</button>
    {open && account && wallet && <div className="wallet-popover"><span>{account.address}</span><a href={`https://etherscan.io/address/${account.address}`} target="_blank" rel="noreferrer">View on Etherscan ↗</a><button onClick={()=>{disconnect(wallet);setOpen(false);}}><LogOut size={16}/> Disconnect</button></div>}
    {error && <p className="wallet-error" role="alert">{error}</p>}
  </div>;
}
