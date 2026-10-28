// One-off: make an existing user a Metis admin.
// Usage: gcloud auth application-default login, then  node set-admin.js someone@metis.gr
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const email = process.argv[2];
if (!email) { console.error('Usage: node set-admin.js <email>'); process.exit(1); }
initializeApp({ projectId: 'metis-energy' });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
await getFirestore().doc(`admins/${user.uid}`).set({ email });
console.log(`${email} is now an admin. They must sign out and in again.`);
