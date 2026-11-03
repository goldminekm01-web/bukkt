"use client";

import { useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

export default function FirebaseSync() {
  useEffect(() => {
    const handleSync = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return; // Not logged in

        const users = JSON.parse(localStorage.getItem('platform_users') || '[]');
        const userLoc = users.find((u: any) => u.id === currentUser.uid);

        if (userLoc) {
          // Push local storage updates up to Firestore
          const userRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(userRef);
          
          if (docSnap.exists()) {
            await updateDoc(userRef, {
              balance: userLoc.balance || {},
              walletAddress: userLoc.walletAddress || '',
              btCWelcomeGrantClaimed: !!userLoc.btCWelcomeGrantClaimed,
              pendingKshSwaps: userLoc.pendingKshSwaps || []
            });
          }
        }
      } catch (e) {
        console.error("Failed to sync to Firebase", e);
      }
    };

    // Listen to our custom platform events
    window.addEventListener('balanceUpdated', handleSync);
    
    return () => {
      window.removeEventListener('balanceUpdated', handleSync);
    };
  }, []);

  return null; // Headless component
}
