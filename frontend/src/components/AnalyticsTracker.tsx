"use client";

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    // Avoid strict mode double-firing but allow route changes to be tracked
    if (lastTrackedPathRef.current === pathname) return;
    lastTrackedPathRef.current = pathname;

    const trackVisitor = async () => {
      try {
        let ip = 'Unknown';
        let country = 'Unknown';
        let city = 'Unknown';
        let region = 'Unknown';

        // Try primary IP service (less likely to be rate-limited)
        try {
          const res = await fetch('https://ipwho.is/');
          const data = await res.json();
          if (data.success) {
            ip = data.ip;
            country = data.country;
            city = data.city || 'Unknown';
            region = data.region || 'Unknown';
          } else {
            throw new Error('Fallback');
          }
        } catch (err) {
          // Fallback to secondary IP service
          try {
            const res2 = await fetch('https://freeipapi.com/api/json');
            const data2 = await res2.json();
            ip = data2.ipAddress || 'Unknown';
            country = data2.countryName || 'Unknown';
            city = data2.cityName || 'Unknown';
            region = data2.regionName || 'Unknown';
          } catch (err2) {
            // Final fallback
            try {
              const res3 = await fetch('https://api.ipify.org?format=json');
              const data3 = await res3.json();
              ip = data3.ip || 'Unknown';
            } catch (err3) {
              console.warn("IP tracking blocked by client");
            }
          }
        }
        
        const visit = {
          ip,
          country,
          city,
          region,
          page: pathname || '/',
          timestamp: new Date().toISOString(),
        };

        // Write to Firestore
        const { db } = await import('@/lib/firebase');
        const { collection, addDoc } = await import('firebase/firestore');
        await addDoc(collection(db, 'visitors'), visit);
        
      } catch (e) {
        // Silently fail if adblocker blocks analytics completely
      }
    };

    trackVisitor();
  }, [pathname]);

  return null;
}
