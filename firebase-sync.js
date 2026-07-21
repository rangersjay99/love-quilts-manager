// Love Quilts Manager — Firebase production live sync
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

const ORG_ID = 'faithful-circle-love-quilts';
const PENDING_KEY = 'love_quilts_firebase_pending_v1';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const orgRef = doc(db, 'organizations', ORG_ID);
const settingsRef = doc(db, 'organizations', ORG_ID, 'settings', 'main');
const transactionsRef = collection(db, 'organizations', ORG_ID, 'transactions');
const needsRef = collection(db, 'organizations', ORG_ID, 'needs');

let unsubscribe = [];
let currentUser = null;
let saveTimer = null;
let pendingSave = null;
let syncing = false;
let applyingRemote = false;
let initialCloudReady = false;
let cloudInitialized = false;
let remoteApplyTimer = null;
let remote = blankRemote();
let lastRemoteData = null;
let authStateResolved = false;

const byId = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => JSON.stringify(value);
const cleanString = value => String(value ?? '');
pendingSave = loadPendingSave();

function blankRemote() {
  return {
    org: null,
    settings: null,
    transactions: [],
    needs: [],
    orgReady: false,
    settingsReady: false,
    transactionsReady: false,
    needsReady: false,
    orgPending: false,
    settingsPending: false,
    transactionsPending: false,
    needsPending: false,
    orgFromCache: true,
    settingsFromCache: true,
    transactionsFromCache: true,
    needsFromCache: true
  };
}

function safeParse(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function loadPendingSave() {
  const saved = safeParse(localStorage.getItem(PENDING_KEY));
  if (!saved || !saved.data) return null;
  return {
    data: saved.data,
    reason: cleanString(saved.reason || 'Saved while offline'),
    force: !!saved.force,
    initialize: !!saved.initialize
  };
}

function persistPendingSave() {
  try {
    if (pendingSave) localStorage.setItem(PENDING_KEY, JSON.stringify(pendingSave));
    else localStorage.removeItem(PENDING_KEY);
  } catch (error) {
    console.warn('Could not store pending Firebase save.', error);
  }
}

function showGate(mode = 'signin', message = '') {
  const gate = byId('firebaseGate');
  const signIn = byId('firebaseSignInPanel');
  const loading = byId('firebaseLoadingPanel');
  const loadingStatus = byId('firebaseLoadingStatus');
  if (gate) gate.classList.remove('hidden');
  if (signIn) signIn.style.display = mode === 'signin' ? 'block' : 'none';
  if (loading) loading.style.display = mode === 'loading' ? 'block' : 'none';
  if (loadingStatus && message) loadingStatus.textContent = message;
}

function releaseGate() {
  const gate = byId('firebaseGate');
  if (gate) gate.classList.add('hidden');
}

function setState(message, kind = 'normal') {
  const verified = message === 'All changes synced';
  const displayMessage = verified ? '✓ Shared data verified · All changes synced' : message;
  const previous = window.lqFirebaseState || {};
  window.lqFirebaseState = {message:displayMessage,rawMessage:message,kind,email:currentUser?.email || '',verified,verifiedAt:verified?new Date().toISOString():(previous.verifiedAt||'')};
  const banner = byId('firebaseBannerStatus');
  if (banner) banner.textContent = currentUser ? `${displayMessage} · ${currentUser.email}` : displayMessage;
  const account = byId('firebaseAccountStatus');
  if (account) account.textContent = currentUser?.email || 'Not signed in';
  const loadingStatus = byId('firebaseLoadingStatus');
  if (loadingStatus && !byId('firebaseGate')?.classList.contains('hidden')) loadingStatus.textContent = displayMessage;
  if (typeof window.lqRefreshSaveStatus === 'function') window.lqRefreshSaveStatus();
}

function showNotice(id, message, good = false) {
  const box = byId(id);
  if (!box) return;
  box.textContent = message;
  box.className = `notice show${good ? ' good' : ''}`;
  clearTimeout(box.noticeTimer);
  box.noticeTimer = setTimeout(() => { box.className = 'notice'; }, 7000);
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
    reportTitle: cleanString(source.reportTitle || ''),
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
    note: cleanString(source.note || ''),
    createdBy: cleanString(source.createdBy || ''),
    createdAt: cleanString(source.createdAt || ''),
    updatedBy: cleanString(source.updatedBy || ''),
    updatedAt: cleanString(source.updatedAt || '')
  };
}

function normalizeNeed(source = {}) {
  const qty = Math.max(1, Math.floor(Number(source.qty || 1)));
  const fulfilledQty = Math.max(0, Math.min(qty, Math.floor(Number(source.fulfilledQty || 0))));
  return {
    id: cleanString(source.id),
    month: cleanString(source.month),
    charity: cleanString(source.charity),
    size: cleanString(source.size),
    qty,
    note: cleanString(source.note || ''),
    fulfilledQty,
    fulfilledDate: cleanString(source.fulfilledDate || ''),
    fulfilledBy: cleanString(source.fulfilledBy || ''),
    fulfilledAt: cleanString(source.fulfilledAt || ''),
    fulfilledHighWater: Math.max(fulfilledQty, Math.floor(Number(source.fulfilledHighWater ?? fulfilledQty) || 0)),
    autoOutQty: Math.max(0, Math.floor(Number(source.autoOutQty || 0))),
    createdBy: cleanString(source.createdBy || ''),
    createdAt: cleanString(source.createdAt || ''),
    updatedBy: cleanString(source.updatedBy || ''),
    updatedAt: cleanString(source.updatedAt || '')
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
  return remote.orgReady && remote.settingsReady && remote.transactionsReady && remote.needsReady;
}

function hasPendingWrites() {
  return remote.orgPending || remote.settingsPending || remote.transactionsPending || remote.needsPending;
}

function updateInitializationPanel() {
  const panel = byId('firebaseInitializePanel');
  const button = byId('firebaseInitializeButton');
  if (panel) panel.style.display = currentUser && initialCloudReady && !cloudInitialized ? 'block' : 'none';
  if (button) button.disabled = !currentUser || !initialCloudReady || cloudInitialized || syncing;
}

function scheduleRemoteApply(reason = 'a shared-device update') {
  if (!allRemoteReady() || hasPendingWrites()) return;
  clearTimeout(remoteApplyTimer);
  remoteApplyTimer = setTimeout(async () => {
    await waitForBridge();
    const cloudData = normalizeAppData(composeRemoteData());
    const cloudHasData = !!remote.settings || cloudData.transactions.length > 0 || cloudData.needs.length > 0;
    const waitingForServer = !cloudHasData && !remote.org?.initialized && (
      remote.orgFromCache || remote.settingsFromCache || remote.transactionsFromCache || remote.needsFromCache
    );
    if (waitingForServer) {
      setState(navigator.onLine ? 'Connecting to Firebase…' : 'Offline — using data saved on this device');
      if (!navigator.onLine) releaseGate();
      return;
    }
    cloudInitialized = remote.org?.initialized === true || cloudHasData;
    initialCloudReady = true;
    lastRemoteData = clone(cloudData);
    updateInitializationPanel();

    if (!cloudInitialized) {
      setState('Shared inventory is ready to be created');
      releaseGate();
      return;
    }

    if (syncing) return;
    if (pendingSave) {
      setState('Uploading changes saved on this device…');
      releaseGate();
      flushSave();
      return;
    }

    const localData = normalizeAppData(window.lqGetData());
    if (stable(localData) !== stable(cloudData)) {
      applyingRemote = true;
      window.lqApplyRemoteData(cloudData, reason);
      applyingRemote = false;
      setState('Shared inventory loaded');
    } else {
      setState('All changes synced');
    }
    releaseGate();
  }, 150);
}

function stopRealtime() {
  unsubscribe.forEach(fn => {
    try { fn(); } catch { /* no-op */ }
  });
  unsubscribe = [];
  remote = blankRemote();
  lastRemoteData = null;
  initialCloudReady = false;
  cloudInitialized = false;
  updateInitializationPanel();
}

function handleFirestoreError(error) {
  console.error('Firebase sync error:', error);
  const code = error?.code || '';
  if (code.includes('permission-denied')) {
    setState('Access blocked by Firestore rules', 'error');
    showNotice('firebaseSettingsNotice', 'Firestore denied access. Recheck that both approved account UIDs are in the published Rules.');
    showGate('loading', 'Access was blocked by Firestore rules. Sign out and recheck the Rules.');
  } else {
    setState('Firebase connection error', 'error');
    showNotice('firebaseSettingsNotice', 'Firebase could not connect. Check the internet connection and try again.');
    showGate('loading', 'Firebase could not connect. Check the internet connection, or sign out and try again.');
  }
}

function startRealtime() {
  stopRealtime();
  setState('Loading shared inventory…');
  showGate('loading', 'Loading shared inventory…');

  unsubscribe.push(onSnapshot(orgRef, { includeMetadataChanges: true }, snapshot => {
    remote.org = snapshot.exists() ? snapshot.data() : null;
    remote.orgReady = true;
    remote.orgPending = snapshot.metadata.hasPendingWrites;
    remote.orgFromCache = snapshot.metadata.fromCache;
    scheduleRemoteApply('shared inventory information');
  }, handleFirestoreError));

  unsubscribe.push(onSnapshot(settingsRef, { includeMetadataChanges: true }, snapshot => {
    remote.settings = snapshot.exists() ? snapshot.data() : null;
    remote.settingsReady = true;
    remote.settingsPending = snapshot.metadata.hasPendingWrites;
    remote.settingsFromCache = snapshot.metadata.fromCache;
    scheduleRemoteApply('shared settings');
  }, handleFirestoreError));

  unsubscribe.push(onSnapshot(transactionsRef, { includeMetadataChanges: true }, snapshot => {
    remote.transactions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    remote.transactionsReady = true;
    remote.transactionsPending = snapshot.metadata.hasPendingWrites;
    remote.transactionsFromCache = snapshot.metadata.fromCache;
    scheduleRemoteApply('shared inventory');
  }, handleFirestoreError));

  unsubscribe.push(onSnapshot(needsRef, { includeMetadataChanges: true }, snapshot => {
    remote.needs = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    remote.needsReady = true;
    remote.needsPending = snapshot.metadata.hasPendingWrites;
    remote.needsFromCache = snapshot.metadata.fromCache;
    scheduleRemoteApply('shared needs');
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
      operations.push({ type: 'set', ref: doc(db, 'organizations', ORG_ID, collectionName, id), data: item });
    }
  }
  for (const id of remoteMap.keys()) {
    if (!localMap.has(id)) {
      operations.push({ type: 'delete', ref: doc(db, 'organizations', ORG_ID, collectionName, id) });
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
  if (!cloudInitialized && !pendingSave.initialize) return;
  const task = pendingSave;
  syncing = true;
  setState(task.initialize ? 'Creating real shared inventory…' : 'Saving changes…');
  updateInitializationPanel();

  try {
    const localData = normalizeAppData(task.data);
    const baseline = task.initialize ? normalizeAppData({}) : (lastRemoteData || normalizeAppData({}));
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
        productionMode: true,
        initialized: true,
        schemaVersion: 1,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedByUid: currentUser.uid,
        lastUpdatedByEmail: currentUser.email || '',
        lastReason: task.reason || 'Saved from Love Quilts Manager'
      }
    });

    await commitOperations(operations);
    pendingSave = null;
    persistPendingSave();
    cloudInitialized = true;
    lastRemoteData = clone(localData);
    setState('All changes synced');
    updateInitializationPanel();
    if (task.initialize) showNotice('firebaseSettingsNotice', 'Real shared inventory created.', true);
  } catch (error) {
    console.error('Could not save Firebase production data:', error);
    pendingSave = task;
    persistPendingSave();
    if (task.initialize) cloudInitialized = false;
    if (error?.code === 'permission-denied') {
      setState('Save blocked by Firestore rules', 'error');
      showNotice('firebaseSettingsNotice', 'The save was blocked. Recheck the published Firestore Rules and both account UIDs. Your local copy is safe.');
    } else {
      setState(navigator.onLine ? 'Firebase save failed — will retry' : 'Offline — saved on this device', 'error');
      showNotice('firebaseSettingsNotice', 'The local copy is safe. Firebase will retry after the connection is restored.');
    }
    updateInitializationPanel();
  } finally {
    syncing = false;
    if (pendingSave && cloudInitialized) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 1500);
    } else {
      scheduleRemoteApply('a completed Firebase sync');
    }
  }
}

window.lqFirebaseQueueSave = (snapshot, reason = 'Saved from Love Quilts Manager') => {
  if (applyingRemote) return;
  pendingSave = { data: normalizeAppData(snapshot), reason, force: false, initialize: false };
  persistPendingSave();
  if (!currentUser) {
    setState('Saved locally — sign in to sync');
    return;
  }
  if (!initialCloudReady) {
    setState('Saved locally — waiting for Firebase');
    return;
  }
  if (!cloudInitialized) {
    setState('Saved locally — create shared inventory to sync');
    updateInitializationPanel();
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
  if (!initialCloudReady) {
    showNotice('firebaseSettingsNotice', 'Firebase is still loading. Try again in a moment.');
    return;
  }
  if (!cloudInitialized) {
    showNotice('firebaseSettingsNotice', 'Create the real shared inventory first.');
    updateInitializationPanel();
    return;
  }
  if (typeof window.lqGetData !== 'function') return;
  pendingSave = { data: normalizeAppData(window.lqGetData()), reason: 'Manual Sync Now', force: true, initialize: false };
  persistPendingSave();
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

async function initializeProduction() {
  if (!currentUser || !initialCloudReady || cloudInitialized || syncing) return;
  await waitForBridge();
  const localData = normalizeAppData(window.lqGetData());
  const countText = `${localData.transactions.length} inventory transactions and ${localData.needs.length} planned needs`;
  const typed = prompt(
    `This will create the real shared inventory from this device.\n\nIt will upload ${countText}.\n\nType START SHARED INVENTORY exactly to continue.`
  );
  if (typed !== 'START SHARED INVENTORY') {
    showNotice('firebaseSettingsNotice', 'Initialization canceled. Nothing was uploaded.');
    return;
  }
  cloudInitialized = true;
  pendingSave = {
    data: localData,
    reason: 'Created real shared inventory',
    force: true,
    initialize: true
  };
  persistPendingSave();
  updateInitializationPanel();
  await flushSave();
}

window.addEventListener('online', () => {
  if (pendingSave && cloudInitialized) flushSave();
  else if (currentUser) setState('Online — Firebase connected');
});
window.addEventListener('offline', () => {
  if (currentUser) setState('Offline — changes stay on this device');
});

document.addEventListener('DOMContentLoaded', () => {
  const form = byId('firebaseLoginForm');
  if (form) form.addEventListener('submit', handleLogin);
  const initializeButton = byId('firebaseInitializeButton');
  if (initializeButton) initializeButton.addEventListener('click', initializeProduction);
  showGate(authStateResolved && !currentUser ? 'signin' : 'loading', authStateResolved ? 'Loading shared inventory…' : 'Checking saved sign-in…');
  setState(authStateResolved && !currentUser ? 'Waiting for sign-in' : 'Checking sign-in');
  updateInitializationPanel();
});

onAuthStateChanged(auth, async user => {
  authStateResolved = true;
  currentUser = user || null;
  if (!user) {
    stopRealtime();
    showGate('signin');
    setState('Waiting for sign-in');
    return;
  }

  showGate('loading', 'Loading shared inventory…');
  setState('Signed in — loading shared inventory');
  await waitForBridge();
  startRealtime();
});
