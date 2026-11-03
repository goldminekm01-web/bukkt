import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCyye2hZW5_eKi0jA75SUitQ_r8ck6EgNQ",
  authDomain: "bukkt-c2fa7.firebaseapp.com",
  projectId: "bukkt-c2fa7",
  storageBucket: "bukkt-c2fa7.firebasestorage.app",
  messagingSenderId: "304845409420",
  appId: "1:304845409420:web:f7633b165ecc3dd7d93fa9",
  measurementId: "G-N74LYFCTFD"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

// Analytics only run on client
let analytics = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

export { app, auth, db, analytics };
