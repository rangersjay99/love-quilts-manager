// Love Quilts Manager — Firebase live-sync test
// Copyright © 2026 Jay. Personal and authorized guild use only.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAEeRbEwPAFdAy96xG6hxnFTQDjxSo5QIE',
  authDomain: 'faithful-circle-love-quilts.firebaseapp.com',
  projectId: 'faithful-circle-love-quilts',
  storageBucket: 'faithful-circle-love-quilts.firebasestorage.app',
  messagingSenderId: '730320654272',
  appId: '1:730320654272:web:9ef0ea1cd380fb053f8225'
};

const TEST_ORG_ID = 'faithful-circle-love-quilts-test';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // Memory cache only for the first sync test.

const orgRef = doc(db, 'organizations', TEST_ORG_ID);
const settingsRef = doc(db, 'organizations', TEST_ORG_ID, 'settings', 'main');
const transactionsRef = collection(db, 'organizations', TEST_ORG_ID, 'transactions');
const needsRef = collection(db, 'organizations', TEST_ORG_ID, 'needs');

let unsubscribe = [];
let currentUser = null;
let saveTimer = null;
let pendingSave = null;
let syncing = false;
let applyingRemote = false;
let initialCloudReady = false;
let seedRequested = false;
let remoteApplyTimer = null;
let remote = {
  settings: null,
  transactions: [],
  needs: [],
  settingsReady: false,
  transactionsReady: false,
  needsReady: false,
  settingsPending: false,
  transactionsPending: false,
  needsPending: false
};
let lastRemoteData = null;

const byId = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => JSON.stringify(value);
const cleanString = value => String(value ?? '');

function setState(message, kind = 'normal') {
  window.lqFirebaseState = { message, kind, email: currentUser?.email || '' };
  const banner = byId('firebaseBannerStatus');
  if (banner) banner.textContent = currentUser ? `${message} · ${currentUser.email}` : message;
  const account = byId('firebaseAccountStatus');
  if (account) account.textContent = currentUser?.email || 'Not signed in';
  if (typeof window.lqRefreshSaveStatus === 'function') window.lqRefreshSaveStatus();
}

function showNotice(id, message, good = false) {
  const box = byId(id);
  if (!box) return;
  box.textContent = message;
  box.className = `notice show${good ? ' good' : ''}`;
  clearTimeout(box.noticeTimer);
  box.noticeTimer = setTimeout(() => { box.className = 'notice'; }, 6000);
}

function waitForBridge() {
  return new Promise(resolve => {
    if (typeof window.lqGetData === 'function' && typeof window.lqApplyRemoteData === 'function') {
      resolve();
      return;
    }
    const timer = setInterval(() => {
      if (typeof window.lqGetData === 'function' && typeof window.lqApplyRemoteData === 'function') {
        clearInterval(timer);
        resolve();
      }
    }, 40);
  });
}

function normalizeSettings(source = {}) {
  return {
    orgName: cleanString(source.orgName || 'Faithful Circle Quilters'),
    appName: cleanString(source.appName || 'Love Quilts Manager'),
    itemName: cleanString(source.itemName || 'Love Quilts'),
    splashTag: cleanString(source.splashTag || ''),
    splashMessage: cleanString(source.splashMessage || ''),
    charities: Array.isArray(source.charities) ? source.charities.map(cleanString) : [],
    sizes: Array.isArray(source.sizes) ? source.sizes.map(cleanString) : []
  };
}

function normalizeTransaction(source = {}) {
  return {
    id: cleanString(source.id),
    date: cleanString(source.date),
    type: ['IN', 'OUT', 'ADJUST'].includes(source.type) ? source.type : 'IN',
    charity: cleanString(source.charity),
    size: cleanString(source.size),
    qty: Math.max(1, Number(source.qty || 1)),
    adjustment: Number(source.adjustment || 0),
    note: cleanString(source.note || '')
  };
}

function normalizeNeed(source = {}) {
  return {
    id: cleanString(source.id),
    month: cleanString(source.month),
    charity: cleanString(source.charity),
    size: cleanString(source.size),
    qty: Math.max(1, Number(source.qty || 1)),
    note: cleanString(source.note || '')
  };
}

function normalizeAppData(source = {}) {
  const settings = normalizeSettings(source);
  return {
    ...settings,
    transactions: Array.isArray(source.transactions) ? source.transactions.map(normalizeTransaction).filter(x => x.id) : [],
    needs: Array.isArray(source.needs) ? source.needs.map(normalizeNeed).filter(x => x.id) : []
  };
}

function composeRemoteData() {
  const fallback = typeof window.lqGetData === 'function' ? normalizeSettings(window.lqGetData()) : normalizeSettings();
  return {
    ...(remote.settings ? normalizeSettings(remote.settings) : fallback),
    transactions: remote.transactions.map(normalizeTransaction).filter(x => x.id),
    needs: remote.needs.map(normalizeNeed).filter(x => x.id)
  };
}

function allRemoteReady() {
  return remote.settingsReady && remote.transactionsReady && remote.needsReady;
}

function hasPendingWrites() {
  return remote.settingsPending || remote.transactionsPending || remote.needsPending;
}

function scheduleRemoteApply(reason = 'a Firebase update') {
  if (!allRemoteReady() || hasPendingWrites()) return;
  clearTimeout(remoteApplyTimer);
  remoteApplyTimer = setTimeout(async () => {
    await waitForBridge();
    const cloudData = normalizeAppData(composeRemoteData());
    lastRemoteData = clone(cloudData);
    initialCloudReady = true;

    const cloudIsEmpty = !remote.settings && cloudData.transactions.length === 0 && cloudData.needs.length === 0;
    if (cloudIsEmpty && !seedRequested) {
      seedRequested = true;
      const emptyTestData = normalizeAppData(window.lqGetData());
      pendingSave = { data: emptyTestData, reason: 'Created empty Firebase test database', force: true };
      setState('Creating empty test database…');
      await flushSave();
      return;
    }

    if (syncing || pendingSave) return;
    const localData = normalizeAppData(window.lqGetData());
    if (stable(localData) !== stable(cloudData)) {
      applyingRemote = true;
      window.lqApplyRemoteData(cloudData, reason);
      applyingRemote = false;
      setState('Cloud update received');
    } else {
      setState('All test changes synced');
    }
  }, 120);
}

function stopRealtime() {
  unsubscribe.forEach(fn => {
    try { fn(); } catch { /* no-op */ }
  });
  unsubscribe = [];
  remote = {
    settings: null,
    transactions: [],
    needs: [],
    settingsReady: false,
    transactionsReady: false,
    needsReady: false,
    settingsPending: false,
    transactionsPending: false,
    needsPending: false
  };
  lastRemoteData = null;
  initialCloudReady = false;
  seedRequested = false;
}

function handleFirestoreError(error) {
  console.error('Firebase sync error:', error);
  const code = error?.code || '';
  if (code.includes('permission-denied')) {
    setState('Access blocked by Firestore rules', 'error');
    showNotice('firebaseSettingsNotice', 'Firestore denied access. Recheck that both UIDs were published in the Rules tab.');
  } else {
    setState('Firebase connection error', 'error');
    showNotice('firebaseSettingsNotice', 'Firebase could not connect. Check the internet connection and try again.');
  }
}

function startRealtime() {
  stopRealtime();
  setState('Connecting to Firebase…');

  unsubscribe.push(onSnapshot(settingsRef, { includeMetadataChanges: true }, snapshot => {
    remote.settings = snapshot.exists() ? snapshot.data() : null;
    remote.settingsReady = true;
    remote.settingsPending = snapshot.metadata.hasPendingWrites;
    scheduleRemoteApply('a Firebase settings update');
  }, handleFirestoreError));

  unsubscribe.push(onSnapshot(transactionsRef, { includeMetadataChanges: true }, snapshot => {
    remote.transactions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    remote.transactionsReady = true;
    remote.transactionsPending = snapshot.metadata.hasPendingWrites;
    scheduleRemoteApply('a Firebase inventory update');
  }, handleFirestoreError));

  unsubscribe.push(onSnapshot(needsRef, { includeMetadataChanges: true }, snapshot => {
    remote.needs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    remote.needsReady = true;
    remote.needsPending = snapshot.metadata.hasPendingWrites;
    scheduleRemoteApply('a Firebase needs update');
  }, handleFirestoreError));
}

function mapById(items = []) {
  return new Map(items.map(item => [item.id, item]));
}

function addDiffOperations(operations, collectionName, localItems, remoteItems) {
  const localMap = mapById(localItems);
  const remoteMap = mapById(remoteItems);

  for (const [id, item] of localMap) {
    const previous = remoteMap.get(id);
    if (!previous || stable(item) !== stable(previous)) {
      operations.push({ type: 'set', ref: doc(db, 'organizations', TEST_ORG_ID, collectionName, id), data: item });
    }
  }
  for (const id of remoteMap.keys()) {
    if (!localMap.has(id)) {
      operations.push({ type: 'delete', ref: doc(db, 'organizations', TEST_ORG_ID, collectionName, id) });
    }
  }
}

async function commitOperations(operations) {
  const chunkSize = 400;
  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + chunkSize)) {
      if (operation.type === 'set') batch.set(operation.ref, operation.data);
      else batch.delete(operation.ref);
    }
    await batch.commit();
  }
}

async function flushSave() {
  if (syncing || !pendingSave || !currentUser || !initialCloudReady) return;
  const task = pendingSave;
  pendingSave = null;
  syncing = true;
  setState('Saving test changes…');

  try {
    const localData = normalizeAppData(task.data);
    const baseline = lastRemoteData || normalizeAppData({});
    const operations = [];
    const localSettings = normalizeSettings(localData);
    const oldSettings = normalizeSettings(baseline);

    if (task.force || stable(localSettings) !== stable(oldSettings)) {
      operations.push({
        type: 'set',
        ref: settingsRef,
        data: {
          ...localSettings,
          schemaVersion: 1,
          updatedAt: serverTimestamp(),
          updatedByUid: currentUser.uid,
          updatedByEmail: currentUser.email || '',
          lastReason: task.reason || 'Saved from Love Quilts Manager'
        }
      });
    }

    addDiffOperations(operations, 'transactions', localData.transactions, baseline.transactions);
    addDiffOperations(operations, 'needs', localData.needs, baseline.needs);

    operations.push({
      type: 'set',
      ref: orgRef,
      data: {
        testMode: true,
        schemaVersion: 1,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedByUid: currentUser.uid,
        lastUpdatedByEmail: currentUser.email || '',
        lastReason: task.reason || 'Saved from Love Quilts Manager'
      }
    });

    await commitOperations(operations);
    lastRemoteData = clone(localData);
    setState('All test changes synced');
  } catch (error) {
    console.error('Could not save Firebase test data:', error);
    if (error?.code === 'permission-denied') {
      pendingSave = null;
      setState('Save blocked by Firestore rules', 'error');
      showNotice('firebaseSettingsNotice', 'The save was blocked. Recheck the published Firestore Rules and the two account UIDs.');
    } else {
      pendingSave = task;
      setState(navigator.onLine ? 'Firebase save failed — retrying' : 'Offline — saved on this device', 'error');
      showNotice('firebaseSettingsNotice', 'The local test copy is safe. Firebase will retry after the connection is restored.');
    }
  } finally {
    syncing = false;
    if (pendingSave) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 1000);
    } else {
      scheduleRemoteApply('a completed Firebase sync');
    }
  }
}

window.lqFirebaseQueueSave = (snapshot, reason = 'Saved from Love Quilts Manager') => {
  if (applyingRemote) return;
  pendingSave = { data: normalizeAppData(snapshot), reason, force: false };
  if (!currentUser) {
    setState('Sign in to sync test changes');
    return;
  }
  setState(navigator.onLine ? 'Waiting to sync…' : 'Offline — saved on this device');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 350);
};

window.lqFirebaseForceSync = () => {
  if (!currentUser) {
    showNotice('firebaseSettingsNotice', 'Sign in before syncing.');
    return;
  }
  if (typeof window.lqGetData !== 'function') return;
  pendingSave = { data: normalizeAppData(window.lqGetData()), reason: 'Manual Sync Now', force: true };
  flushSave();
};

window.lqFirebaseSignOut = async () => {
  try {
    await signOut(auth);
    showNotice('firebaseSettingsNotice', 'Signed out.', true);
  } catch (error) {
    console.error(error);
    showNotice('firebaseSettingsNotice', 'Could not sign out.');
  }
};

function readableAuthError(error) {
  const code = error?.code || '';
  if (code.includes('invalid-credential')) return 'The email or password is not correct.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a little and try again.';
  if (code.includes('network-request-failed')) return 'No connection to Firebase. Check the internet connection.';
  if (code.includes('unauthorized-domain')) return 'This GitHub Pages address must be added to Firebase Authentication authorized domains.';
  return 'Sign-in failed. Check the email, password, and Firebase setup.';
}

async function handleLogin(event) {
  event.preventDefault();
  const email = byId('firebaseEmail')?.value.trim() || '';
  const password = byId('firebasePassword')?.value || '';
  const button = byId('firebaseLoginBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Signing In…';
  }
  showNotice('firebaseLoginNotice', 'Connecting…', true);
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    if (byId('firebasePassword')) byId('firebasePassword').value = '';
  } catch (error) {
    console.error('Firebase sign-in error:', error);
    showNotice('firebaseLoginNotice', readableAuthError(error));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Sign In';
    }
  }
}

window.addEventListener('online', () => {
  if (pendingSave) flushSave();
  else if (currentUser) setState('Online — Firebase connected');
});
window.addEventListener('offline', () => {
  if (currentUser) setState('Offline — changes stay on this device');
});

document.addEventListener('DOMContentLoaded', () => {
  const form = byId('firebaseLoginForm');
  if (form) form.addEventListener('submit', handleLogin);
  setState('Waiting for sign-in');
});

onAuthStateChanged(auth, async user => {
  currentUser = user || null;
  const gate = byId('firebaseGate');
  if (!user) {
    stopRealtime();
    if (gate) gate.classList.remove('hidden');
    setState('Waiting for sign-in');
    return;
  }

  if (gate) gate.classList.add('hidden');
  setState('Signed in — loading shared test data');
  await waitForBridge();
  startRealtime();
});
