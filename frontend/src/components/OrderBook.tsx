"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

// Color helpers
const GREEN = "text-green-500";
const RED = "text-red-500";
const DEPTH_BAR_BG = "bg-slate-800";
const DEPTH_BAR_GREEN = "bg-green-500/10";
const DEPTH_BAR_RED = "bg-red-500/10";

interface OrderLevel {
  price: string;
  size: string;
  total: number;
}

export default function OrderBook({ symbol }: { symbol: string }) {
  const [bids, setBids] = useState<OrderLevel[]>([]);
  const [asks, setAsks] = useState<OrderLevel[]>([]);
  const [priceChange, setPriceChange] = useState<{
    price: string;
    percent: string;
    direction: "up" | "down";
  }>({ price: "0", percent: "0", direction: "up" });

  const [maxDepthBid, setMaxDepthBid] = useState(1);
  const [maxDepthAsk, setMaxDepthAsk] = useState(1);

  const fetchOrderBook = async (sym: string) => {
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/depth?symbol=${sym.replace("/", "")}&limit=20`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Process bids (highest first, so reverse)
      const bidLevels: OrderLevel[] = (data.bids as [string, string][])
        .slice(0, 10)
        .map(([price, size]) => ({
          price,
          size,
          total: parseFloat(price) * parseFloat(size),
        }))
        .sort((a: OrderLevel, b: OrderLevel) => parseFloat(b.price) - parseFloat(a.price));

      // Process asks (lowest first)
      const askLevels: OrderLevel[] = (data.asks as [string, string][])
        .slice(0, 10)
        .map(([price, size]) => ({
          price,
          size,
          total: parseFloat(price) * parseFloat(size),
        }))
        .sort((a: OrderLevel, b: OrderLevel) => parseFloat(a.price) - parseFloat(b.price));

      setBids(bidLevels);
      setAsks(askLevels);

      const maxBid = Math.max(...bidLevels.map((l) => l.total), 1);
      const maxAsk = Math.max(...askLevels.map((l) => l.total), 1);
      setMaxDepthBid(maxBid);
      setMaxDepthAsk(maxAsk);

      // Fetch 24h ticker for price change
      const tickerRes = await fetch(
        `https://api.binance.com/api/v3/prevDay?symbol=${sym.replace("/", "")}`
      );
      if (tickerRes.ok) {
        const ticker = await tickerRes.json();
        const changePercent = ((parseFloat(ticker.lastPrice) - parseFloat(ticker.openPrice)) / parseFloat(ticker.openPrice)) * 100;
        setPriceChange({
          price: ticker.lastPrice,
          percent: changePercent.toFixed(2),
          direction: changePercent >= 0 ? "up" : "down",
        });
      }
    } catch (err) {
      console.error("Failed to fetch order book:", err);

      // Generate simulated order book for fallback
      const centerPrice = 3000 + Math.random() * 100;
      const bidLevels: OrderLevel[] = [];
      const askLevels: OrderLevel[] = [];

      for (let i = 0; i < 10; i++) {
        const bidPrice = centerPrice - i * (1 + Math.random());
        const askPrice = centerPrice + i * (1 + Math.random());
        const bidSize = (Math.random() * 5 + 0.5).toFixed(2);
        const askSize = (Math.random() * 5 + 0.5).toFixed(2);

        bidLevels.push({
          price: bidPrice.toFixed(2),
          size: bidSize,
          total: parseFloat(bidPrice.toFixed(2)) * parseFloat(bidSize),
        });
        askLevels.push({
          price: askPrice.toFixed(2),
          size: askSize,
          total: parseFloat(askPrice.toFixed(2)) * parseFloat(askSize),
        });
      }

      setBids(bidLevels);
      setAsks(askLevels);
      setMaxDepthBid(Math.max(...bidLevels.map((l) => l.total)));
      setMaxDepthAsk(Math.max(...askLevels.map((l) => l.total)));
      setPriceChange({
        price: centerPrice.toFixed(2),
        percent: "1.24",
        direction: "up",
      });
    }
  };

  // Subscribe to symbol changes
  useEffect(() => {
    const binanceSymbol = symbol.replace("/", "");
    fetchOrderBook(symbol);

    const interval = setInterval(() => {
      fetchOrderBook(symbol);
    }, 5000);

    return () => clearInterval(interval);
  }, [symbol]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with price */}
      <div className="p-2 border-b border-slate-800 flex justify-between items-center">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Order Book
        </h3>
        <div
          className={`flex items-center gap-1.5 text-xs font-mono ${
            priceChange.direction === "up" ? GREEN : RED
          }`}
        >
          {priceChange.direction === "up" ? (
            <TrendingUp size={14} />
          ) : (
            <TrendingDown size={14} />
          )}
          <span>{priceChange.percent}%</span>
        </div>
      </div>

      {/* Price display */}
      <div className="px-3 py-2 text-center border-b border-slate-800">
        <div className="text-xl font-bold font-mono text-slate-200">
          ${priceChange.price}
        </div>
        <div
          className={`text-xs font-mono ${
            priceChange.direction === "up" ? GREEN : RED
          }`}
        >
          {priceChange.percent}%
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 gap-1 px-3 py-2 text-xs text-slate-500 uppercase font-sans">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (red, lowest ask at bottom of section) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-px">
          {asks.map((level, idx) => {
            const pct = (level.total / maxDepthAsk) * 100;
            return (
              <div
                key={`ask-${idx}`}
                className="grid grid-cols-3 gap-1 items-center px-3 py-1 text-xs relative group cursor-pointer hover:bg-slate-800/50 transition-colors"
              >
                <div
                  className={`absolute inset-y-0 left-0 ${DEPTH_BAR_RED} rounded-r`}
                  style={{ width: `${pct}%` }}
                ></div>
                <span className={`relative ${RED} font-mono z-10`}>
                  {level.price}
                </span>
                <span className="relative text-right text-slate-400 font-mono z-10">
                  {level.size}
                </span>
                <span className="relative text-right text-slate-500 font-mono z-10">
                  {level.total.toFixed(4)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spread indicator */}
      {bids.length > 0 && asks.length > 0 && (
        <div className="px-3 py-1 text-center border-t border-slate-800 border-b border-slate-800">
          <span className="text-xs text-slate-500">
            Spread: {(parseFloat(asks[0].price) - parseFloat(bids[0].price)).toFixed(2)}
          </span>
        </div>
      )}

      {/* Bids (green, highest bid at top) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-px">
          {bids.map((level, idx) => {
            const pct = (level.total / maxDepthBid) * 100;
            return (
              <div
                key={`bid-${idx}`}
                className="grid grid-cols-3 gap-1 items-center px-3 py-1 text-xs relative group cursor-pointer hover:bg-slate-800/50 transition-colors"
              >
                <div
                  className={`absolute inset-y-0 left-0 ${DEPTH_BAR_GREEN} rounded-r`}
                  style={{ width: `${pct}%` }}
                ></div>
                <span className={`relative ${GREEN} font-mono z-10`}>
                  {level.price}
                </span>
                <span className="relative text-right text-slate-400 font-mono z-10">
                  {level.size}
                </span>
                <span className="relative text-right text-slate-500 font-mono z-10">
                  {level.total.toFixed(4)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer stats */}
      <div className="p-2 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
        <span>{bids.length} bids</span>
        <span>{asks.length} asks</span>
      </div>
    </div>
  );
}
