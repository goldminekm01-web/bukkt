"use client";

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { X, Copy, Check, ArrowDownToLine } from 'lucide-react';
import QRCode from 'react-qr-code';
import { createPortal } from 'react-dom';

export default function DepositModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [depositAddress, setDepositAddress] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      let address = localStorage.getItem('deposit_address');
      if (!address) {
        // Generate a deterministic or random unique address for this user
        const randomWallet = ethers.Wallet.createRandom();
        address = randomWallet.address;
        localStorage.setItem('deposit_address', address);
      }
      setDepositAddress(address);
    }
  }, [isOpen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#151920] border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative">
            <div className="flex justify-between items-center p-4 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ArrowDownToLine size={20} className="text-[#10b981]" />
                Fund Your Account
              </h2>
              <button 
                onClick={onClose}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col items-center">
              <p className="text-slate-400 text-sm text-center mb-6">
                Send ETH or USDT (ERC20) to this unique address. Funds will be credited to your Bukkt balance automatically after 1 network confirmation.
              </p>

              <div className="bg-white p-3 rounded-xl mb-6 shadow-sm">
                {depositAddress ? (
                  <QRCode 
                    value={depositAddress} 
                    size={180}
                    level="H"
                  />
                ) : (
                  <div className="w-[180px] h-[180px] bg-slate-200 animate-pulse rounded-lg flex items-center justify-center">
                    <span className="text-slate-400 text-sm">Generating...</span>
                  </div>
                )}
              </div>

              <div className="w-full space-y-2">
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Your Deposit Address (ERC20)</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#0b0e11] border border-slate-800 rounded-lg px-4 py-3 font-mono text-sm text-slate-200 truncate">
                    {depositAddress || 'Generating...'}
                  </div>
                  <button 
                    onClick={handleCopy}
                    className="bg-[#1a1f2b] hover:bg-[#252b3b] border border-slate-700 p-3 rounded-lg text-slate-300 transition-colors flex items-center justify-center min-w-[48px]"
                  >
                    {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                  </button>
                </div>
              </div>

              <div className="w-full mt-6 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <h4 className="text-orange-400 font-semibold text-sm mb-1 flex items-center gap-2">
                  <span className="text-lg">⚠️</span> Important
                </h4>
                <ul className="text-slate-400 text-xs space-y-1 list-disc list-inside">
                  <li>Send only Ethereum network assets (ERC20)</li>
                  <li>Minimum deposit: 0.01 ETH or 10 USDT</li>
                  <li>Other networks (e.g. BSC, Polygon) will result in permanent loss</li>
                </ul>
              </div>
            </div>
          </div>
        </div>,
        document.body
  );
}
