// Firebase + native bridge. Bundled by esbuild into www/vendor/cloud.js (global: Cloud).
// Firestore paths are exactly the Windows app's:  users/{uid}/bills/{id} · users/{uid}/data/settings · users/{uid}/data/contacts
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, signInWithCredential, signInWithPopup, onAuthStateChanged, signOut,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, collection, onSnapshot, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Same project as the Windows app (these values are already public in its config.json).
const firebaseConfig = {
  apiKey: 'AIzaSyDcvQEkEuCqagBXMR0XdpYXqbDLFugRQ_Y',
  authDomain: 'billing-app-70f4f.firebaseapp.com',
  projectId: 'billing-app-70f4f',
  storageBucket: 'billing-app-70f4f.firebasestorage.app',
  messagingSenderId: '5472017689',
  appId: '1:5472017689:web:afc6825acf1edede9c7988',
};

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver });
// Local cache = the app works offline; writes made offline are sent automatically when the network returns.
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }) });

const isNative = () => Capacitor.isNativePlatform();
const strip = d => { const o = Object.assign({}, d); delete o.updatedAt; return o; };

export function onAuth(cb) { return onAuthStateChanged(auth, cb); }
export const currentUser = () => auth.currentUser;

export async function signIn() {
  if (isNative()) {
    const r = await FirebaseAuthentication.signInWithGoogle();          // skipNativeAuth: true -> we finish in the JS SDK
    const idToken = r && r.credential && r.credential.idToken;
    if (!idToken) throw new Error('Google did not return a token. Check the SHA-1 / google-services.json setup.');
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken, (r.credential && r.credential.accessToken) || null));
  } else {
    await signInWithPopup(auth, new GoogleAuthProvider());               // desktop-browser testing only
  }
}
export async function logout() {
  if (isNative()) { try { await FirebaseAuthentication.signOut(); } catch (e) {} }
  await signOut(auth);
}

// ── live subscriptions ───────────────────────────────────────────────────────
export function watchBills(uid, cb, onErr) {
  return onSnapshot(collection(db, 'users', uid, 'bills'), { includeMetadataChanges: true }, snap => {
    cb(snap.docs.map(d => Object.assign(strip(d.data()), { id: d.data().id || d.id, _pending: d.metadata.hasPendingWrites })),
       { fromCache: snap.metadata.fromCache, pending: snap.docs.some(d => d.metadata.hasPendingWrites) });
  }, onErr);
}
export function watchSettings(uid, cb, onErr) {
  return onSnapshot(doc(db, 'users', uid, 'data', 'settings'), s => cb(s.exists() ? strip(s.data()) : {}), onErr);
}
export function watchContacts(uid, cb, onErr) {
  return onSnapshot(doc(db, 'users', uid, 'data', 'contacts'), s => cb(s.exists() ? (s.data().data || {}) : {}), onErr);
}

// ── writes (merge, so fields the Windows app owns are never wiped) ───────────
// Not awaited by the UI: offline, the promise only settles once the server confirms.
export const saveBill = (uid, bill) => setDoc(doc(db, 'users', uid, 'bills', bill.id), Object.assign({}, bill, { updatedAt: serverTimestamp() }), { merge: true });
export const deleteBill = (uid, id) => deleteDoc(doc(db, 'users', uid, 'bills', id));
export const saveSettings = (uid, patch) => setDoc(doc(db, 'users', uid, 'data', 'settings'), Object.assign({}, patch, { updatedAt: serverTimestamp() }), { merge: true });
export const saveContacts = (uid, map) => setDoc(doc(db, 'users', uid, 'data', 'contacts'), { data: map, updatedAt: serverTimestamp() }, { merge: true });

// ── share a file through the Android share sheet (falls back to a download in a browser) ──
export async function shareFile(name, data, { base64 = false, title } = {}) {
  if (!isNative()) {
    const blob = base64 ? new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))]) : new Blob([data]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); return;
  }
  const f = await Filesystem.writeFile(base64 ? { path: name, data, directory: Directory.Cache } : { path: name, data, directory: Directory.Cache, encoding: 'utf8' });
  await Share.share({ title: title || name, url: f.uri, dialogTitle: title || 'Share' });
}
export { isNative };
