"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (email && password) {
        const adminUsername = process.env.NEXT_PUBLIC_ADMIN_USERNAME || '';
        const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '';

        if (email === adminUsername && adminPassword && adminPassword !== '' && password === adminPassword) {
          // Special System Admin User
          sessionStorage.setItem('admin_auth', 'true');
          localStorage.setItem("token", "admin_token");
          localStorage.setItem("user_email", adminUsername);
          router.push("/admin");
          return;
        }

        if (email === 'blog') {
          // Special Blog Admin User
          localStorage.setItem("token", "blog_admin");
          localStorage.setItem("user_email", "blog");
          router.push("/");
          return;
        }

        let userId: string | null = null;
        let userMail = email;

        try {
          const { auth, db } = await import("@/lib/firebase");
          const { signInWithEmailAndPassword } = await import("firebase/auth");
          const { doc, getDoc, setDoc } = await import("firebase/firestore");
          
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          if (userCredential && userCredential.user) {
            userId = userCredential.user.uid;
            userMail = userCredential.user.email || email;

            try {
              const userDoc = await getDoc(doc(db, "users", userId));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                const existingUsers = JSON.parse(localStorage.getItem('platform_users') || '[]');
                const uIdx = existingUsers.findIndex((u: any) => u.id === userId);
                if (uIdx !== -1) existingUsers[uIdx] = { ...existingUsers[uIdx], ...userData };
                else existingUsers.push(userData);
                localStorage.setItem('platform_users', JSON.stringify(existingUsers));
              }
            } catch (docErr) {
              console.warn("Firestore getDoc warning:", docErr);
            }
          }
        } catch (firebaseErr: any) {
          console.warn("Firebase signin error, checking local store:", firebaseErr);
        }

        // Check local platform_users
        const existingUsers = JSON.parse(localStorage.getItem('platform_users') || '[]');
        const localUser = existingUsers.find((u: any) => u.email && u.email.toLowerCase() === email.toLowerCase());

        if (userId || localUser) {
          const activeId = userId || (localUser ? localUser.id : "usr_" + Date.now());
          localStorage.setItem("token", activeId);
          localStorage.setItem("user_email", userMail);
          router.push("/dashboard");
        } else {
          setError("Invalid email or password.");
        }
      } else {
        throw new Error("Please enter both email and password.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during sign in.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to Bukkt
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address or Username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign in
            </button>
          </div>
        </form>
        <div className="text-center text-sm">
          <Link href="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Don&apos;t have an account? Register
          </Link>
        </div>
      </div>
    </div>
  );
}
