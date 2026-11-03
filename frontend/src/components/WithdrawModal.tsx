"use client";

import { useState, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import { createPortal } from 'react-dom';

const SUPPORTED_ASSETS = ['USDT', 'BTC', 'ETH', 'SOL', 'BNB'];

export default function WithdrawModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [withdrawCoin, setWithdrawCoin] = useState('USDT');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawStatus, setWithdrawStatus] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const loadUserData = () => {
        const userId = localStorage.getItem('token');
        if (!userId) return;
        
        const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
        const user = users.find((u: any) => u.id === userId);
        
        if (user) {
          if (user.balance) {
            setBalances(user.balance);
            // Default to the first asset they actually have balance for, if any
            const availableCoins = Object.entries(user.balance).filter(([_, amt]) => (amt as number) > 0);
            if (availableCoins.length > 0 && !availableCoins.find(c => c[0] === withdrawCoin)) {
              setWithdrawCoin(availableCoins[0][0]);
            }
          }
        }
      };
      
      loadUserData();
      
      const handleBalanceUpdate = () => {
        loadUserData();
      };
      
      window.addEventListener('balanceUpdated', handleBalanceUpdate);
      return () => window.removeEventListener('balanceUpdated', handleBalanceUpdate);
    }
  }, [isOpen, withdrawCoin]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawStatus('');
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawStatus('Invalid amount.');
      return;
    }
    if (withdrawAddress.length < 26) {
      setWithdrawStatus('Invalid withdrawal address.');
      return;
    }

    const userId = localStorage.getItem('token');
    if (!userId) return;
    
    const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
    const userIndex = users.findIndex((u: any) => u.id === userId);
    
    if (userIndex !== -1) {
      const user = users[userIndex];
      const currentBalance = user.balance[withdrawCoin] || 0;
      
      if (amount > currentBalance) {
        setWithdrawStatus(`Insufficient ${withdrawCoin} balance.`);
        return;
      }
      
      // Deduct balance
      user.balance[withdrawCoin] -= amount;
      localStorage.setItem('platform_users', JSON.stringify(users));
      setBalances(user.balance);
      
      // Save withdrawal request to Firebase for the admin
      try {
        const { db } = await import('@/lib/firebase');
        const { collection, addDoc } = await import('firebase/firestore');
        
        await addDoc(collection(db, 'withdrawals'), {
          userId: user.id || 'Unknown',
          email: user.email || 'Unknown',
          coin: withdrawCoin || 'USDT',
          amount: amount || 0,
          address: withdrawAddress || 'Unknown',
          status: 'Pending',
          date: new Date().toISOString()
        });
      } catch (err) {
        console.error("Failed to sync withdrawal to Firebase", err);
      }

      // Legacy fallback for admin on the same device
      const existingWithdrawals = JSON.parse(localStorage.getItem('admin_withdrawals') || '[]');
      existingWithdrawals.push({
        id: Math.random().toString(36).substr(2, 9),
        userId: user.id || 'Unknown',
        email: user.email || 'Unknown',
        coin: withdrawCoin || 'USDT',
        amount: amount || 0,
        address: withdrawAddress || 'Unknown',
        status: 'Pending',
        date: new Date().toISOString()
      });
      localStorage.setItem('admin_withdrawals', JSON.stringify(existingWithdrawals));

      window.dispatchEvent(new Event('balanceUpdated'));
      
      setWithdrawStatus('Withdrawal initiated successfully! Awaiting network confirmation.');
      setTimeout(() => {
        onClose();
        setWithdrawAmount('');
        setWithdrawAddress('');
        setWithdrawStatus('');
      }, 3000);
    }
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Send size={18} className="text-indigo-400" /> Withdraw Crypto
          </h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          <form onSubmit={handleWithdraw} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Asset to Withdraw</label>
              <select 
                value={withdrawCoin} 
                onChange={e => setWithdrawCoin(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              >
                {SUPPORTED_ASSETS.map((coin) => (
                  <option key={coin} value={coin}>{coin}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Available: <span className="font-mono text-slate-300">{(balances[withdrawCoin] || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</span> {withdrawCoin}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Destination Address</label>
              <input 
                type="text" 
                required
                placeholder="0x..."
                value={withdrawAddress}
                onChange={e => setWithdrawAddress(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Amount</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  required
                  placeholder="0.00"
                  value={withdrawAmount}
                  onChange={e => setWithdrawAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none pr-16"
                />
                <button 
                  type="button"
                  onClick={() => setWithdrawAmount((balances[withdrawCoin] || 0).toString())}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded"
                >
                  MAX
                </button>
              </div>
            </div>

            {withdrawStatus && (
              <div className={`p-3 rounded-lg text-sm ${withdrawStatus.includes('successfully') ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {withdrawStatus}
              </div>
            )}

            <button 
              type="submit"
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20 transition-all mt-2 flex justify-center items-center gap-2"
            >
              <Send size={18} /> Confirm Withdrawal
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
