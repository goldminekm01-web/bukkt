"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowRight, Activity, Shield, Zap, TrendingUp, CheckCircle, Quote, X } from 'lucide-react';
import SwapModal from '@/components/SwapModal';

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  imageUrl?: string;
}

export default function LandingPage() {
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [selectedBlog, setSelectedBlog] = useState<BlogPost | null>(null);
  const [isAuth, setIsAuth] = useState(false);
  const [isBlogAdmin, setIsBlogAdmin] = useState(false);
  const [showBlogEditor, setShowBlogEditor] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [newBlogTitle, setNewBlogTitle] = useState('');
  const [newBlogExcerpt, setNewBlogExcerpt] = useState('');
  const [newBlogContent, setNewBlogContent] = useState('');
  const [newBlogImage, setNewBlogImage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isEditingBlog, setIsEditingBlog] = useState(false);
  const [editBlogTitle, setEditBlogTitle] = useState('');
  const [editBlogExcerpt, setEditBlogExcerpt] = useState('');
  const [editBlogContent, setEditBlogContent] = useState('');
  const [editBlogImage, setEditBlogImage] = useState('');

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('token');
    const userEmail = localStorage.getItem('user_email');
    if (token) {
      setIsAuth(true);
    }
    if (userEmail === 'blog') {
      setIsBlogAdmin(true);
    }
    
    // Fetch global blogs from Firebase
    const fetchBlogs = async () => {
      try {
        const { db } = await import('@/lib/firebase');
        const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
        const blogsSnap = await getDocs(query(collection(db, 'blogs'), orderBy('date', 'desc')));
        const fetchedBlogs: BlogPost[] = [];
        blogsSnap.forEach((doc) => fetchedBlogs.push({ id: doc.id, ...doc.data() } as BlogPost));
        // Merge locally published blogs (admin)
        const localBlogs: BlogPost[] = JSON.parse(localStorage.getItem('platform_blogs') || '[]');
        const merged = [...localBlogs, ...fetchedBlogs].sort((a,b)=> new Date(b.date).getTime()-new Date(a.date).getTime());
        setBlogs(merged);
      } catch (err) {
        console.error("Failed to fetch blogs from Firebase:", err);
        // Fallback to local
        const storedBlogs = JSON.parse(localStorage.getItem('platform_blogs') || '[]');
        setBlogs(storedBlogs.reverse().slice(0, 5));
      }
    };
    fetchBlogs();
  }, []);

  const handleLogout = async () => {
    try {
      const { auth } = await import('@/lib/firebase');
      await auth.signOut();
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user_email');
    sessionStorage.removeItem('admin_auth');
    setIsAuth(false);
    setIsBlogAdmin(false);
  };

  const handlePostBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { db } = await import('@/lib/firebase');
      const { collection, addDoc } = await import('firebase/firestore');
      
      const blogData = {
        title: newBlogTitle,
        excerpt: newBlogExcerpt,
        content: newBlogContent,
        imageUrl: newBlogImage,
        date: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'blogs'), blogData);
      
      setBlogs([{ id: docRef.id, ...blogData }, ...blogs]);
      setShowBlogEditor(false);
      setNewBlogTitle('');
      setNewBlogExcerpt('');
      setNewBlogContent('');
      setNewBlogImage('');
    } catch (err) {
      console.error("Error adding blog:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBlog) return;
    setIsSubmitting(true);
    try {
      const { db } = await import('@/lib/firebase');
      const { doc, updateDoc } = await import('firebase/firestore');
      
      const updatedData = {
        title: editBlogTitle,
        excerpt: editBlogExcerpt,
        content: editBlogContent,
        imageUrl: editBlogImage,
      };
      
      const blogRef = doc(db, 'blogs', selectedBlog.id);
      await updateDoc(blogRef, updatedData);
      
      // Update local state
      const updatedBlog = { ...selectedBlog, ...updatedData };
      setBlogs(blogs.map(b => b.id === selectedBlog.id ? updatedBlog : b));
      setSelectedBlog(updatedBlog);
      setIsEditingBlog(false);
    } catch (err) {
      console.error("Error updating blog:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-indigo-500/30 flex flex-col">
      <nav className="flex flex-wrap items-center justify-between p-4 md:p-6 max-w-7xl mx-auto w-full sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="text-xl md:text-2xl font-bold tracking-tighter flex items-center gap-2">
          <div className="w-6 h-6 md:w-8 md:h-8 bg-indigo-500 rounded-lg"></div>
          Bukkt
        </div>
        <div className="flex gap-2 md:gap-4 items-center mt-2 sm:mt-0">
          <SwapModal />
          {!isAuth ? (
            <>
              <button onClick={() => setShowAuthModal(true)} className="px-3 py-1.5 md:px-5 md:py-2.5 text-xs md:text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-full transition-colors shadow-lg shadow-indigo-500/20">
                Get Started
              </button>
            </>
          ) : (
            <>
              <Link href="/dashboard" className="px-3 py-1.5 md:px-5 md:py-2.5 text-xs md:text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-full transition-colors shadow-lg shadow-indigo-500/20">
                Dashboard
              </Link>
              <button onClick={handleLogout} className="px-3 py-1.5 md:px-5 md:py-2.5 text-xs md:text-sm font-medium text-slate-300 hover:text-white transition-colors">
                Log Out
              </button>
            </>
          )}
        </div>
      </nav>

      <main className="flex-1 w-full flex flex-col">
        <div className="max-w-7xl mx-auto px-6 py-12 md:py-20 flex flex-col lg:flex-row gap-12 w-full">
          
          {/* Left Column - Main Content */}
          <div className="flex-1 min-w-0">
            <section className="mb-20">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-sm font-semibold mb-8 border border-indigo-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                Platform Live
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
                Trade crypto with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">confidence.</span>
              </h1>
              <p className="text-xl text-slate-400 mb-10 leading-relaxed max-w-2xl">
                The professional grade trading platform featuring real-time charts, advanced order books, and immutable ledger technology.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-4">
                {isAuth ? (
                  <Link href="/dashboard" className="w-full sm:w-auto justify-center inline-flex items-center gap-2 px-6 py-4 md:px-8 bg-white text-slate-900 rounded-full font-bold text-base md:text-lg hover:bg-slate-100 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]">
                    Open Trading Dashboard <ArrowRight size={20} />
                  </Link>
                ) : (
                  <>
                    <button onClick={() => setShowAuthModal(true)} className="w-full sm:w-auto justify-center inline-flex items-center gap-2 px-6 py-4 md:px-8 bg-white text-slate-900 rounded-full font-bold text-base md:text-lg hover:bg-slate-100 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]">
                      Get Started <ArrowRight size={20} />
                    </button>
                  </>
                )}
              </div>
            </section>

            {/* Features Section */}
            <section>
              <h2 className="text-3xl font-bold mb-10">Why Choose Bukkt?</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/60 transition-colors">
                  <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center mb-4">
                    <Activity size={24} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Real-time Market Data</h3>
                  <p className="text-slate-400 leading-relaxed text-sm">Live feeds for order books, trades, and high-performance charting built directly into the UI.</p>
                </div>
                <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/60 transition-colors">
                  <div className="w-12 h-12 bg-cyan-500/20 text-cyan-400 rounded-xl flex items-center justify-center mb-4">
                    <Shield size={24} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Bank-Grade Security</h3>
                  <p className="text-slate-400 leading-relaxed text-sm">Double-entry accounting architecture guarantees absolute precision and auditability.</p>
                </div>
                <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/60 transition-colors">
                  <div className="w-12 h-12 bg-fuchsia-500/20 text-fuchsia-400 rounded-xl flex items-center justify-center mb-4">
                    <Zap size={24} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Web3 Integration</h3>
                  <p className="text-slate-400 leading-relaxed text-sm">Instantly connect via MetaMask and monitor on-chain deposits seamlessly.</p>
                </div>
                <div className="p-6 rounded-2xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-sm hover:bg-slate-800/60 transition-colors">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mb-4">
                    <TrendingUp size={24} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Deep Liquidity</h3>
                  <p className="text-slate-400 leading-relaxed text-sm">Access industry-leading order book depth and ultra-fast execution engine.</p>
                </div>
              </div>
            </section>

            {/* Testimonials */}
            <section className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-8 md:p-12">
              <Quote className="text-indigo-500/50 w-12 h-12 mb-6" />
              <p className="text-2xl md:text-3xl font-medium leading-tight mb-8">
                "Bukkt completely transformed how our institutional desk executes large orders. The interface is clean, the WebSocket feeds are flawless, and the security is unmatched."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-full"></div>
                <div>
                  <h4 className="font-bold text-lg">Akshay Naheta</h4>
                  <p className="text-slate-400 text-sm">Head of Trading, Quantum Capital</p>
                </div>
              </div>
            </section>

          </div>

          {/* Right Column - Blog Sidebar */}
          <aside className="w-full lg:w-[400px] shrink-0">
            <div className="sticky top-28 bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <span className="w-2 h-6 bg-indigo-500 rounded-full block"></span>
                Trading Insights
              </h3>
              
              {isBlogAdmin && (
                <div className="mb-6">
                  {!showBlogEditor ? (
                    <button 
                      onClick={() => setShowBlogEditor(true)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold text-white transition-colors"
                    >
                      + Post New Blog
                    </button>
                  ) : (
                    <form onSubmit={handlePostBlog} className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-4">
                      <div>
                        <input 
                          type="text" required placeholder="Blog Title"
                          value={newBlogTitle} onChange={e => setNewBlogTitle(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <input 
                          type="text" required placeholder="Short Excerpt"
                          value={newBlogExcerpt} onChange={e => setNewBlogExcerpt(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <input 
                          type="url" placeholder="Image URL (Optional)"
                          value={newBlogImage} onChange={e => setNewBlogImage(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <textarea 
                          required placeholder="Full Content..." rows={4}
                          value={newBlogContent} onChange={e => setNewBlogContent(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          type="submit" disabled={isSubmitting}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50"
                        >
                          {isSubmitting ? 'Posting...' : 'Publish'}
                        </button>
                        <button 
                          type="button" onClick={() => setShowBlogEditor(false)}
                          className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
              <div className="space-y-6">
                {blogs.length > 0 ? (
                  blogs.map(blog => (
                    <article 
                      key={blog.id} 
                      onClick={() => {
                        setSelectedBlog(blog);
                        setIsEditingBlog(false);
                      }}
                      className="group cursor-pointer border-b border-slate-700/50 pb-6 last:border-0 last:pb-0"
                    >
                      {blog.imageUrl && (
                        <div className="w-full h-32 mb-3 rounded-lg overflow-hidden bg-slate-800">
                          <img src={blog.imageUrl} alt={blog.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}
                      <time className="text-xs font-medium text-indigo-400 mb-2 block">
                        {new Date(blog.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </time>
                      <h4 className="font-bold text-slate-200 mb-2 group-hover:text-indigo-400 transition-colors leading-snug">
                        {blog.title}
                      </h4>
                      <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">
                        {blog.excerpt}
                      </p>
                      <div className="mt-3 text-xs font-bold text-indigo-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        Read full article <ArrowRight size={12} />
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <p className="text-sm">No insights published yet.</p>
                    <p className="text-xs mt-1">Check back later for market updates.</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

        </div>
      </main>

      {/* Blog Reading Modal */}
      {mounted && selectedBlog && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => {
            setSelectedBlog(null);
            setIsEditingBlog(false);
          }}
        >
          <div
            className="bg-[#151920] border border-slate-700 rounded-2xl w-full max-w-3xl my-auto relative shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              type="button"
              onClick={() => {
                setSelectedBlog(null);
                setIsEditingBlog(false);
              }}
              className="absolute top-4 right-4 z-50 w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer border border-slate-700"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
            <div className="p-8 md:p-12 relative">
              {isBlogAdmin && !isEditingBlog && (
                <button 
                  type="button"
                  onClick={() => {
                    setEditBlogTitle(selectedBlog.title);
                    setEditBlogExcerpt(selectedBlog.excerpt);
                    setEditBlogContent(selectedBlog.content);
                    setEditBlogImage(selectedBlog.imageUrl || '');
                    setIsEditingBlog(true);
                  }}
                  className="absolute top-8 right-16 py-1.5 px-4 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold text-indigo-400 transition-colors z-40"
                >
                  Edit Blog
                </button>
              )}
              
              {!isEditingBlog ? (
                <>
                  <time className="text-sm font-medium text-indigo-400 mb-4 block">
                    {new Date(selectedBlog.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </time>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 leading-tight pr-20">
                    {selectedBlog.title}
                  </h2>
                  {selectedBlog.imageUrl && (
                    <div className="w-full h-64 md:h-96 mb-8 rounded-xl overflow-hidden bg-slate-800">
                      <img src={selectedBlog.imageUrl} alt={selectedBlog.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="prose prose-invert prose-indigo max-w-none font-sans whitespace-pre-wrap leading-relaxed text-slate-300">
                    {selectedBlog.content}
                  </div>
                </>
              ) : (
                <form onSubmit={handleUpdateBlog} className="space-y-4">
                  <h2 className="text-2xl font-bold text-white mb-4">Edit Blog</h2>
                  <div>
                    <input 
                      type="text" required placeholder="Blog Title"
                      value={editBlogTitle} onChange={e => setEditBlogTitle(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <input 
                      type="text" required placeholder="Short Excerpt"
                      value={editBlogExcerpt} onChange={e => setEditBlogExcerpt(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <input 
                      type="url" placeholder="Image URL (Optional)"
                      value={editBlogImage} onChange={e => setEditBlogImage(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <textarea 
                      required placeholder="Full Content..." rows={10}
                      value={editBlogContent} onChange={e => setEditBlogContent(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <button 
                      type="submit" disabled={isSubmitting}
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button 
                      type="button" onClick={() => setIsEditingBlog(false)}
                      className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="text-xl font-bold tracking-tighter flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-indigo-500 rounded-lg"></div>
                Bukkt
              </div>
              <p className="text-slate-400 text-sm">Professional cryptocurrency trading infrastructure for the modern era.</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="/dashboard" className="hover:text-white transition-colors">Exchange</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Markets</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">API Documentation</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="#" className="hover:text-white transition-colors">About Us</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Careers</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Security</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="#" className="hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Cookie Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-800 text-sm text-slate-500 flex flex-col md:flex-row justify-between items-center gap-4">
            <p>© {new Date().getFullYear()} Bukkt. All rights reserved.</p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              All systems operational
            </div>
          </div>
        </div>
      </footer>

      {/* Auth Choice Modal */}
      {mounted && showAuthModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowAuthModal(false)}>
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white text-center">Welcome to Bukkt</h2>
              <p className="text-slate-400 text-sm text-center mt-1">Sign in to start trading or create a new account</p>
            </div>
            <div className="p-6 flex flex-col gap-3">
              <Link
                href="/login"
                className="w-full text-center px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors"
                onClick={() => setShowAuthModal(false)}
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="w-full text-center px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold rounded-xl transition-colors"
                onClick={() => setShowAuthModal(false)}
              >
                Create Account
              </Link>
              <button
                onClick={() => setShowAuthModal(false)}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors pt-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
