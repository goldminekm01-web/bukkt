"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface OrderEntryProps {
  symbol: string;
}

type TabType = "limit" | "market";
type SideType = "buy" | "sell";

interface OpenOrder {
  id: string;
  timestamp: number;
  pair: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  amount: number;
  filled: number;
  status: "open" | "partially_filled" | "filled" | "cancelled";
}

interface TradeRecord {
  timestamp: number;
  pair: string;
  side: "buy" | "sell";
  type: string;
  price: number;
  amount: number;
  fee: number;
  total: number;
}

export default function OrderEntry({ symbol }: OrderEntryProps) {
  const [activeTab, setActiveTab] = useState<TabType>("limit");
  const [side, setSide] = useState<SideType>("buy");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");

  const baseAsset = symbol.split("/")[0];
  const quoteAsset = symbol.split("/")[1] || "USDT";

  const [marketPrice, setMarketPrice] = useState<string | null>(null);
  const [priceChangePercent, setPriceChangePercent] = useState<string>("0");
  const [priceDirection, setPriceDirection] = useState<"up" | "down">("up");

  const [usdtBalance, setUsdtBalance] = useState(0);
  const [baseBalance, setBaseBalance] = useState(0);

  const fetchMarketPrice = async () => {
    try {
      const binanceSymbol = symbol.replace("/", "");
      const res = await fetch(
        `https://api.binance.com/api/v3/prevDay?symbol=${binanceSymbol}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMarketPrice(parseFloat(data.lastPrice).toFixed(2));
      const change = ((parseFloat(data.lastPrice) - parseFloat(data.openPrice)) / parseFloat(data.openPrice)) * 100;
      setPriceChangePercent(change.toFixed(2));
      setPriceDirection(change >= 0 ? "up" : "down");
    } catch (err) {
      console.error("Failed to fetch price:", err);
      setMarketPrice("3000.24");
      setPriceChangePercent("1.24");
      setPriceDirection("up");
    }
  };

  // Load balances from Firestore first (shared source of truth — admin adjustments write here)
  const loadBalances = async () => {
    const userId = localStorage.getItem("token");
    if (!userId) return;

    try {
      const { db } = await import("@/lib/firebase");
      const { doc, getDoc } = await import("firebase/firestore");
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData && userData.balance) {
          setUsdtBalance(userData.balance.USDT || 0);
          setBaseBalance(userData.balance[baseAsset] || 0);
          // Hydrate localStorage for other components
          const users = JSON.parse(localStorage.getItem("platform_users") || "[]");
          const idx = users.findIndex((u: any) => u.id === userId);
          if (idx !== -1) {
            users[idx].balance = userData.balance;
            localStorage.setItem("platform_users", JSON.stringify(users));
          }
          return;
        }
      }
    } catch (err) {
      console.warn("Firestore balance read notice:", err);
    }

    // Fallback: localStorage
    const users = JSON.parse(localStorage.getItem("platform_users") || "[]");
    const user = users.find((u: any) => u.id === userId);
    if (user && user.balance) {
      setUsdtBalance(user.balance.USDT || 0);
      setBaseBalance(user.balance[baseAsset] || 0);
    }
  };

  // Persist updated balance to Firestore and localStorage
  const saveBalances = async (newBalance: Record<string, number>) => {
    const userId = localStorage.getItem("token");
    if (!userId) return;

    try {
      const { db } = await import("@/lib/firebase");
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", userId), { balance: newBalance });
    } catch (err) {
      console.error("Firestore balance write error:", err);
    }

    const users = JSON.parse(localStorage.getItem("platform_users") || "[]");
    const idx = users.findIndex((u: any) => u.id === userId);
    if (idx !== -1) {
      users[idx].balance = newBalance;
      localStorage.setItem("platform_users", JSON.stringify(users));
    }
    window.dispatchEvent(new Event("balanceUpdated"));
  };

  const appendTradeHistory = (trade: TradeRecord) => {
    const history = JSON.parse(localStorage.getItem("trade_history") || "[]");
    history.push(trade);
    localStorage.setItem("trade_history", JSON.stringify(history));
    window.dispatchEvent(new Event("balanceUpdated"));
  };

  const appendOpenOrder = (order: OpenOrder) => {
    const orders = JSON.parse(localStorage.getItem("open_orders") || "[]");
    orders.push(order);
    localStorage.setItem("open_orders", JSON.stringify(orders));
    window.dispatchEvent(new Event("ordersUpdated"));
  };

  const removeOpenOrder = (orderId: string) => {
    const orders = JSON.parse(localStorage.getItem("open_orders") || "[]");
    const filtered = orders.filter((o: OpenOrder) => o.id !== orderId);
    localStorage.setItem("open_orders", JSON.stringify(filtered));
    window.dispatchEvent(new Event("ordersUpdated"));
  };

  const totalCost = (parseFloat(price) * parseFloat(amount) || 0);
  const fee = totalCost * 0.001;
  const totalWithFee = totalCost + fee;

  const resetForm = () => {
    setPrice("");
    setAmount("");
  };

  const handlePlaceOrder = async () => {
    if (!amount) return;
    const parsedAmount = parseFloat(amount);
    const parsedPrice = activeTab === "limit" ? parseFloat(price) : parseFloat(marketPrice || "0");

    if (parsedAmount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    if (activeTab === "limit" && (!price || parsedPrice <= 0)) {
      alert("Please enter a valid price");
      return;
    }

    const userId = localStorage.getItem("token");
    if (!userId) return;

    const users = JSON.parse(localStorage.getItem("platform_users") || "[]");
    const userIndex = users.findIndex((u: any) => u.id === userId);
    if (userIndex === -1) return;

    const user = users[userIndex];
    const balance = { ...(user.balance || {}) };

    if (side === "buy") {
      const requiredUSDT = parsedPrice * parsedAmount * 1.001; // Include fee buffer
      if ((balance.USDT || 0) < requiredUSDT) {
        alert(`Insufficient USDT balance. Required: ${requiredUSDT.toFixed(2)} USDT, Available: ${(balance.USDT || 0).toFixed(2)} USDT`);
        return;
      }

      if (activeTab === "market") {
        // Execute immediately at market price
        balance.USDT = (balance.USDT || 0) - requiredUSDT;
        balance[baseAsset] = (balance[baseAsset] || 0) + parsedAmount;
        await saveBalances(balance);
        const trade: TradeRecord = {
          timestamp: Date.now(),
          pair: symbol,
          side: "buy",
          type: "market",
          price: parsedPrice,
          amount: parsedAmount,
          fee: parsedPrice * parsedAmount * 0.001,
          total: parsedPrice * parsedAmount + parsedPrice * parsedAmount * 0.001,
        };
        appendTradeHistory(trade);
        alert(`Bought ${parsedAmount.toFixed(6)} ${baseAsset} at $${parsedPrice.toFixed(2)}`);
      } else {
        // Hold funds for limit order
        balance.USDT = (balance.USDT || 0) - requiredUSDT;
        await saveBalances(balance);
        placeLimitOrder(parsedPrice, parsedAmount, balance, userIndex, users);
      }
    } else {
      // Sell
      if ((balance[baseAsset] || 0) < parsedAmount) {
        alert(`Insufficient ${baseAsset} balance. Required: ${parsedAmount.toFixed(6)}, Available: ${(balance[baseAsset] || 0).toFixed(6)}`);
        return;
      }

      if (activeTab === "market") {
        const proceeds = parsedPrice * parsedAmount * 0.999;
        balance[baseAsset] = (balance[baseAsset] || 0) - parsedAmount;
        balance.USDT = (balance.USDT || 0) + proceeds;
        await saveBalances(balance);
        const trade: TradeRecord = {
          timestamp: Date.now(),
          pair: symbol,
          side: "sell",
          type: "market",
          price: parsedPrice,
          amount: parsedAmount,
          fee: parsedPrice * parsedAmount * 0.001,
          total: parsedPrice * parsedAmount - parsedPrice * parsedAmount * 0.001,
        };
        appendTradeHistory(trade);
        alert(`Sold ${parsedAmount.toFixed(6)} ${baseAsset} at $${parsedPrice.toFixed(2)}`);
      } else {
        // Hold base asset for limit order
        balance[baseAsset] = (balance[baseAsset] || 0) - parsedAmount;
        await saveBalances(balance);
        placeLimitOrder(parsedPrice, parsedAmount, balance, userIndex, users);
      }
    }

    resetForm();
  };

  const placeLimitOrder = (
    orderPrice: number,
    orderAmount: number,
    balance: Record<string, number>,
    userIndex: number,
    users: any[]
  ) => {
    const orderId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    const newOrder: OpenOrder = {
      id: orderId,
      timestamp: Date.now(),
      pair: symbol,
      side,
      type: "limit",
      price: orderPrice,
      amount: orderAmount,
      filled: 0,
      status: "open",
    };

    const existingOrders: OpenOrder[] = JSON.parse(localStorage.getItem("open_orders") || "[]");
    existingOrders.push(newOrder);
    localStorage.setItem("open_orders", JSON.stringify(existingOrders));

    users[userIndex].balance = balance;
    localStorage.setItem("platform_users", JSON.stringify(users));
    window.dispatchEvent(new Event("ordersUpdated"));
    window.dispatchEvent(new Event("balanceUpdated"));

    alert(`${side === "buy" ? "Buy" : "Sell"} limit order placed! Order ID: ${orderId.slice(0, 8)}`);
  };

  // Auto-execute limit orders when market price reaches the limit price
  useEffect(() => {
    if (!marketPrice) return;

    const userId = localStorage.getItem("token");
    if (!userId) return;

    const users = JSON.parse(localStorage.getItem("platform_users") || "[]");
    const userIndex = users.findIndex((u: any) => u.id === userId);
    if (userIndex === -1) return;

    const user = users[userIndex];
    const orders = JSON.parse(localStorage.getItem("open_orders") || "[]");
    const currentPrice = parseFloat(marketPrice);
    let changed = false;

    const updatedOrders = orders.filter((order: OpenOrder) => {
      if (order.pair !== symbol || order.status !== "open") return true;

      let shouldExecute = false;
      if (order.side === "buy" && currentPrice <= order.price) {
        shouldExecute = true;
      }
      if (order.side === "sell" && currentPrice >= order.price) {
        shouldExecute = true;
      }

      if (shouldExecute) {
        changed = true;
        const balance = { ...(user.balance || {}) };
        const execPrice = order.price;
        const execAmount = order.amount;
        const fee = execPrice * execAmount * 0.001;

        if (order.side === "buy") {
          balance.USDT = (balance.USDT || 0) - (execPrice * execAmount + fee);
          balance[baseAsset] = (balance[baseAsset] || 0) + execAmount;
        } else {
          balance[baseAsset] = (balance[baseAsset] || 0) - execAmount;
          balance.USDT = (balance.USDT || 0) + (execPrice * execAmount - fee);
        }

        user.balance = balance;
        changed = true;

        const trade: TradeRecord = {
          timestamp: Date.now(),
          pair: symbol,
          side: order.side,
          type: "limit",
          price: execPrice,
          amount: execAmount,
          fee,
          total: order.side === "buy"
            ? execPrice * execAmount + fee
            : execPrice * execAmount - fee,
        };
        appendTradeHistory(trade);
        alert(`Limit order executed! ${order.side === "buy" ? "Bought" : "Sold"} ${execAmount.toFixed(6)} ${baseAsset} at $${execPrice.toFixed(2)}`);
      }

      return !shouldExecute;
    });

    if (changed) {
      localStorage.setItem("platform_users", JSON.stringify(users));
      localStorage.setItem("open_orders", JSON.stringify(updatedOrders));
      saveBalances(user.balance);
      window.dispatchEvent(new Event("ordersUpdated"));
    }
  }, [marketPrice, symbol, baseAsset]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-slate-800">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Order Entry
        </h3>
      </div>

      {/* Side Selector (Buy/Sell) */}
      <div className="flex mx-3 mt-2 mb-1 bg-slate-900 rounded-md p-1">
        <button
          onClick={() => setSide("buy")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-sm font-semibold transition-all ${
            side === "buy"
              ? "bg-green-600/20 text-green-400 border border-green-600/30"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <TrendingUp size={14} />
          Buy {baseAsset}
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-sm font-semibold transition-all ${
            side === "sell"
              ? "bg-red-600/20 text-red-400 border border-red-600/30"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <TrendingDown size={14} />
          Sell {baseAsset}
        </button>
      </div>

      {/* Order Type Tabs */}
      <div className="flex mx-3 mb-3 bg-slate-900 rounded-md p-1">
        <button
          onClick={() => setActiveTab("limit")}
          className={`flex-1 text-center py-1.5 rounded text-sm font-semibold transition-all ${
            activeTab === "limit"
              ? "bg-slate-700/50 text-slate-200"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Limit
        </button>
        <button
          onClick={() => setActiveTab("market")}
          className={`flex-1 text-center py-1.5 rounded text-sm font-semibold transition-all ${
            activeTab === "market"
              ? "bg-slate-700/50 text-slate-200"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Market
        </button>
      </div>

      {/* Price Display */}
      {marketPrice && (
        <div className="mx-3 mb-3 text-center">
          <div className="text-lg font-bold font-mono text-slate-200">
            ${marketPrice}
          </div>
          <div className={`flex items-center justify-center gap-1 text-xs ${
            priceDirection === "up" ? "text-green-500" : "text-red-500"
          }`}>
            {priceDirection === "up" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            <span>{priceChangePercent}%</span>
          </div>
        </div>
      )}

      {/* Price Input (Limit only) */}
      {activeTab === "limit" && (
        <div className="px-3 mb-2">
          <label className="text-xs text-slate-500 mb-1 flex justify-between">
            <span>Price ({quoteAsset})</span>
            {marketPrice && (
              <button
                onClick={() => setPrice(marketPrice)}
                className="text-xs text-slate-400 hover:text-slate-200 font-mono"
              >
                Mark: {marketPrice}
              </button>
            )}
          </label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500/50 placeholder-slate-600 transition-colors"
          />
        </div>
      )}

      {/* Amount Input */}
      <div className="px-3 mb-3">
        <label className="text-xs text-slate-500 mb-1 flex justify-between">
          <span>Amount ({baseAsset})</span>
          <span className="font-mono text-slate-400">
            {baseAsset} Balance: {baseBalance.toFixed(6)}
          </span>
        </label>
        <input
          type="number"
          step="0.001"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500/50 placeholder-slate-600 transition-colors"
        />
      </div>

      {/* Cost/Proceeds Summary */}
      {activeTab === "limit" && price && amount && (
        <div className="px-3 mb-3 text-xs">
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500">Cost:</span>
            <span className="font-mono text-slate-400">${totalCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-slate-500">Fee (0.1%):</span>
            <span className="font-mono text-slate-400">${fee.toFixed(4)}</span>
          </div>
          <div className="flex justify-between py-0.5 font-semibold border-t border-slate-800 mt-1 pt-1">
            <span className="text-slate-400">Total:</span>
            <span className="font-mono text-slate-200">${totalWithFee.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Available Balance for Market Sell */}
      {activeTab === "market" && side === "sell" && (
        <div className="px-3 mb-3 flex gap-2">
          <button
            onClick={() => setAmount(baseBalance.toFixed(6))}
            className="text-xs text-slate-400 hover:text-slate-200 font-mono bg-slate-900 px-2 py-1 rounded"
          >
            Max
          </button>
        </div>
      )}

      {/* USDT Balance for Market Buy */}
      {activeTab === "market" && side === "buy" && (
        <div className="px-3 mb-3 flex gap-2 items-center">
          <span className="text-xs text-slate-500">Available USDT:</span>
          <span className="text-xs font-mono text-slate-400">{usdtBalance.toFixed(2)}</span>
        </div>
      )}

      {/* Place Order Button */}
      <div className="px-3 mb-3">
        <button
          onClick={handlePlaceOrder}
          disabled={!amount || (activeTab === "limit" && !price)}
          className={`w-full py-2.5 rounded-md text-sm font-bold flex items-center justify-center transition-all ${
            side === "buy"
              ? "bg-green-600 hover:bg-green-500 text-white disabled:bg-green-900/30 disabled:text-slate-500"
              : "bg-red-600 hover:bg-red-500 text-white disabled:bg-red-900/30 disabled:text-slate-500"
          }`}
        >
          {side === "buy" ? "BUY " : "SELL "} {baseAsset}
        </button>
      </div>

      {/* Market Order Warning */}
      {activeTab === "market" && (
        <div className="px-3 mb-2 text-xs text-slate-500 text-center italic">
          Market orders execute at current market prices immediately.
        </div>
      )}

      {/* Limit Order Info */}
      {activeTab === "limit" && (
        <div className="px-3 mb-2 text-xs text-slate-500 text-center italic">
          Limit orders execute automatically when the market price reaches your limit.
        </div>
      )}
    </div>
  );
}
