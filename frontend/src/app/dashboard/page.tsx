"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronDown, Menu, X, Wallet, TrendingUp, ArrowDownToLine, ArrowUpRight, Eye, EyeOff, Image, User, Phone, Mail } from "lucide-react";

import WalletConnect from "@/components/WalletConnect";
import OrderBook from "@/components/OrderBook";
import OrderEntry from "@/components/OrderEntry";
import AssetsAndHistory from "@/components/AssetsAndHistory";
import WithdrawModal from "@/components/WithdrawModal";
import DepositModal from "@/components/DepositModal";
import SwapModal from "@/components/SwapModal";

const TradingViewChart = dynamic(() => import("@/components/TradingViewChart"), { ssr: false });

import { ErrorBoundary } from "@/components/ErrorBoundary";

const MARKETS = ["ETH/USDT", "BTC/USDT", "SOL/USDT", "BNB/USDT"];

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentMarket, setCurrentMarket] = useState("ETH/USDT");
  const [showMarkets, setShowMarkets] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Balance state
  const [showBalance, setShowBalance] = useState(true);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [totalValue, setTotalValue] = useState(0);

  // Profile state
  const [userProfile, setUserProfile] = useState<{
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    country: string;
    photoURL: string;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  // Edit profile state
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // Price map for portfolio valuation
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});

  useEffect(() => {
    setMounted(true);

    // Auto-login via Deep Link
    const searchParams = new URLSearchParams(window.location.search);
    const autoLoginUid = searchParams.get("autoLoginUid");
    if (autoLoginUid) {
      localStorage.setItem("token", autoLoginUid);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
    } else {
      setIsAuthenticated(true);

      // If we auto-logged in, hydrate user data from Firebase
      if (autoLoginUid) {
        import("@/lib/firebase").then(({ db }) => {
          import("firebase/firestore").then(({ doc, getDoc }) => {
            getDoc(doc(db, "users", autoLoginUid)).then((docSnap) => {
              if (docSnap.exists()) {
                const userData = docSnap.data();
                const existingUsers = JSON.parse(localStorage.getItem("platform_users") || "[]");
                const userIndex = existingUsers.findIndex((u: any) => u.id === autoLoginUid);
                if (userIndex !== -1) {
                  existingUsers[userIndex] = { ...existingUsers[userIndex], ...userData };
                } else {
                  existingUsers.push({ id: autoLoginUid, ...userData });
                }
                localStorage.setItem("platform_users", JSON.stringify(existingUsers));
                localStorage.setItem("user_email", userData.email || "");
                window.dispatchEvent(new Event("balanceUpdated"));
              }
            });
          });
        });
      }
    }
  }, [router]);

  // Load balances
  const loadBalances = async () => {
    const userId = localStorage.getItem("token");
    if (!userId) return;

    // Primary: read from Firestore (shared source of truth — admin adjustments write here)
    try {
      const { db } = await import("@/lib/firebase");
      const { doc, getDoc } = await import("firebase/firestore");
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData && userData.balance) {
          setBalances(userData.balance);
          // Hydrate localStorage for subsequent reads
          const storedUsers = JSON.parse(localStorage.getItem("platform_users") || "[]");
          const idx = storedUsers.findIndex((u: any) => u.id === userId);
          if (idx !== -1) {
            storedUsers[idx].balance = userData.balance;
            localStorage.setItem("platform_users", JSON.stringify(storedUsers));
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
      setBalances(user.balance);
    }
  };

  // Load user profile from Firestore
  const loadProfile = async () => {
    const userId = localStorage.getItem("token");
    if (!userId) return;
    setProfileLoading(true);
    try {
      const { db } = await import("@/lib/firebase");
      const { doc, getDoc } = await import("firebase/firestore");
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserProfile({
          email: data?.email || "",
          firstName: data?.firstName || "",
          lastName: data?.lastName || "",
          phone: data?.phone || "",
          country: data?.country || "",
          photoURL: data?.photoURL || "",
        });
      }
    } catch (err) {
      console.warn("Profile load notice:", err);
    } finally {
      setProfileLoading(false);
    }
  };

  // Upload profile picture to Firebase Storage
  const uploadProfileImage = async (file: File) => {
    const userId = localStorage.getItem("token");
    if (!userId) return;
    try {
      const { storage } = await import("@/lib/firebase");
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const storageRef = ref(storage, `profile_pics/${userId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      // Update Firestore with photoURL
      const { db } = await import("@/lib/firebase");
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", userId), { photoURL: url });
      setUserProfile((prev) => (prev ? { ...prev, photoURL: url } : null));
    } catch (err) {
      console.error("Profile image upload error:", err);
    }
  };

  // Update user profile details in Firestore
  const updateProfile = async () => {
    const userId = localStorage.getItem("token");
    if (!userId) return;
    setSaveLoading(true);
    try {
      const { db } = await import("@/lib/firebase");
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", userId), {
        email: editEmail,
        phone: editPhone,
        country: editCountry,
        firstName: editFirstName,
        lastName: editLastName,
      });
      setUserProfile((prev) => (prev
        ? { ...prev, email: editEmail, phone: editPhone, country: editCountry, firstName: editFirstName, lastName: editLastName }
        : null));
      setProfileMenuOpen(false);
    } catch (err) {
      console.error("Profile update error:", err);
    } finally {
      setSaveLoading(false);
    }
  };

  const openProfileMenu = () => {
    if (userProfile) {
      setEditEmail(userProfile.email);
      setEditPhone(userProfile.phone);
      setEditCountry(userProfile.country);
      setEditFirstName(userProfile.firstName);
      setEditLastName(userProfile.lastName);
    }
    setProfileMenuOpen(true);
  };

  const closeProfileMenu = () => setProfileMenuOpen(false);

  // Fetch prices for portfolio valuation
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
      // Fallback to hardcoded prices
      setPriceMap({ USDT: 1, ETH: 3000, BTC: 65000, SOL: 150, BNB: 600, KSH: 0.01 });
    }
  };

  useEffect(() => {
    loadBalances();
    loadProfile();
    fetchPrices();
    window.addEventListener("balanceUpdated", () => {
      loadBalances();
      fetchPrices();
    });
    return () => {
      window.removeEventListener("balanceUpdated", () => {
        loadBalances();
        fetchPrices();
      });
    };
  }, []);

  // Calculate total portfolio value
  useEffect(() => {
    let total = 0;
    Object.entries(balances).forEach(([asset, amount]) => {
      const price = priceMap[asset] || 0;
      total += amount * price;
    });
    setTotalValue(total);
  }, [balances, priceMap]);

  const baseAsset = currentMarket.split("/")[0];
  const quoteAsset = currentMarket.split("/")[1] || "USDT";

  if (!mounted) return null;
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#0b0e11] text-slate-300 flex flex-col font-sans overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-800 bg-[#151920] flex justify-between items-center px-4 flex-shrink-0 z-20 relative">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-6 h-6 bg-indigo-500 rounded-sm"></div>
            <h1 className="text-xl font-bold text-white tracking-tight">Bukkt</h1>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-sm">
            {/* Market Selector */}
            <div className="relative">
              <button
                onClick={() => setShowMarkets(!showMarkets)}
                className="flex items-center gap-2 hover:bg-slate-800 p-2 rounded-md transition-colors -ml-2"
              >
                <span className="text-xl font-semibold text-white">{currentMarket}</span>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform ${showMarkets ? "rotate-180" : ""}`}
                />
              </button>

              {showMarkets && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-[#151920] border border-slate-800 rounded-lg shadow-xl py-2 z-50">
                  <div className="px-3 pb-2 mb-2 border-b border-slate-800 text-xs font-semibold text-slate-500">
                    Select Market
                  </div>
                  {MARKETS.map((market) => (
                    <button
                      key={market}
                      onClick={() => {
                        setCurrentMarket(market);
                        setShowMarkets(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-800 transition-colors ${
                        currentMarket === market ? "text-indigo-400 font-bold" : "text-slate-300"
                      }`}
                    >
                      {market}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Market Stats */}
            <div className="flex items-center gap-4 text-slate-400">
              <span className="text-sm">24h Change: <span className="text-green-500 font-mono">+1.24%</span></span>
              <span className="text-sm">24h High: <span className="text-slate-200 font-mono">3,050.21</span></span>
              <span className="text-sm">24h Volume: <span className="text-slate-200 font-mono">42,512.5 ETH</span></span>
            </div>
          </div>
        </div>

        {/* Balance Display */}
        <div className="hidden md:flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            {showBalance ? (
              <span className="text-slate-200 font-mono text-lg font-semibold">
                ${totalValue.toFixed(2)}
              </span>
            ) : (
              <span className="text-slate-200 font-mono text-lg">
                •••••
              </span>
            )}
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            >
              {showBalance ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>

          {/* Asset Balances Mini */}
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {Object.entries(balances)
              .filter(([_, amount]) => amount > 0)
              .slice(0, 3)
              .map(([asset, amount]) => (
                <span key={asset} className="font-mono">
                  {amount.toFixed(4)} {asset}
                </span>
              ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2">
            <SwapModal />
            <ErrorBoundary>
              <WalletConnect />
            </ErrorBoundary>
          </div>

          {/* Profile Menu Trigger */}
          <div className="relative">
            <button
              onClick={openProfileMenu}
              className="flex items-center gap-2 bg-[#1a1f2b] hover:bg-[#252b3b] text-slate-200 border border-slate-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <div className="relative">
                {userProfile?.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt="Profile"
                    className="w-8 h-8 rounded-full object-cover border border-slate-600"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                    <User size={20} className="text-indigo-400" />
                  </div>
                )}
              </div>
              <span className="hidden sm:inline">{userProfile?.firstName || "Profile"}</span>
              <ChevronDown size={14} className="text-slate-400 ml-1" />
            </button>

            {/* Profile Dropdown */}
            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-[#151920] border border-slate-800 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
                <div className="p-4 border-b border-slate-800">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative">
                      {userProfile?.photoURL ? (
                        <img
                          src={userProfile.photoURL}
                          alt="Profile"
                          className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center border-2 border-indigo-500/30">
                          <User size={24} className="text-indigo-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-semibold">{userProfile?.firstName || ""} {userProfile?.lastName || ""}</h3>
                      <p className="text-xs text-slate-400">{userProfile?.email || "No email"}</p>
                    </div>
                  </div>
                </div>
                <div className="p-3 space-y-1">
                  <button
                    onClick={() => setShowActions(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <ArrowDownToLine size={16} className="text-indigo-400" />
                    Manage Funds
                  </button>
                  <hr className="border-slate-800 my-2" />
                  <button
                    onClick={() => {
                      setEditEmail(userProfile?.email || "");
                      setEditPhone(userProfile?.phone || "");
                      setEditCountry(userProfile?.country || "");
                      setEditFirstName(userProfile?.firstName || "");
                      setEditLastName(userProfile?.lastName || "");
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Image size={16} className="text-indigo-400" />
                    Edit Profile
                  </button>
                  <hr className="border-slate-800 my-2" />
                  <button
                    onClick={async () => {
                      try {
                        const { auth } = await import("@/lib/firebase");
                        await auth.signOut();
                      } catch (e) {
                        console.error(e);
                      }
                      localStorage.removeItem("token");
                      localStorage.removeItem("user_email");
                      sessionStorage.removeItem("admin_auth");
                      router.push("/login");
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <X size={16} className="text-red-500" />
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        <WithdrawModal isOpen={isWithdrawOpen} onClose={() => setIsWithdrawOpen(false)} />
        <DepositModal isOpen={isDepositOpen} onClose={() => setIsDepositOpen(false)} />
      </header>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="md:hidden bg-[#151920] border-b border-slate-800 p-4 flex flex-col gap-3 z-50">
          <button
            onClick={() => { setIsDepositOpen(true); setShowMobileMenu(false); }}
            className="w-full text-center bg-[#1a1f2b] border border-slate-700 px-4 py-3 rounded-md text-sm font-semibold text-slate-200"
          >
            Deposit Crypto
          </button>
          <button
            onClick={() => { setIsWithdrawOpen(true); setShowMobileMenu(false); }}
            className="w-full text-center bg-[#1a1f2b] border border-slate-700 px-4 py-3 rounded-md text-sm font-semibold text-slate-200"
          >
            Withdraw Crypto
          </button>
          <div className="flex justify-center">
            <ErrorBoundary>
              <WalletConnect />
            </ErrorBoundary>
          </div>
          <button
            onClick={async () => {
              try {
                const { auth } = await import("@/lib/firebase");
                await auth.signOut();
              } catch (e) {
                console.error(e);
              }
              localStorage.removeItem("token");
              localStorage.removeItem("user_email");
              sessionStorage.removeItem("admin_auth");
              router.push("/login");
            }}
            className="w-full text-center px-4 py-3 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors border border-slate-700"
          >
            Log Out
          </button>
        </div>
      )}

      {/* Main Trading Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden lg:h-[calc(100vh-56px-260px)] z-10 relative">
        {/* Left Column: Asset Balances + Order Book */}
        <div className="w-full lg:w-[280px] h-[350px] lg:h-full border-r border-slate-800 flex flex-col bg-[#11141a] lg:order-1 overflow-hidden">
          {/* Asset Balances */}
          <div className="border-b border-slate-800 flex-shrink-0">
            <div className="p-3 text-xs text-slate-500 uppercase font-sans font-medium flex justify-between items-center">
              <span>Your Balances</span>
              <span
                className="cursor-pointer hover:text-slate-300 transition-colors"
                onClick={() => router.push("/dashboard")}
              >
                <Wallet size={14} />
              </span>
            </div>
            <div className="px-3 pb-3 overflow-y-auto custom-scrollbar" style={{ maxHeight: "calc(192px - 48px)" }}>
              {Object.keys(balances).length === 0 ? (
                <p className="text-xs text-slate-500 py-2">No assets. Deposit to start trading.</p>
              ) : (
                Object.entries(balances)
                  .filter(([_, amount]) => amount > 0)
                  .sort((a: [string, number], b: [string, number]) => {
                    const aVal = a[1] * (priceMap[a[0]] || 0);
                    const bVal = b[1] * (priceMap[b[0]] || 0);
                    return bVal - aVal;
                  })
                  .map(([asset, amount]) => {
                    const usdValue = amount * (priceMap[asset] || 0);
                    return (
                      <div key={asset} className="flex justify-between items-center py-1.5">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-300">{asset}</span>
                          <span className="text-xs text-slate-500">
                            {showBalance ? `$${usdValue.toFixed(2)}` : "•••••"}
                          </span>
                        </div>
                        <span className="text-sm font-mono text-slate-200">
                          {showBalance ? amount.toFixed(6) : "••••"}
                        </span>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Order Book */}
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <OrderBook symbol={currentMarket} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Center Column: Chart */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0b0e11] lg:order-2">
          <div className="flex-1 min-h-[300px] relative h-full">
            <ErrorBoundary>
              <TradingViewChart symbol={currentMarket} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Right Column: Order Entry */}
        <div className="w-full lg:w-[340px] h-[400px] lg:h-full border-l border-slate-800 flex flex-col bg-[#11141a] lg:order-3 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <OrderEntry symbol={currentMarket} />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Bottom Panel: Open Orders / Trade History */}
      <div className="h-[250px] lg:h-[260px] border-t border-slate-800 bg-[#11141a] flex-shrink-0 lg:order-4 overflow-hidden">
        <ErrorBoundary>
          <AssetsAndHistory />
        </ErrorBoundary>
      </div>
    </div>
  );
}
