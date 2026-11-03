"use client";

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wallet, X, ChevronRight, AlertCircle, ArrowRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { BT_C_WELCOME_GRANT, grantBtCWelcomeBalance } from '@/lib/bt-c';

// EIP-6963 Provider Discovery
const eip6963Providers: Record<string, any> = {};
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event: any) => {
    if (event.detail?.info?.rdns) {
      eip6963Providers[event.detail.info.rdns] = event.detail.provider;
    }
  });
  // Request providers to announce themselves
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

type WalletProvider = {
  name: string;
  id: string;
  icon: string;
  getProvider: () => any;
};

const WALLETS: WalletProvider[] = [
  {
    name: 'MetaMask',
    id: 'metamask',
    icon: '🦊',
    getProvider: () => {
      // 1. Try EIP-6963 (100% reliable)
      if (eip6963Providers['io.metamask']) return eip6963Providers['io.metamask'];
      
      // 2. Fallbacks
      const eth = (window as any).ethereum;
      if (!eth) return null;
      
      if (eth.providers?.length) {
        const mm = eth.providers.find((p: any) => p.isMetaMask && !p.isTrust && !p.isTrustWallet && !p.isCoinbaseWallet);
        if (mm) return mm;
      }
      if (eth.isMetaMask) return eth;
      return null;
    },
  },
  {
    name: 'Coinbase / Base Wallet',
    id: 'coinbase',
    icon: '🔵',
    getProvider: () => {
      if (eip6963Providers['com.coinbase.wallet']) return eip6963Providers['com.coinbase.wallet'];
      
      if ((window as any).coinbaseWalletExtension) return (window as any).coinbaseWalletExtension;
      if ((window as any).ethereum?.isCoinbaseWallet) return (window as any).ethereum;
      if ((window as any).ethereum?.providers) {
        return (window as any).ethereum.providers.find((p: any) => p.isCoinbaseWallet) || null;
      }
      return null;
    }
  },
  {
    name: 'Trust Wallet',
    id: 'trustwallet',
    icon: '🛡️',
    getProvider: () => {
      if (eip6963Providers['com.trustwallet.app']) return eip6963Providers['com.trustwallet.app'];
      
      const eth = (window as any).ethereum;
      if (!eth) return null;
      if (eth.isTrust || eth.isTrustWallet) return eth;
      if (eth.providers?.length) {
        return eth.providers.find((p: any) => p.isTrust || p.isTrustWallet) || null;
      }
      return (window as any).trustwallet || null;
    }
  },
  {
    name: 'Phantom',
    id: 'phantom',
    icon: '👻',
    getProvider: () => {
      if (eip6963Providers['app.phantom']) return eip6963Providers['app.phantom'];
      return (window as any).phantom?.ethereum || ((window as any).ethereum?.isPhantom ? (window as any).ethereum : null);
    }
  },
  {
    name: 'Browser Wallet',
    id: 'injected',
    icon: '🌐',
    getProvider: () => (window as any).ethereum,
  }
];

export default function WalletConnect() {
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [activeProvider, setActiveProvider] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  // State for detected wallet tokens (BT-c, etc.)
  const [walletTokens, setWalletTokens] = useState<Record<string, number>>({});

  // BT-c token contract address (educational token on Phantom/EVM)
  const BT_C_CONTRACT = "0x1F1c1bE1eAe1c1bE1eAe1c1bE1eAe1c1bE1eAe1"; // Placeholder - actual BT-c contract

  // Funding Flow States
  const [isFunding, setIsFunding] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [isTxPending, setIsTxPending] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Request EIP-6963 providers again when component mounts just in case some wallets loaded late
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    }
  }, []);

  // Wallet app links reopen the current page inside the wallet's browser. Once
  // its injected provider announces itself, complete the connection requested
  // by the original button tap.
  useEffect(() => {
    if (!mounted) return;
    const walletId = new URLSearchParams(window.location.search).get('connectWallet');
    const wallet = WALLETS.find(candidate => candidate.id === walletId);
    if (!wallet) return;

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      window.dispatchEvent(new Event('eip6963:requestProvider'));
      if (wallet.getProvider()) {
        window.clearInterval(interval);
        const url = new URL(window.location.href);
        url.searchParams.delete('connectWallet');
        window.history.replaceState({}, '', url.toString());
        setShowModal(true);
        void connectSpecificWallet(wallet);
      } else if (attempts >= 20) {
        window.clearInterval(interval);
      }
    }, 150);

    return () => window.clearInterval(interval);
  // connectSpecificWallet uses component state setters and is intentionally
  // invoked only after the wallet provider has appeared.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const connectSpecificWallet = async (wallet: WalletProvider) => {
    setError(null);
    const providerObj = wallet.getProvider();
    
    if (!providerObj) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        const returnUrl = new URL(window.location.href);
        returnUrl.searchParams.set('connectWallet', wallet.id);
        const dAppHost = window.location.host;
        const currentUrl = returnUrl.toString();
        const encodedUrl = encodeURIComponent(currentUrl);
        
        if (wallet.id === 'metamask') {
          window.location.href = `https://metamask.app.link/dapp/${dAppHost}${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
          return;
        } else if (wallet.id === 'trustwallet') {
          window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodedUrl}`;
          return;
        } else if (wallet.id === 'phantom') {
          window.location.href = `https://phantom.app/ul/browse/${encodedUrl}`;
          return;
        } else if (wallet.id === 'coinbase') {
          window.location.href = `https://go.cb-w.com/dapp?cb_url=${encodedUrl}`;
          return;
        }
      }

      setError(`Please install ${wallet.name}.`);
      return;
    }

    try {
      // First try to request accounts directly from the provider object
      // This is often more reliable for initial connection than going through ethers first
      let accounts: string[] = [];
      try {
        accounts = await providerObj.request({ method: 'eth_requestAccounts' });
      } catch (reqErr: any) {
        // Fallback for older or non-standard providers
        if (providerObj.enable) {
          accounts = await providerObj.enable();
        } else {
          throw reqErr; // Re-throw to be caught by the outer try-catch
        }
      }

      if (accounts && accounts.length > 0) {
        // Once authorized, create the ethers provider
        const provider = new ethers.BrowserProvider(providerObj);
        
        setAccount(accounts[0]);
        if (grantBtCWelcomeBalance(accounts[0])) {
          setWalletTokens(tokens => ({ ...tokens, 'BT-c': BT_C_WELCOME_GRANT }));
        }
        
        // Save to platform_users
        const userId = localStorage.getItem('token');
        if (userId) {
          const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
          const userIndex = users.findIndex((u: any) => u.id === userId);
          if (userIndex !== -1) {
            users[userIndex].walletAddress = accounts[0];
            localStorage.setItem('platform_users', JSON.stringify(users));
            window.dispatchEvent(new Event('balanceUpdated')); // Trigger FirebaseSync
          }
        }

        setActiveProvider(providerObj);
        const bal = await provider.getBalance(accounts[0]);
        setBalance(ethers.formatEther(bal));
        
        // Fetch wallet token balances (ERC-20 tokens like BT-c, etc.)
        await fetchWalletTokens(providerObj, accounts[0]);
        
        // Transition to Funding flow
        setIsFunding(true);
      } else {
        throw new Error("No accounts returned from wallet.");
      }
    } catch (err: any) {
      // If we get the -32603 'Unable to find account' error, it often means the wallet is locked or 
      // the dapp is disconnected and MetaMask isn't showing the prompt properly. 
      // We can force a prompt using wallet_requestPermissions.
      if (err.code === -32603 || err.message?.includes("Unable to find any account")) {
        try {
          await providerObj.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }]
          });
          // If successful, try getting accounts again
          const accounts = await providerObj.request({ method: 'eth_requestAccounts' });
          if (accounts && accounts.length > 0) {
            const provider = new ethers.BrowserProvider(providerObj);
            setAccount(accounts[0]);
            if (grantBtCWelcomeBalance(accounts[0])) {
              setWalletTokens(tokens => ({ ...tokens, 'BT-c': BT_C_WELCOME_GRANT }));
            }
            
            // Save to platform_users
            const userId = localStorage.getItem('token');
            if (userId) {
              const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
              const userIndex = users.findIndex((u: any) => u.id === userId);
              if (userIndex !== -1) {
                users[userIndex].walletAddress = accounts[0];
                localStorage.setItem('platform_users', JSON.stringify(users));
                window.dispatchEvent(new Event('balanceUpdated')); // Trigger FirebaseSync
              }
            }

            setActiveProvider(providerObj);
            const bal = await provider.getBalance(accounts[0]);
            setBalance(ethers.formatEther(bal));
            await fetchWalletTokens(providerObj, accounts[0]);
            setIsFunding(true);
            return;
          }
        } catch (permissionErr: any) {
          console.error("Permission request failed:", permissionErr);
          if (permissionErr.code === 4001) {
            setError("Connection rejected by user.");
            return;
          }
        }
        
        setError("Wallet is locked or disconnected. Please open the extension, unlock it, and refresh the page.");
        return;
      }

      console.error("Wallet connection error:", err);
      if (err.code === 4001) {
        setError("Connection rejected by user.");
      } else if (err.code === -32002) {
        setError("Connection request already pending. Please open your wallet.");
      } else {
        setError(err.message || `Failed to connect to ${wallet.name}`);
      }
    }
  };

  const executeFunding = async () => {
    setError(null);
    if (!fundAmount || isNaN(Number(fundAmount))) {
      setError("Please enter a valid amount.");
      return;
    }
    
    // Check for minimum deposit of ~1 USD (roughly 0.00033 ETH)
    if (Number(fundAmount) < 0.00033) {
      setError("Minimum deposit is 0.00033 ETH (approx. $1).");
      return;
    }

    if (Number(fundAmount) > Number(balance)) {
      setError("Insufficient balance.");
      return;
    }

    setIsTxPending(true);
    try {
      const provider = new ethers.BrowserProvider(activeProvider);
      const signer = await provider.getSigner();
      
      // Sending tx to the specified treasury address
      const tx = await signer.sendTransaction({
        to: "0x9b8f441bafd4318a97c2d40d7187219dbfdeb4ee",
        value: ethers.parseEther(fundAmount.toString())
      });
      
      await tx.wait(); // Wait for confirmation so we only credit successful txs

      // Fetch current ETH price in USDT to credit equivalent USDT to user
      let ethPriceUSDT = 3000; // Fallback price
      try {
        const priceRes = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT");
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          ethPriceUSDT = parseFloat(priceData.price);
        }
      } catch (e) {
        console.error("Failed to fetch ETH price:", e);
      }

      // Update user balance in localStorage
      const loggedInUserId = localStorage.getItem('token');
      const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
      const userIndex = users.findIndex((u: any) => u.id === loggedInUserId);
      
      let userEmail = 'Unknown';
      if (userIndex !== -1) {
        userEmail = users[userIndex].email;
        if (!users[userIndex].balance) users[userIndex].balance = { USDT: 0, ETH: 0 };
        users[userIndex].balance.ETH = (users[userIndex].balance.ETH || 0) + Number(fundAmount);
        users[userIndex].balance.USDT = (users[userIndex].balance.USDT || 0) + Number(fundAmount) * ethPriceUSDT;
        localStorage.setItem('platform_users', JSON.stringify(users));
        
        // Notify other components to refresh balance
        window.dispatchEvent(new Event('balanceUpdated'));
      }

      // Track deposit for admin dashboard
      const existingDeposits = JSON.parse(localStorage.getItem('admin_deposits') || '[]');
      existingDeposits.push({
        user: account,
        email: userEmail,
        amount: fundAmount,
        usdtValue: (Number(fundAmount) * ethPriceUSDT).toFixed(2),
        hash: tx.hash,
        date: new Date().toISOString()
      });
      localStorage.setItem('admin_deposits', JSON.stringify(existingDeposits));

      setIsFunding(false);
      setShowModal(false);
      
      // Update local wallet balance UI
      const newBal = await provider.getBalance(account!);
      setBalance(ethers.formatEther(newBal));

      // Show success message with USDT equivalent
      const usdtCredited = Number(fundAmount) * ethPriceUSDT;
      alert(`Deposit successful! ${Number(fundAmount)} ETH (≈ $${usdtCredited.toFixed(2)} USDT) credited to your account.`);

    } catch (err: any) {
      setError(err.message || "Transaction failed or rejected.");
    } finally {
      setIsTxPending(false);
    }
  };

  // Fetch ERC-20 token balances from connected wallet
  const fetchWalletTokens = async (provider: any, walletAddress: string) => {
    try {
      const providerObj = new ethers.BrowserProvider(provider);
      
      // Common ERC-20 token contract ABIs we want to track
      // BT-c and other educational tokens
      const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number; name: string }> = {
        // BT-c token (educational token, 1 BT-c = 100 USDT by design)
        "0x1F1c1bE1eAe1c1bE1eAe1c1bE1eAe1c1bE1eAe1": { symbol: "BT-c", decimals: 18, name: "Bukkt Token c" },
        // Add more token contracts here as they're created
      };

      const tokenBalances: Record<string, number> = {};
      
      // Fetch balance of each known token
      for (const [contractAddress, tokenInfo] of Object.entries(KNOWN_TOKENS)) {
        try {
          const erc20Abi = [
            "function balanceOf(address owner) view returns (uint256)",
            "function decimals() view returns (uint8)",
            "function symbol() view returns (string)"
          ];
          
          const contract = new ethers.Contract(contractAddress, erc20Abi, providerObj);
          const rawBalance = await contract.balanceOf(walletAddress);
          const decimals = await contract.decimals();
          const balanceFormatted = Number(ethers.formatUnits(rawBalance, decimals));
          
          if (balanceFormatted > 0) {
            tokenBalances[tokenInfo.symbol] = balanceFormatted;
          }
        } catch (err) {
          console.warn(`Failed to fetch ${tokenInfo.symbol} balance:`, err);
        }
      }

      // Also query Solana SPL token balances (e.g. Phantom / Solana mint 5ZpyyfccnWuLc99mtX7D2NXPsg5B6DcaLKiYRk1vskAQ)
      const solanaProvider = (typeof window !== 'undefined' && ((window as any).phantom?.solana || (window as any).solana));
      if (solanaProvider && solanaProvider.publicKey) {
        const solAddress = solanaProvider.publicKey.toBase58();
        const BT_C_SOLANA_MINT = "5ZpyyfccnWuLc99mtX7D2NXPsg5B6DcaLKiYRk1vskAQ";
        const rpcEndpoints = [
          'https://api.mainnet-beta.solana.com',
          'https://api.devnet.solana.com'
        ];

        for (const rpcUrl of rpcEndpoints) {
          try {
            const btcResp = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: 1,
                jsonrpc: '2.0',
                method: 'getTokenAccountsByOwner',
                params: [solAddress, { mint: BT_C_SOLANA_MINT }, { encoding: 'jsonParsed' }]
              })
            });

            if (btcResp.ok) {
              const data = await btcResp.json();
              if (data.result?.value?.length > 0) {
                for (const item of data.result.value) {
                  const info = item.account?.data?.parsed?.info;
                  if (info?.tokenAmount?.amount) {
                    const decimals = info.tokenAmount.decimals || 18;
                    const bal = parseInt(info.tokenAmount.amount) / (10 ** decimals);
                    if (bal > 0) {
                      tokenBalances['BT-c'] = bal;
                    }
                  }
                }
              }
            }
          } catch (solErr) {
            console.warn(`Solana token fetch warning (${rpcUrl}):`, solErr);
          }
        }
      }

      // Merge with existing balances
      const updatedTokens = { ...tokenBalances };
      
      // Store wallet tokens for the swap modal to access
      localStorage.setItem('wallet_tokens', JSON.stringify(updatedTokens));
      setWalletTokens(updatedTokens);
      
      // Also merge into platform user balance
      const userId = localStorage.getItem('token');
      if (userId) {
        const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
        const userIndex = users.findIndex((u: any) => u.id === userId);
        if (userIndex !== -1) {
          if (!users[userIndex].balance) users[userIndex].balance = { USDT: 0, ETH: 0 };
          // Merge wallet tokens into user balance
          Object.entries(updatedTokens).forEach(([symbol, amount]) => {
            users[userIndex].balance[symbol] = (users[userIndex].balance[symbol] || 0) + amount;
          });
          // Also save wallet tokens separately for reference
          users[userIndex].walletTokens = updatedTokens;
          localStorage.setItem('platform_users', JSON.stringify(users));
          window.dispatchEvent(new Event('balanceUpdated'));
        }
      }
      
      return updatedTokens;
    } catch (err) {
      console.error("Failed to fetch wallet tokens:", err);
      return {};
    }
  };

  useEffect(() => {
    if (activeProvider) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          setAccount(null);
          setBalance(null);
          setActiveProvider(null);
          setIsFunding(false);
        }
      };
      
      activeProvider.on('accountsChanged', handleAccountsChanged);
      return () => {
        if (activeProvider.removeListener) {
          activeProvider.removeListener('accountsChanged', handleAccountsChanged);
        }
      };
    }
  }, [activeProvider]);

  return (
    <>
      {account && !isFunding ? (
        <div className="flex items-center gap-3">
          {balance && (
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs text-slate-400">Wallet Balance</span>
              <span className="text-sm font-mono font-medium text-slate-200">
                {Number(balance).toFixed(4)} ETH
              </span>
            </div>
          )}
          <div 
            className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-md cursor-pointer hover:bg-slate-700 transition-colors"
            onClick={() => {
              setAccount(null);
              setBalance(null);
              setActiveProvider(null);
            }}
            title="Click to disconnect"
          >
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-sm font-mono text-slate-300">
              {account.slice(0, 6)}...{account.slice(-4)}
            </span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setError(null);
            setShowModal(true);
            setIsFunding(!!account);
          }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors border border-indigo-500 shadow-sm shadow-indigo-900/20"
        >
          <Wallet size={16} />
          <span>Connect Wallet</span>
        </button>
      )}

      {/* Custom Modal */}
      {mounted && showModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#151920] border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative">
            
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white">
                {isFunding ? "Fund Your Account" : "Connect a Wallet"}
              </h2>
              <button 
                onClick={() => {
                  setShowModal(false);
                  setIsFunding(false);
                  setError(null);
                }}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 flex flex-col gap-2">
              {error && (
                <div className="p-3 mb-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span className="break-words">{error}</span>
                </div>
              )}

              {isFunding ? (
                <div className="flex flex-col gap-4 py-2">
                  <p className="text-sm text-slate-400">
                    To start trading, please deposit ETH to your account.
                  </p>
                  
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Available Wallet Balance</span>
                    <span className="font-mono text-slate-300">{Number(balance || 0).toFixed(4)} ETH</span>
                  </div>

                  <div className="flex items-center bg-[#0b0e11] border border-slate-800 rounded-md px-3 py-3">
                    <span className="text-slate-500 text-sm w-20">Amount</span>
                    <input 
                      type="number" 
                      value={fundAmount}
                      onChange={e => setFundAmount(e.target.value)}
                      className="flex-1 bg-transparent text-right font-mono text-slate-200 outline-none w-full"
                      placeholder="0.00033"
                      step="0.00001"
                      min="0.00033"
                      disabled={isTxPending}
                    />
                    <span className="text-slate-500 font-bold text-sm ml-3">ETH</span>
                  </div>

                  <button
                    onClick={executeFunding}
                    disabled={isTxPending || !fundAmount}
                    className="w-full flex justify-center items-center gap-2 py-3 rounded-md font-bold text-white transition-colors bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 mt-2"
                  >
                    {isTxPending ? 'Confirming in Wallet...' : 'Deposit Funds'}
                    {!isTxPending && <ArrowRight size={18} />}
                  </button>
                </div>
              ) : (
                <>
                  {WALLETS.map(wallet => {
                    const isDetected = !!wallet.getProvider();
                    return (
                      <button
                        key={wallet.id}
                        onClick={() => connectSpecificWallet(wallet)}
                        className="flex justify-between items-center w-full p-4 rounded-lg bg-[#0b0e11] border border-slate-800 hover:border-indigo-500 hover:bg-[#1a1f2b] transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-2xl">{wallet.icon}</span>
                          <span className="font-semibold text-slate-200 group-hover:text-white">{wallet.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {isDetected ? (
                            <span className="text-[10px] uppercase font-bold tracking-wider text-green-500 bg-green-500/10 px-2 py-1 rounded">Detected</span>
                          ) : null}
                          <ChevronRight size={18} className="text-slate-600 group-hover:text-indigo-400" />
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            
            <div className="p-4 bg-[#0b0e11] border-t border-slate-800 text-xs text-center text-slate-500">
              {isFunding 
                ? "Minimum deposit requirement: $1 equivalent in ETH (0.00033 ETH)." 
                : "By connecting a wallet, you agree to Bukkt's Terms of Service and Privacy Policy."}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
