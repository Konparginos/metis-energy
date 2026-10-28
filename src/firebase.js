import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Web config is public by design; access is enforced by Auth + firestore.rules.
const app = initializeApp({
  apiKey: 'AIzaSyAu4cNjq7CKOO-MiL5FQoS6H0QiY6edBvg',
  authDomain: 'metis-energy.firebaseapp.com',
  projectId: 'metis-energy',
  storageBucket: 'metis-energy.firebasestorage.app',
  messagingSenderId: '894241983753',
  appId: '1:894241983753:web:225efe814a285c7978d7d8',
});
// ponytail: no Analytics until there is a cookie-consent banner (GDPR).

export const auth = getAuth(app);
export const db = getFirestore(app);
export const call = (name) => httpsCallable(getFunctions(app, 'europe-west1'), name);
