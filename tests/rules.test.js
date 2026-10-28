// Firestore rules checks. Run with: npm run test:rules (starts the emulator).
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';

let env;
const as = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const alice = () => as('alice', { cid: 'A', role: 'analyst' });
const vic = () => as('vic', { cid: 'A', role: 'viewer' });
const bob = () => as('bob', { cid: 'B', role: 'owner' });
const anon = () => env.unauthenticatedContext().firestore();
const seed = (fn) => env.withSecurityRulesDisabled((c) => fn(c.firestore()));

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-metis', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
  await seed(async (db) => {
    await setDoc(doc(db, 'settings/app'), { authRequired: true });
    await setDoc(doc(db, 'companies/A'), { name: 'A', modules: { market: true, cost: true, signal: false, advisory: true }, validUntil: null });
    await setDoc(doc(db, 'companies/B'), { name: 'B', modules: { market: false, cost: true }, validUntil: null });
    await setDoc(doc(db, 'companies/A/profiles/p1'), { createdBy: 'alice' });
    await setDoc(doc(db, 'companies/A/requests/r1'), { title: 'x', status: 'open', createdBy: 'alice', thread: [{ side: 'client', text: 'hi' }] });
    await setDoc(doc(db, 'market/ipto/months/2026-10'), { days: {} });
    await setDoc(doc(db, 'series/ttf'), { licence: 'derived', points: {} });
    await setDoc(doc(db, 'series/eua'), { licence: 'display', points: {} });
    await setDoc(doc(db, 'signals/s1'), { signal: 'buy' });
    await setDoc(doc(db, 'secrets/entsoe'), { value: 'x' });
  });
});
after(() => env.cleanup());

test('signed-out visitors see only public settings and texts', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'settings/app')));
  await assertSucceeds(getDoc(doc(anon(), 'content/privacy')));
  await assertFails(getDoc(doc(anon(), 'companies/A')));
  await assertFails(setDoc(doc(anon(), 'settings/app'), { authRequired: false }));
});

test('companies are isolated from each other', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'companies/A')));
  await assertFails(getDoc(doc(alice(), 'companies/B')));
  await assertFails(getDoc(doc(bob(), 'companies/A/profiles/p1')));
  await assertFails(getDoc(doc(bob(), 'companies/A/requests/r1')));
});

test('clients cannot change their own subscription', async () => {
  await assertFails(updateDoc(doc(alice(), 'companies/A'), { 'modules.signal': true }));
  await assertFails(setDoc(doc(alice(), 'companies/A/members/alice'), { role: 'owner' }));
});

test('analysts save profiles, viewers only read', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'companies/A/profiles/p2'), { createdBy: 'alice' }));
  await assertFails(setDoc(doc(alice(), 'companies/A/profiles/p3'), { createdBy: 'someone-else' }));
  await assertSucceeds(getDoc(doc(vic(), 'companies/A/profiles/p1')));
  await assertFails(setDoc(doc(vic(), 'companies/A/profiles/p4'), { createdBy: 'vic' }));
});

test('modules gate market data and signals', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'market/ipto/months/2026-10')));
  await assertFails(getDoc(doc(bob(), 'market/ipto/months/2026-10')));
  await assertFails(getDoc(doc(alice(), 'signals/s1')));
});

test('licensed series: display yes, derived never', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'series/eua')));
  await assertFails(getDoc(doc(alice(), 'series/ttf')));
});

test('secrets cannot be read or set by clients', async () => {
  await assertFails(getDoc(doc(alice(), 'secrets/entsoe')));
  await assertFails(setDoc(doc(alice(), 'secrets/entsoe'), { value: 'y' }));
});

test('advisory: clients may only append to the thread', async () => {
  await assertSucceeds(updateDoc(doc(alice(), 'companies/A/requests/r1'), { thread: arrayUnion({ side: 'client', text: 'more' }) }));
  await assertFails(updateDoc(doc(alice(), 'companies/A/requests/r1'), { status: 'closed' }));
  await assertFails(updateDoc(doc(vic(), 'companies/A/requests/r1'), { thread: arrayUnion({ side: 'client', text: 'viewer' }) }));
});

test('an expired subscription locks the modules', async () => {
  await seed((db) => updateDoc(doc(db, 'companies/A'), { validUntil: Timestamp.fromDate(new Date('2020-01-01')) }));
  await assertFails(getDoc(doc(alice(), 'market/ipto/months/2026-10')));
  await seed((db) => updateDoc(doc(db, 'companies/A'), { validUntil: null }));
});

test('test mode (login off) opens everything, as intended until launch', async () => {
  await seed((db) => setDoc(doc(db, 'settings/app'), { authRequired: false }));
  await assertSucceeds(getDoc(doc(anon(), 'companies/A')));
  await seed((db) => setDoc(doc(db, 'settings/app'), { authRequired: true }));
});
