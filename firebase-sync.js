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
let verificationTarget = null;

const byId = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => JSON.stringify(value);
function stableData(value) {
  const copy = clone(value || {});
  if (Array.isArray(copy.transactions)) copy.transactions.sort((a, b) => cleanString(a.id).localeCompare(cleanString(b.id)));
  if (Array.isArray(copy.needs)) copy.needs.sort((a, b) => cleanString(a.id).localeCompare(cleanString(b.id)));
  return stable(copy);
}
const cleanString = value => String(value ?? '');
const CANONICAL_STORAGE_CHARITY = 'Unassigned/Storage';
function normalizeStorageCharity(value) {
  const clean = cleanString(value).trim();
  const normalized = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.startsWith('unas') && normalized.includes('storage')
    ? CANONICAL_STORAGE_CHARITY
    : clean;
}
function uniqueStrings(values = []) {
  return [...new Set(values.map(normalizeStorageCharity).filter(Boolean))];
}
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
  const bannerBox = byId('firebaseBanner');
  if (bannerBox) {
    bannerBox.classList.toggle('synced', verified);
    bannerBox.classList.toggle('not-synced', !verified);
  }
  const account = byId('firebaseAccountStatus');
  if (account) account.textContent = currentUser?.email || 'Not signed in';
  const loadingStatus = byId('firebaseLoadingStatus');
  if (loadingStatus && !byId('firebaseGate')?.classList.contains('hidden')) loadingStatus.textContent = displayMessage;
  const syncBusy = /syncing|waiting to sync|loading shared|saving changes|waiting for firebase confirmation|applying latest shared/i.test(displayMessage);
  document.querySelectorAll('[data-sync-now]').forEach(button => { button.disabled = syncBusy || !currentUser; button.textContent = syncBusy ? 'Syncing…' : 'Sync Now'; });
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

function normalizeAuditValue(value) {
  if (!value || typeof value !== 'object') return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function normalizeAuditEntry(source = {}) {
  return {
    id: cleanString(source.id),
    timestamp: cleanString(source.timestamp || source.createdAt || ''),
    user: cleanString(source.user || source.createdBy || ''),
    action: cleanString(source.action || 'Changed'),
    recordType: cleanString(source.recordType || 'Record'),
    recordId: cleanString(source.recordId || ''),
    summary: cleanString(source.summary || ''),
    before: normalizeAuditValue(source.before),
    after: normalizeAuditValue(source.after)
  };
}

function normalizeSettings(source = {}) {
  return {
    orgName: cleanString(source.orgName || 'Faithful Circle Quilters'),
    appName: cleanString(source.appName || 'Love Quilts Manager'),
    itemName: cleanString(source.itemName || 'Love Quilts'),
    reportTitle: cleanString(source.reportTitle || ''),
    headerTagline: cleanString(source.headerTagline || 'Available quilts, requests, and quilts still to complete'),
    splashTag: cleanString(source.splashTag || ''),
    splashMessage: cleanString(source.splashMessage || ''),
    futureMessage: cleanString(source.futureMessage || 'Designed to grow with your quilting needs.'),
    navHomeLabel: cleanString(source.navHomeLabel || 'Home'),
    navInventoryLabel: cleanString(source.navInventoryLabel || 'Inventory'),
    navNeedsLabel: cleanString(source.navNeedsLabel || 'Quilts Needed'),
    navReportsLabel: cleanString(source.navReportsLabel || 'Reports'),
    navSettingsLabel: cleanString(source.navSettingsLabel || 'Settings'),
    homeAtAGlance: cleanString(source.homeAtAGlance || 'At a Glance'),
    homeStorageLabel: cleanString(source.homeStorageLabel || 'Available in Storage'),
    homeNeededLabel: cleanString(source.homeNeededLabel || 'Quilts Requested'),
    homeDifferenceLabel: cleanString(source.homeDifferenceLabel || 'Quilts Needed to be Completed'),
    homeCalendarHeading: cleanString(source.homeCalendarHeading || 'All Quilts Calendar'),
    homeActionsHeading: cleanString(source.homeActionsHeading || 'Choose an Action'),
    customLogo: cleanString(source.customLogo || ''),
    auditLog: Array.isArray(source.auditLog) ? source.auditLog.map(normalizeAuditEntry).filter(x => x.id).sort((a, b) => cleanString(b.timestamp).localeCompare(cleanString(a.timestamp))).slice(0, 200) : [],
    charities: Array.isArray(source.charities) ? uniqueStrings(source.charities) : [],
    sizes: Array.isArray(source.sizes) ? source.sizes.map(cleanString) : [],
    // Legacy deferred records are preserved for backward compatibility.
    holds: Array.isArray(source.holds) ? source.holds.map(normalizeHold).filter(x => x.id) : []
  };
}

function normalizeTransaction(source = {}) {
  return {
    id: cleanString(source.id),
    date: cleanString(source.date),
    type: ['IN', 'OUT', 'ADJUST'].includes(source.type) ? source.type : 'IN',
    charity: normalizeStorageCharity(source.charity),
    size: cleanString(source.size),
    qty: Math.max(1, Number(source.qty || 1)),
    adjustment: Number(source.adjustment || 0),
    note: cleanString(source.note || ''),
    sourceNeedId: cleanString(source.sourceNeedId || ''),
    sourceHoldId: cleanString(source.sourceHoldId || ''),
    sourceType: cleanString(source.sourceType || ''),
    createdBy: cleanString(source.createdBy || ''),
    createdAt: cleanString(source.createdAt || ''),
    updatedBy: cleanString(source.updatedBy || ''),
    updatedAt: cleanString(source.updatedAt || '')
  };
}

function normalizeNeed(source = {}) {
  const qty = Math.max(1, Math.floor(Number(source.qty || 1)));
  const recordedFulfilled = Math.max(0, Math.floor(Number(source.fulfilledQty || 0)));
  const autoOutQty = Math.max(0, Math.floor(Number(source.autoOutQty || 0)));
  // Keep the complete distributed quantity. If 7.8.23 clipped fulfilledQty,
  // autoOutQty safely recovers the amount already removed from inventory.
  const fulfilledQty = Math.max(recordedFulfilled, autoOutQty);
  return {
    id: cleanString(source.id),
    month: cleanString(source.month),
    charity: normalizeStorageCharity(source.charity),
    size: cleanString(source.size),
    qty,
    note: cleanString(source.note || ''),
    fulfilledQty,
    fulfilledDate: cleanString(source.fulfilledDate || ''),
    fulfilledBy: cleanString(source.fulfilledBy || ''),
    fulfilledAt: cleanString(source.fulfilledAt || ''),
    fulfilledHighWater: Math.max(fulfilledQty, Math.floor(Number(source.fulfilledHighWater ?? fulfilledQty) || 0)),
    autoOutQty,
    createdBy: cleanString(source.createdBy || ''),
    createdAt: cleanString(source.createdAt || ''),
    updatedBy: cleanString(source.updatedBy || ''),
    updatedAt: cleanString(source.updatedAt || '')
  };
}

function normalizeHold(source = {}) {
  const qty = Math.max(1, Math.floor(Number(source.qty || 1)));
  const returned = Math.max(0, Math.floor(Number(source.returnedQty || 0)));
  const distributed = Math.max(0, Math.floor(Number(source.distributedQty || 0)));
  const used = Math.min(qty, returned + distributed);
  const safeReturned = Math.min(returned, used);
  return {
    id: cleanString(source.id),
    date: cleanString(source.date),
    charity: normalizeStorageCharity(source.charity),
    size: cleanString(source.size),
    qty,
    location: cleanString(source.location || source.reason || ''),
    returnedQty: safeReturned,
    distributedQty: Math.max(0, used - safeReturned),
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

function mergeAuditLogs(...lists) {
  const merged = new Map();
  lists.flat().map(normalizeAuditEntry).filter(x => x.id).forEach(entry => {
    const existing = merged.get(entry.id);
    if (!existing || cleanString(entry.timestamp) > cleanString(existing.timestamp)) merged.set(entry.id, entry);
  });
  return [...merged.values()].sort((a, b) => cleanString(b.timestamp).localeCompare(cleanString(a.timestamp))).slice(0, 200);
}

function composeRemoteData() {
  const fallback = typeof window.lqGetData === 'function' ? normalizeSettings(window.lqGetData()) : normalizeSettings();
  // Older shared settings do not contain the Home wording fields. Merge them over
  // this device's current wording so an update does not erase an existing choice.
  const settings = remote.settings ? normalizeSettings({
    ...fallback,
    ...remote.settings,
    auditLog: mergeAuditLogs(fallback.auditLog || [], remote.settings.auditLog || [])
  }) : fallback;
  return {
    ...settings,
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


function remoteConfirmedByServer() {
  return allRemoteReady() && !hasPendingWrites() &&
    !remote.orgFromCache && !remote.settingsFromCache &&
    !remote.transactionsFromCache && !remote.needsFromCache;
}

function localHasAuthoritativeDistributionRepair(localData, cloudData) {
  const cloudNeeds = mapById(cloudData.needs || []);
  const cloudTransactions = mapById(cloudData.transactions || []);
  for (const need of localData.needs || []) {
    const cloudNeed = cloudNeeds.get(need.id);
    const localFulfilled = Math.max(0, Number(need.fulfilledQty || 0));
    const cloudFulfilled = Math.max(0, Number(cloudNeed?.fulfilledQty || 0));
    const localAutoOut = Math.max(0, Number(need.autoOutQty || 0));
    const cloudAutoOut = Math.max(0, Number(cloudNeed?.autoOutQty || 0));
    const localHighWater = Math.max(localFulfilled, Number(need.fulfilledHighWater || 0));
    if (localFulfilled > cloudFulfilled && (localAutoOut >= localFulfilled || localHighWater >= localFulfilled)) return true;
    if (localAutoOut > cloudAutoOut) return true;
  }
  for (const transaction of localData.transactions || []) {
    if (!cloudTransactions.has(transaction.id) && transaction.sourceNeedId &&
        ['NEED_DISTRIBUTION','NEED_DISTRIBUTION_CORRECTION'].includes(transaction.sourceType)) return true;
  }
  return false;
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
    const localBeforeRemote = normalizeAppData(window.lqGetData());
    const cloudData = normalizeAppData(composeRemoteData());
    const sharedHomeWordingMissing = !remote.settings || [
      'homeAtAGlance','homeStorageLabel','homeNeededLabel','homeDifferenceLabel','homeCalendarHeading','homeActionsHeading'
    ].some(key => !Object.prototype.hasOwnProperty.call(remote.settings, key));
    const sharedGrowthAndTabsMissing = !remote.settings || [
      'futureMessage','navHomeLabel','navInventoryLabel','navNeedsLabel','navReportsLabel','navSettingsLabel'
    ].some(key => !Object.prototype.hasOwnProperty.call(remote.settings, key));
    const localHasCustomHomeWording =
      localBeforeRemote.homeAtAGlance !== 'At a Glance' ||
      !['Total Quilts in Storage','Quilts in Storage','Available in Storage'].includes(localBeforeRemote.homeStorageLabel) ||
      !['Quilts Still Needed','Quilts Needed','Charity Requests','Quilts Requested'].includes(localBeforeRemote.homeNeededLabel) ||
      !['Difference','More to Make','Quilts Needed to be Completed'].includes(localBeforeRemote.homeDifferenceLabel) ||
      localBeforeRemote.homeCalendarHeading !== 'All Quilts Calendar' ||
      localBeforeRemote.homeActionsHeading !== 'Choose an Action';
    const localHasCustomGrowthOrTabs =
      localBeforeRemote.futureMessage !== 'Designed to grow with your quilting needs.' ||
      localBeforeRemote.navHomeLabel !== 'Home' ||
      localBeforeRemote.navInventoryLabel !== 'Inventory' ||
      localBeforeRemote.navNeedsLabel !== 'Quilts Needed' ||
      localBeforeRemote.navReportsLabel !== 'Reports' ||
      localBeforeRemote.navSettingsLabel !== 'Settings';
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

    // If an older shared settings document is missing newer customizable wording,
    // publish the customized value from this device instead of treating its local
    // fallback as though it were already stored in Firebase.
    if ((sharedHomeWordingMissing && localHasCustomHomeWording) ||
        (sharedGrowthAndTabsMissing && localHasCustomGrowthOrTabs)) {
      pendingSave = {
        data: clone(cloudData),
        reason: sharedGrowthAndTabsMissing && localHasCustomGrowthOrTabs
          ? 'Added growth message and tab labels to shared settings'
          : 'Added Home wording to shared settings',
        force: true,
        initialize: false
      };
      persistPendingSave();
      setState('Sharing customized wording with all devices…');
      releaseGate();
      flushSave();
      return;
    }

    const localData = normalizeAppData(window.lqGetData());

    if (verificationTarget) {
      if (remoteConfirmedByServer() && stableData(cloudData) === stableData(verificationTarget)) {
        lastRemoteData = clone(cloudData);
        verificationTarget = null;
        setState('All changes synced');
      } else {
        setState('Waiting for Firebase confirmation…');
      }
      releaseGate();
      return;
    }

    if (stableData(localData) !== stableData(cloudData)) {
      // Do not let a clipped cloud copy overwrite the device that still contains
      // the proven full distribution and its linked inventory transaction.
      if (localHasAuthoritativeDistributionRepair(localData, cloudData)) {
        setState('Full distribution found on this device — press Sync Now to repair shared data');
        releaseGate();
        return;
      }
      applyingRemote = true;
      window.lqApplyRemoteData(cloudData, reason);
      applyingRemote = false;
      const appliedData = normalizeAppData(window.lqGetData());
      if (stableData(appliedData) === stableData(cloudData) && remoteConfirmedByServer()) {
        lastRemoteData = clone(cloudData);
        setState('All changes synced');
      } else {
        setState('Applying latest shared data…');
      }
    } else if (remoteConfirmedByServer()) {
      lastRemoteData = clone(cloudData);
      setState('All changes synced');
    } else {
      setState('Waiting for Firebase confirmation…');
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
  verificationTarget = null;
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

function addDiffOperations(operations, collectionName, localItems, remoteItems, forceSet = false) {
  const localMap = mapById(localItems);
  const remoteMap = mapById(remoteItems);

  for (const [id, item] of localMap) {
    const previous = remoteMap.get(id);
    if (forceSet || !previous || stable(item) !== stable(previous)) {
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
    const baseline = task.initialize ? normalizeAppData({}) : (allRemoteReady() ? normalizeAppData(composeRemoteData()) : (lastRemoteData || normalizeAppData({})));
    const operations = [];
    const localSettings = normalizeSettings(localData);
    // Compare against the actual shared settings document. composeRemoteData() fills
    // missing fields from this device so older documents remain usable, but using that
    // merged copy here can hide a newly edited field and prevent it from being uploaded.
    const oldSettings = normalizeSettings(remote.settings || {});

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

    // A manual repair sync rewrites both collections so a stale second device cannot preserve a missing inventory transaction.
    addDiffOperations(operations, 'transactions', localData.transactions, baseline.transactions, task.force);
    // Manual Sync Now rewrites need records so a quantity clipped by 7.8.23 is repaired in Firestore.
    addDiffOperations(operations, 'needs', localData.needs, baseline.needs, task.force);

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
    verificationTarget = clone(localData);
    setState('Waiting for Firebase confirmation…');
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
  if (!initialCloudReady || !allRemoteReady()) {
    showNotice('firebaseSettingsNotice', 'Firebase is still loading. Try again in a moment.');
    return;
  }
  if (!cloudInitialized) {
    showNotice('firebaseSettingsNotice', 'Create the real shared inventory first.');
    updateInitializationPanel();
    return;
  }
  if (typeof window.lqGetData !== 'function') return;

  const localData = normalizeAppData(window.lqGetData());
  const cloudData = normalizeAppData(composeRemoteData());

  // Preserve a real unsent local edit. Otherwise, Sync Now is safe on a second
  // device: it downloads the server copy instead of blindly uploading stale data.
  if (pendingSave || localHasAuthoritativeDistributionRepair(localData, cloudData)) {
    pendingSave = { data: localData, reason: 'Manual Sync Now', force: true, initialize: false };
    persistPendingSave();
    flushSave();
    return;
  }

  if (stableData(localData) !== stableData(cloudData)) {
    applyingRemote = true;
    window.lqApplyRemoteData(cloudData, 'manual Sync Now');
    applyingRemote = false;
    const appliedData = normalizeAppData(window.lqGetData());
    if (stableData(appliedData) === stableData(cloudData) && remoteConfirmedByServer()) {
      lastRemoteData = clone(cloudData);
      setState('All changes synced');
      showNotice('firebaseSettingsNotice', 'Latest shared data received on this device.', true);
    } else {
      setState('Applying latest shared data…');
    }
    return;
  }

  if (remoteConfirmedByServer()) setState('All changes synced');
  else setState('Waiting for Firebase confirmation…');
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
  // Refresh an older pending save from the app's current local copy before it can upload.
  // This prevents a 7.8.23 pending sync from re-sending a clipped distributed quantity.
  if (pendingSave && typeof window.lqGetData === 'function') {
    pendingSave = { ...pendingSave, data: normalizeAppData(window.lqGetData()) };
    persistPendingSave();
  }
  startRealtime();
});
