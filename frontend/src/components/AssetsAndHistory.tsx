"use client";

import { useEffect, useState } from "react";
import { History, ClipboardList, Trash2 } from "lucide-react";

type TabType = "history" | "orders" | "balances";

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

interface OpenOrder {
  id: string;
  timestamp: number;
  pair: string;
  side: "buy" | "sell";
  type: string;
  price: number;
  amount: number;
  filled: number;
  status: string;
}

export default function AssetsAndHistory() {
  const [activeTab, setActiveTab] = useState<TabType>("history");
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [priceMap, setPriceMap] = useState<Record<string, number>>({ USDT: 1 });

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const fetchPrices = async () => {
    try {
      const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
      if (!res.ok) throw new Error("Failed to fetch prices");
      const data = await res.json();
      const prices: Record<string, number> = {
        USDT: 1,
        BTC: 65000,
        ETH: 3500,
        BNB: 600,
        SOL: 150,
        KSH: 0.01
      };
      data.forEach((item: any) => {
        const symbol = item.symbol;
        if (symbol.endsWith("USDT")) {
          const asset = symbol.replace("USDT", "");
          prices[asset] = parseFloat(item.lastPrice);
        }
      });
      setPriceMap(prices);
    } catch (err) {
      console.error("Failed to fetch prices:", err);
      setPriceMap({ USDT: 1, ETH: 3000, BTC: 65000, SOL: 150, BNB: 600, KSH: 0.01 });
    }
  };

  const loadData = () => {
    const userId = localStorage.getItem("token");
    if (!userId) return;

    // Load user balances
    const users = JSON.parse(localStorage.getItem("platform_users") || "[]");
    const user = users.find((u: any) => u.id === userId);
    if (user && user.balance) {
      setBalances(user.balance);
    }

    // Load trade history
    const history = JSON.parse(localStorage.getItem("trade_history") || "[]");
    setTradeHistory(history.slice().reverse().slice(0, 100));

    // Load open orders
    const orders = JSON.parse(localStorage.getItem("open_orders") || "[]");
    setOpenOrders(orders.slice().reverse());
  };

  useEffect(() => {
    loadData();
    fetchPrices();

    window.addEventListener("balanceUpdated", loadData);
    window.addEventListener("ordersUpdated", loadData);
    return () => {
      window.removeEventListener("balanceUpdated", loadData);
      window.removeEventListener("ordersUpdated", loadData);
    };
  }, []);

  const cancelOrder = (orderId: string) => {
    const orders = JSON.parse(localStorage.getItem("open_orders") || "[]");
    const orderIndex = orders.findIndex((o: OpenOrder) => o.id === orderId);
    if (orderIndex === -1) return;

    const order = orders[orderIndex];
    if (order.status === "open" || order.status === "partially_filled") {
      // Refund funds if order was open
      const userId = localStorage.getItem("token");
      if (userId) {
        const users = JSON.parse(localStorage.getItem("platform_users") || "[]");
        const userIndex = users.findIndex((u: any) => u.id === userId);
        if (userIndex !== -1) {
          const balance = { ...(users[userIndex].balance || {}) };
          const executedAmount = order.filled || 0;
          const remainingAmount = order.amount - executedAmount;

          if (order.side === "buy") {
            // Refund USDT for unfilled portion
            const refund = order.price * remainingAmount * 1.001;
            balance.USDT = (balance.USDT || 0) + refund;
          } else {
            // Refund base asset for unfilled portion
            balance[order.pair.split("/")[0]] = (balance[order.pair.split("/")[0]] || 0) + remainingAmount;
          }

          users[userIndex].balance = balance;
          localStorage.setItem("platform_users", JSON.stringify(users));
        }
      }

      orders[orderIndex].status = "cancelled";
      localStorage.setItem("open_orders", JSON.stringify(orders));
      setOpenOrders(orders.slice().reverse());
      window.dispatchEvent(new Event("balanceUpdated"));
      alert("Order cancelled successfully.");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-[#11141a]">
        {[
          { id: "history", label: "Trade History", icon: History },
          { id: "orders", label: "Open Orders", icon: ClipboardList },
          { id: "balances", label: "Asset Balances", icon: ClipboardList },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-3 text-sm transition-all border-b-2 ${
                activeTab === tab.id
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {/* Trade History Tab */}
        {activeTab === "history" && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {tradeHistory.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                <History size={32} className="mx-auto mb-2 opacity-30" />
                <p>No trade history yet</p>
                <p className="text-xs mt-1">Your executed trades will appear here</p>
              </div>
            ) : (
              <div className="p-2">
                <div className="grid grid-cols-7 gap-2 px-3 py-2 text-xs text-slate-500 uppercase font-sans">
                  <span className="col-span-2">Time</span>
                  <span className="col-span-1">Pair</span>
                  <span className="col-span-1">Side</span>
                  <span className="col-span-1">Price</span>
                  <span className="col-span-1">Amount</span>
                  <span className="col-span-1">Fee</span>
                  <span className="col-span-1 text-right">Total</span>
                </div>
                <div className="space-y-px">
                  {tradeHistory.map((trade, idx) => {
                    const isBuy = trade.side === "buy";
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-7 gap-2 items-center px-3 py-1.5 text-xs hover:bg-slate-800/30 rounded"
                      >
                        <span className="col-span-2 text-slate-400 font-mono">
                          {formatDate(trade.timestamp)}
                        </span>
                        <span className="col-span-1 text-slate-300">{trade.pair}</span>
                        <span
                          className={`col-span-1 font-semibold ${
                            isBuy ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {isBuy ? "BUY" : "SELL"}
                        </span>
                        <span className="col-span-1 text-slate-400 font-mono">
                          ${trade.price.toFixed(2)}
                        </span>
                        <span className="col-span-1 text-slate-400 font-mono">
                          {trade.amount.toFixed(6)}
                        </span>
                        <span className="col-span-1 text-slate-400 font-mono">
                          ${trade.fee.toFixed(4)}
                        </span>
                        <span className="col-span-1 text-slate-300 font-mono text-right">
                          ${trade.total.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Open Orders Tab */}
        {activeTab === "orders" && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            {openOrders.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
                <p>No open orders</p>
                <p className="text-xs mt-1">Your open orders will appear here</p>
              </div>
            ) : (
              <div className="p-2">
                <div className="grid grid-cols-7 gap-2 px-3 py-2 text-xs text-slate-500 uppercase font-sans">
                  <span className="col-span-2">Time</span>
                  <span className="col-span-1">Pair</span>
                  <span className="col-span-1">Side</span>
                  <span className="col-span-1">Price</span>
                  <span className="col-span-1">Amount</span>
                  <span className="col-span-1">Status</span>
                  <span className="col-span-1 text-right">Action</span>
                </div>
                <div className="space-y-px">
                  {openOrders.map((order) => {
                    const isBuy = order.side === "buy";
                    const isActive = order.status === "open" || order.status === "partially_filled";
                    return (
                      <div
                        key={order.id}
                        className="grid grid-cols-7 gap-2 items-center px-3 py-1.5 text-xs hover:bg-slate-800/30 rounded"
                      >
                        <span className="col-span-2 text-slate-400 font-mono">
                          {formatDate(order.timestamp)}
                        </span>
                        <span className="col-span-1 text-slate-300">{order.pair}</span>
                        <span
                          className={`col-span-1 font-semibold ${
                            isBuy ? "text-green-500" : "text-red-500"
                          }`}
                        >
                          {isBuy ? "BUY" : "SELL"}
                        </span>
                        <span className="col-span-1 text-slate-400 font-mono">
                          ${order.price.toFixed(2)}
                        </span>
                        <span className="col-span-1 text-slate-400 font-mono">
                          {order.amount.toFixed(6)}
                        </span>
                        <span
                          className={`col-span-1 ${
                            isActive
                              ? "text-blue-400"
                              : order.status === "filled"
                              ? "text-green-500"
                              : "text-red-500"
                          }`}
                        >
                          {order.status}
                        </span>
                        <span className="col-span-1 text-right">
                          {isActive && (
                            <button
                              onClick={() => cancelOrder(order.id)}
                              className="p-1 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded transition-colors"
                              title="Cancel Order"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Balances Tab */}
        {activeTab === "balances" && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="p-2">
              <div className="grid grid-cols-4 gap-2 px-3 py-2 text-xs text-slate-500 uppercase font-sans">
                <span className="col-span-1">Asset</span>
                <span className="col-span-1">Balance</span>
                <span className="col-span-1">Price (USDT)</span>
                <span className="col-span-1 text-right">Value (USDT)</span>
              </div>
              <div className="space-y-px">
                {Object.entries(balances)
                  .filter(([_, amount]) => amount > 0)
                  .sort((a: [string, number], b: [string, number]) => {
                    const aVal = a[1] * (priceMap[a[0]] || 0);
                    const bVal = b[1] * (priceMap[b[0]] || 0);
                    return bVal - aVal;
                  })
                  .map(([asset, amount]) => {
                    const price = priceMap[asset] || 0;
                    const value = amount * price;
                    return (
                      <div
                        key={asset}
                        className="grid grid-cols-4 gap-2 items-center px-3 py-1.5 text-xs hover:bg-slate-800/30 rounded"
                      >
                        <span className="col-span-1 font-semibold text-slate-300">
                          {asset}
                        </span>
                        <span className="col-span-1 text-slate-400 font-mono">
                          {amount.toFixed(6)}
                        </span>
                        <span className="col-span-1 text-slate-400 font-mono">
                          ${price.toFixed(2)}
                        </span>
                        <span className="col-span-1 text-right text-slate-300 font-mono">
                          ${value.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
