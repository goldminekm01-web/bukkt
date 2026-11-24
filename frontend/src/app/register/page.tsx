"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { TrendingUp, ShieldCheck } from "lucide-react";

// Dynamically import chart for the left panel
const TradingViewChart = dynamic(() => import("@/components/TradingViewChart"), { ssr: false });

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "phone") {
      // Enforce numbers only for phone
      const numericValue = value.replace(/[^0-9]/g, "");
      setFormData(prev => ({ ...prev, [name]: numericValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    // 1. Password Match Validation
    if (formData.password !== formData.confirmPassword) {
      return setError("Passwords do not match.");
    }

    // 2. Email Realness/Format Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return setError("Please enter a valid real email address.");
    }

    if (!formData.email || !formData.password || !formData.firstName) {
      return setError("Please fill in all required fields.");
    }

    setLoading(true);

    try {
      const storedUsers = JSON.parse(localStorage.getItem('platform_users') || '[]');
      const normalizedEmail = formData.email.trim().toLowerCase();

      // Check if email already exists in local platform store
      if (storedUsers.some((u: any) => u.email && u.email.trim().toLowerCase() === normalizedEmail)) {
        setError("This email has already been used. Please sign in or use another email.");
        setLoading(false);
        return;
      }

      let userId = "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

      // Detect user country from IP geolocation
      let country = 'Unknown';
      try {
        const res = await fetch('https://ipwho.is/');
        const data = await res.json();
        if (data.success) {
          country = data.country || 'Unknown';
        }
      } catch (err) {
        try {
          const res2 = await fetch('https://freeipapi.com/api/json');
          const data2 = await res2.json();
          country = data2.countryName || 'Unknown';
        } catch (err2) {
          console.warn("Country detection notice:", err2);
        }
      }

      // Attempt Firebase Auth creation
      try {
        const { auth } = await import("@/lib/firebase");
        const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
        
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        if (userCredential && userCredential.user) {
          userId = userCredential.user.uid;
          try {
            await updateProfile(userCredential.user, {
              displayName: `${formData.firstName} ${formData.lastName}`.trim()
            });
          } catch (profileErr) {
            console.warn("Update profile notice:", profileErr);
          }
        }
      } catch (authErr: any) {
        console.warn("Firebase Auth notice:", authErr);
        if (authErr && (authErr.code === 'auth/email-already-in-use' || String(authErr.message || '').includes('already-in-use'))) {
          setError("This email has already been used. Please sign in or use another email.");
          setLoading(false);
          return;
        }
      }

      // User document object
      const newUserDoc = {
        id: userId,
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: `${formData.firstName} ${formData.lastName}`.trim(),
        email: formData.email,
        phone: formData.phone,
        country,
        role: 'USER',
        balance: {
          USDT: 0,
          ETH: 0
        },
        createdAt: new Date().toISOString()
      };

      // Persist user record to Neon Cloud Postgres Database
      try {
        await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUserDoc)
        });
      } catch (apiErr) {
        console.warn("Neon DB API registration notice:", apiErr);
      }

      // Attempt Firestore document save
      try {
        const { db } = await import("@/lib/firebase");
        const { doc, setDoc } = await import("firebase/firestore");
        await setDoc(doc(db, "users", userId), newUserDoc);
      } catch (dbErr) {
        console.warn("Firestore setDoc notice:", dbErr);
      }

      // Always save user record to local platform_users for admin panel and local login
      const updatedStoredUsers = JSON.parse(localStorage.getItem('platform_users') || '[]');
      const existingIdx = updatedStoredUsers.findIndex((u: any) => u.id === userId || (u.email && u.email.trim().toLowerCase() === normalizedEmail));
      if (existingIdx !== -1) {
        updatedStoredUsers[existingIdx] = { ...updatedStoredUsers[existingIdx], ...newUserDoc };
      } else {
        updatedStoredUsers.push(newUserDoc);
      }
      localStorage.setItem('platform_users', JSON.stringify(updatedStoredUsers));

      // Hydrate active session token & user info
      localStorage.setItem("token", userId);
      localStorage.setItem("user_email", formData.email);

      // Successfully registered! Navigate to login page
      router.push("/login?registered=true");
    } catch (err: any) {
      console.error("Registration error:", err);
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("firebase")) {
        // Ignore remote permission error and finish registration locally
        router.push("/login?registered=true");
      } else {
        setError(msg || "An error occurred during registration.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left Panel - Market Info & Chart */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 text-white flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-900/20 to-slate-900 z-0"></div>
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[100px]"></div>
        
        <div className="relative z-10 p-12 flex flex-col h-full">
          <Link href="/" className="text-2xl font-bold tracking-tighter flex items-center gap-2 mb-12">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg"></div>
            Bukkt
          </Link>

          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-4xl font-bold mb-6 leading-tight">
              The world's most trusted <br/> crypto exchange.
            </h1>
            <div className="space-y-6 mb-12">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="font-semibold">Deep Liquidity</h3>
                  <p className="text-slate-400 text-sm">Industry-leading order book depth.</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-semibold">Secure Storage</h3>
                  <p className="text-slate-400 text-sm">Offline cold storage with multi-sig technology.</p>
                </div>
              </div>
            </div>

            <div className="w-full h-[300px] bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 backdrop-blur-sm shadow-2xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-slate-300">Live Market</span>
                <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded-full">ETH/USDT Active</span>
              </div>
              <div className="h-[230px] w-full filter invert hue-rotate-180 opacity-90 mix-blend-screen">
                <TradingViewChart symbol="ETH/USDT" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Registration Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <Link href="/" className="text-2xl font-bold tracking-tighter flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg"></div>
              Bukkt
            </Link>
          </div>

          <h2 className="text-3xl font-bold text-slate-900 mb-2">Create Account</h2>
          <p className="text-slate-500 mb-8">Sign up to start trading crypto today.</p>

          <form onSubmit={handleRegister} className="space-y-5">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">First Name</label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm font-bold text-slate-900 bg-slate-50 focus:bg-white transition-colors outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm font-bold text-slate-900 bg-slate-50 focus:bg-white transition-colors outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm font-bold text-slate-900 bg-slate-50 focus:bg-white transition-colors outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone Number</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm font-bold text-slate-900 bg-slate-50 focus:bg-white transition-colors outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm font-bold text-slate-900 bg-slate-50 focus:bg-white transition-colors outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 text-sm font-bold text-slate-900 bg-slate-50 focus:bg-white transition-colors outline-none"
                  required
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white font-semibold py-3.5 px-4 rounded-lg hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-600/30 transition-all disabled:opacity-70 flex justify-center"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </button>
            </div>

            <p className="text-center text-sm text-slate-500 mt-6">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
