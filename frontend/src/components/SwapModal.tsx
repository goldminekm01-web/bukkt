"use client";

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ArrowDownUp, X, RefreshCcw, Info, Wallet, AlertCircle, Copy, Check, LoaderCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { grantBtCWelcomeBalance } from '@/lib/bt-c';

// EIP-6963 Provider Discovery
const eip6963Providers: Record<string, any> = {};
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (event: any) => {
    if (event.detail?.info?.rdns) {
      eip6963Providers[event.detail.info.rdns] = event.detail.provider;
    }
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

type WalletProvider = {
  name: string;
  id: string;
  icon: string;
  getProvider: () => any;
  getSolanaProvider?: () => any;
};

const WALLETS: WalletProvider[] = [
  {
    name: 'Phantom',
    id: 'phantom',
    icon: '👻',
    getProvider: () => {
      if (eip6963Providers['app.phantom']) return eip6963Providers['app.phantom'];
      return (window as any).phantom?.ethereum || ((window as any).ethereum?.isPhantom ? (window as any).ethereum : null);
    },
    getSolanaProvider: () => {
      if ((window as any).phantom?.solana) return (window as any).phantom.solana;
      if ((window as any).solana && (window as any).solana.isPhantom) return (window as any).solana;
      return null;
    }
  },
  {
    name: 'MetaMask',
    id: 'metamask',
    icon: '🦊',
    getProvider: () => {
      if (eip6963Providers['io.metamask']) return eip6963Providers['io.metamask'];
      const eth = (window as any).ethereum;
      if (!eth) return null;
      if (eth.providers?.length) {
        const mm = eth.providers.find((p: any) => p.isMetaMask);
        if (mm) return mm;
      }
      if (eth.isMetaMask) return eth;
      return null;
    }
  },
  {
    name: 'Coinbase',
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
    name: 'Browser Wallet',
    id: 'injected',
    icon: '🌐',
    getProvider: () => (window as any).ethereum,
  }
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

const KNOWN_TOKENS: Record<string, {
  symbol: string; decimals: number; name: string; priceInUSDT: number
}> = {
  "0x1F1c1bE1eAe1c1bE1eAe1c1bE1eAe1c1bE1eAe1": { symbol: "BT-c", decimals: 18, name: "Bukkt Token c", priceInUSDT: 100 },
};

const BT_C_SOLANA_MINT = process.env.NEXT_PUBLIC_BT_C_MINT || "5ZpyyfccnWuLc99mtX7D2NXPsg5B6DcaLKiYRk1vskAQ";
const MIN_BT_C_SWAP = 3000;

export default function SwapModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});

  const [fromAsset, setFromAsset] = useState('USDT');
  const [toAsset, setToAsset] = useState('ETH');
  const [amount, setAmount] = useState('');
  const [estimatedReceive, setEstimatedReceive] = useState('0.00');
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const [mounted, setMounted] = useState(false);

  const [walletAccount, setWalletAccount] = useState<string | null>(null);
  const [walletProvider, setWalletProvider] = useState<any>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [selectedBank, setSelectedBank] = useState('');
  const [payoutAccountNumber, setPayoutAccountNumber] = useState('');
  const [kshFee, setKshFee] = useState(0);
  const [kshNetReceive, setKshNetReceive] = useState(0);
  const [pendingKshPayment, setPendingKshPayment] = useState<{
    amount: number;
    fromAsset: string;
    gross: number;
    fee: number;
    net: number;
    bank: string;
    accountNumber: string;
  } | null>(null);
  const [kshVerificationPending, setKshVerificationPending] = useState<any>(null);
  const [copiedTill, setCopiedTill] = useState(false);
  const [copyTillError, setCopyTillError] = useState(false);

  const [dynamicAssets, setDynamicAssets] = useState<string[]>(['USDT', 'ETH', 'BTC', 'BNB', 'SOL', 'KSH', 'BT-c']);

  const PRICE_MAP: Record<string, number> = {
    USDT: 1,
    BTC: 65000,
    ETH: 3500,
    BNB: 600,
    SOL: 150,
    'BT-c': 100,
    KSH: 0.01
  };

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const userId = localStorage.getItem('token');
    const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
    const user = users.find((entry: any) => entry.id === userId);
    const pendingSwaps = user?.pendingKshSwaps || [];
    const newestPendingSwap = pendingSwaps.find((swap: any) => swap.status === 'PENDING_VERIFICATION');
    if (newestPendingSwap) setKshVerificationPending(newestPendingSwap);
  }, [mounted]);

  // Complete mobile wallet deep-link handoffs when the wallet's in-app browser
  // reloads this page and injects its provider.
  useEffect(() => {
    if (!mounted) return;
    const walletId = new URLSearchParams(window.location.search).get('connectWallet');
    const wallet = WALLETS.find(candidate => candidate.id === walletId);
    if (!wallet) return;

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      window.dispatchEvent(new Event('eip6963:requestProvider'));
      if (wallet.getProvider() || wallet.getSolanaProvider?.()) {
        window.clearInterval(interval);
        const url = new URL(window.location.href);
        url.searchParams.delete('connectWallet');
        window.history.replaceState({}, '', url.toString());
        setIsOpen(true);
        setWalletModalOpen(true);
        void connectWallet(wallet);
      } else if (attempts >= 20) {
        window.clearInterval(interval);
      }
    }, 150);

    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const loadBalances = () => {
    const userId = localStorage.getItem('token');
    if (!userId) return;
    const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
    const user = users.find((u: any) => u.id === userId);
    if (user && user.balance) {
      setBalances({ ...user.balance });
    }

    const walletTokensStr = localStorage.getItem('wallet_tokens');
    if (walletTokensStr) {
      try {
        const walletTokens = JSON.parse(walletTokensStr);
        // The platform account includes the welcome credit and takes
        // precedence over any stale cached wallet-token reading.
        const mergedBalances = { ...walletTokens, ...(user?.balance || {}) };
        setBalances(mergedBalances);

        const currentAssets = dynamicAssets;
        const newAssets = Object.keys(walletTokens).filter(t => !currentAssets.includes(t));
        if (newAssets.length > 0) {
          setDynamicAssets(prev => [...prev, ...newAssets]);
        }
      } catch (e) {
        console.error('Failed to parse wallet tokens:', e);
      }
    }
  };

  const connectWallet = async (wallet: WalletProvider) => {
    setWalletError(null);
    const providerObj = wallet.getProvider();
    const solanaProvider = wallet.getSolanaProvider?.();

    if (!providerObj && !solanaProvider) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const dAppHost = window.location.host;
        const returnUrl = new URL(window.location.href);
        returnUrl.searchParams.set('connectWallet', wallet.id);
        const encodedReturnUrl = encodeURIComponent(returnUrl.toString());

        if (wallet.id === 'metamask') {
          window.location.href = `https://metamask.app.link/dapp/${dAppHost}${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
          return;
        }
        if (wallet.id === 'phantom') {
          window.location.href = `https://phantom.app/ul/browse/${encodedReturnUrl}`;
          return;
        }
        if (wallet.id === 'trustwallet') {
          window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodedReturnUrl}`;
          return;
        }
        if (wallet.id === 'coinbase') {
          window.location.href = `https://go.cb-w.com/dapp?cb_url=${encodedReturnUrl}`;
          return;
        }
      }
      setWalletError(`Please install ${wallet.name}.`);
      return;
    }

    let accountAddress: string | null = null;
    let connectedWalletAddress: string | null = null;

    if (providerObj) {
      try {
        let accounts: string[] = [];
        try {
          accounts = await providerObj.request({ method: 'eth_requestAccounts' });
        } catch (reqErr: any) {
          if (providerObj.enable) {
            accounts = await providerObj.enable();
          } else {
            throw reqErr;
          }
        }
        if (accounts && accounts.length > 0) {
          accountAddress = accounts[0];
          connectedWalletAddress = accounts[0];
          setWalletAccount(accounts[0]);
          setWalletProvider(providerObj);
        }
      } catch (err: any) {
        console.error("Ethereum connection error:", err);
        if (err.code === 4001) {
          setWalletError("Connection rejected by user.");
          return;
        }
      }
    }

    if (solanaProvider) {
      try {
        let solAddress = '';
        
        // Try to connect to Phantom Solana
        // Phantom's `ready` property may be false initially, but connect() should initialize it
        try {
          const solanaResp = await solanaProvider.connect();
          solAddress = solanaResp.publicKey?.toBase58();
        } catch (connectErr: any) {
          console.warn('Phantom connect() attempt 1 failed:', connectErr);
          // Fallback: use existing publicKey if already connected
          if (solanaProvider.publicKey) {
            solAddress = solanaProvider.publicKey.toBase58();
          }
          // If still no address, try enabling Phantom Solana
          if (!solAddress && typeof solanaProvider.connect === 'function') {
            try {
              const solanaResp2 = await solanaProvider.connect({ onlyIfTrusted: false });
              solAddress = solanaResp2.publicKey?.toBase58();
            } catch (connectErr2: any) {
              console.warn('Phantom connect() attempt 2 failed:', connectErr2);
              // Last resort: try to get publicKey directly
              if (solanaProvider.publicKey) {
                solAddress = solanaProvider.publicKey.toBase58();
              } else {
                // If Phantom is installed but not connected, show a helpful message
                setWalletError('Phantom Solana wallet detected. Please click "Connect" in Phantom to authorize this connection.');
                return;
              }
            }
          }
        }

        if (!solAddress) {
          setWalletError('Could not get Solana address from Phantom. Please ensure Phantom is unlocked and connected to Solana.');
          return;
        }
          setWalletAccount(solAddress);
        connectedWalletAddress = solAddress;
          
        // Try using Phantom's built-in token discovery method if available
        // This discovers all tokens in the wallet without needing the mint address
        if (typeof (solanaProvider as any).request === 'function') {
          try {
            const tokensResult = await (solanaProvider as any).request({
              method: 'solana_getTokenAccountsByOwner',
              params: [solAddress, { mint: BT_C_SOLANA_MINT }, { encoding: 'jsonParsed' }]
            });
            
            if (tokensResult?.result?.value?.length > 0) {
              for (const tokenAccount of tokensResult.result.value) {
                const parsed = tokenAccount.account.data.parsed?.info;
                if (parsed?.tokenAmount?.amount && parsed?.mint) {
                  const rawBalance = parseInt(parsed.tokenAmount.amount);
                  const decimals = parsed.tokenAmount.decimals || 9;
                  const balance = rawBalance / (10 ** decimals);
                  if (balance > 0) {
                    setBalances(prev => ({ ...prev, 'BT-c': balance }));
                    const existing = JSON.parse(localStorage.getItem('wallet_tokens') || '{}');
                    existing['BT-c'] = balance;
                    localStorage.setItem('wallet_tokens', JSON.stringify(existing));
                    console.log('Found BT-c via Phantom request:', balance);
                  }
                }
              }
            }
          } catch (phantomErr) {
            console.warn('Phantom getTokens request failed:', phantomErr);
          }
        }
        
        // 1. Direct RPC query specifically for BT-c mint (5ZpyyfccnWuLc99mtX7D2NXPsg5B6DcaLKiYRk1vskAQ)
        const rpcEndpoints = [
          'https://api.mainnet-beta.solana.com',
          'https://api.devnet.solana.com'
        ];
        const BT_C_MINT = "5ZpyyfccnWuLc99mtX7D2NXPsg5B6DcaLKiYRk1vskAQ";

        for (const rpcUrl of rpcEndpoints) {
          try {
            // Query specific mint 5ZpyyfccnWuLc99mtX7D2NXPsg5B6DcaLKiYRk1vskAQ
            const btcResp = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: 1,
                jsonrpc: '2.0',
                method: 'getTokenAccountsByOwner',
                params: [solAddress, { mint: BT_C_MINT }, { encoding: 'jsonParsed' }]
              })
            });

            if (btcResp.ok) {
              const btcData = await btcResp.json();
              if (btcData.result?.value?.length > 0) {
                for (const item of btcData.result.value) {
                  const info = item.account?.data?.parsed?.info;
                  if (info?.tokenAmount?.amount) {
                    const decimals = info.tokenAmount.decimals || 18;
                    const btcBalance = parseInt(info.tokenAmount.amount) / (10 ** decimals);
                    if (btcBalance > 0) {
                      setBalances(prev => ({ ...prev, 'BT-c': btcBalance }));
                      const existing = JSON.parse(localStorage.getItem('wallet_tokens') || '{}');
                      existing['BT-c'] = btcBalance;
                      localStorage.setItem('wallet_tokens', JSON.stringify(existing));

                      // Also sync into user platform_users balance
                      const userId = localStorage.getItem('token');
                      if (userId) {
                        const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
                        const uIdx = users.findIndex((u: any) => u.id === userId);
                        if (uIdx !== -1) {
                          if (!users[uIdx].balance) users[uIdx].balance = { USDT: 0, ETH: 0 };
                          users[uIdx].balance['BT-c'] = btcBalance;
                          localStorage.setItem('platform_users', JSON.stringify(users));
                          window.dispatchEvent(new Event('balanceUpdated'));
                        }
                      }
                    }
                  }
                }
              }
            }

            // Fetch SOL balance
            const solResp = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: 1,
                jsonrpc: '2.0',
                method: 'getBalance',
                params: [solAddress]
              })
            });
            
            if (solResp.ok) {
              const solData = await solResp.json();
              const lamports = typeof solData.result?.value === 'number' ? solData.result.value : (solData.result?.value?.amount ? parseInt(solData.result.value.amount) : 0);
              const solBalance = lamports / (10 ** 9);
              if (solBalance > 0) {
                setBalances(prev => ({ ...prev, 'SOL': solBalance }));
                const existing = JSON.parse(localStorage.getItem('wallet_tokens') || '{}');
                existing['SOL'] = solBalance;
                localStorage.setItem('wallet_tokens', JSON.stringify(existing));
              }
            }
            
            // Query all token accounts under Standard Token Program and Token-2022 Program
            const programs = [
              'TokenkegQfeZyiNwAJEbK8J7k9bD9W5fK9o6m9D2n7kQ', // SPL Token
              'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'  // Token 2022
            ];

            for (const programId of programs) {
              const tokenResp = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: 1,
                  jsonrpc: '2.0',
                  method: 'getTokenAccountsByOwner',
                  params: [solAddress, { programId }, { encoding: 'jsonParsed' }]
                })
              });
              
              if (tokenResp.ok) {
                const tokenData = await tokenResp.json();
                if (tokenData.result?.value?.length > 0) {
                  for (const ta of tokenData.result.value) {
                    const info = ta.account?.data?.parsed?.info;
                    const mint = info?.mint;
                    const amountRaw = info?.tokenAmount?.amount;
                    const decimals = info?.tokenAmount?.decimals || 9;
                    if (amountRaw && parseInt(amountRaw) > 0) {
                      const balance = parseInt(amountRaw) / (10 ** decimals);
                      const isBtcToken = mint === BT_C_MINT || mint === BT_C_SOLANA_MINT || info?.symbol === 'BT-c';
                      const symbol = isBtcToken ? 'BT-c' : (info?.symbol || (mint ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : 'TOKEN'));
                      
                      setBalances(prev => ({ ...prev, [symbol]: balance }));
                      const existing = JSON.parse(localStorage.getItem('wallet_tokens') || '{}');
                      existing[symbol] = balance;
                      localStorage.setItem('wallet_tokens', JSON.stringify(existing));

                      // Sync into platform_users
                      const userId = localStorage.getItem('token');
                      if (userId) {
                        const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
                        const uIdx = users.findIndex((u: any) => u.id === userId);
                        if (uIdx !== -1) {
                          if (!users[uIdx].balance) users[uIdx].balance = { USDT: 0, ETH: 0 };
                          users[uIdx].balance[symbol] = balance;
                          localStorage.setItem('platform_users', JSON.stringify(users));
                          window.dispatchEvent(new Event('balanceUpdated'));
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (tokenErr) {
            console.warn(`Failed to fetch tokens via ${rpcUrl}:`, tokenErr);
          }
        }
      } catch (solErr) {
        console.warn('Failed to connect to Phantom Solana:', solErr);
        setWalletError('Failed to connect to Phantom Solana. Please make sure Phantom is unlocked.');
      }
    }

    if (accountAddress && providerObj) {
      await fetchWalletTokenBalances(providerObj, accountAddress);
    }

    if (connectedWalletAddress) {
      grantBtCWelcomeBalance(connectedWalletAddress);
      const userId = localStorage.getItem('token');
      const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
      const connectedUser = users.find((user: any) => user.id === userId);
      if (connectedUser?.balance) {
        setBalances(current => ({ ...current, ...connectedUser.balance }));
      }
    }

    setWalletModalOpen(false);
  };

  const fetchWalletTokenBalances = async (provider: any, walletAddress: string) => {
    try {
      const ethersProvider = new ethers.BrowserProvider(provider);
      const tokenBalances: Record<string, number> = {};

      for (const [contractAddress, tokenInfo] of Object.entries(KNOWN_TOKENS)) {
        try {
          const contract = new ethers.Contract(contractAddress, ERC20_ABI, ethersProvider);
          const rawBalance = await contract.balanceOf(walletAddress);
          const decimals = await contract.decimals();
          const balance = Number(ethers.formatUnits(rawBalance, decimals));

          if (balance > 0) {
            tokenBalances[tokenInfo.symbol] = balance;
            if (!PRICE_MAP[tokenInfo.symbol]) {
              PRICE_MAP[tokenInfo.symbol] = tokenInfo.priceInUSDT;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch ${tokenInfo.symbol} balance:`, err);
        }
      }

      localStorage.setItem('wallet_tokens', JSON.stringify(tokenBalances));
      setBalances(prev => ({ ...prev, ...tokenBalances }));

      const currentAssets = [...dynamicAssets];
      const newAssets = Object.keys(tokenBalances).filter(t => !currentAssets.includes(t));
      if (newAssets.length > 0) {
        setDynamicAssets(prev => [...prev, ...newAssets]);
      }
    } catch (err) {
      console.error("Failed to fetch wallet token balances:", err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBalances();
      setAmount('');
      setStatus('');
      setSelectedBank('');
      setPayoutAccountNumber('');
      setKshFee(0);
      setKshNetReceive(0);
      setPendingKshPayment(null);
      setCopyTillError(false);

      const userId = localStorage.getItem('token');
      const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
      const user = users.find((entry: any) => entry.id === userId);
      const pendingSwap = user?.pendingKshSwaps?.find((swap: any) => swap.status === 'PENDING_VERIFICATION');
      setKshVerificationPending(pendingSwap || null);
    }
  }, [isOpen]);

  // Reload balances when wallet account changes (wallet connected/disconnected)
  useEffect(() => {
    if (walletAccount) {
      loadBalances();
    }
  }, [walletAccount]);

  useEffect(() => {
    const fetchPrice = async () => {
      if (fromAsset === toAsset) {
        setExchangeRate(1);
        return;
      }

      // Use a dedicated fixed rate for BT-c/KSH: 5,000 BT-c quotes 5,000,000 KSH.
      if (fromAsset === 'BT-c' && toAsset === 'KSH') {
        setExchangeRate(1000);
        return;
      }
      if (fromAsset === 'KSH' && toAsset === 'BT-c') {
        setExchangeRate(0.001);
        return;
      }

      const FALLBACK_PRICES: Record<string, number> = { ...PRICE_MAP };

      try {
        let fromPriceInUSDT = FALLBACK_PRICES[fromAsset] || 1;
        let toPriceInUSDT = FALLBACK_PRICES[toAsset] || 1;

        if (fromAsset !== 'USDT' && fromAsset !== 'BT-c' && fromAsset !== 'KSH') {
          try {
            const resFrom = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${fromAsset}USDT`);
            if (resFrom.ok) {
              const dataFrom = await resFrom.json();
              fromPriceInUSDT = parseFloat(dataFrom.price);
            }
          } catch (err) {
            console.warn(`Failed to fetch ${fromAsset} price, using fallback.`);
          }
        }

        if (toAsset !== 'USDT' && toAsset !== 'BT-c' && toAsset !== 'KSH') {
          try {
            const resTo = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${toAsset}USDT`);
            if (resTo.ok) {
              const dataTo = await resTo.json();
              toPriceInUSDT = parseFloat(dataTo.price);
            }
          } catch (err) {
            console.warn(`Failed to fetch ${toAsset} price, using fallback.`);
          }
        }

        setExchangeRate(fromPriceInUSDT / toPriceInUSDT);
      } catch (e) {
        console.error("Critical fetch error, using absolute fallbacks", e);
        const fromPrice = FALLBACK_PRICES[fromAsset] || 1;
        const toPrice = FALLBACK_PRICES[toAsset] || 1;
        setExchangeRate(fromPrice / toPrice);
      }
    };

    if (isOpen) {
      fetchPrice();
    }
  }, [fromAsset, toAsset, isOpen]);

  useEffect(() => {
    const amt = parseFloat(amount);
    if (!isNaN(amt) && exchangeRate) {
      const grossReceive = amt * exchangeRate;

      if (toAsset === 'KSH') {
        const feeAmount = Math.ceil(grossReceive * 0.10);
        setKshFee(feeAmount);
        setKshNetReceive(grossReceive);
        setEstimatedReceive(grossReceive.toFixed(6));
      } else if (fromAsset === 'BT-c') {
        const feeAmount = grossReceive * 0.10;
        const netReceive = grossReceive - feeAmount;
        setKshFee(feeAmount);
        setKshNetReceive(netReceive);
        setEstimatedReceive(netReceive.toFixed(6));
      } else {
        setKshFee(0);
        setKshNetReceive(0);
        setEstimatedReceive(grossReceive.toFixed(6));
      }
    } else {
      setEstimatedReceive('0.00');
      setKshFee(0);
      setKshNetReceive(0);
    }
  }, [amount, exchangeRate, toAsset, fromAsset]);

  const handleSwap = (e: React.FormEvent) => {
    e.preventDefault();
    let amt = parseFloat(amount);
    let recv = parseFloat(estimatedReceive);

    if (isNaN(amt) || amt <= 0 || isNaN(recv)) {
      setStatus('Invalid amount.');
      return;
    }

    if (fromAsset === 'BT-c' && amt < MIN_BT_C_SWAP) {
      setStatus(`BT-c swaps require a minimum of ${MIN_BT_C_SWAP.toLocaleString()} tokens.`);
      return;
    }

    const currentBalance = balances[fromAsset] || 0;
    if (amt > currentBalance) {
      setStatus(`Insufficient ${fromAsset} balance.`);
      return;
    }

    if (toAsset === 'KSH' && !selectedBank) {
      setStatus('Please select a bank for KSH conversion.');
      return;
    }

    if (toAsset === 'KSH' && !payoutAccountNumber.trim()) {
      setStatus('Please enter your bank account number for KSH conversion.');
      return;
    }

    if (toAsset === 'KSH') {
      const gross = amt * (exchangeRate || 0);
      const fee = Math.ceil(gross * 0.10);
      setPendingKshPayment({
        amount: amt,
        fromAsset,
        gross,
        fee,
        net: gross - fee,
        bank: selectedBank,
        accountNumber: payoutAccountNumber.trim()
      });
      setStatus('Swap pending M-Pesa fee payment to Till 3261839.');
      return;
    }

    setStatus('');

    setLoading(true);

    setTimeout(() => {
      const userId = localStorage.getItem('token');
      if (!userId) return;
      const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
      const userIndex = users.findIndex((u: any) => u.id === userId);

      if (userIndex !== -1) {
        const user = users[userIndex];
        if (!user.balance) user.balance = {};

        user.balance[fromAsset] = (user.balance[fromAsset] || 0) - amt;

        if (fromAsset === 'BT-c') {
          const grossReceive = amt * (exchangeRate || 0);
          const feeAmount = grossReceive * 0.10;
          const netReceive = grossReceive - feeAmount;

          if (!user.bt_cSwaps) user.bt_cSwaps = [];
          user.bt_cSwaps.push({
            id: Math.random().toString(36).substr(2, 9),
            fromAsset: fromAsset,
            toAsset: toAsset,
            amount: amt,
            grossReceive: grossReceive,
            fee: feeAmount,
            netReceive: netReceive,
            exchangeRate: exchangeRate,
            date: new Date().toISOString()
          });

          user.balance[toAsset] = (user.balance[toAsset] || 0) + netReceive;
          recv = netReceive;
        } else {
          user.balance[toAsset] = (user.balance[toAsset] || 0) + recv;
        }

        if (!user.tradeHistory) user.tradeHistory = [];
        user.tradeHistory.push({
          id: Math.random().toString(36).substr(2, 9),
          symbol: `${fromAsset}/${toAsset}`,
          side: 'SWAP',
          price: exchangeRate,
          amount: recv,
          total: amt,
          date: new Date().toISOString()
        });

        localStorage.setItem('platform_users', JSON.stringify(users));
        setBalances(user.balance);
        window.dispatchEvent(new Event('balanceUpdated'));

        if (fromAsset === 'BT-c') {
          setStatus(`Swap completed! 10% fee applied for BT-c conversion. You received ${recv.toFixed(6)} ${toAsset}.`);
        } else {
          setStatus('Swap completed successfully!');
        }
        setAmount('');
        setSelectedBank('');
        setPayoutAccountNumber('');
        setKshFee(0);
        setKshNetReceive(0);
        loadBalances();
      }
      setLoading(false);
    }, 1000);
  };

  const handleMaxAmount = () => {
    const maxBal = balances[fromAsset] || 0;
    if (maxBal > 0) {
      setAmount(maxBal.toFixed(6));
    }
  };

  const isKshSwap = toAsset === 'KSH';

  const assetOptions = () => dynamicAssets.map(a => (
    <option key={a} value={a}>{a}</option>
  ));

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white text-sm font-bold rounded-md transition-all shadow-[0_0_15px_-3px_rgba(99,102,241,0.5)] flex items-center gap-2"
      >
        <RefreshCcw size={16} /> SWAP
      </button>

      {mounted && isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-slate-900/70 border border-white/10 rounded-3xl w-[95vw] max-w-md shadow-2xl backdrop-blur-xl overflow-hidden animate-in zoom-in-95 duration-300 relative my-8">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-purple-500/10 pointer-events-none"></div>

            <div className="p-5 border-b border-white/5 flex justify-between items-center relative z-10">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                 <RefreshCcw size={20} className="text-indigo-400" /> Instant Swap
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-6 relative z-10">
              {!walletAccount ? (
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={() => setWalletModalOpen(true)}
                    className="w-full flex items-center justify-center gap-3 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-indigo-500/25"
                  >
                    <Wallet size={20} />
                    Connect Wallet
                  </button>
                  {walletError && (
                    <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg flex items-center gap-2">
                      <AlertCircle size={16} />
                      {walletError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-4 flex items-center justify-between p-3 bg-slate-800/50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-sm font-mono text-slate-300">
                      {walletAccount.slice(0, 6)}...{walletAccount.slice(-4)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (walletProvider && walletProvider.disconnect) {
                        try { await walletProvider.disconnect(); } catch {}
                      }
                      setWalletAccount(null);
                      setWalletProvider(null);
                      localStorage.removeItem('wallet_tokens');
                      setBalances({});
                      window.dispatchEvent(new Event('balanceUpdated'));
                    }}
                    className="text-xs text-slate-400 hover:text-slate-300"
                  >
                    Disconnect
                  </button>
                </div>
              )}

              <form onSubmit={handleSwap} className="space-y-6">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-medium text-slate-400">You Pay</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 bg-black/20 px-2 py-1 rounded-md">
                        Bal: <span className="text-white font-mono">{(balances[fromAsset] || 0).toLocaleString(undefined, {maximumFractionDigits: 6})}</span> {fromAsset}
                      </span>
                      {(balances[fromAsset] || 0) > 0 && (
                        <button
                          type="button"
                          onClick={handleMaxAmount}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-mono bg-indigo-500/20 px-2 py-1 rounded"
                        >
                          Max
                        </button>
                      )}
                    </div>
                  </div>
                  {(fromAsset === 'BT-c' || toAsset === 'BT-c') && (
                    <p className="mb-3 text-xs text-slate-400">
                      BT-c welcome credits are an in-app balance and are not held in your connected wallet.
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <input
                      type="number" min={fromAsset === 'BT-c' ? MIN_BT_C_SWAP : 0} step="any" placeholder={fromAsset === 'BT-c' ? 'Minimum 3,000' : '0.00'}
                      value={amount} onChange={e => setAmount(e.target.value)}
                      className="bg-transparent text-3xl font-mono text-white placeholder-slate-600 outline-none w-full flex-1"
                    />
                    <select
                      value={fromAsset} onChange={e => setFromAsset(e.target.value)}
                      className="bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white font-bold outline-none cursor-pointer hover:bg-slate-700 transition-colors"
                    >
                      {assetOptions()}
                    </select>
                  </div>

                </div>

                <div className="flex justify-center -my-6 relative z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setFromAsset(toAsset);
                      setToAsset(fromAsset);
                      setAmount('');
                    }}
                    className="p-3 bg-slate-800 border-4 border-slate-900 rounded-xl hover:bg-slate-700 text-indigo-400 transition-all hover:scale-110 shadow-lg shadow-black/20"
                  >
                    <ArrowDownUp size={20} />
                  </button>
                </div>

                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner mt-2">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-sm font-medium text-slate-400">You Receive</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 bg-black/20 px-2 py-1 rounded-md">
                        Bal: <span className="text-white font-mono">{(balances[toAsset] || 0).toLocaleString(undefined, {maximumFractionDigits: 6})}</span> {toAsset}
                      </span>
                      {(balances[toAsset] || 0) > 0 && (
                        <button
                          type="button"
                          onClick={handleMaxAmount}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-mono bg-indigo-500/20 px-2 py-1 rounded"
                        >
                          Max
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="text" readOnly
                      value={estimatedReceive}
                      className="bg-transparent text-3xl font-mono text-slate-300 outline-none w-full flex-1"
                    />
                    <select
                      value={toAsset} onChange={e => setToAsset(e.target.value)}
                      className="bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-2.5 text-white font-bold outline-none cursor-pointer hover:bg-slate-700 transition-colors"
                    >
                      {assetOptions()}
                    </select>
                  </div>

                </div>





                {status && (
                  <div className={`p-4 rounded-xl text-sm text-center font-medium shadow-inner ${
                    status.toLowerCase().includes('pending')
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : status.includes('success') || status.includes('completed') || status.includes('Processing')
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}>
                    {status}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !exchangeRate || (isKshSwap && (!selectedBank || !payoutAccountNumber.trim()))}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white rounded-2xl font-bold transition-all text-lg shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
                >
                  {loading ? 'Processing...' : exchangeRate ? 'Confirm Swap' : 'Pair Unavailable'}
                </button>
              </form>
            </div>
          </div>

          {kshVerificationPending && (
            <div className="fixed inset-0 bg-black/85 z-[100002] flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-slate-900 border border-amber-500/30 rounded-3xl max-w-sm w-full shadow-2xl p-7 text-center">
                <LoaderCircle size={44} className="mx-auto text-amber-400 animate-spin" />
                <h3 className="mt-5 text-xl font-bold text-white">Waiting for payment verification</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Your M-Pesa payment report for Till 3261839 has been submitted. This swap is pending review and no KSH has been credited yet.
                </p>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  The site cannot verify Till payments automatically. Keep your M-Pesa receipt for review.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setKshVerificationPending(null);
                    setIsOpen(false);
                  }}
                  className="mt-6 w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {pendingKshPayment && (
            <div className="fixed inset-0 bg-black/80 z-[100001] flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-slate-900 border border-orange-500/30 rounded-3xl max-w-sm w-full shadow-2xl relative overflow-hidden">
                <div className="p-5 border-b border-white/5">
                  <h3 className="text-xl font-bold text-white">M-Pesa payment required</h3>
                  <p className="mt-1 text-sm text-amber-300">Swap pending until you report the fee payment.</p>
                </div>
                <div className="p-5 space-y-4">
                  <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Pay 10% fee to Till</p>
                    <p className="text-3xl font-mono font-bold text-white mt-1">3261839</p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText('3261839');
                          setCopiedTill(true);
                          window.setTimeout(() => setCopiedTill(false), 2000);
                        } catch {
                          setCopyTillError(true);
                        }
                      }}
                      className="mt-2 inline-flex items-center gap-2 text-xs text-orange-300 hover:text-orange-200"
                    >
                      {copiedTill ? <Check size={14} /> : <Copy size={14} />}
                      {copiedTill ? 'Copied' : 'Copy Till number'}
                    </button>
                    {copyTillError && <p className="mt-1 text-xs text-amber-300">Couldn&apos;t copy; please enter the Till number manually.</p>}
                    <p className="mt-4 text-xs text-slate-400">Amount to pay</p>
                    <p className="text-2xl font-mono font-bold text-orange-300">{pendingKshPayment.fee.toLocaleString()} KSH</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-400">
                      <span>Swap proceeds</span>
                      <span className="font-mono text-white">{pendingKshPayment.gross.toLocaleString(undefined, { maximumFractionDigits: 2 })} KSH</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Fee (10%, rounded up to whole KSH)</span>
                      <span className="font-mono text-orange-300">{pendingKshPayment.fee.toLocaleString()} KSH</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>KSH payout to {pendingKshPayment.bank} account {pendingKshPayment.accountNumber}</span>
                      <span className="font-mono text-white">{pendingKshPayment.net.toLocaleString(undefined, { maximumFractionDigits: 2 })} KSH</span>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Pay using M-Pesa Buy Goods and Services, then report it below. The swap stays pending until payment is reviewed; the site cannot verify Till payments automatically.
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setPendingKshPayment(null);
                        setStatus('Swap canceled. No conversion was recorded.');
                      }}
                      className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        const userId = localStorage.getItem('token');
                        const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
                        const userIndex = users.findIndex((user: any) => user.id === userId);
                        if (userIndex === -1) {
                          setStatus('Sign in to submit this swap for verification.');
                          return;
                        }

                        const user = users[userIndex];
                        if (!user.balance) user.balance = {};
                        const currentBalance = Number(user.balance[pendingKshPayment.fromAsset] || 0);
                        if (pendingKshPayment.amount > currentBalance) {
                          setStatus(`Insufficient ${pendingKshPayment.fromAsset} balance to record this swap.`);
                          setPendingKshPayment(null);
                          return;
                        }

                        const balanceBefore = currentBalance;
                        const balanceAfter = currentBalance - pendingKshPayment.amount;
                        user.balance[pendingKshPayment.fromAsset] = balanceAfter;
                        const pendingSwap = {
                          id: `ksh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                          fromAsset: pendingKshPayment.fromAsset,
                          amount: pendingKshPayment.amount,
                          balanceBefore,
                          balanceAfter,
                          grossKSH: pendingKshPayment.gross,
                          feeKSH: pendingKshPayment.fee,
                          payoutKSH: pendingKshPayment.net,
                          payoutBank: pendingKshPayment.bank,
                          payoutAccountNumber: pendingKshPayment.accountNumber,
                          tillNumber: '3261839',
                          status: 'PENDING_VERIFICATION',
                          paymentReportedAt: new Date().toISOString()
                        };
                        user.pendingKshSwaps = [...(user.pendingKshSwaps || []), pendingSwap];
                        if (!user.tradeHistory) user.tradeHistory = [];
                        user.tradeHistory.push({
                          id: pendingSwap.id,
                          symbol: `${pendingKshPayment.fromAsset}/KSH`,
                          side: 'SWAP',
                          price: pendingKshPayment.gross / pendingKshPayment.amount,
                          amount: pendingKshPayment.net,
                          total: pendingKshPayment.amount,
                          status: 'PENDING_VERIFICATION',
                          balanceBefore,
                          balanceAfter,
                          date: pendingSwap.paymentReportedAt
                        });
                        users[userIndex] = user;
                        localStorage.setItem('platform_users', JSON.stringify(users));
                        setBalances(user.balance);
                        window.dispatchEvent(new Event('balanceUpdated'));
                        setPendingKshPayment(null);
                        setKshVerificationPending(pendingSwap);
                        setStatus('M-Pesa payment reported. Waiting for verification.');
                      }}
                      className="py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold disabled:opacity-50"
                    >
                      {loading ? 'Processing...' : "I've paid"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {walletModalOpen && (
            <div className="fixed inset-0 bg-black/70 z-[100000] flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-sm w-full shadow-2xl relative">
                <div className="p-5 border-b border-white/5 flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Wallet size={20} className="text-indigo-400" /> Connect Wallet
                  </h3>
                  <button
                    onClick={() => { setWalletModalOpen(false); setWalletError(null); }}
                    className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="p-4 space-y-2">
                  {WALLETS.map(wallet => {
                    const detected = wallet.getProvider();
                    const solanaDetected = wallet.getSolanaProvider?.();
                    const isDetected = detected || solanaDetected;
                    return (
                      <button
                        key={wallet.id}
                        type="button"
                        onClick={() => connectWallet(wallet)}
                        className="w-full flex items-center gap-3 py-3 px-4 rounded-xl font-bold text-lg transition-all bg-slate-800 hover:bg-slate-700 text-white border border-indigo-500/30"
                      >
                        <span className="text-2xl">{wallet.icon}</span>
                        <span className="flex-1 text-left">{wallet.name}</span>
                        <span className={`text-xs ${isDetected ? 'text-green-400' : 'text-slate-400'}`}>
                          {isDetected ? 'Detected' : /iPhone|iPad|iPod|Android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ? 'Open app' : 'Not detected'}
                        </span>
                      </button>
                    );
                  })}
                  {walletError && (
                    <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg flex items-center gap-2">
                      <AlertCircle size={16} />
                      {walletError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
