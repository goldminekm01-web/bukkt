"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Users, DollarSign, Activity, Globe, Shield, Edit, X, Copy, Check, FileText } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt?: string;
  balances: Record<string, number>;
  walletAddress?: string;
}

interface Deposit {
  user: string;
  email: string;
  hash: string;
  amount: string;
  date: string;
}

interface Withdrawal {
  id: string;
  userId: string;
  email: string;
  coin: string;
  amount: number;
  address: string;
  status: string;
  date: string;
}

interface Visitor {
  ip: string;
  country: string;
  page: string;
  timestamp: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  
  // Balance Adjustment State
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currency, setCurrency] = useState('USDT');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  
  // Stats
  const [totalVolume, setTotalVolume] = useState(0);

  // Copy State
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  
  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };
  
  const handlePostBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    setBlogStatus('Posting...');
    try {
      const { db } = await import('@/lib/firebase');
      const { collection, addDoc } = await import('firebase/firestore');
      if (editingBlogId) {
        const { doc, updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'blogs', editingBlogId), {
          title: blogTitle,
          excerpt: blogExcerpt,
          content: blogContent,
          imageUrl: blogImage,
        });
      } else {
        await addDoc(collection(db, 'blogs'), {
          title: blogTitle,
          excerpt: blogExcerpt,
          content: blogContent,
          imageUrl: blogImage,
          date: new Date().toISOString()
        });
      }
      setBlogStatus(editingBlogId ? 'Updated!' : 'Published!');
      setEditingBlogId(null);
      setBlogTitle(''); setBlogExcerpt(''); setBlogContent(''); setBlogImage('');
      fetchAdminBlogs();
    } catch (err) {
      console.error(err);
      setBlogStatus('Failed: ' + (err?.message || err));
    }
  };
  
  const fetchAdminBlogs = async () => {
    try {
      const { db } = await import('@/lib/firebase');
      const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
      const snap = await getDocs(query(collection(db, 'blogs'), orderBy('date', 'desc')));
      const list: any[] = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setAdminBlogs(list);
    } catch (e) { console.error(e); }
  };
  
  const handleDeleteBlog = async (id: string) => {
    if (!confirm('Delete this post?')) return;
    try {
      const { db } = await import('@/lib/firebase');
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'blogs', id));
      setAdminBlogs(prev => prev.filter(b => b.id !== id));
    } catch (e) { console.error(e); setBlogStatus('Delete failed'); }
  };
  
  const handleEditBlog = (b: any) => {
    setEditingBlogId(b.id);
    setBlogTitle(b.title || '');
    setBlogExcerpt(b.excerpt || '');
    setBlogContent(b.content || '');
    setBlogImage(b.imageUrl || '');
    setBlogStatus('Editing...');
  };

  // Authentication State
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [mounted, setMounted] = useState(false);

  // Blog post state
  const [blogTitle, setBlogTitle] = useState('');
  const [blogExcerpt, setBlogExcerpt] = useState('');
  const [blogContent, setBlogContent] = useState('');
  const [blogImage, setBlogImage] = useState('');
  const [blogStatus, setBlogStatus] = useState('');
  const [adminBlogs, setAdminBlogs] = useState<any[]>([]);
  const [editingBlogId, setEditingBlogId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (sessionStorage.getItem('admin_auth') === 'true') {
      setIsAdminAuth(true);
    }
  }, []);

  useEffect(() => {
    if (!isAdminAuth) return;
    
    const fetchData = async () => {
      let globalWithdrawals: Withdrawal[] = [];
      try {
        const { db, auth } = await import('@/lib/firebase');
        const { collection, getDocs, query, orderBy, limit } = await import('firebase/firestore');
        const { signInAnonymously } = await import('firebase/auth');

        const globalUsers: User[] = [];

        // Primary: Fetch users from Neon Postgres Cloud Database
        try {
          const res = await fetch('/api/users');
          if (res.ok) {
            const data = await res.json();
            if (data.users && Array.isArray(data.users)) {
              data.users.forEach((u: any) => {
                globalUsers.push(u);
              });
            }
          }
        } catch (neonErr) {
          console.warn("Neon API fetch warning:", neonErr);
        }

        // Secondary: Fetch Global Users from Firebase Firestore
        try {
          // Sign in anonymously so Firestore reads pass `request.auth != null` rule
          try {
            await signInAnonymously(auth);
          } catch (authErr) {
            // Already signed in or anonymous auth disabled — proceed anyway
            console.warn("Anonymous Firebase sign-in notice:", authErr);
          }
          const usersSnap = await getDocs(collection(db, 'users'));
          usersSnap.forEach((doc) => {
            const data = doc.data();
            if (!globalUsers.some(u => u.email === data.email || u.id === (data.id || doc.id))) {
              globalUsers.push({
                id: data.id || doc.id,
                name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email,
                email: data.email,
                phone: data.phone || '',
                createdAt: data.createdAt || data.created_at || '',
                balances: data.balance || {},
                walletAddress: data.walletAddress || ''
              });
            }
          });
        } catch (fbErr) {
          console.warn("Firestore fetch notice:", fbErr);
        }

        // Fallback / merge local users from platform_users
        const localPlatformUsers = JSON.parse(localStorage.getItem('platform_users') || '[]');
        localPlatformUsers.forEach((lu: any) => {
          if (!globalUsers.some(u => u.id === lu.id || (u.email && u.email === lu.email))) {
            globalUsers.push({
              id: lu.id || String(Math.random()),
              name: `${lu.firstName || ''} ${lu.lastName || ''}`.trim() || lu.name || lu.email || 'User',
              email: lu.email || '',
              phone: lu.phone || '',
              createdAt: lu.createdAt || lu.created_at || '',
              balances: lu.balance || lu.balances || {},
              walletAddress: lu.walletAddress || ''
            });
          }
        });
        if (globalUsers.length > 0) setUsers(globalUsers); else { const lu = JSON.parse(localStorage.getItem('platform_users')||'[]'); setUsers(lu.map((u:any)=>({id:u.id||String(Math.random()),name:u.name||u.email||'User',email:u.email||'',phone:u.phone||'',createdAt:u.createdAt||'',balances:u.balance||{},walletAddress:u.walletAddress||''}))); }

        // Fetch Global Visitors (isolated — failures must not clobber users state)
        try {
          const visitorsQ = query(collection(db, 'visitors'), orderBy('timestamp', 'desc'), limit(500));
          const visitorsSnap = await getDocs(visitorsQ);
          const globalVisitors: Visitor[] = [];
          visitorsSnap.forEach((doc) => {
            globalVisitors.push(doc.data() as Visitor);
          });
          setVisitors(globalVisitors);
        } catch (visErr) {
          console.warn("Visitors fetch notice:", visErr);
        }

        // Fetch Global Withdrawals from Firestore (isolated)
        try {
          const withdrawalsQ = query(collection(db, 'withdrawals'), limit(500));
          const withdrawalsSnap = await getDocs(withdrawalsQ);
          withdrawalsSnap.forEach((doc) => {
            const data = doc.data();
            globalWithdrawals.push({
              id: doc.id,
              userId: data.userId || 'Unknown',
              email: data.email || 'Unknown',
              coin: data.coin || '',
              amount: data.amount || 0,
              address: data.address || '',
              status: data.status || 'Pending',
              date: data.date || new Date().toISOString()
            });
          });
        } catch (wdErr) {
          console.warn("Withdrawals fetch notice:", wdErr);
        }
      } catch (err) {
        console.error("Failed to fetch admin users from Firebase:", err);
        // If Firebase fetch fails, populate from local platform_users
        const localPlatformUsers = JSON.parse(localStorage.getItem('platform_users') || '[]');
        const fallbackUsers: User[] = localPlatformUsers.map((lu: any) => ({
          id: lu.id || String(Math.random()),
          name: `${lu.firstName || ''} ${lu.lastName || ''}`.trim() || lu.name || lu.email || 'User',
          email: lu.email || '',
          phone: lu.phone || '',
          createdAt: lu.createdAt || lu.created_at || '',
          balances: lu.balance || lu.balances || {},
          walletAddress: lu.walletAddress || ''
        }));
        setUsers(fallbackUsers);
      }

      // Fallbacks and mergers
      const storedDeposits = JSON.parse(localStorage.getItem('admin_deposits') || '[]');
      setDeposits(storedDeposits);
      const volume = storedDeposits.reduce((acc: number, val: Deposit) => acc + parseFloat(val.amount), 0);
      setTotalVolume(volume);

      // Merge any locally registered users so they stay visible
      const localPlatformUsers = JSON.parse(localStorage.getItem('platform_users') || '[]');
      setUsers(prev => {
        const merged = [...prev];
        localPlatformUsers.forEach((lu:any) => {
          if (!merged.some(u => u.id === lu.id || (u.email && u.email === lu.email))) {
            merged.push({ id: lu.id||String(Math.random()), name: `${lu.firstName||''} ${lu.lastName||''}`.trim()||lu.name||lu.email||'User', email: lu.email||'', phone: lu.phone||'', createdAt: lu.createdAt||'', balances: lu.balance||lu.balances||{}, walletAddress: lu.walletAddress||'' } as any);
          }
        });
        return merged;
      });
      const storedWithdrawals = JSON.parse(localStorage.getItem('admin_withdrawals') || '[]');
      const allWithdrawals = [...globalWithdrawals];
      
      storedWithdrawals.forEach((sw: any) => {
        if (!allWithdrawals.find(w => w.id === sw.id)) {
          allWithdrawals.push(sw);
        }
      });
      
      allWithdrawals.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setWithdrawals(allWithdrawals);
    };

    fetchData();
    fetchAdminBlogs();
  }, [isAdminAuth]);

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    const amount = parseFloat(delta);
    if (isNaN(amount)) return;

    const storedUsers = JSON.parse(localStorage.getItem('platform_users') || '[]');
    const userIndex = storedUsers.findIndex((u: any) => u.id === selectedUser.id);
    
    if (userIndex !== -1) {
      if (!storedUsers[userIndex].balance) storedUsers[userIndex].balance = {};
      storedUsers[userIndex].balance[currency] = (storedUsers[userIndex].balance[currency] || 0) + amount;
      
      localStorage.setItem('platform_users', JSON.stringify(storedUsers));
      
      const newUsers = [...users];
      const uiUserIndex = newUsers.findIndex(u => u.id === selectedUser.id);
      if (uiUserIndex !== -1) {
        newUsers[uiUserIndex].balances[currency] = storedUsers[userIndex].balance[currency];
        setUsers(newUsers);
      }

      // Sync the change to Firestore
      try {
        const { db } = await import('@/lib/firebase');
        const { doc, updateDoc, getDoc } = await import('firebase/firestore');
        const userRef = doc(db, 'users', selectedUser.id);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          await updateDoc(userRef, { balance: storedUsers[userIndex].balance });
        }
      } catch (err) {
        console.error("Failed to sync admin adjustment to Firebase", err);
      }
    }
    
    setSelectedUser(null);
    setDelta('');
    setReason('');
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const envAdminUsername = process.env.NEXT_PUBLIC_ADMIN_USERNAME || '';
    const envAdminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '';

    if (envAdminUsername && envAdminPassword && envAdminPassword !== '' &&
        adminUsername === envAdminUsername && adminPassword === envAdminPassword) {
      sessionStorage.setItem('admin_auth', 'true');
      setIsAdminAuth(true);
      setAuthError('');
    } else {
      setAuthError('Invalid admin credentials.');
    }
  };

  if (!mounted) return null;

  if (!isAdminAuth) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex items-center justify-center p-4">
        <div className="bg-[#151920] border border-slate-800 p-8 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="flex items-center gap-3 mb-6 justify-center">
            <Shield className="text-indigo-500 w-8 h-8" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Admin Gateway</h1>
          </div>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Username</label>
              <input 
                type="text" required
                value={adminUsername} onChange={e => setAdminUsername(e.target.value)}
                className="w-full bg-[#0b0e11] border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
              <input 
                type="password" required
                value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                className="w-full bg-[#0b0e11] border border-slate-800 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="Enter password"
              />
            </div>
            {authError && <p className="text-red-400 text-sm font-medium text-center">{authError}</p>}
            <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-all shadow-lg shadow-indigo-500/20">
              Access Control Panel
            </button>
            <button 
              type="button" onClick={() => router.push('/')}
              className="w-full py-3 bg-transparent text-slate-400 hover:text-white rounded-lg font-medium transition-all"
            >
              Return to Platform
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-300 font-sans p-6 md:p-10 relative">
      {/* Modal Overlay for Balance Adjustment */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                 Adjust Balance: {selectedUser.name}
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleAdjustBalance} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Asset Currency</label>
                  <select 
                    value={currency} onChange={e => setCurrency(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="USDT">USDT</option>
                    <option value="ETH">ETH</option>
                    <option value="BTC">BTC</option>
                    <option value="SOL">SOL</option>
                    <option value="BNB">BNB</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Adjustment Amount (+/-)</label>
                  <input 
                    type="number" step="any" required placeholder="e.g. 100 or -50"
                    value={delta} onChange={e => setDelta(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">Use negative values to deduct funds.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Audit Reason</label>
                  <input 
                    type="text" required placeholder="e.g. Manual Deposit Credit"
                    value={reason} onChange={e => setReason(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <button type="submit" className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20 transition-all mt-4">
                  Confirm Balance Change
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Shield className="text-indigo-500" /> System Control Panel
            </h1>
            <p className="text-slate-400 mt-1">Manage users, audit deposits, and monitor platform traffic.</p>
          </div>
          <button 
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700"
          >
            Exit to Platform
          </button>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl">
                <Users size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400 font-medium">Registered Users</p>
                <p className="text-2xl font-bold text-white">{users.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <DollarSign size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400 font-medium">Total Deposits (ETH)</p>
                <p className="text-2xl font-bold text-white">{totalVolume.toFixed(4)}</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-xl">
                <Activity size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400 font-medium">Active Sessions</p>
                <p className="text-2xl font-bold text-white">{visitors.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/20 text-purple-400 rounded-xl">
                <Globe size={24} />
              </div>
              <div>
                <p className="text-sm text-slate-400 font-medium">Network Status</p>
                <p className="text-2xl font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span> Online
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grids */}
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Left Column (Users & Deposits) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Users Table */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Platform Users</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-800/80 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-6 py-4 font-medium">Name</th>
                      <th className="px-6 py-4 font-medium">Email</th>
                      <th className="px-6 py-4 font-medium">Phone</th>
                      <th className="px-6 py-4 font-medium">Registered</th>
                      <th className="px-6 py-4 font-medium">Wallet Address</th>
                      <th className="px-6 py-4 font-medium">Balances (USDT/ETH)</th>
                      <th className="px-6 py-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-medium text-white">{u.name}</td>
                        <td className="px-6 py-4 text-slate-400">{u.email}</td>
                        <td className="px-6 py-4 text-slate-400">{u.phone || <span className="text-slate-600 italic">None</span>}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{u.createdAt ? new Date(u.createdAt).toLocaleString() : <span className="text-slate-600 italic">Unknown</span>}</td>
                        <td className="px-6 py-4 font-mono text-xs text-indigo-300">
                          {u.walletAddress ? (
                            <button 
                              onClick={() => handleCopyAddress(u.walletAddress!)}
                              className="flex items-center gap-1.5 hover:text-indigo-200 transition-colors group relative"
                              title={u.walletAddress}
                            >
                              <span>{u.walletAddress.slice(0, 6)}...{u.walletAddress.slice(-4)}</span>
                              {copiedAddress === u.walletAddress ? (
                                <Check size={14} className="text-emerald-400" />
                              ) : (
                                <Copy size={14} className="opacity-50 group-hover:opacity-100" />
                              )}
                            </button>
                          ) : (
                            <span className="text-slate-600">Not connected</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-mono text-sm">
                          <span className="text-emerald-400">${(u.balances?.USDT || 0).toFixed(2)}</span>
                          <span className="text-slate-500 mx-2">|</span>
                          <span className="text-indigo-400">{(u.balances?.ETH || 0).toFixed(4)} ETH</span>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => setSelectedUser(u)}
                            className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-md transition-colors"
                          >
                            <Edit size={14} /> Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deposits Table */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Recent Deposits</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-800/80 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-6 py-4 font-medium">Time</th>
                      <th className="px-6 py-4 font-medium">User</th>
                      <th className="px-6 py-4 font-medium">Amount</th>
                      <th className="px-6 py-4 font-medium">TxHash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {deposits.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {new Date(d.date).toLocaleTimeString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-300">
                          {d.email || d.user.slice(0,6)+'...'}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-400">
                          +{parseFloat(d.amount).toFixed(4)} ETH
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <a href={`https://etherscan.io/tx/${d.hash}`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono">
                            {d.hash.slice(0, 8)}... <ExternalLink size={12} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Withdrawals Table */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Withdrawal Requests</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-800/80 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-6 py-4 font-medium">Time</th>
                      <th className="px-6 py-4 font-medium">User</th>
                      <th className="px-6 py-4 font-medium">Amount & Asset</th>
                      <th className="px-6 py-4 font-medium">Destination</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {withdrawals.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                          No withdrawal requests found.
                        </td>
                      </tr>
                    ) : (
                      withdrawals.map((w, i) => (
                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-400">
                            {new Date(w.date).toLocaleTimeString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-300">
                            {w.email}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-rose-400">
                            -{w.amount} {w.coin}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-400">
                            <div className="flex items-center gap-2">
                              <span title={w.address}>{w.address.slice(0, 6)}...{w.address.slice(-4)}</span>
                              <button onClick={() => handleCopyAddress(w.address)} className="hover:text-indigo-300 transition-colors">
                                {copiedAddress === w.address ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 text-xs font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              {w.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Right Column (Visitor Traffic) */}
          <div className="space-y-8">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm h-full flex flex-col">
              <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Globe size={18} className="text-cyan-400" /> Visitor Traffic
                </h2>
                <span className="text-xs font-medium bg-slate-700 text-slate-300 px-2 py-1 rounded-md">Live</span>
              </div>
              <div className="p-6 flex-1 overflow-y-auto max-h-[600px] space-y-4">
                {visitors.map((v, i) => (
                  <div key={i} className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono text-sm text-indigo-400">{v.ip}</span>
                      <span className="text-xs text-slate-500">{new Date(v.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-300">{v.country}</span>
                      <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-xs font-mono">{v.page}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Blog Posts Section */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={18} className="text-indigo-400" /> Trading Insights Blog
          </h2>
          <p className="text-sm text-slate-400">New posts appear in the Trading Insights section on the main page.</p>
          <form onSubmit={handlePostBlog} className="space-y-3">
            <input type="text" required placeholder="Blog Title" value={blogTitle} onChange={e=>setBlogTitle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
            <input type="text" required placeholder="Short Excerpt" value={blogExcerpt} onChange={e=>setBlogExcerpt(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
            <input type="url" placeholder="Image URL (Optional)" value={blogImage} onChange={e=>setBlogImage(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
            <textarea required placeholder="Full Content..." rows={4} value={blogContent} onChange={e=>setBlogContent(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
            <div className="flex items-center gap-3">
              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold text-white">{editingBlogId ? 'Update' : 'Publish'}</button>
              {editingBlogId && <button type="button" onClick={() => { setEditingBlogId(null); setBlogTitle(''); setBlogExcerpt(''); setBlogContent(''); setBlogImage(''); setBlogStatus(''); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold text-white">Cancel</button>}
              {blogStatus && <span className="text-sm text-slate-400">{blogStatus}</span>}
            </div>
          </form>
          <div className="space-y-2 mt-4">
            <h3 className="text-sm font-bold text-slate-300">Existing Posts</h3>
            {adminBlogs.map(b => (
              <div key={b.id} className="flex items-center justify-between bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-200 truncate">{b.title}</span>
                <div className="flex gap-2">
                  <button onClick={() => handleEditBlog(b)} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                  <button onClick={() => handleDeleteBlog(b.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
