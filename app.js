'use strict';

// Copyright © 2026 Jay. All rights reserved.
// Personal and authorized guild use only. See LICENSE.txt.

const VERSION='7.8.33';
const KEY='love_quilts_v1';
const RECOVERY_KEY='love_quilts_v1_recovery';
const CLOUD_KEY='love_quilts_cloud_v1';
const STATUS_KEY='love_quilts_status_v1';
const MAX_RECOVERY=20;
const MAX_RECOVERY_BYTES=3000000;
const DEFAULT_ORG='Faithful Circle Quilters';
const DEFAULT_APP='Love Quilts Manager';
const DEFAULT_ITEM='Love Quilts';
const DEFAULT_SPLASH_TAG='MADE WITH LOVE, SHARED WITH CARE';
const DEFAULT_HOME_AT_A_GLANCE='At a Glance';
const DEFAULT_HOME_STORAGE_LABEL='Available in Storage';
const DEFAULT_HOME_NEEDED_LABEL='Quilts Requested';
const DEFAULT_HOME_DIFFERENCE_LABEL='Quilts Needed to be Completed';
const DEFAULT_HOME_CALENDAR_HEADING='All Quilts Calendar';
const DEFAULT_HOME_ACTIONS_HEADING='Choose an Action';
const COPYRIGHT_TEXT='© 2026 Jay. Love Quilts Manager. All rights reserved.';
const COPYRIGHT_PDF='Copyright (c) 2026 Jay. Love Quilts Manager. All rights reserved.';
const DEFAULT_CHARITIES=['Grassroots','SHP','St. Agnes','Bridges','Project Holiday'];
const DEFAULT_SIZES=["Children's Large",'Adult Large','Medium'];
let mode='IN',qty=0,editTxId=null,editNeedId=null,editNeedMode='details',calendarModalNeedId=null,calendarActionNeedId=null,calendarDistributionNeedId=null,calendarDistributionMode='full',entryReviewAction=null,externalTimer=null,externalReason='Automatic save';

const el=id=>document.getElementById(id);
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function today(){const d=new Date(),o=d.getTimezoneOffset();return new Date(d.getTime()-o*60000).toISOString().slice(0,10)}
function monthNow(){return today().slice(0,7)}
function parse(s){try{return JSON.parse(s)}catch{return null}}
function clone(v){return JSON.parse(JSON.stringify(v))}
function unique(a){return [...new Set((a||[]).filter(Boolean).map(v=>String(v).trim()).filter(Boolean))]}
function upgradedSummaryLabel(value,legacy,fallback){
  const clean=String(value||'').trim();
  return !clean||legacy.some(item=>clean.toLocaleLowerCase()===String(item).toLocaleLowerCase())?fallback:clean;
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function fmtDate(s){if(!s)return'';const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function fmtMonth(s){if(!s)return'';const[y,m]=s.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'})}
function fmtMonthShort(s){if(!s)return'';const[y,m]=s.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString(undefined,{month:'short',year:'numeric'})}
function fmtDateTime(s){if(!s)return'Not yet';const d=new Date(s);return Number.isNaN(d.getTime())?'Not yet':d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function notice(id,msg,good=false){const e=el(id);if(!e)return;e.textContent=msg;e.className='notice show'+(good?' good':'');clearTimeout(e.t);e.t=setTimeout(()=>e.className='notice',5000)}
function filePart(v){return String(v||'Quilt_Manager').trim().replace(/[^a-z0-9]+/gi,'_').replace(/^_+|_+$/g,'')||'Quilt_Manager'}
function lowerName(){return(data.itemName||DEFAULT_ITEM).toLocaleLowerCase()}
function currentUserEmail(){return String(window.lqFirebaseState?.email||'').trim()||'This device'}
function nowIso(){return new Date().toISOString()}
function effectiveReportTitle(){return String(data.reportTitle||'').trim()||`${data.itemName||DEFAULT_ITEM} Inventory and Quilts Needed Report`}
function auditText(record){
  if(!record)return'';
  const createdBy=String(record.createdBy||'').trim(),updatedBy=String(record.updatedBy||'').trim();
  const createdAt=String(record.createdAt||''),updatedAt=String(record.updatedAt||'');
  if(updatedBy&&updatedAt&&(updatedBy!==createdBy||updatedAt!==createdAt))return`Entered by ${createdBy||'earlier user'} · Last edited by ${updatedBy} ${fmtDateTime(updatedAt)}`;
  if(createdBy)return`Entered by ${createdBy}${createdAt?' '+fmtDateTime(createdAt):''}`;
  return'';
}
function isLinkedNeedDistributionTransaction(record){
  return !!record?.sourceNeedId&&['NEED_DISTRIBUTION','NEED_DISTRIBUTION_CORRECTION'].includes(String(record.sourceType||''));
}
function syncLinkedNeedDistributionDates(needId,effectiveDate,email='',stamp=''){
  if(!needId||!effectiveDate)return 0;
  let changed=0;
  data.transactions.forEach(record=>{
    if(record.sourceNeedId!==needId||!isLinkedNeedDistributionTransaction(record)||record.date===effectiveDate)return;
    record.date=effectiveDate;
    if(email)record.updatedBy=email;
    if(stamp)record.updatedAt=stamp;
    changed++;
  });
  return changed;
}

function normalizeData(d={}){
  let tx=Array.isArray(d.transactions)?d.transactions.map(t=>({
    id:t.id||uid(),date:t.date||today(),type:['IN','OUT','ADJUST'].includes(t.type)?t.type:'IN',
    charity:String(t.charity||'Unknown'),size:String(t.size||'Other'),qty:Math.max(1,Number(t.qty||t.quantity||1)),
    adjustment:Number(t.adjustment||0),note:String(t.note||''),
    sourceNeedId:String(t.sourceNeedId||''),sourceHoldId:String(t.sourceHoldId||''),sourceType:String(t.sourceType||''),
    createdBy:String(t.createdBy||''),createdAt:String(t.createdAt||''),updatedBy:String(t.updatedBy||''),updatedAt:String(t.updatedAt||'')
  })):[];
  if(d.inv&&!tx.length){
    Object.entries(d.inv).forEach(([k,v])=>{
      const parts=k.includes(' | ')?k.split(' | '):k.split('|'),c=parts[0],s=parts[1],n=Number(v)||0;
      if(n)tx.push({id:uid(),date:today(),type:'ADJUST',charity:c||'Unknown',size:s||'Other',qty:Math.abs(n),adjustment:n,note:'Imported from original app'});
    });
  }
  const needs=Array.isArray(d.needs)?d.needs.map(n=>{
    const needQty=Math.max(1,Math.floor(Number(n.qty||1)));
    const legacyComplete=n.completed===true||String(n.status||'').toLocaleLowerCase()==='completed';
    const recordedFulfilled=Math.max(0,Math.floor(Number(n.fulfilledQty??(legacyComplete?needQty:0))||0));
    const autoOutQty=Math.max(0,Math.floor(Number(n.autoOutQty||0)));
    // 7.8.23 could clip fulfilledQty to the request during Firebase normalization.
    // autoOutQty can never legitimately exceed the current distributed amount, so use it to repair that copy.
    const fulfilled=Math.max(recordedFulfilled,autoOutQty);
    return{
      id:n.id||uid(),month:n.month||monthNow(),charity:String(n.charity||DEFAULT_CHARITIES[0]),
      size:String(n.size||DEFAULT_SIZES[0]),qty:needQty,note:String(n.note||''),
      fulfilledQty:fulfilled,fulfilledDate:String(n.fulfilledDate||n.completedDate||''),
      fulfilledBy:String(n.fulfilledBy||''),fulfilledAt:String(n.fulfilledAt||''),
      fulfilledHighWater:Math.max(fulfilled,Math.floor(Number(n.fulfilledHighWater??fulfilled)||0)),
      autoOutQty,
      createdBy:String(n.createdBy||''),createdAt:String(n.createdAt||''),updatedBy:String(n.updatedBy||''),updatedAt:String(n.updatedAt||'')
    };
  }):[];
  const holds=Array.isArray(d.holds)?d.holds.map(h=>{
    const holdQty=Math.max(1,Math.floor(Number(h.qty||1)));
    const returned=Math.max(0,Math.floor(Number(h.returnedQty||0))),distributed=Math.max(0,Math.floor(Number(h.distributedQty||0)));
    const used=Math.min(holdQty,returned+distributed),safeReturned=Math.min(returned,used),safeDistributed=Math.max(0,used-safeReturned);
    return{id:h.id||uid(),date:String(h.date||today()),charity:String(h.charity||DEFAULT_CHARITIES[0]),size:String(h.size||DEFAULT_SIZES[0]),qty:holdQty,location:String(h.location||h.reason||''),returnedQty:safeReturned,distributedQty:safeDistributed,createdBy:String(h.createdBy||''),createdAt:String(h.createdAt||''),updatedBy:String(h.updatedBy||''),updatedAt:String(h.updatedAt||'')};
  }):[];
  needs.forEach(n=>{
    let remaining=n.autoOutQty;if(remaining<=0)return;
    const expectedNote=`Distributed for ${fmtMonth(n.month)} charity request`;
    tx.filter(t=>!t.sourceNeedId&&t.type==='OUT'&&t.charity===n.charity&&t.size===n.size&&t.note===expectedNote)
      .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id||'').localeCompare(String(b.id||'')))
      .forEach(t=>{const amount=Math.max(1,Math.floor(Number(t.qty||1)));if(amount<=remaining){t.sourceNeedId=n.id;t.sourceType='NEED_DISTRIBUTION';remaining-=amount}});
  });
  // A charity request currently stores one effective distribution date. Keep every linked
  // inventory transaction on that selected date so reports and yearly totals reflect when
  // the quilts actually moved, not when the correction was entered.
  needs.forEach(n=>{
    if(!n.fulfilledDate)return;
    tx.forEach(t=>{if(t.sourceNeedId===n.id&&isLinkedNeedDistributionTransaction(t))t.date=n.fulfilledDate});
  });
  return{
    orgName:String(d.orgName||DEFAULT_ORG),appName:String(d.appName||DEFAULT_APP),itemName:String(d.itemName||DEFAULT_ITEM),
    reportTitle:String(d.reportTitle||''),splashTag:String(d.splashTag||''),splashMessage:String(d.splashMessage||''),
    homeAtAGlance:String(d.homeAtAGlance||DEFAULT_HOME_AT_A_GLANCE),
    homeStorageLabel:upgradedSummaryLabel(d.homeStorageLabel,['Total Quilts in Storage','Quilts in Storage'],DEFAULT_HOME_STORAGE_LABEL),
    homeNeededLabel:upgradedSummaryLabel(d.homeNeededLabel,['Quilts Still Needed','Quilts Needed','Charity Requests'],DEFAULT_HOME_NEEDED_LABEL),
    homeDifferenceLabel:upgradedSummaryLabel(d.homeDifferenceLabel,['Difference','More to Make'],DEFAULT_HOME_DIFFERENCE_LABEL),
    homeCalendarHeading:String(d.homeCalendarHeading||DEFAULT_HOME_CALENDAR_HEADING),homeActionsHeading:String(d.homeActionsHeading||DEFAULT_HOME_ACTIONS_HEADING),
    // Once a list exists, keep it authoritative so renamed default choices do not reappear on the next load.
    charities:unique([...(Array.isArray(d.charities)&&d.charities.length?d.charities:DEFAULT_CHARITIES),...tx.map(t=>t.charity),...needs.map(n=>n.charity),...holds.map(h=>h.charity)]),
    sizes:unique([...(Array.isArray(d.sizes)&&d.sizes.length?d.sizes:DEFAULT_SIZES),...tx.map(t=>t.size),...needs.map(n=>n.size),...holds.map(h=>h.size)]),
    transactions:tx,needs,holds
  };
}
function loadData(){
  const raw=parse(localStorage.getItem(KEY))||parse(localStorage.getItem('cqt_v3'))||parse(localStorage.getItem('cqt_v2'))||parse(localStorage.getItem('cqt'))||{};
  return normalizeData(raw);
}
function loadCloud(){
  const c=parse(localStorage.getItem(CLOUD_KEY))||{};
  return{url:String(c.url||''),code:String(c.code||''),enabled:!!c.enabled,lastSentAt:String(c.lastSentAt||''),lastStatus:String(c.lastStatus||'')};
}
function loadStatus(){const s=parse(localStorage.getItem(STATUS_KEY))||{};return{lastSavedAt:String(s.lastSavedAt||'')}}
let data=loadData(),cloud=loadCloud(),status=loadStatus();

function persistCloud(){try{localStorage.setItem(CLOUD_KEY,JSON.stringify(cloud));return true}catch{return false}}
function persistStatus(){try{localStorage.setItem(STATUS_KEY,JSON.stringify(status));return true}catch{return false}}
function getRecovery(){const a=parse(localStorage.getItem(RECOVERY_KEY));return Array.isArray(a)?a:[]}
function storeRecovery(list){
  let a=list.slice(0,MAX_RECOVERY);
  while(a.length>1&&JSON.stringify(a).length>MAX_RECOVERY_BYTES)a.pop();
  localStorage.setItem(RECOVERY_KEY,JSON.stringify(a));
}
function createRecoverySnapshot(reason,source=data,force=false){
  try{
    const snap={id:uid(),createdAt:new Date().toISOString(),reason:String(reason||'Automatic recovery copy'),data:clone(source)};
    const list=getRecovery();
    if(!force&&list[0]&&JSON.stringify(list[0].data)===JSON.stringify(snap.data))return;
    list.unshift(snap);storeRecovery(list);
  }catch(error){console.warn('Recovery snapshot could not be saved.',error)}
}
function save(reason='Saved automatically',options={}){
  const snapshot=options.snapshot!==false,external=options.external!==false;
  try{
    localStorage.setItem(KEY,JSON.stringify(data));
    status.lastSavedAt=new Date().toISOString();persistStatus();
    if(snapshot)createRecoverySnapshot(reason,data);
    updateSaveStatus();renderRecoveryList();
    if(external)queueExternalBackup(reason);
    if(options.firebase!==false&&typeof window.lqFirebaseQueueSave==='function')window.lqFirebaseQueueSave(clone(data),reason);
    return true;
  }catch(error){alert('The app could not save to this browser. Please export a backup and check browser storage settings.');return false}
}
function splashSecondLine(){
  const item=(data.itemName||DEFAULT_ITEM).trim(),app=(data.appName||DEFAULT_APP).trim();
  if(app.toLocaleLowerCase().startsWith(item.toLocaleLowerCase()))return app.slice(item.length).trim()||'Manager';
  return app;
}
function applyNames(){
  data.orgName=(data.orgName||DEFAULT_ORG).trim()||DEFAULT_ORG;
  data.appName=(data.appName||DEFAULT_APP).trim()||DEFAULT_APP;
  data.itemName=(data.itemName||DEFAULT_ITEM).trim()||DEFAULT_ITEM;
  data.splashTag=String(data.splashTag||'').trim();
  data.splashMessage=String(data.splashMessage||'').trim();
  data.homeAtAGlance=String(data.homeAtAGlance||DEFAULT_HOME_AT_A_GLANCE).trim()||DEFAULT_HOME_AT_A_GLANCE;
  data.homeStorageLabel=String(data.homeStorageLabel||DEFAULT_HOME_STORAGE_LABEL).trim()||DEFAULT_HOME_STORAGE_LABEL;
  data.homeNeededLabel=String(data.homeNeededLabel||DEFAULT_HOME_NEEDED_LABEL).trim()||DEFAULT_HOME_NEEDED_LABEL;
  data.homeDifferenceLabel=String(data.homeDifferenceLabel||DEFAULT_HOME_DIFFERENCE_LABEL).trim()||DEFAULT_HOME_DIFFERENCE_LABEL;
  data.homeCalendarHeading=String(data.homeCalendarHeading||DEFAULT_HOME_CALENDAR_HEADING).trim()||DEFAULT_HOME_CALENDAR_HEADING;
  data.homeActionsHeading=String(data.homeActionsHeading||DEFAULT_HOME_ACTIONS_HEADING).trim()||DEFAULT_HOME_ACTIONS_HEADING;
  const automaticSplashMessage=`Keeping track of ${lowerName()}…\none quilt at a time.`;
  const shownSplashMessage=data.splashMessage||automaticSplashMessage;
  el('headerOrg').textContent=data.orgName;el('headerAppName').textContent=data.appName;
  el('splashOrg').textContent=data.orgName;el('splashItemName').textContent=data.itemName;el('splashManager').textContent=splashSecondLine();
  el('splashTag').textContent=data.splashTag||DEFAULT_SPLASH_TAG;
  el('splashMessage').innerHTML=esc(shownSplashMessage).replace(/\n/g,'<br>');
  el('splashVersion').textContent=`${data.appName} · Update ${VERSION}`;
  el('orgNameInput').value=data.orgName;el('appNameInput').value=data.appName;el('itemNameInput').value=data.itemName;
  el('homeAtAGlanceHeading').textContent=data.homeAtAGlance;el('homeStorageLabel').textContent=data.homeStorageLabel;
  el('homeNeededLabel').textContent=data.homeNeededLabel;el('homeDifferenceLabel').textContent=data.homeDifferenceLabel;
  el('homeCalendarHeading').textContent=data.homeCalendarHeading;if(el('homeActionsHeading'))el('homeActionsHeading').textContent=data.homeActionsHeading;
  el('homeAtAGlanceInput').value=data.homeAtAGlance;el('homeStorageLabelInput').value=data.homeStorageLabel;
  el('homeNeededLabelInput').value=data.homeNeededLabel;el('homeDifferenceLabelInput').value=data.homeDifferenceLabel;
  el('homeCalendarHeadingInput').value=data.homeCalendarHeading;if(el('homeActionsHeadingInput'))el('homeActionsHeadingInput').value=data.homeActionsHeading;
  if(el('reportTitleInput')){el('reportTitleInput').value=data.reportTitle||'';el('reportTitleInput').placeholder=`${data.itemName} Inventory and Quilts Needed Report`}
  el('splashTagInput').value=data.splashTag;el('splashTagInput').placeholder=DEFAULT_SPLASH_TAG;
  el('splashMessageInput').value=data.splashMessage;el('splashMessageInput').placeholder=automaticSplashMessage;
  el('aboutAppName').textContent=data.appName;el('aboutItemName').textContent=data.itemName;el('aboutOrgName').textContent=data.orgName;
  if(el('homeRecordBtn'))el('homeRecordBtn').textContent=`Record ${data.itemName}`;el('recordHeading').textContent=`Record ${data.itemName}`;
  el('modeIn').textContent=`${data.itemName} In`;el('modeOut').textContent=`${data.itemName} Out`;
  el('historyInOption').textContent=`${data.itemName} In`;el('historyOutOption').textContent=`${data.itemName} Out`;if(el('modeSet'))el('modeSet').textContent='Set Current Count';
  el('inventoryNote').textContent=`Choose ${data.itemName} Out only when items physically leave storage. Use Set Current Count to enter the exact quantity now in storage, or Adjust for a known correction.`;
  el('needsNote').textContent=`Enter the number of ${lowerName()} needed by month. Available inventory and shortage are calculated in month order.`;if(el('needRecordOutName'))el('needRecordOutName').textContent=data.itemName;
  el('reportHeading').textContent=effectiveReportTitle();
  document.title=`${data.orgName} — ${data.appName}`;
  const appleTitle=document.querySelector('meta[name="apple-mobile-web-app-title"]');if(appleTitle)appleTitle.setAttribute('content',data.appName);
  setMode(mode);
}
function saveNames(){
  data.orgName=el('orgNameInput').value.trim()||DEFAULT_ORG;data.appName=el('appNameInput').value.trim()||DEFAULT_APP;data.itemName=el('itemNameInput').value.trim()||DEFAULT_ITEM;
  data.homeAtAGlance=el('homeAtAGlanceInput').value.trim()||DEFAULT_HOME_AT_A_GLANCE;data.homeStorageLabel=el('homeStorageLabelInput').value.trim()||DEFAULT_HOME_STORAGE_LABEL;
  data.homeNeededLabel=el('homeNeededLabelInput').value.trim()||DEFAULT_HOME_NEEDED_LABEL;data.homeDifferenceLabel=el('homeDifferenceLabelInput').value.trim()||DEFAULT_HOME_DIFFERENCE_LABEL;
  data.homeCalendarHeading=el('homeCalendarHeadingInput').value.trim()||DEFAULT_HOME_CALENDAR_HEADING;if(el('homeActionsHeadingInput'))data.homeActionsHeading=el('homeActionsHeadingInput').value.trim()||DEFAULT_HOME_ACTIONS_HEADING;
  data.reportTitle=el('reportTitleInput')?.value.trim()||'';data.splashTag=el('splashTagInput').value.trim();data.splashMessage=el('splashMessageInput').value.trim();
  save('Names and Home wording changed');applyNames();renderAll();notice('nameNotice','Names and Home-screen wording saved.',true);
}
function closeSplash(){el('splash').classList.add('hidden');document.body.style.overflow=''}
function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  if(id==='reports')renderReports();if(id==='needs')renderNeedsCalendar();if(id==='settings'){renderRecoveryList();updateSaveStatus();loadExternalFields()}
  window.scrollTo({top:0,behavior:'smooth'});
}
function fill(id,vals,first=''){const e=el(id);if(!e)return;const old=e.value;e.innerHTML=first+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(vals.includes(old))e.value=old}
function refreshSelects(){
  data.charities=unique(data.charities).sort((a,b)=>a.localeCompare(b));data.sizes=unique(data.sizes).sort((a,b)=>a.localeCompare(b));
  fill('txCharity',data.charities,'<option value="">Select charity</option>');
  fill('needCharity',data.charities,'<option value="">Select charity</option>');
  fill('deleteCharity',data.charities);
  fill('renameCharitySelect',data.charities);
  fill('txSize',data.sizes,'<option value="">Select size</option>');
  fill('needSize',data.sizes,'<option value="">Select size</option>');
  fill('deleteSize',data.sizes);
  fill('renameSizeSelect',data.sizes);
  fill('historyCharity',data.charities,'<option value="">All charities</option>');
  fill('calendarCharity',data.charities,'<option value="">All charities</option>');
  fill('homeCalendarCharity',data.charities,'<option value="">All charities</option>');
  fill('calendarSize',data.sizes,'<option value="">All sizes</option>');
  fill('calendarNeedCharity',data.charities,'<option value="">Select charity</option>');
  fill('calendarNeedSize',data.sizes,'<option value="">Select size</option>');
  refreshCalendarYears();
}
function openAddQuilts(){
  cancelTxEdit();setMode('IN');showView('inventory');
  requestAnimationFrame(()=>{el('inventoryEntryCard')?.scrollIntoView({behavior:'smooth',block:'start'});el('txCharity')?.focus()});
}
function openInventoryDetails(){
  showView('inventory');
  requestAnimationFrame(()=>el('inventoryDetailsCard')?.scrollIntoView({behavior:'smooth',block:'start'}));
}
function resetNeedEntryForm(){
  editNeedId=null;editNeedMode='details';
  if(el('needMonth'))el('needMonth').value=monthNow();
  if(el('needCharity'))el('needCharity').value='';
  if(el('needSize'))el('needSize').value='';
  if(el('needQty'))el('needQty').value=1;
  if(el('needNote'))el('needNote').value='';
  if(el('needFulfilledQty'))el('needFulfilledQty').value=0;
  if(el('needFulfilledDate'))el('needFulfilledDate').value='';
  if(el('needRecordOut'))el('needRecordOut').checked=false;
  if(el('saveNeedBtn'))el('saveNeedBtn').textContent='Add to Quilts Needed';
  if(el('cancelNeedBtn'))el('cancelNeedBtn').style.display='none';
}
function openAddNeed(){
  resetNeedEntryForm();showView('needs');renderNeeds();
  requestAnimationFrame(()=>{el('needsEntryCard')?.scrollIntoView({behavior:'smooth',block:'start'});el('needCharity')?.focus()});
}
function openNeedsDetails(){
  showView('needs');renderNeeds();
  requestAnimationFrame(()=>el('needsList')?.scrollIntoView({behavior:'smooth',block:'start'}));
}
function openDistributeQuilts(){
  editNeedId=null;editNeedMode='details';showView('needs');renderNeeds();
  requestAnimationFrame(()=>{
    notice('needNotice','Choose a request below, then tap Mark Distributed.');
    const first=[...document.querySelectorAll('#needsList .need-card')].find(card=>!card.classList.contains('need-completed'));
    (first||el('needsList'))?.scrollIntoView({behavior:'smooth',block:'center'});
  });
}
function setMode(m){
  mode=m;el('modeIn').className=m==='IN'?'active-in':'';el('modeOut').className=m==='OUT'?'active-out':'';el('modeAdjust').className=m==='ADJUST'?'active-adjust':'';if(el('modeSet'))el('modeSet').className=m==='SET'?'active-set':'';
  el('dateLabel').textContent=m==='IN'?'Date In':m==='OUT'?'Date Out':m==='SET'?'Count Date':'Adjustment Date';
  const input=el('qtyInput');if(input){input.min=m==='SET'?'0':'1';input.placeholder=m==='SET'?'Enter current count':'Enter quantity'}
  if(el('adjustDirectionWrap'))el('adjustDirectionWrap').style.display=m==='ADJUST'?'block':'none';
  el('saveTxBtn').textContent=editTxId?'Save Changes':m==='IN'?'Add to Inventory':m==='OUT'?'Remove from Inventory':m==='SET'?'Set Current Count':'Review Adjustment';
}
function setQty(value){
  const parsed=Math.floor(Number(value)),minimum=mode==='SET'?0:1;
  qty=Number.isFinite(parsed)&&parsed>=minimum?parsed:minimum;
  if(el('qtyInput'))el('qtyInput').value=qty;
}
function clearQty(){qty=0;if(el('qtyInput'))el('qtyInput').value=''}
function syncQtyInput(){
  const input=el('qtyInput');if(!input)return;
  const raw=String(input.value??'').trim();
  if(raw===''){qty=0;return}
  const parsed=Math.floor(Number(raw)),minimum=mode==='SET'?0:1;
  qty=Number.isFinite(parsed)&&parsed>=minimum?parsed:-1;
}
function changeQty(d){syncQtyInput();const minimum=mode==='SET'?0:1;setQty(Math.max(minimum,(qty<minimum?minimum:qty)+d))}
function value(t){if(t.sourceType==='HOLD_DISTRIBUTION')return 0;if(t.type==='IN')return Number(t.qty)||0;if(t.type==='OUT')return-(Number(t.qty)||0);return Number(t.adjustment)||Number(t.qty)||0}
function activityValue(t){if(t.sourceType==='HOLD_DISTRIBUTION')return-(Number(t.qty)||0);return value(t)}
function transactionLabel(t){if(t.sourceType==='HOLD_TRANSFER_OUT')return'DEFERRED OUT';if(t.sourceType==='HOLD_RETURN')return'DEFERRED RETURN';if(t.sourceType==='HOLD_DISTRIBUTION')return'DEFERRED DISTRIBUTION';return t.type==='ADJUST'?'ADJUSTED':t.type}
function invMap(exclude=null){const m={};data.transactions.filter(t=>t.id!==exclude).forEach(t=>{const k=t.charity+'|'+t.size;m[k]=(m[k]||0)+value(t)});return m}
function onHand(c,s,exclude=null){return invMap(exclude)[c+'|'+s]||0}
function totalOnHand(exclude=null){return Object.values(invMap(exclude)).reduce((a,b)=>a+b,0)}
function saveTransaction(reviewed=false,reviewedAdjustment=null){
  const rawQuantity=String(el('qtyInput')?.value??'').trim();
  syncQtyInput();
  if(rawQuantity==='')return notice('txNotice',mode==='SET'?'Please enter the exact current count, including 0 when none remain.':'Please enter a quantity of 1 or more.');
  if(mode==='SET'?qty<0:qty<1)return notice('txNotice',mode==='SET'?'Current count must be zero or more.':'Please enter a quantity of 1 or more.');
  const c=el('txCharity').value,s=el('txSize').value,d=el('txDate').value||today(),noteText=el('txNote').value.trim();
  if(!c||!s)return notice('txNotice','Please select a charity and size.');
  const previous=editTxId?data.transactions.find(t=>t.id===editTxId):null;
  if(editTxId&&!previous)return notice('txNotice','This transaction could not be found. It may have changed on another device.');
  const current=onHand(c,s,editTxId);let adj=0,storedMode=mode,storedNote=noteText;
  if(mode==='SET'){
    adj=qty-current;
    if(adj===0)return notice('txNotice',`The current count is already ${qty} for ${c} — ${s}. No change was needed.`,true);
    storedMode='ADJUST';storedNote=`Set current count to ${qty}${noteText?' — '+noteText:''}`;
  }else if(mode==='ADJUST'){
    const direction=el('txAdjustmentDirection')?.value==='subtract'?-1:1;
    adj=reviewed&&Number.isFinite(reviewedAdjustment)?reviewedAdjustment:direction*qty;
  }
  const inventoryChange=storedMode==='IN'?qty:storedMode==='OUT'?-qty:adj;
  if(current+inventoryChange<0)return notice('txNotice',`This change would leave negative inventory for ${c} — ${s}. Current available after removing the old transaction is ${current}.`);
  const stamp=nowIso(),email=currentUserEmail();
  const draft={id:editTxId||uid(),date:d,type:storedMode,charity:c,size:s,qty:storedMode==='ADJUST'?Math.max(1,Math.abs(adj)):qty,adjustment:adj,note:storedNote,
    sourceNeedId:String(previous?.sourceNeedId||''),sourceHoldId:String(previous?.sourceHoldId||''),sourceType:String(previous?.sourceType||''),
    createdBy:previous?.createdBy||email,createdAt:previous?.createdAt||stamp,updatedBy:email,updatedAt:stamp};
  if(!reviewed){
    const editing=!!previous,typeLabel=mode==='IN'?`${data.itemName} In`:mode==='OUT'?`${data.itemName} Out`:mode==='SET'?'Set Current Count':'Inventory Adjustment';
    const metrics=transactionPreviewMetrics(previous,draft),beforeCategory=onHand(c,s),afterCategory=beforeCategory+(previous&&previous.charity===c&&previous.size===s?-value(previous):0)+value(draft);
    const sections=[homeReviewBubbles(metrics)];
    if(editing){
      sections.push('<div class="entry-review-details-heading">Current transaction</div>',transactionRecordSummary(previous));
      sections.push('<div class="entry-review-details-heading">Proposed transaction</div>',transactionRecordSummary(draft));
      if(previous.charity!==c||previous.size!==s){
        const oldBefore=onHand(previous.charity,previous.size),oldAfter=oldBefore-value(previous);
        sections.push(reviewTotals(`Inventory for ${previous.charity} — ${previous.size}`,oldBefore,oldAfter));
      }
    }else{
      sections.push('<div class="entry-review-details-heading">Inventory entry details</div>',transactionRecordSummary(draft));
    }
    sections.push(reviewTotals(`Inventory for ${c} — ${s}`,beforeCategory,afterCategory),reviewTotals(`Total ${lowerName()} in storage`,metrics.before.storage,metrics.after.storage));
    if(mode==='SET')sections.push(`<div class="entry-review-note">This records an adjustment of ${adj>0?'+':''}${adj} so the exact count becomes ${qty}.</div>`);
    openEntryReview(editing?'Review Inventory Changes':`Review ${typeLabel}`,sections.join(''),editing?'Save Inventory Changes':'Save Inventory Entry',()=>saveTransaction(true,adj));
    return;
  }
  if(editTxId){const i=data.transactions.findIndex(t=>t.id===editTxId);if(i<0)return notice('txNotice','This transaction no longer exists. Nothing was saved.');data.transactions[i]=draft}else data.transactions.push(draft);
  const editing=!!editTxId;
  save(editing?'Inventory transaction edited':mode==='SET'?'Current inventory count set':'Inventory transaction added');cancelTxEdit();renderAll();
  notice('txNotice',mode==='SET'?`Current count set to ${qty}. An adjustment of ${adj>0?'+':''}${adj} was recorded.`:editing?'Inventory changes saved.':'Saved successfully.',true);
  if(!editing)showView('home');
}
function editTx(id){
  const t=data.transactions.find(x=>x.id===id);if(!t)return;if(t.sourceNeedId){alert('This inventory transaction is linked to a charity distribution. Update it from Quilts Needed using Mark Distributed so the distribution and inventory stay matched.');prepareNeedDistribution(t.sourceNeedId);return}if(t.sourceHoldId){alert('This protected transaction belongs to an earlier deferred storage record, so it cannot be edited here.');return}editTxId=id;mode=t.type;qty=Math.abs(value(t))||1;refreshSelects();
  el('txCharity').value=t.charity;el('txSize').value=t.size;el('txDate').value=t.date;el('txNote').value=t.note||'';setQty(qty);
  if(el('txAdjustmentDirection'))el('txAdjustmentDirection').value=value(t)<0?'subtract':'add';
  el('cancelTxBtn').style.display='block';setMode(mode);showView('inventory');
}
function cancelTxEdit(){editTxId=null;clearQty();el('txCharity').value='';el('txSize').value='';el('txNote').value='';el('txDate').value=today();if(el('txAdjustmentDirection'))el('txAdjustmentDirection').value='add';el('cancelTxBtn').style.display='none';setMode(mode)}
function deleteTx(id){
  const t=data.transactions.find(x=>x.id===id);if(!t)return;
  if(t.sourceNeedId){alert('This inventory transaction is protected because it is linked to a charity distribution. Update the request with Mark Distributed instead.');prepareNeedDistribution(t.sourceNeedId);return}
  if(t.sourceHoldId){alert('This protected transaction belongs to an earlier deferred storage record, so it cannot be deleted here.');return}
  const metrics=transactionPreviewMetrics(t,null),beforeCategory=onHand(t.charity,t.size),afterCategory=beforeCategory-value(t);
  const summary=[
    homeReviewBubbles(metrics),
    '<div class="entry-review-details-heading">Transaction being deleted</div>',transactionRecordSummary(t),
    reviewTotals(`Inventory for ${t.charity} — ${t.size}`,beforeCategory,afterCategory),
    reviewTotals(`Total ${lowerName()} in storage`,metrics.before.storage,metrics.after.storage),
    '<div class="entry-review-warning">Deleting this transaction changes the calculated inventory. A recovery copy will be created before deletion.</div>'
  ].join('');
  openEntryReview('Review Inventory Deletion',summary,'Delete Inventory Transaction',()=>{
    const current=data.transactions.find(x=>x.id===id);if(!current){notice('txNotice','This transaction was already removed on another device.');return}
    createRecoverySnapshot('Before deleting an inventory transaction');data.transactions=data.transactions.filter(x=>x.id!==id);save('Inventory transaction deleted');renderAll();notice('txNotice','Inventory transaction deleted.',true);
  },'danger');
}
function renderInventory(){
  const groups={};Object.entries(invMap()).forEach(([k,n])=>{const split=k.lastIndexOf('|'),c=k.slice(0,split),s=k.slice(split+1);if(n!==0)(groups[c]??=[]).push({s,n})});
  const names=Object.keys(groups).sort();
  el('inventoryList').innerHTML=names.length?names.map(c=>`<div class="group"><div class="head"><div class="title">${esc(c)}</div><div class="badge">${groups[c].reduce((a,x)=>a+x.n,0)}</div></div>${groups[c].sort((a,b)=>a.s.localeCompare(b.s)).map(x=>`<div class="head" style="margin-top:8px"><div class="meta">${esc(x.s)}</div><b class="${x.n<0?'negative':''}">${x.n}</b></div>`).join('')}</div>`).join(''):`<div class="empty">No ${esc(lowerName())} currently in storage.</div>`;
}
function renderHistory(){
  const c=el('historyCharity').value,t=el('historyType').value;
  const list=[...data.transactions].filter(x=>(!c||x.charity===c)&&(!t||x.type===t)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  el('historyList').innerHTML=list.length?list.map(x=>{const n=activityValue(x),inventoryEffect=value(x);return`<div class="item"><div class="head"><div><div class="title ${n<0?'negative':'positive'}">${n>0?'+':''}${n} ${esc(x.size)}</div><div class="meta">${esc(x.charity)} · Activity date ${fmtDate(x.date)}</div>${x.note?`<div class="meta">${esc(x.note)}</div>`:''}${x.sourceType==='HOLD_DISTRIBUTION'?'<div class="meta">Earlier deferred distribution record.</div>':''}${auditText(x)?`<div class="audit-meta">${esc(auditText(x))}</div>`:''}${x.type==='ADJUST'?'<div class="meta"><span class="flag">Adjusted inventory</span></div>':''}${x.sourceNeedId?'<div class="meta"><span class="flag distribution-link-flag">Linked distribution</span></div>':''}${x.sourceHoldId?'<div class="meta"><span class="flag">Deferred record</span></div>':''}</div><b>${transactionLabel(x)}</b></div><div class="actions"><button onclick="editTx('${x.id}')">Edit</button><button onclick="deleteTx('${x.id}')">Delete</button></div></div>`}).join(''):'<div class="empty">No matching history.</div>';
}
function fulfilledQty(n){return Math.max(0,Math.floor(Number(n?.fulfilledQty||0)))}
function remainingNeed(n){return Math.max(0,Math.max(1,Number(n?.qty||1))-fulfilledQty(n))}
function needIsComplete(n){return remainingNeed(n)===0}
function needIsPastDue(n){return String(n?.month||'')<monthNow()&&!needIsComplete(n)}
function distributionText(n){
  const sent=fulfilledQty(n);if(!sent)return'';
  return`Distributed ${sent}${n.fulfilledDate?' on '+fmtDate(n.fulfilledDate):''}${n.fulfilledBy?' by '+n.fulfilledBy:''}`;
}
function showNeedSaveMessage(target,msg,good=false){
  if(typeof target==='string')return notice(target,msg,good);
  if(!target)return;
  target.textContent=msg;target.className='notice show'+(good?' good':'');
  clearTimeout(target.t);target.t=setTimeout(()=>target.className='notice',5000);
}
function openEntryReview(title,summaryHtml,confirmLabel,action,tone='primary'){
  entryReviewAction=typeof action==='function'?action:null;
  el('entryReviewTitle').textContent=title;
  el('entryReviewSummary').innerHTML=summaryHtml;
  const confirmButton=el('entryReviewConfirm');
  confirmButton.textContent=confirmLabel||'Save Entry';
  confirmButton.className=tone==='danger'?'danger':'primary';
  modalOpen('entryReviewModal');
  requestAnimationFrame(()=>confirmButton?.focus());
}
function closeEntryReview(){modalClose('entryReviewModal');entryReviewAction=null}
function confirmEntryReview(){
  const action=entryReviewAction;entryReviewAction=null;modalClose('entryReviewModal');
  if(action)action();
}
function reviewLine(label,value){return`<div class="entry-review-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`}
function reviewTotals(label,current,next){const difference=Number(next)-Number(current),state=difference>0?'increase':difference<0?'decrease':'unchanged';return`<div class="entry-review-total change-${state}"><span>${esc(label)}</span><b>${esc(current)} → ${esc(next)}</b></div>`}
function reviewChangeText(label,current,next){
  const difference=Number(next)-Number(current),amount=Math.abs(difference);
  const wording=difference>0?`${amount} ${amount===1?'quilt':'quilts'} will be added to ${label}`:difference<0?`${amount} ${amount===1?'quilt':'quilts'} will be subtracted from ${label}`:`No change to ${label}`;
  return`<div class="entry-review-change ${difference>0?'increase':difference<0?'decrease':'unchanged'}">${esc(wording)}.</div>`
}
function sumMapValues(map){return Object.values(map||{}).reduce((sum,value)=>sum+Number(value||0),0)}
function homeMetricsFromMaps(afterInventory,afterRequested){
  const beforeStorage=totalOnHand(),beforeNeeded=totalNeeded(),beforeDifference=quiltsToCompleteTotal();
  const inventory=afterInventory||invMap(),requested=afterRequested||requestedNeedsMap();
  const keys=unique([...Object.keys(inventory),...Object.keys(requested)]);
  const afterDifference=keys.reduce((sum,key)=>sum+Math.max(0,Number(requested[key]||0)-Number(inventory[key]||0)),0);
  return{before:{storage:beforeStorage,needed:beforeNeeded,difference:beforeDifference},after:{storage:sumMapValues(inventory),needed:sumMapValues(requested),difference:afterDifference}}
}
function homePreviewMetrics(charity,size,inventoryChange=0,neededChange=0){
  const inventory=invMap(),requested=requestedNeedsMap(),key=charity+'|'+size;
  inventory[key]=(Number(inventory[key])||0)+Number(inventoryChange||0);
  requested[key]=(Number(requested[key])||0)+Number(neededChange||0);
  return homeMetricsFromMaps(inventory,requested)
}
function homeReviewBubbles(metrics){
  const cards=[
    {key:'storage',label:data.homeStorageLabel||DEFAULT_HOME_STORAGE_LABEL},
    {key:'needed',label:data.homeNeededLabel||DEFAULT_HOME_NEEDED_LABEL},
    {key:'difference',label:data.homeDifferenceLabel||DEFAULT_HOME_DIFFERENCE_LABEL}
  ];
  return`<div class="entry-review-home-wrap"><div class="entry-review-home-heading">Home screen preview</div><div class="entry-review-home-grid">${cards.map(card=>{const before=metrics.before[card.key],after=metrics.after[card.key],state=after>before?'increase':after<before?'decrease':'unchanged';return`<div class="entry-review-home-card change-${state}"><span>${esc(card.label)}</span><div class="entry-review-before-after"><div><small>Before</small><b>${before}</b></div><div class="entry-review-arrow">→</div><div><small>After</small><b>${after}</b></div></div>${reviewChangeText(card.label,before,after)}</div>`}).join('')}</div></div>`
}
function signedQuantity(number){const value=Number(number||0);return`${value>0?'+':''}${value}`}
function transactionPreviewMetrics(previous,draft){
  const inventory=invMap(),requested=requestedNeedsMap();
  const apply=(record,multiplier)=>{
    if(!record)return;
    const key=record.charity+'|'+record.size;
    inventory[key]=(Number(inventory[key])||0)+multiplier*value(record);
  };
  apply(previous,-1);apply(draft,1);
  return homeMetricsFromMaps(inventory,requested)
}
function needPreviewMetrics(previous,draft,inventoryChange=0){
  const inventory=invMap(),requested=requestedNeedsMap();
  if(inventoryChange){
    const key=draft.charity+'|'+draft.size;
    inventory[key]=(Number(inventory[key])||0)+Number(inventoryChange||0);
  }
  const applyNeed=(record,multiplier)=>{
    if(!record||String(record.month||'')<monthNow())return;
    const remaining=Math.max(0,Math.floor(Number(record.qty||0))-Math.floor(Number(record.fulfilledQty||0)));
    const key=record.charity+'|'+record.size;
    requested[key]=(Number(requested[key])||0)+multiplier*remaining;
  };
  applyNeed(previous,-1);applyNeed(draft,1);
  return homeMetricsFromMaps(inventory,requested)
}
function transactionRecordSummary(record,prefix=''){
  if(!record)return'';
  const label=transactionLabel(record),effect=value(record);
  return[
    reviewLine(`${prefix}Type`,label),reviewLine(`${prefix}Charity`,record.charity),reviewLine(`${prefix}Size`,record.size),
    reviewLine(`${prefix}Inventory effect`,signedQuantity(effect)),reviewLine(`${prefix}Date`,fmtDate(record.date)),
    record.note?reviewLine(`${prefix}Note`,record.note):''
  ].join('')
}
function needRecordSummary(record,prefix=''){
  if(!record)return'';
  const sent=Math.max(0,Math.floor(Number(record.fulfilledQty||0))),remaining=Math.max(0,Math.floor(Number(record.qty||0))-sent);
  return[
    reviewLine(`${prefix}Month needed`,fmtMonth(record.month)),reviewLine(`${prefix}Charity`,record.charity),reviewLine(`${prefix}Size`,record.size),
    reviewLine(`${prefix}Quilts needed`,String(record.qty)),reviewLine(`${prefix}Distributed`,String(sent)),reviewLine(`${prefix}Still needed`,String(remaining)),
    sent?reviewLine(`${prefix}Distribution date`,record.fulfilledDate?fmtDate(record.fulfilledDate):'Not entered'):'',record.note?reviewLine(`${prefix}Note`,record.note):''
  ].join('')
}
function needValuesFromMainForm(){
  return{
    month:el('needMonth').value||monthNow(),charity:el('needCharity').value,size:el('needSize').value,
    qty:el('needQty').value,note:el('needNote').value.trim(),fulfilledQty:0,fulfilledDate:'',recordOut:false
  };
}
function needValuesFromInlineForm(form){
  const field=name=>form.querySelector(`[name="${name}"]`);
  return{
    month:field('month')?.value||monthNow(),charity:field('charity')?.value||'',size:field('size')?.value||'',
    qty:field('qty')?.value,note:String(field('note')?.value||'').trim(),fulfilledQty:field('fulfilledQty')?.value,
    fulfilledDate:field('fulfilledDate')?.value||'',recordOut:!!field('recordOut')?.checked
  };
}
function persistNeedRecord(values,id=null,messageTarget='needNotice',options={}){
  const previous=id?data.needs.find(n=>n.id===id):null,stamp=nowIso(),email=currentUserEmail();
  if(id&&!previous){showNeedSaveMessage(messageTarget,'This charity request could not be found. It may have changed on another device.');editNeedId=null;renderNeeds();return false}
  const needQty=Math.floor(Number(values.qty));
  if(!Number.isFinite(needQty)||needQty<1){showNeedSaveMessage(messageTarget,'Quilts Needed must be 1 or more.');return false}
  const sentRaw=Math.floor(Number(values.fulfilledQty||0));
  if(!Number.isFinite(sentRaw)||sentRaw<0){showNeedSaveMessage(messageTarget,'Quantity Distributed must be zero or more.');return false}
  const sentDate=String(values.fulfilledDate||'');
  if(sentRaw>0&&!sentDate){showNeedSaveMessage(messageTarget,'Please enter the distribution date.');return false}
  const charity=String(values.charity||''),size=String(values.size||'');
  if(!charity||!size){showNeedSaveMessage(messageTarget,'Please select a charity and size.');return false}
  if(!id&&!options.reviewed){
    const month=String(values.month||monthNow());
    const monthCurrent=data.needs.filter(n=>String(n.month||'')===month).reduce((sum,n)=>sum+Math.max(1,Math.floor(Number(n.qty||1))),0);
    const monthAfter=monthCurrent+needQty,activeCurrent=totalNeeded(),activeAfter=activeCurrent+(month>=monthNow()?needQty:0);
    const activeNeededChange=month>=monthNow()?needQty:0;
    const homeMetrics=homePreviewMetrics(charity,size,0,activeNeededChange);
    const summary=[
      homeReviewBubbles(homeMetrics),
      '<div class="entry-review-details-heading">Need details</div>',
      reviewLine('Month needed',fmtMonth(month)),reviewLine('Charity',charity),reviewLine('Size',size),reviewLine('Quilts needed',String(needQty)),
      String(values.note||'').trim()?reviewLine('Note',String(values.note||'').trim()):'',
      reviewTotals(`Requests in ${fmtMonth(month)}`,monthCurrent,monthAfter),reviewTotals('Total active quilts requested',activeCurrent,activeAfter),
      '<div class="entry-review-note entry-review-distribution-note">Distribution is not part of this entry. After saving, use Mark Distributed on the request when quilts are delivered.</div>'
    ].join('');
    openEntryReview('Review New Charity Need',summary,'Save Charity Need',options.onConfirm||(()=>persistNeedRecord(values,null,messageTarget,{reviewed:true})));
    return false;
  }
  const previousSent=fulfilledQty(previous),priorAutoOut=Math.max(0,Math.floor(Number(previous?.autoOutQty||0)));
  if(previous&&priorAutoOut>0&&(charity!==previous.charity||size!==previous.size)){
    showNeedSaveMessage(messageTarget,'This request already has inventory linked to its distribution. Keep the same charity and size, or first reduce Quantity Distributed to 0 so the linked inventory can be restored safely.');return false
  }
  const fulfillmentChanged=sentRaw!==previousSent||sentDate!==String(previous?.fulfilledDate||'');
  const priorHighWater=Math.max(previousSent,Math.floor(Number(previous?.fulfilledHighWater??previousSent)||0));
  const recordOut=!!values.recordOut,autoRestoreNeeded=Math.max(0,priorAutoOut-sentRaw),autoOutNeeded=recordOut?Math.max(0,sentRaw-priorAutoOut):0;
  const recordId=id||uid();
  if(autoOutNeeded>0){
    const current=onHand(charity,size);
    if(autoOutNeeded>current){showNeedSaveMessage(messageTarget,`Only ${current} are in storage for ${charity} — ${size}. Leave the Inventory Out box unchecked only if this distribution was already recorded separately.`);return false}
  }
  const previewRecord={id:recordId,month:String(values.month||monthNow()),charity,size,qty:needQty,note:String(values.note||'').trim(),fulfilledQty:sentRaw,fulfilledDate:sentRaw?sentDate:'',autoOutQty:Math.max(0,priorAutoOut-autoRestoreNeeded)+autoOutNeeded};
  if(id&&!options.reviewed){
    const inventoryChange=autoRestoreNeeded-autoOutNeeded,metrics=needPreviewMetrics(previous,previewRecord,inventoryChange);
    const oldRemaining=Math.max(0,Math.floor(Number(previous.qty||0))-previousSent),newRemaining=Math.max(0,needQty-sentRaw);
    const summary=[
      homeReviewBubbles(metrics),
      '<div class="entry-review-details-heading">Current charity need</div>',needRecordSummary(previous),
      '<div class="entry-review-details-heading">Proposed charity need</div>',needRecordSummary(previewRecord),
      reviewTotals('Still needed for this request',oldRemaining,newRemaining)
    ];
    if(autoOutNeeded>0)summary.push(`<div class="entry-review-note">${autoOutNeeded} ${autoOutNeeded===1?'quilt':'quilts'} will be subtracted from inventory for ${esc(charity)} — ${esc(size)}.</div>`);
    else if(autoRestoreNeeded>0)summary.push(`<div class="entry-review-note">${autoRestoreNeeded} ${autoRestoreNeeded===1?'quilt':'quilts'} will be added back to inventory for ${esc(charity)} — ${esc(size)}.</div>`);
    else if(sentRaw>previousSent&&!recordOut)summary.push(`<div class="entry-review-note entry-review-distribution-note">Distribution increases by ${sentRaw-previousSent}, but inventory will not change. Continue only when those quilts were already recorded separately as Quilts Out.</div>`);
    else summary.push('<div class="entry-review-note entry-review-distribution-note">Inventory will not change as part of this edit.</div>');
    const distributionChange=sentRaw!==previousSent||sentDate!==String(previous.fulfilledDate||'');
    openEntryReview(distributionChange?'Review Distribution Changes':'Review Charity Need Changes',summary.join(''),distributionChange?'Save Distribution Changes':'Save Charity Need Changes',options.onConfirm||(()=>persistNeedRecord(values,id,messageTarget,{...options,reviewed:true})));
    return false;
  }
  const r={id:recordId,month:String(values.month||monthNow()),charity,size,qty:needQty,note:String(values.note||'').trim(),
    fulfilledQty:sentRaw,fulfilledDate:sentRaw?sentDate:'',fulfilledBy:fulfillmentChanged?(sentRaw?email:''):String(previous?.fulfilledBy||''),fulfilledAt:fulfillmentChanged?(sentRaw?stamp:''):String(previous?.fulfilledAt||''),
    fulfilledHighWater:Math.max(priorHighWater,sentRaw),autoOutQty:Math.max(0,priorAutoOut-autoRestoreNeeded),
    createdBy:previous?.createdBy||email,createdAt:previous?.createdAt||stamp,updatedBy:email,updatedAt:stamp};
  if(previous&&sentRaw>0&&sentDate&&sentDate!==String(previous.fulfilledDate||''))syncLinkedNeedDistributionDates(r.id,sentDate,email,stamp);
  const effectiveCorrectionDate=sentRaw>0&&sentDate?sentDate:String(previous?.fulfilledDate||sentDate||today());
  if(autoRestoreNeeded>0){
    data.transactions.push({id:uid(),date:effectiveCorrectionDate,type:'IN',charity:r.charity,size:r.size,qty:autoRestoreNeeded,adjustment:0,
      note:`Distribution correction for ${fmtMonth(r.month)} charity request`,sourceNeedId:r.id,sourceType:'NEED_DISTRIBUTION_CORRECTION',createdBy:email,createdAt:stamp,updatedBy:email,updatedAt:stamp});
  }
  if(autoOutNeeded>0){
    data.transactions.push({id:uid(),date:r.fulfilledDate,type:'OUT',charity:r.charity,size:r.size,qty:autoOutNeeded,adjustment:0,
      note:`Distributed for ${fmtMonth(r.month)} charity request`,sourceNeedId:r.id,sourceType:'NEED_DISTRIBUTION',createdBy:email,createdAt:stamp,updatedBy:email,updatedAt:stamp});
    r.autoOutQty+=autoOutNeeded;
  }
  if(id){const i=data.needs.findIndex(n=>n.id===id);if(i<0)return false;data.needs[i]=r}else data.needs.push(r);
  save(id?'Charity request edited':'Charity request added');editNeedId=null;editNeedMode='details';renderAll();
  const balance=onHand(r.charity,r.size);
  if(autoRestoreNeeded>0)notice('needNotice',`Distribution corrected. ${autoRestoreNeeded} added back to inventory; ${balance} now remain for ${r.charity} — ${r.size}.`,true);
  else if(autoOutNeeded>0)notice('needNotice',`Distribution saved. ${autoOutNeeded} removed from inventory; ${balance} now remain for ${r.charity} — ${r.size}.`,true);
  else if(id)notice('needNotice','Charity request changes saved. Inventory was not changed.',true);else notice('needNotice',sentRaw>=needQty?'Charity request marked distributed.':'Charity request saved.',true);
  if(!id)showView('home');
  return true;
}
function saveNeed(reviewed=false){
  const ok=persistNeedRecord(needValuesFromMainForm(),null,'needNotice',{reviewed,onConfirm:()=>saveNeed(true)});
  if(ok){
    el('needMonth').value=monthNow();el('needCharity').value='';el('needSize').value='';el('needQty').value=1;el('needNote').value='';
  }
  return ok;
}
function prepareNeedDistribution(id){editNeed(id,true)}
function editNeed(id,distribution=false){
  const n=data.needs.find(x=>x.id===id);if(!n)return;
  editNeedId=id;editNeedMode=distribution?'distribution':'details';showView('needs');renderNeeds();
  requestAnimationFrame(()=>{
    const form=[...document.querySelectorAll('.need-inline-editor')].find(x=>x.dataset.needEditId===id);if(!form)return;
    if(distribution){
      const qtyField=form.querySelector('[name="fulfilledQty"]'),dateField=form.querySelector('[name="fulfilledDate"]');
      const missingOut=Math.max(0,fulfilledQty(n)-Math.max(0,Math.floor(Number(n.autoOutQty||0))));
      showNeedSaveMessage(form.querySelector('.inline-need-notice'),missingOut>0?`${missingOut} distributed ${lowerName()} have not yet been removed from inventory. Leave the box checked and save to remove them now.`:`Edit the distribution directly in this card. Leave the box checked only for newly distributed quilts that have not already been entered as Quilts Out.`);
      qtyField?.focus();
    }else form.querySelector('[name="month"]')?.focus();
    form.scrollIntoView({behavior:'smooth',block:'center'});
  });
}
function saveInlineNeed(event,id){
  event?.preventDefault();
  const form=event?.currentTarget?.classList?.contains('need-inline-editor')?event.currentTarget:[...document.querySelectorAll('.need-inline-editor')].find(x=>x.dataset.needEditId===id);
  if(!form)return false;
  return persistNeedRecord(needValuesFromInlineForm(form),id,form.querySelector('.inline-need-notice'));
}
function updateInlineNeedPreview(form){
  if(!form)return;
  const qty=Math.max(1,Math.floor(Number(form.querySelector('[name="qty"]')?.value||1)));
  const sent=Math.max(0,Math.floor(Number(form.querySelector('[name="fulfilledQty"]')?.value||0)));
  const target=form.querySelector('[data-inline-remaining]');if(target)target.textContent=String(Math.max(0,qty-sent));
}
function cancelNeedEdit(){editNeedId=null;editNeedMode='details';renderNeeds()}
function deleteNeed(id){
  const n=data.needs.find(x=>x.id===id);if(!n)return;
  const linkedTransactions=data.transactions.filter(t=>t.sourceNeedId===id),linkedOut=Math.max(0,Math.floor(Number(n.autoOutQty||0)));
  if(linkedTransactions.length){
    const guidance=linkedOut>0?`Open Mark Distributed and correct the quantity there. The app will safely restore any inventory that should remain.`:`The linked inventory entries balance to zero, but the request is retained as the audit record for those corrections.`;
    alert(`This charity request cannot be deleted because ${linkedTransactions.length} protected inventory transaction${linkedTransactions.length===1?' is':'s are'} linked to it.\n\n${guidance}`);prepareNeedDistribution(id);return
  }
  const metrics=needPreviewMetrics(n,null,0),remaining=Math.max(0,Math.floor(Number(n.qty||0))-fulfilledQty(n));
  const summary=[
    homeReviewBubbles(metrics),
    '<div class="entry-review-details-heading">Charity need being deleted</div>',needRecordSummary(n),
    reviewTotals('Still needed for this request',remaining,0),
    '<div class="entry-review-warning">This removes the charity need. Inventory transactions are not deleted or changed. A recovery copy will be created first.</div>'
  ].join('');
  openEntryReview('Review Charity Need Deletion',summary,'Delete Charity Need',()=>{
    const current=data.needs.find(x=>x.id===id);if(!current){notice('needNotice','This charity need was already removed on another device.');return}
    if(data.transactions.some(t=>t.sourceNeedId===id)){notice('needNotice','This charity need now has protected inventory transactions and cannot be deleted.');prepareNeedDistribution(id);return}
    createRecoverySnapshot('Before deleting a charity request');data.needs=data.needs.filter(x=>x.id!==id);if(editNeedId===id){editNeedId=null;editNeedMode='details'}save('Charity request deleted');renderAll();if(calendarModalNeedId===id)closeCalendarNeedModal();notice('needNotice','Charity need deleted.',true);
  },'danger');
}
function upcoming(){return data.needs.filter(n=>n.month>=monthNow()&&remainingNeed(n)>0)}
function totalNeeded(){return upcoming().reduce((a,n)=>a+remainingNeed(n),0)}
function yearOf(value){const match=String(value||'').match(/^(\d{4})/);return match?Number(match[1]):0}
function statisticsYears(){
  const current=Number(monthNow().slice(0,4));
  return unique([current,...data.transactions.map(t=>yearOf(t.date)).filter(Boolean),...data.needs.map(n=>yearOf(n.fulfilledDate)).filter(Boolean)]).map(Number).sort((a,b)=>b-a);
}
function fillStatisticsYearSelect(){
  const select=el('reportStatsYear');if(!select)return Number(monthNow().slice(0,4));
  const current=Number(monthNow().slice(0,4)),years=statisticsYears(),old=Number(select.value)||current;
  select.innerHTML=years.map(year=>`<option value="${year}">${year}</option>`).join('');select.value=years.includes(old)?String(old):String(current);return Number(select.value)||current;
}
function selectedStatisticsYear(){return Number(el('reportStatsYear')?.value)||Number(monthNow().slice(0,4))}
function distributionActivityValue(record){
  const amount=Math.max(0,Number(record?.qty)||0);
  if(record?.type==='OUT'&&record.sourceType!=='HOLD_TRANSFER_OUT')return amount;
  if(record?.type==='IN'&&record.sourceType==='NEED_DISTRIBUTION_CORRECTION')return-amount;
  return 0;
}
function yearlyStatistics(year=Number(monthNow().slice(0,4))){
  const transactions=data.transactions.filter(t=>yearOf(t.date)===Number(year));
  const made=transactions.filter(t=>t.type==='IN'&&!['NEED_DISTRIBUTION_CORRECTION','HOLD_RETURN'].includes(t.sourceType)).reduce((sum,t)=>sum+Math.max(0,Number(t.qty)||0),0);
  const distributed=Math.max(0,transactions.reduce((sum,t)=>sum+distributionActivityValue(t),0));
  const netChange=transactions.reduce((sum,t)=>sum+value(t),0);
  const charityDistributionTotals={};
  transactions.forEach(t=>{const amount=distributionActivityValue(t);if(amount&&t.charity)charityDistributionTotals[t.charity]=(charityDistributionTotals[t.charity]||0)+amount});
  const charitiesServed=Object.values(charityDistributionTotals).filter(amount=>amount>0).length;
  const lifetimeDistributed=Math.max(0,data.transactions.reduce((sum,t)=>sum+distributionActivityValue(t),0));
  return{year:Number(year),made,distributed,netChange,currentInventory:totalOnHand(),charitiesServed,lifetimeDistributed,reportDate:today()};
}
function yearlyStatisticsHTML(stats){
  return`<div class="yearly-stat"><b>${stats.made}</b><span>Quilts Made in ${stats.year}</span></div><div class="yearly-stat"><b>${stats.distributed}</b><span>Quilts Distributed in ${stats.year}</span></div><div class="yearly-stat"><b class="${differenceClass(stats.netChange)}">${signedDifference(stats.netChange)}</b><span>Net Inventory Change</span></div><div class="yearly-stat"><b>${stats.currentInventory}</b><span>Current Inventory</span></div><div class="yearly-stat"><b>${stats.charitiesServed}</b><span>Charities Served</span></div><div class="yearly-stat"><b>${stats.lifetimeDistributed}</b><span>Lifetime Quilts Distributed</span></div>`;
}
function renderHomeYearStatistics(){
  const stats=yearlyStatistics();if(el('homeStatsYear'))el('homeStatsYear').textContent=String(stats.year);if(el('homeMadeThisYear'))el('homeMadeThisYear').textContent=String(stats.made);if(el('homeDistributedThisYear'))el('homeDistributedThisYear').textContent=String(stats.distributed);
}
function openYearlyStatistics(){showView('reports');renderReports();requestAnimationFrame(()=>el('yearlyStatsCard')?.scrollIntoView({behavior:'smooth',block:'start'}))}
function sortedNeedsForPlanning(list=data.needs){return[...list].sort((a,b)=>a.month.localeCompare(b.month)||a.charity.localeCompare(b.charity)||a.size.localeCompare(b.size)||String(a.createdAt||a.id).localeCompare(String(b.createdAt||b.id)))}
function allocateNeedsForPlanning(list=data.needs){
  const remaining=invMap();
  return sortedNeedsForPlanning(list).map(n=>{
    const key=n.charity+'|'+n.size,available=Math.max(0,Number(remaining[key]||0)),need=remainingNeed(n),shortage=Math.max(0,need-available);
    if(need>0)remaining[key]=Math.max(0,available-need);
    return{n,available,shortage,covered:Math.min(need,available),remaining:need,fulfilled:fulfilledQty(n)};
  });
}
function allocationForNeed(target,allocations=null){
  const available=Math.max(0,onHand(target.charity,target.size)),need=remainingNeed(target);
  return(allocations||allocateNeedsForPlanning()).find(item=>item.n.id===target.id)||{n:target,available,shortage:Math.max(0,need-available),covered:Math.min(need,available),remaining:need,fulfilled:fulfilledQty(target)};
}
function quiltsToCompleteTotal(){
  const inventory=invMap(),requested=requestedNeedsMap();
  return unique([...Object.keys(inventory),...Object.keys(requested)]).reduce((sum,key)=>sum+Math.max(0,Number(requested[key]||0)-Number(inventory[key]||0)),0);
}
function shortageTotal(){return quiltsToCompleteTotal()}
function needInlineEditor(n,stateClass,stateLabel,info,editorMode='details'){
  const charityOptions=data.charities.map(c=>`<option value="${esc(c)}"${c===n.charity?' selected':''}>${esc(c)}</option>`).join('');
  const sizeOptions=data.sizes.map(size=>`<option value="${esc(size)}"${size===n.size?' selected':''}>${esc(size)}</option>`).join('');
  const sent=fulfilledQty(n),remaining=remainingNeed(n),complete=remaining===0,pastDue=needIsPastDue(n),available=Math.max(0,Number(info?.available||0)),short=Math.max(0,Number(info?.shortage||0));
  let metricTwo='',metricThree='';
  if(complete){metricTwo=`<div><b>${sent}</b><span>Sent</span></div>`;metricThree=`<div><b class="positive">0</b><span>Still Needed</span></div>`}
  else if(sent>0||pastDue){metricTwo=`<div><b>${sent}</b><span>Sent</span></div>`;metricThree=`<div><b class="${pastDue?'negative':''}">${remaining}</b><span>Still Needed</span></div>`}
  else{metricTwo=`<div><b>${available}</b><span>Available for this request</span></div>`;metricThree=`<div><b class="${short?'negative':'positive'}">${short}</b><span>Shortage</span></div>`}
  const distributionQty=sent||Number(n.qty)||1,distributionDate=n.fulfilledDate||today();
  const planner=editorMode==='distribution'
    ?`<div class="planner-edit-cell"><input name="qty" type="number" inputmode="numeric" min="1" step="1" value="${Number(n.qty)||1}" oninput="updateInlineNeedPreview(this.form)" aria-label="Quilts requested"><span>Quilts Needed</span></div>
      <div class="planner-edit-cell"><input name="fulfilledQty" type="number" inputmode="numeric" min="0" step="1" value="${distributionQty}" oninput="updateInlineNeedPreview(this.form)" aria-label="Quantity sent"><span>Sent</span></div>
      <div><b data-inline-remaining>${Math.max(0,(Number(n.qty)||1)-distributionQty)}</b><span>Still Needed</span></div>`
    :`<div class="planner-edit-cell"><input name="qty" type="number" inputmode="numeric" min="1" step="1" value="${Number(n.qty)||1}" aria-label="Quilts requested"><span>Quilts Needed</span></div>${metricTwo}${metricThree}`;
  const distributionFields=editorMode==='distribution'
    ?`<div class="direct-distribution-row"><label>Date Distributed<input name="fulfilledDate" type="date" value="${esc(distributionDate)}"></label><label class="check-row inline-check"><input name="recordOut" type="checkbox" checked><span>Remove newly distributed quantity from ${esc(data.itemName)} inventory</span></label></div>
      <p class="small direct-edit-help">This is checked automatically. Uncheck it only when the same quilts were already entered as Quilts Out on the Inventory screen.</p>`
    :`<input name="fulfilledQty" type="hidden" value="${sent}"><input name="fulfilledDate" type="hidden" value="${esc(n.fulfilledDate||'')}"><input name="recordOut" type="checkbox" hidden>`;
  return`<form class="item need-card need-inline-editor ${stateClass}" data-need-edit-id="${esc(n.id)}" onsubmit="return saveInlineNeed(event,this.dataset.needEditId)">
    <div class="head direct-edit-head">
      <div class="direct-edit-identification">
        <div class="direct-title-row"><input class="direct-month" name="month" type="month" value="${esc(n.month)}" required aria-label="Month needed"><span>—</span><select class="direct-charity" name="charity" required aria-label="Charity">${charityOptions}</select></div>
        <div class="direct-meta-row"><select name="size" required aria-label="Size">${sizeOptions}</select><input name="note" value="${esc(n.note||'')}" placeholder="Optional note" aria-label="Note"></div>
        ${auditText(n)?`<div class="audit-meta">${esc(auditText(n))}</div>`:''}
      </div>
      <span class="need-status">${stateLabel}</span>
    </div>
    <div class="planner direct-edit-planner">${planner}</div>
    ${distributionFields}
    <div class="notice inline-need-notice"></div>
    <div class="inline-edit-actions"><button type="submit" class="inline-save">Save Changes</button><button type="button" class="inline-cancel" onclick="cancelNeedEdit()">Cancel</button><button type="button" class="need-delete-button" onclick="deleteNeed(this.closest('.need-inline-editor').dataset.needEditId)">Delete</button></div>
  </form>`;
}
function needCard(n,actions=true,allocation=null){
  const info=allocation||allocationForNeed(n),available=info.available,short=info.shortage,sent=fulfilledQty(n),remaining=remainingNeed(n),complete=remaining===0,pastDue=needIsPastDue(n);
  let stateClass,stateLabel,planner,detail='';
  if(complete){
    stateClass='need-completed';stateLabel='Distributed';
    planner=`<div><b>${n.qty}</b><span>Quilts Needed</span></div><div><b>${sent}</b><span>Sent</span></div><div><b class="positive">0</b><span>Still Needed</span></div>`;
    detail=`<div class="distribution-meta">✓ ${esc(distributionText(n)||'Distribution completed')}</div>`;
  }else if(sent>0||pastDue){
    stateClass=pastDue?'need-pastdue':'need-partial';stateLabel=pastDue?'Past Due': 'Partially Sent';
    planner=`<div><b>${n.qty}</b><span>Quilts Needed</span></div><div><b>${sent}</b><span>Sent</span></div><div><b class="${pastDue?'negative':''}">${remaining}</b><span>Still Needed</span></div>`;
    detail=`<div class="distribution-meta">${sent?esc(distributionText(n))+' · ':''}Available for this request ${available} · Short ${short}</div>`;
  }else{
    stateClass=short===0?'need-covered':available>0?'need-partial':'need-shortage';stateLabel=short===0?'Covered':available>0?'Partial':'Shortage';
    planner=`<div><b>${n.qty}</b><span>Quilts Needed</span></div><div><b>${available}</b><span>Available for this request</span></div><div><b class="${short?'negative':'positive'}">${short}</b><span>Shortage</span></div>`;
  }
  if(actions&&editNeedId===n.id)return needInlineEditor(n,stateClass,stateLabel,info,editNeedMode);
  const actionButtons=actions?`<div class="actions need-actions"><button class="need-edit-button" onclick="editNeed(this.closest('.need-card').dataset.needId)">Edit</button><button class="need-distribute-button" onclick="prepareNeedDistribution(this.closest('.need-card').dataset.needId)">${complete?'Update Distribution':'Mark Distributed'}</button><button class="need-delete-button" onclick="deleteNeed(this.closest('.need-card').dataset.needId)">Delete</button></div>`:'';
  return`<div class="item need-card ${stateClass}" data-need-id="${esc(n.id)}"><div class="head"><div><div class="title">${fmtMonth(n.month)} — ${esc(n.charity)}</div><div class="meta">${esc(n.size)}${n.note?' · '+esc(n.note):''}</div>${auditText(n)?`<div class="audit-meta">${esc(auditText(n))}</div>`:''}</div><span class="need-status">${stateLabel}</span></div><div class="planner">${planner}</div>${detail}${actionButtons}</div>`;
}
function calendarYears(){
  const current=Number(monthNow().slice(0,4));
  return unique([current-1,current,current+1,current+2,...data.needs.map(n=>Number(String(n.month).slice(0,4))).filter(Boolean)]).map(Number).sort((a,b)=>a-b);
}
function fillCalendarYearSelect(id){
  const select=el(id);if(!select)return;
  const current=Number(monthNow().slice(0,4)),years=calendarYears(),old=Number(select.value)||current;
  select.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');select.value=years.includes(old)?String(old):String(current);
}
function refreshCalendarYears(){fillCalendarYearSelect('calendarYear')}
function calendarMarkup(year,charity='',size='',showAddButtons=true,interactive=true){
  const allocations=allocateNeedsForPlanning(),byId=new Map(allocations.map(item=>[item.n.id,item]));
  const monthNames=Array.from({length:12},(_,i)=>new Date(year,i,1).toLocaleDateString(undefined,{month:'short'}));
  return monthNames.map((name,index)=>{
    const month=`${year}-${String(index+1).padStart(2,'0')}`;
    const list=data.needs.filter(n=>n.month===month&&(!charity||n.charity===charity)&&(!size||n.size===size)).sort((a,b)=>a.charity.localeCompare(b.charity)||a.size.localeCompare(b.size)||String(a.createdAt||a.id).localeCompare(String(b.createdAt||b.id)));
    const rows=list.map(n=>byId.get(n.id)||allocationForNeed(n,allocations));
    const needed=list.reduce((sum,n)=>sum+Number(n.qty||0),0),sent=list.reduce((sum,n)=>sum+fulfilledQty(n),0),remainingTotal=list.reduce((sum,n)=>sum+remainingNeed(n),0),shortage=rows.reduce((sum,item)=>sum+item.shortage,0);
    const allComplete=list.length>0&&remainingTotal===0,isPast=month<monthNow(),isCurrent=month===monthNow();
    const hasPartial=rows.some(item=>item.available>0&&item.shortage>0),hasCovered=rows.some(item=>item.remaining>0&&item.shortage===0),hasShort=rows.some(item=>item.shortage>0);
    const futureCovered=list.length>0&&!hasShort;
    const isFuture=month>monthNow();
    const state=!list.length?(isFuture?'future-open empty-month':isCurrent?'current-open empty-month':'empty-month'):isPast?(allComplete?'completed':'past-unmet'):futureCovered?'covered':isCurrent?'current-open':'future-open';
    const label=!list.length?'No request':isPast?(allComplete?'Demand Met':'Demand Not Met'):allComplete?'Distributed':futureCovered?'Covered':(hasPartial||hasCovered||sent>0)?'Partial':'Shortage';
    const charityGroups=[];
    rows.forEach(item=>{
      let group=charityGroups.find(entry=>entry.charity===item.n.charity);
      if(!group){group={charity:item.n.charity,items:[]};charityGroups.push(group)}
      group.items.push(item);
    });
    const details=list.length?charityGroups.map(group=>{
      const groupMet=isPast?group.items.every(item=>remainingNeed(item.n)===0):group.items.every(item=>item.shortage===0);
      const lines=group.items.map(item=>{
        const n=item.n,nSent=fulfilledQty(n),nRemaining=remainingNeed(n);
        let summary;
        if(nRemaining===0)summary=`Quilts Needed ${n.qty} · Sent ${nSent} · Quilts Still Needed 0${n.fulfilledDate?' · '+fmtDate(n.fulfilledDate):''}`;
        else if(nSent>0||isPast)summary=`Quilts Needed ${n.qty} · Sent ${nSent} · Quilts Still Needed ${nRemaining} · Available in Storage ${item.available} · Short ${item.shortage}`;
        else summary=`Quilts Needed ${n.qty} · Available in Storage ${item.available} · Short ${item.shortage}`;
        return interactive?`<button type="button" class="month-need-line" onclick="openCalendarNeedActions('${n.id}')"><span class="month-need-size">${esc(n.size)}</span> · ${summary}</button>`:`<div class="month-need-line"><span class="month-need-size">${esc(n.size)}</span> · ${summary}</div>`;
      }).join('');
      return`<div class="month-charity-status ${groupMet?'charity-met':'charity-short'}"><div class="month-charity-heading"><b>${esc(group.charity)}</b><span>${groupMet?'Met':'Short'}</span></div>${lines}</div>`;
    }).join(''):'<div class="month-need">No quilts needed</div>';
    const totals=(allComplete||isPast||sent>0)?`<div class="month-totals three"><div><b>${needed}</b><span>Quilts Needed</span></div><div><b>${sent}</b><span>Sent</span></div><div><b class="${remainingTotal?'negative':'positive'}">${remainingTotal}</b><span>Still Needed</span></div></div>`:`<div class="month-totals"><div><b>${needed}</b><span>Quilts Needed</span></div><div><b class="${shortage?'negative':''}">${shortage}</b><span>Short</span></div></div>`;
    const editHint=interactive?'<div class="month-edit-hint">Tap charity to edit</div>':'';
    return`<div class="month-card ${state}${isCurrent?' current-month':''}"><h4><span>${name}</span><span class="month-status">${label}</span></h4>${totals}${details}${editHint}</div>`;
  }).join('');
}
function renderNeedsCalendar(){
  const box=el('needsCalendar');if(!box)return;refreshCalendarYears();
  const year=Number(el('calendarYear')?.value)||Number(monthNow().slice(0,4)),charity=el('calendarCharity')?.value||'',size=el('calendarSize')?.value||'';
  box.innerHTML=calendarMarkup(year,charity,size,true);
}
function renderHomeCalendar(){
  const box=el('homeNeedsCalendar');if(!box)return;
  const year=Number(monthNow().slice(0,4)),charity=el('homeCalendarCharity')?.value||'';
  box.innerHTML=calendarMarkup(year,charity,'',true);
}
function modalOpen(id){const modal=el(id);if(!modal)return;modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}
function modalClose(id){const modal=el(id);if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');if(!document.querySelector('.calendar-modal-backdrop.open'))document.body.style.overflow=''}
function openCalendarNeedActions(id){
  const n=data.needs.find(item=>item.id===id);if(!n)return;calendarActionNeedId=id;
  const info=allocationForNeed(n),sent=fulfilledQty(n),remaining=remainingNeed(n);
  el('calendarActionTitle').textContent=`${fmtMonth(n.month)} — ${n.charity}`;
  el('calendarActionSummary').innerHTML=`<b>${esc(n.size)} · ${n.qty} requested</b><span>${sent} distributed · ${remaining} still needed · ${info.available} available for this request · ${info.shortage} short${n.note?' · '+esc(n.note):''}</span>`;
  modalOpen('calendarActionModal');
}
function closeCalendarActionModal(){modalClose('calendarActionModal');calendarActionNeedId=null}
function calendarActionEdit(){const id=calendarActionNeedId;if(!id)return;closeCalendarActionModal();openCalendarNeedEditor(id)}
function calendarActionDistribute(){const id=calendarActionNeedId;if(!id)return;closeCalendarActionModal();openCalendarDistributionModal(id)}
function calendarActionViewDetails(){
  const id=calendarActionNeedId;if(!id)return;closeCalendarActionModal();showView('needs');renderNeeds();
  requestAnimationFrame(()=>document.querySelector(`[data-need-id="${CSS.escape(id)}"], [data-need-edit-id="${CSS.escape(id)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}));
}
function openCalendarDistributionModal(id,source='calendar'){
  const n=data.needs.find(item=>item.id===id);if(!n)return;calendarDistributionNeedId=id;calendarDistributionMode=source==='report-date'?'date-only':'full';
  const sent=fulfilledQty(n),remaining=remainingNeed(n),info=allocationForNeed(n),dateOnly=calendarDistributionMode==='date-only';
  el('calendarDistributionTitle').textContent=dateOnly?'Edit Date Distributed':'Distribute Quilts';
  el('calendarDistributionIdentity').textContent=`${fmtMonth(n.month)} · ${n.charity} · ${n.size}`;
  el('calendarDistributionSummary').innerHTML=dateOnly
    ?`<b>${sent} distributed${n.fulfilledDate?' on '+fmtDate(n.fulfilledDate):''}</b><span>Changing this date also updates the linked inventory activity and yearly statistics. Quantity and inventory will not change.</span>`
    :`<b>${n.qty} requested · ${sent} already distributed</b><span>${remaining} still needed · ${info.available} available for this request · ${info.shortage} short</span>`;
  el('calendarDistributionQty').value=String(sent||n.qty);el('calendarDistributionQty').removeAttribute('max');
  el('calendarDistributionDate').value=n.fulfilledDate||today();
  // When a distribution was entered separately as Quilts Out, do not silently deduct it again while editing.
  el('calendarDistributionRecordOut').checked=sent===0||Math.max(0,Number(n.autoOutQty||0))>0;
  if(el('calendarDistributionQtyWrap'))el('calendarDistributionQtyWrap').style.display=dateOnly?'none':'block';
  if(el('calendarDistributionRecordOutWrap'))el('calendarDistributionRecordOutWrap').style.display=dateOnly?'none':'flex';
  if(el('calendarDistributionSaveBtn'))el('calendarDistributionSaveBtn').textContent=dateOnly?'Save Date':'Save Distribution';
  const nb=el('calendarDistributionNotice');if(nb){nb.textContent='';nb.className='notice'}
  modalOpen('calendarDistributionModal');requestAnimationFrame(()=>(dateOnly?el('calendarDistributionDate'):el('calendarDistributionQty'))?.focus());
}
function openReportDistributionEditor(id){openCalendarDistributionModal(id,'report-date')}
function closeCalendarDistributionModal(){modalClose('calendarDistributionModal');calendarDistributionNeedId=null;calendarDistributionMode='full'}
function saveCalendarDistribution(reviewed=false){
  const id=calendarDistributionNeedId,n=id?data.needs.find(item=>item.id===id):null;if(!n)return;
  const dateOnly=calendarDistributionMode==='date-only';
  const values={month:n.month,charity:n.charity,size:n.size,qty:n.qty,note:n.note,fulfilledQty:dateOnly?fulfilledQty(n):el('calendarDistributionQty').value,fulfilledDate:el('calendarDistributionDate').value,recordOut:dateOnly?false:el('calendarDistributionRecordOut').checked};
  const ok=persistNeedRecord(values,id,'calendarDistributionNotice',{reviewed,onConfirm:()=>saveCalendarDistribution(true)});if(ok)closeCalendarDistributionModal();return ok;
}

function openCalendarNeedEditor(id='',month=''){
  const existing=id?data.needs.find(n=>n.id===id):null;if(id&&!existing)return;
  calendarModalNeedId=existing?.id||null;refreshSelects();
  el('calendarNeedModalTitle').textContent=existing?'Edit Quilts Needed':'Add Quilts Needed';
  el('calendarNeedMonth').value=existing?.month||month||monthNow();
  el('calendarNeedCharity').value=existing?.charity||'';el('calendarNeedSize').value=existing?.size||'';
  el('calendarNeedQty').value=existing?.qty||1;el('calendarNeedNote').value=existing?.note||'';
  el('calendarNeedDelete').style.display=existing?'block':'none';
  const noticeBox=el('calendarNeedNotice');if(noticeBox){noticeBox.textContent='';noticeBox.className='notice'}
  const modal=el('calendarNeedModal');modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  requestAnimationFrame(()=>el('calendarNeedCharity')?.focus());
}
function closeCalendarNeedModal(){
  const modal=el('calendarNeedModal');if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
  calendarModalNeedId=null;document.body.style.overflow='';
}
function saveCalendarNeed(reviewed=false){
  const previous=calendarModalNeedId?data.needs.find(n=>n.id===calendarModalNeedId):null;
  const values={month:el('calendarNeedMonth').value||monthNow(),charity:el('calendarNeedCharity').value,size:el('calendarNeedSize').value,qty:el('calendarNeedQty').value,note:el('calendarNeedNote').value.trim(),fulfilledQty:previous?fulfilledQty(previous):0,fulfilledDate:previous?.fulfilledDate||'',recordOut:false};
  const ok=persistNeedRecord(values,calendarModalNeedId,'calendarNeedNotice',{reviewed,onConfirm:()=>saveCalendarNeed(true)});if(ok)closeCalendarNeedModal();return ok;
}
function deleteCalendarNeed(){
  const id=calendarModalNeedId;if(!id)return;deleteNeed(id);if(!data.needs.some(n=>n.id===id))closeCalendarNeedModal();
}
function renderNeeds(){
  if(editNeedId&&!data.needs.some(n=>n.id===editNeedId))editNeedId=null;
  renderNeedsCalendar();const allocations=allocateNeedsForPlanning();
  el('needsList').innerHTML=allocations.length?allocations.map(item=>needCard(item.n,true,item)).join(''):'<div class="empty">No quilts needed entered yet.</div>';
}
function homeCharitySummaries(){
  const inventory=invMap(),remaining=requestedNeedsMap();
  const names=unique([
    ...data.charities,
    ...Object.keys(inventory).map(key=>key.slice(0,key.lastIndexOf('|'))),
    ...Object.keys(remaining).map(key=>key.slice(0,key.lastIndexOf('|')))
  ]).sort((a,b)=>a.localeCompare(b));
  return names.map(charity=>{
    const prefix=charity+'|';
    const keys=unique([...Object.keys(inventory),...Object.keys(remaining)]).filter(key=>key.startsWith(prefix));
    const onHand=keys.reduce((sum,key)=>sum+Number(inventory[key]||0),0);
    const requested=keys.reduce((sum,key)=>sum+Number(remaining[key]||0),0);
    const toComplete=keys.reduce((sum,key)=>sum+Math.max(0,Number(remaining[key]||0)-Number(inventory[key]||0)),0);
    return{charity,onHand,requested,toComplete};
  });
}
function renderHomeCharityBreakdown(){
  const box=el('homeCharityBreakdown');if(!box)return;
  const rows=homeCharitySummaries();
  box.innerHTML=rows.length?rows.map(row=>{
    const state=row.toComplete>0?'has-shortage':row.onHand>row.requested?'has-surplus':'balanced';
    return`<button type="button" class="home-charity-card ${state}" data-charity="${esc(row.charity)}" onclick="openHomeCharity(this.dataset.charity)"><div class="home-charity-heading"><strong>${esc(row.charity)}</strong><span>View details ›</span></div><div class="home-charity-metrics"><div><b>${row.onHand}</b><span>${esc(data.homeStorageLabel)}</span></div><div><b>${row.requested}</b><span>${esc(data.homeNeededLabel)}</span></div><div><b class="${row.toComplete?'negative':'positive'}">${row.toComplete}</b><span>${esc(data.homeDifferenceLabel)}</span></div></div></button>`;
  }).join(''):'<div class="empty">No charities have been entered yet.</div>';
}
function openHomeCharity(charity){
  const filter=el('calendarCharity');if(filter)filter.value=charity;
  showView('needs');
  if(filter){filter.value=charity;renderNeedsCalendar()}
}
function renderHomeSummaryReport(){
  const target=el('homeSummaryReport');if(!target)return;
  const rows=homeCharitySummaries(),onHand=totalOnHand(),requested=totalNeeded(),toComplete=quiltsToCompleteTotal();
  const generated=new Date().toLocaleString();
  const body=rows.length?rows.map(row=>`<tr><td>${esc(row.charity)}</td><td>${row.onHand}</td><td>${row.requested}</td><td><span class="difference-value ${row.toComplete?'negative':'positive'}">${row.toComplete}</span></td></tr>`).join(''):`<tr><td colspan="4">No charities have been entered.</td></tr>`;
  target.innerHTML=`<h1>${esc(data.appName)}</h1><div class="summary-meta">${esc(data.orgName)} · ${esc(data.homeAtAGlance)} Summary · Report generated ${esc(generated)}</div><div class="summary-metrics"><div class="summary-metric"><b>${onHand}</b><span>${esc(data.homeStorageLabel)}</span></div><div class="summary-metric"><b>${requested}</b><span>${esc(data.homeNeededLabel)}</span></div><div class="summary-metric"><b class="${toComplete?'negative':'positive'}">${toComplete}</b><span>${esc(data.homeDifferenceLabel)}</span></div></div><table><colgroup><col style="width:40%"><col style="width:18%"><col style="width:20%"><col style="width:22%"></colgroup><thead><tr><th>Charity</th><th>${esc(data.homeStorageLabel)}</th><th>${esc(data.homeNeededLabel)}</th><th>${esc(data.homeDifferenceLabel)}</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td>Grand Total</td><td>${onHand}</td><td>${requested}</td><td><span class="difference-value ${toComplete?'negative':'positive'}">${toComplete}</span></td></tr></tfoot></table><div class="print-copyright">${esc(COPYRIGHT_TEXT)} Personal and authorized guild use only.</div>`;
}
function renderHome(){
  const toComplete=quiltsToCompleteTotal();
  el('homeOnHand').textContent=totalOnHand();
  el('homeNeeded').textContent=totalNeeded();
  const differenceBox=el('homeDifference'),differenceStatus=el('homeDifferenceStatus');
  differenceBox.textContent=String(toComplete);
  differenceBox.className=toComplete?'negative':'positive';
  if(differenceStatus){
    differenceStatus.textContent=toComplete?'Still to Make':'All Requests Covered';
    differenceStatus.className=`difference-status ${toComplete?'negative':'positive'}`;
  }
  renderHomeYearStatistics();renderHomeCharityBreakdown();renderHomeCalendar();renderHomeSummaryReport();updateSaveStatus();
}
function inventoryGroups(){const inventory=invMap();return[...data.charities].sort((a,b)=>a.localeCompare(b)).map(c=>{const sizes=data.sizes.map(s=>({s,n:inventory[c+'|'+s]||0})).filter(x=>x.n!==0).sort((a,b)=>a.s.localeCompare(b.s));return{charity:c,sizes,total:sizes.reduce((sum,x)=>sum+x.n,0)}})}
function requestedNeedsMap(){
  const m={};
  upcoming().forEach(n=>{const key=n.charity+'|'+n.size;m[key]=(m[key]||0)+remainingNeed(n)});
  return m;
}
function reportComparisonGroups(){
  const inventory=invMap(),requested=requestedNeedsMap();
  const charities=unique([...data.charities,...Object.keys(inventory).map(k=>k.slice(0,k.lastIndexOf('|'))),...Object.keys(requested).map(k=>k.slice(0,k.lastIndexOf('|')))]).sort((a,b)=>a.localeCompare(b));
  return charities.map(charity=>{
    const prefix=charity+'|';
    const sizes=unique([...data.sizes,...Object.keys(inventory).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length)),...Object.keys(requested).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length))])
      .map(size=>{const key=charity+'|'+size,onHand=Number(inventory[key]||0),requestedNeeds=Number(requested[key]||0),toComplete=Math.max(0,requestedNeeds-onHand);return{size,onHand,requestedNeeds,toComplete}})
      .filter(row=>row.onHand!==0||row.requestedNeeds!==0)
      .sort((a,b)=>a.size.localeCompare(b.size));
    if(!sizes.length)sizes.push({size:'',onHand:0,requestedNeeds:0,toComplete:0,empty:true});
    const totals=sizes.reduce((out,row)=>({onHand:out.onHand+row.onHand,requestedNeeds:out.requestedNeeds+row.requestedNeeds,toComplete:out.toComplete+row.toComplete}),{onHand:0,requestedNeeds:0,toComplete:0});
    return{charity,sizes,...totals};
  });
}
function signedDifference(n){return n>0?`+${n}`:String(n)}
function differenceClass(n){return n>0?'positive':n<0?'negative':''}
function reportComparisonRows(){
  const rows=[];
  reportComparisonGroups().forEach(group=>{
    group.sizes.forEach(row=>rows.push({type:'detail',charity:group.charity,size:row.empty?'None in storage':row.size,requestedNeeds:row.requestedNeeds,onHand:row.onHand,toComplete:row.toComplete,empty:!!row.empty}));
    rows.push({type:'subtotal',charity:`Total for ${group.charity}`,size:'',requestedNeeds:group.requestedNeeds,onHand:group.onHand,toComplete:group.toComplete});
  });
  rows.push({type:'grand',charity:'Grand Total',size:'',requestedNeeds:totalNeeded(),onHand:totalOnHand(),toComplete:quiltsToCompleteTotal()});
  return rows;
}
function reportInventoryHTML(){
  const rows=reportComparisonRows();if(!rows.length)return'<div class="empty">No charities available.</div>';
  const body=rows.filter(row=>row.type!=='grand').map(row=>{
    const isTotal=row.type==='subtotal';
    const rowClass=isTotal?' class="subtotal-row"':'';
    const charityCell=isTotal?esc(row.charity):esc(row.charity);
    const sizeCell=isTotal?'':(row.empty?'<span class="small">None in storage</span>':esc(row.size));
    const onHandCell=isTotal?`<b class="on-hand-value">${row.onHand}</b>`:String(row.onHand);
    const requestedCell=isTotal?`<b>${row.requestedNeeds}</b>`:String(row.requestedNeeds);
    const differenceCell=isTotal
      ?`<b><span class="difference-value ${row.toComplete?'negative':'positive'}">${row.toComplete}</span></b>`
      :`<span class="difference-value ${row.toComplete?'negative':'positive'}">${row.toComplete}</span>`;
    return`<tr${rowClass}><td>${charityCell}</td><td>${sizeCell}</td><td>${onHandCell}</td><td>${requestedCell}</td><td>${differenceCell}</td></tr>`;
  }).join('');
  const grand=rows.find(row=>row.type==='grand');
  return`<table class="report-summary-table"><colgroup><col class="col-charity"><col class="col-size"><col class="col-onhand"><col class="col-requested"><col class="col-difference"></colgroup><thead><tr><th>Charity</th><th>Size</th><th>${esc(data.homeStorageLabel)}</th><th>${esc(data.homeNeededLabel)}</th><th>${esc(data.homeDifferenceLabel)}</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td>Grand Total</td><td></td><td><b class="on-hand-value">${grand.onHand}</b></td><td><b>${grand.requestedNeeds}</b></td><td><b><span class="difference-value ${grand.toComplete?'negative':'positive'}">${grand.toComplete}</span></b></td></tr></tfoot></table>`;
}
function reportNeedsHTML(){
  const list=allocateNeedsForPlanning().filter(item=>item.n.month>=monthNow()&&item.remaining>0);
  return list.length?`<table><thead><tr><th>Month</th><th>Charity / Size</th><th>${esc(data.homeNeededLabel)}</th><th>Sent / ${esc(data.homeNeededLabel)}</th><th>Available / Short</th></tr></thead><tbody>${list.map(item=>{const n=item.n;return`<tr><td>${fmtMonth(n.month)}</td><td>${esc(n.charity)}<br><span class="small">${esc(n.size)}</span></td><td>${n.qty}</td><td>${item.fulfilled} sent<br><span class="small">${item.remaining} still needed</span></td><td>${item.available} available<br><span class="small ${item.shortage?'negative':''}">${item.shortage} short</span></td></tr>`}).join('')}</tbody></table>`:'<div class="empty">No upcoming quilts needed.</div>';
}
function distributedNeedsForReport(){
  return data.needs.filter(n=>fulfilledQty(n)>0).sort((a,b)=>String(b.fulfilledDate||'').localeCompare(String(a.fulfilledDate||''))||String(b.month||'').localeCompare(String(a.month||''))||a.charity.localeCompare(b.charity)||a.size.localeCompare(b.size));
}
function distributionReportStatus(n){const sent=fulfilledQty(n),requested=Math.max(1,Number(n.qty)||1);return sent>requested?`Distributed (${sent-requested} over request)`:remainingNeed(n)===0?'Distributed':'Partially Sent'}
function holdDistributionsForReport(){return data.transactions.filter(t=>t.sourceType==='HOLD_DISTRIBUTION').sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||a.charity.localeCompare(b.charity)||a.size.localeCompare(b.size))}
function reportDistributedHTML(){
  const list=distributedNeedsForReport();
  if(!list.length)return'<div class="empty">No distributed charity requests recorded yet.</div>';
  const needsTable=list.length?`<table><thead><tr><th>Date Distributed</th><th>Month Needed</th><th>Charity / Size</th><th>Original Request</th><th>Sent / ${esc(data.homeNeededLabel)}</th><th>Status</th><th class="no-print report-edit-column">Edit</th></tr></thead><tbody>${list.map(n=>`<tr><td>${n.fulfilledDate?fmtDate(n.fulfilledDate):'<span class="small">Not entered</span>'}</td><td>${fmtMonth(n.month)}</td><td>${esc(n.charity)}<br><span class="small">${esc(n.size)}</span></td><td>${n.qty}</td><td>${fulfilledQty(n)} sent<br><span class="small">${remainingNeed(n)} ${esc(data.homeNeededLabel.toLocaleLowerCase())}</span></td><td><b>${distributionReportStatus(n)}</b></td><td class="no-print report-edit-column"><button type="button" class="report-edit-date-button" onclick="openReportDistributionEditor('${esc(n.id)}')">Edit Date</button></td></tr>`).join('')}</tbody></table>`:'';
  return needsTable;
}
function compactDistributedHTML(limit=6){
  const needRows=distributedNeedsForReport().map(n=>({date:n.fulfilledDate||'',charity:n.charity,size:n.size,qty:fulfilledQty(n),left:remainingNeed(n),deferred:false}));
  const deferredRows=holdDistributionsForReport().map(t=>({date:t.date||'',charity:t.charity,size:t.size,qty:Math.max(0,Number(t.qty)||0),left:0,deferred:true}));
  const combined=[...needRows,...deferredRows].sort((a,b)=>String(b.date).localeCompare(String(a.date))||a.charity.localeCompare(b.charity));
  const list=combined.slice(0,limit);if(!list.length)return'<div class="print-note">No distributed quilts recorded.</div>';
  return`<table><thead><tr><th>Date Distributed</th><th>Charity / Size</th><th>Sent</th></tr></thead><tbody>${list.map(row=>`<tr><td>${row.date?fmtDate(row.date):'—'}</td><td>${esc(row.charity)}<br>${esc(row.size)}</td><td>${row.qty}${row.deferred?'<br><span class="small">From On Hold / Storage</span>':row.left?`<br><span class="small">${row.left} left</span>`:''}</td></tr>`).join('')}</tbody></table>${combined.length>list.length?`<div class="print-note">Showing ${list.length} of ${combined.length} distribution records.</div>`:''}`;
}
function compactAdjustmentsHTML(){const list=data.transactions.filter(t=>t.type==='ADJUST').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);if(!list.length)return'<div class="print-note">No adjusted transactions.</div>';return`<table><thead><tr><th>Change Date</th><th>Charity / Size</th><th>Change</th></tr></thead><tbody>${list.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${esc(t.charity)}<br>${esc(t.size)}</td><td>${value(t)>0?'+':''}${value(t)}</td></tr>`).join('')}</tbody></table>${data.transactions.filter(t=>t.type==='ADJUST').length>list.length?`<div class="print-note">Showing the ${list.length} most recent adjustments.</div>`:''}`}
function renderMeetingReport(){
  const generated=new Date().toLocaleString(),toComplete=quiltsToCompleteTotal(),completionStatus=toComplete?'Still to Make':'All Requests Covered';
  const stats=yearlyStatistics(selectedStatisticsYear());
  el('meetingReport').innerHTML=`<h1>${esc(data.appName)}</h1><div class="print-meta">${esc(data.orgName)} · ${esc(effectiveReportTitle())} · Report generated ${esc(generated)}</div><div class="print-metrics"><div class="print-metric"><b>${totalOnHand()}</b>${esc(data.homeStorageLabel)}</div><div class="print-metric"><b>${totalNeeded()}</b>${esc(data.homeNeededLabel)}</div><div class="print-metric"><b class="${toComplete?'negative':'positive'}">${toComplete}</b>${esc(data.homeDifferenceLabel)} · ${completionStatus}</div></div><h2>${stats.year} Yearly Statistics</h2><div class="print-note">Made ${stats.made} · Distributed ${stats.distributed} · Net change ${signedDifference(stats.netChange)} · Current inventory ${stats.currentInventory} · Charities served ${stats.charitiesServed} · Lifetime distributed ${stats.lifetimeDistributed}</div><h2>${esc(data.homeStorageLabel)} and ${esc(data.homeNeededLabel)}</h2>${reportInventoryHTML()}<div class="print-columns"><div><h2>${esc(data.homeNeededLabel)}</h2>${reportNeedsHTML()}</div><div><h2>${esc(data.itemName)} Distributed</h2>${compactDistributedHTML()}<h2>Recent Adjustments</h2>${compactAdjustmentsHTML()}</div></div><div class="print-copyright">${esc(COPYRIGHT_TEXT)} Personal and authorized guild use only.</div>`;
}
function renderReports(){
  const statsYear=fillStatisticsYearSelect(),stats=yearlyStatistics(statsYear);
  const toComplete=quiltsToCompleteTotal(),completionStatus=toComplete?'Still to Make':'All Requests Covered';
  el('reportHeading').textContent=effectiveReportTitle();el('reportDate').textContent=`${data.orgName} · Report generated ${new Date().toLocaleString()} · Activity dates use the selected date of the actual change`;el('reportOnHand').textContent=totalOnHand();el('reportNeeded').textContent=totalNeeded();el('reportShortage').textContent=toComplete;
  if(el('reportStorageLabel'))el('reportStorageLabel').textContent=data.homeStorageLabel;if(el('reportNeededLabel'))el('reportNeededLabel').textContent=data.homeNeededLabel;if(el('reportDifferenceLabel'))el('reportDifferenceLabel').textContent=data.homeDifferenceLabel;if(el('reportDifferenceStatus')){el('reportDifferenceStatus').textContent=completionStatus;el('reportDifferenceStatus').className=`metric-status-line difference-status ${toComplete?'negative':'positive'}`}
  if(el('reportInventoryHeading'))el('reportInventoryHeading').textContent=`${data.homeStorageLabel} and ${data.homeNeededLabel}`;if(el('reportNeedsHeading'))el('reportNeedsHeading').textContent=data.homeNeededLabel;if(el('reportDistributedHeading'))el('reportDistributedHeading').textContent=`${data.itemName} Distributed`;
  if(el('reportYearlyStats'))el('reportYearlyStats').innerHTML=yearlyStatisticsHTML(stats);
  el('reportInventory').innerHTML=reportInventoryHTML();el('reportNeeds').innerHTML=reportNeedsHTML();el('reportDistributed').innerHTML=reportDistributedHTML();
  const a=data.transactions.filter(t=>t.type==='ADJUST').sort((x,y)=>y.date.localeCompare(x.date));
  el('reportAdjustments').innerHTML=a.length?a.map(x=>`<div class="item report-shaded-item"><div class="head"><div><div class="title">${value(x)>0?'+':''}${value(x)} ${esc(x.size)}</div><div class="meta">${esc(x.charity)} · Change date ${fmtDate(x.date)}${x.note?' · '+esc(x.note):''}</div></div><span class="flag">Adjusted</span></div></div>`).join(''):'<div class="empty">No adjusted transactions.</div>';
  renderMeetingReport();
}
function feedbackTypeChanged(){
  const type=el('feedbackType')?.value||'Bug Report',bug=type==='Bug Report';
  if(el('feedbackDetailsLabel'))el('feedbackDetailsLabel').textContent=bug?'What happened?':'What should change?';
  if(el('feedbackExpectedLabel'))el('feedbackExpectedLabel').textContent=bug?'What did you expect?':'Why would this help?';
  if(el('feedbackStepsLabel'))el('feedbackStepsLabel').textContent=bug?'Steps to reproduce':'Suggested workflow';
}
function feedbackFormValues(){
  return{
    type:String(el('feedbackType')?.value||'Bug Report'),screen:String(el('feedbackScreen')?.value||'Other'),priority:String(el('feedbackPriority')?.value||'Normal'),
    summary:String(el('feedbackSummary')?.value||'').trim(),details:String(el('feedbackDetails')?.value||'').trim(),expected:String(el('feedbackExpected')?.value||'').trim(),steps:String(el('feedbackSteps')?.value||'').trim()
  };
}
function currentViewName(){const id=document.querySelector('.view.active')?.id||'unknown';return({home:'Home',inventory:'Inventory',needs:'Quilts Needed / Calendar',reports:'Reports',settings:'Settings'})[id]||id}
function buildFeedbackRequest(){
  const f=feedbackFormValues();
  if(!f.summary||!f.details){notice('feedbackNotice','Please enter a short summary and the main details.');return''}
  const created=new Date().toLocaleString(),user=currentUserEmail(),device=String(navigator.userAgent||navigator.platform||'Unknown device');
  return[
    'LOVE QUILTS MANAGER — '+f.type.toUpperCase(),
    '',
    `Summary: ${f.summary}`,
    `Screen: ${f.screen}`,
    `Priority: ${f.priority}`,
    `App version: ${VERSION}`,
    `Created: ${created}`,
    `Signed in as: ${user}`,
    `Current app view: ${currentViewName()}`,
    `Device / browser: ${device}`,
    '',
    f.type==='Bug Report'?'WHAT HAPPENED':'REQUESTED CHANGE',
    f.details,
    '',
    f.type==='Bug Report'?'EXPECTED RESULT':'WHY THIS WOULD HELP',
    f.expected||'Not entered',
    '',
    f.type==='Bug Report'?'STEPS TO REPRODUCE':'SUGGESTED WORKFLOW',
    f.steps||'Not entered'
  ].join('\n');
}
async function copyFeedbackRequest(){
  const text=buildFeedbackRequest();if(!text)return;
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove()}
    notice('feedbackNotice','Bug report or change request copied.',true);
  }catch(error){console.error('Feedback copy failed',error);notice('feedbackNotice','Could not copy the request. Use Download Request instead.')}
}
function downloadFeedbackRequest(){
  const text=buildFeedbackRequest();if(!text)return;
  const f=feedbackFormValues(),name=`Love_Quilts_${filePart(f.type)}_${today()}.txt`;
  downloadBlob(name,new Blob([text],{type:'text/plain;charset=utf-8'}));notice('feedbackNotice','Request file downloaded.',true);
}
async function shareFeedbackRequest(){
  const text=buildFeedbackRequest();if(!text)return;
  const f=feedbackFormValues(),title=`Love Quilts Manager ${f.type}: ${f.summary}`;
  try{
    if(navigator.share){await navigator.share({title,text});notice('feedbackNotice','Share sheet opened.',true)}
    else await copyFeedbackRequest();
  }catch(error){if(error?.name!=='AbortError'){console.error('Feedback share failed',error);notice('feedbackNotice','Could not open sharing. The request can still be copied or downloaded.')}}
}
function clearFeedbackForm(){
  if(el('feedbackType'))el('feedbackType').value='Bug Report';if(el('feedbackScreen'))el('feedbackScreen').value=currentViewName()==='Settings'?'Settings':'Other';if(el('feedbackPriority'))el('feedbackPriority').value='Normal';
  ['feedbackSummary','feedbackDetails','feedbackExpected','feedbackSteps'].forEach(id=>{if(el(id))el(id).value=''});feedbackTypeChanged();notice('feedbackNotice','Form cleared.',true);
}
function collectAppCheckIssues(){
  const issues=[];
  [['inventory activity',data.transactions],['charity request',data.needs],['deferred record',data.holds||[]]].forEach(([label,records])=>{
    const seen=new Set();records.forEach(record=>{const id=String(record.id||'');if(!id)issues.push(`A saved ${label} is missing its identification number.`);else if(seen.has(id))issues.push(`Duplicate ${label} identification found: ${id}.`);else seen.add(id)});
  });
  data.transactions.forEach(t=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(t.date||'')))issues.push(`Inventory activity for ${t.charity} — ${t.size} has an invalid activity date.`);
    if(!Number.isFinite(Number(t.qty))||Number(t.qty)<=0)issues.push(`Inventory activity for ${t.charity} — ${t.size} has an invalid quantity.`);
    if(t.sourceNeedId&&!data.needs.some(n=>n.id===t.sourceNeedId))issues.push(`A linked inventory activity for ${t.charity} — ${t.size} no longer has its charity request.`);
  });
  data.needs.forEach(n=>{
    const sent=fulfilledQty(n),linked=data.transactions.filter(t=>t.sourceNeedId===n.id&&isLinkedNeedDistributionTransaction(t));
    if(!/^\d{4}-\d{2}$/.test(String(n.month||'')))issues.push(`The charity request for ${n.charity} — ${n.size} has an invalid month.`);
    if(!Number.isFinite(Number(n.qty))||Number(n.qty)<1)issues.push(`The charity request for ${n.charity} — ${n.size} has an invalid requested quantity.`);
    if(sent>0&&!/^\d{4}-\d{2}-\d{2}$/.test(String(n.fulfilledDate||'')))issues.push(`The distribution for ${n.charity} — ${n.size} is missing a valid Date Distributed.`);
    if(Math.max(0,Number(n.autoOutQty||0))>sent)issues.push(`The linked inventory quantity is greater than the distributed quantity for ${n.charity} — ${n.size}.`);
    linked.forEach(t=>{if(n.fulfilledDate&&t.date!==n.fulfilledDate)issues.push(`A linked inventory date does not match Date Distributed for ${n.charity} — ${n.size}.`)})
  });
  Object.entries(invMap()).forEach(([key,count])=>{if(Number(count)<0)issues.push(`Negative inventory found for ${key.replace('|',' — ')} (${count}).`)});
  return unique(issues);
}
function runAppCheck(){
  const issues=collectAppCheckIssues(),box=el('appCheckResults');if(!box)return;
  if(!issues.length){box.innerHTML='<div class="app-check-good"><b>✓ No common data problems found.</b><span>Inventory links, quantities, and activity dates passed the check.</span></div>';return}
  box.innerHTML=`<div class="app-check-warning"><b>${issues.length} possible ${issues.length===1?'problem':'problems'} found</b><span>This check does not change any records.</span></div><ol>${issues.map(issue=>`<li>${esc(issue)}</li>`).join('')}</ol>`;
}

function sameName(a,b){return String(a||'').trim().toLocaleLowerCase()===String(b||'').trim().toLocaleLowerCase()}
function renameImpactSummary(kind,name){
  if(kind==='charity'){
    const tx=data.transactions.filter(t=>t.charity===name),needs=data.needs.filter(n=>n.charity===name),holds=(data.holds||[]).filter(h=>h.charity===name);
    const inventory=Object.entries(invMap()).filter(([key])=>key.startsWith(name+'|')).reduce((sum,[,amount])=>sum+Number(amount||0),0);
    return{transactions:tx.length,needs:needs.length,holds:holds.length,inventory};
  }
  const tx=data.transactions.filter(t=>t.size===name),needs=data.needs.filter(n=>n.size===name),holds=(data.holds||[]).filter(h=>h.size===name);
  const inventory=Object.entries(invMap()).filter(([key])=>key.endsWith('|'+name)).reduce((sum,[,amount])=>sum+Number(amount||0),0);
  return{transactions:tx.length,needs:needs.length,holds:holds.length,inventory};
}
function renameCharity(){
  const oldName=String(el('renameCharitySelect')?.value||'').trim(),newName=String(el('renameCharityName')?.value||'').trim();
  if(!oldName)return notice('listNotice','Select the charity to rename.');
  if(!newName)return notice('listNotice','Enter the new charity name.');
  if(oldName===newName)return notice('listNotice','The charity name is already exactly the same. No change is needed.',true);
  const duplicate=data.charities.find(name=>name!==oldName&&sameName(name,newName));
  if(duplicate)return notice('listNotice',`A charity named “${duplicate}” already exists.`);
  const impact=renameImpactSummary('charity',oldName),metrics=homeMetricsFromMaps(invMap(),requestedNeedsMap());
  const summary=[
    homeReviewBubbles(metrics),
    '<div class="entry-review-details-heading">Charity name change</div>',
    reviewLine('Current name',oldName),reviewLine('New name',newName),
    reviewLine('Inventory transactions kept',String(impact.transactions)),reviewLine('Charity needs kept',String(impact.needs)),
    reviewLine('Current quilts in storage kept',String(impact.inventory)),impact.holds?reviewLine('Preserved deferred records kept',String(impact.holds)):'',
    '<div class="entry-review-note">Only the displayed charity name will change. All quantities, dates, needs, distributions, and totals will stay connected and unchanged.</div>'
  ].join('');
  openEntryReview('Review Charity Rename',summary,'Rename Charity',()=>{
    if(!data.charities.includes(oldName)){notice('listNotice','That charity is no longer available. It may have changed on another device.');return}
    const conflict=data.charities.find(name=>name!==oldName&&sameName(name,newName));if(conflict){notice('listNotice',`A charity named “${conflict}” now exists. Nothing was renamed.`);return}
    createRecoverySnapshot('Before renaming a charity');
    data.charities=unique(data.charities.map(name=>name===oldName?newName:name));
    data.transactions.forEach(t=>{if(t.charity===oldName)t.charity=newName});
    data.needs.forEach(n=>{if(n.charity===oldName)n.charity=newName});
    (data.holds||[]).forEach(h=>{if(h.charity===oldName)h.charity=newName});
    save(`Charity renamed from ${oldName} to ${newName}`);if(el('renameCharityName'))el('renameCharityName').value='';renderAll();notice('listNotice',`Charity renamed to “${newName}.” All existing numbers were kept.`,true);
  });
}
function renameSize(){
  const oldName=String(el('renameSizeSelect')?.value||'').trim(),newName=String(el('renameSizeName')?.value||'').trim();
  if(!oldName)return notice('listNotice','Select the quilt size to rename.');
  if(!newName)return notice('listNotice','Enter the new quilt size name.');
  if(oldName===newName)return notice('listNotice','The quilt size name is already exactly the same. No change is needed.',true);
  const duplicate=data.sizes.find(name=>name!==oldName&&sameName(name,newName));
  if(duplicate)return notice('listNotice',`A quilt size named “${duplicate}” already exists.`);
  const impact=renameImpactSummary('size',oldName),metrics=homeMetricsFromMaps(invMap(),requestedNeedsMap());
  const summary=[
    homeReviewBubbles(metrics),
    '<div class="entry-review-details-heading">Quilt size name change</div>',
    reviewLine('Current size name',oldName),reviewLine('New size name',newName),
    reviewLine('Inventory transactions kept',String(impact.transactions)),reviewLine('Charity needs kept',String(impact.needs)),
    reviewLine('Current quilts in storage kept',String(impact.inventory)),impact.holds?reviewLine('Preserved deferred records kept',String(impact.holds)):'',
    '<div class="entry-review-note">Only the displayed quilt-size name will change. All quantities, dates, needs, distributions, and totals will stay connected and unchanged.</div>'
  ].join('');
  openEntryReview('Review Quilt Size Rename',summary,'Rename Quilt Size',()=>{
    if(!data.sizes.includes(oldName)){notice('listNotice','That quilt size is no longer available. It may have changed on another device.');return}
    const conflict=data.sizes.find(name=>name!==oldName&&sameName(name,newName));if(conflict){notice('listNotice',`A quilt size named “${conflict}” now exists. Nothing was renamed.`);return}
    createRecoverySnapshot('Before renaming a quilt size');
    data.sizes=unique(data.sizes.map(name=>name===oldName?newName:name));
    data.transactions.forEach(t=>{if(t.size===oldName)t.size=newName});
    data.needs.forEach(n=>{if(n.size===oldName)n.size=newName});
    (data.holds||[]).forEach(h=>{if(h.size===oldName)h.size=newName});
    save(`Quilt size renamed from ${oldName} to ${newName}`);if(el('renameSizeName'))el('renameSizeName').value='';renderAll();notice('listNotice',`Quilt size renamed to “${newName}.” All existing numbers were kept.`,true);
  });
}
function addCharity(){const n=el('newCharity').value.trim();if(!n)return;if(data.charities.some(x=>x.toLocaleLowerCase()===n.toLocaleLowerCase()))return alert('That charity is already in the list.');data.charities.push(n);el('newCharity').value='';save('Charity added');renderAll()}
function removeCharity(){
  const n=el('deleteCharity').value;if(!n)return;if(data.transactions.some(t=>t.charity===n)||data.needs.some(x=>x.charity===n)||(data.holds||[]).some(h=>h.charity===n))return alert('This charity is being used in inventory, needs, or preserved deferred records. Remove those entries first.');
  if(confirm(`Delete the charity “${n}”?\n\nThis removes it from the choices. A recovery copy will be kept.`)){createRecoverySnapshot('Before deleting a charity');data.charities=data.charities.filter(x=>x!==n);save('Charity deleted');renderAll()}
}
function addSize(){const n=el('newSize').value.trim();if(!n)return;if(data.sizes.some(x=>x.toLocaleLowerCase()===n.toLocaleLowerCase()))return alert('That size is already in the list.');data.sizes.push(n);el('newSize').value='';save('Quilt size added');renderAll()}
function removeSize(){
  const n=el('deleteSize').value;if(!n)return;if(data.transactions.some(t=>t.size===n)||data.needs.some(x=>x.size===n)||(data.holds||[]).some(h=>h.size===n))return alert('This size is being used in inventory, needs, or preserved deferred records. Remove those entries first.');
  if(confirm(`Delete the size “${n}”?\n\nThis removes it from the choices. A recovery copy will be kept.`)){createRecoverySnapshot('Before deleting a quilt size');data.sizes=data.sizes.filter(x=>x!==n);save('Quilt size deleted');renderAll()}
}
function downloadBlob(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
function download(name,text,type){downloadBlob(name,new Blob([text],{type}))}
function exportBackup(){download(`${filePart(data.itemName)}_Backup_${today()}.json`,JSON.stringify(data,null,2),'application/json');notice('settingsNotice','Backup file created.',true)}
function importBackup(e){
  const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{const d=parse(r.result);if(!d||!Array.isArray(d.transactions)||!Array.isArray(d.charities)){notice('settingsNotice',`That is not a valid ${data.appName} backup.`);e.target.value='';return}
    const imported=normalizeData(d),dates=imported.transactions.map(t=>t.date).filter(Boolean).sort(),range=dates.length?`${fmtDate(dates[0])} through ${fmtDate(dates[dates.length-1])}`:'No transaction dates';
    createRecoverySnapshot(`Automatic backup before restoring ${f.name}`,data,true);
    const answer=prompt(`RESTORE SHARED BACKUP\n\nFile: ${f.name}\nTransactions: ${imported.transactions.length}\nQuilts needed: ${imported.needs.length}\nDate range: ${range}\n\nThis will replace the shared information on every synced device. The current data has already been saved as a recovery copy on this device.\n\nType RESTORE SHARED DATA to continue:`);
    if(answer==='RESTORE SHARED DATA'){
      data=imported;save(`Shared backup restored: ${f.name}`);renderAll();notice('settingsNotice','Shared backup restored and queued to sync.',true)
    }else notice('settingsNotice','Restore canceled. Current shared data was not changed.');
    e.target.value='';};r.readAsText(f);
}
function exportCSV(){const rows=[['Activity Date','Activity','Charity','Size','Activity Quantity','Inventory Change','Note','Source','Entered By','Entered At','Last Edited By','Last Edited At']];data.transactions.forEach(t=>rows.push([t.date,transactionLabel(t),t.charity,t.size,activityValue(t),value(t),t.note||'',t.sourceType||'',t.createdBy||'',t.createdAt||'',t.updatedBy||'',t.updatedAt||'']));const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');download(`${filePart(data.itemName)}_Transactions_${today()}.csv`,csv,'text/csv')}

function renderRecoveryList(){
  const box=el('recoveryList');if(!box)return;const list=getRecovery().slice(0,10);
  box.innerHTML=list.length?list.map(s=>`<div class="recovery-item"><div><b>${esc(s.reason||'Recovery copy')}</b><div class="meta">${esc(fmtDateTime(s.createdAt))} · ${Number(s.data?.transactions?.length||0)} transactions · ${Number(s.data?.needs?.length||0)} needs</div></div><button onclick="restoreRecovery('${s.id}')">Restore</button></div>`).join(''):'<div class="empty">No recovery copies yet.</div>';
}
function restoreRecovery(id){
  const snap=getRecovery().find(s=>s.id===id);if(!snap)return alert('That recovery copy is no longer available.');
  if(confirm(`Restore this version?\n\n${snap.reason}\n${fmtDateTime(snap.createdAt)}\n\nThe current data will be saved as another recovery copy first.`)){
    createRecoverySnapshot('Before restoring a previous version');data=normalizeData(snap.data);save(`Restored: ${snap.reason}`);renderAll();notice('settingsNotice','Previous version restored.',true)
  }
}
function clearRecoveryHistory(){if(confirm('Delete all local recovery copies?\n\nThis does not delete the current inventory, needs, settings, or exported backup files.')){localStorage.removeItem(RECOVERY_KEY);renderRecoveryList();notice('settingsNotice','Recovery history cleared.',true)}}

function clearInventoryCounts(){
  if(!data.transactions.length&&!(data.holds||[]).length)return notice('dangerNotice','Inventory counts are already empty.');
  if(confirm(`Clear all inventory counts?\n\nThis deletes ${data.transactions.length} transaction record(s). Quilts needed, names, charities, and sizes will be kept. Any deferred test records are cleared with the inventory history.\n\nA recovery copy will be created first.`)){
    createRecoverySnapshot('Before clearing inventory counts');data.transactions=[];data.holds=[];save('Inventory counts cleared');renderAll();notice('dangerNotice','Inventory counts were cleared. Quilts needed and settings were kept.',true)
  }
}
function startFreshForRealUse(){
  const answer=prompt(`START FRESH FOR REAL USE\n\nThis deletes all ${data.transactions.length} inventory transaction(s) and ${data.needs.length} charity request(s). Names, charities, and sizes will be kept.\n\nA recovery copy will be created first.\n\nType START FRESH to continue:`);
  if(answer!=='START FRESH')return notice('dangerNotice','Start Fresh canceled. Nothing was deleted.');
  createRecoverySnapshot('Before starting fresh for real use');data.transactions=[];data.needs=[];data.holds=[];save('Started fresh for real use');renderAll();notice('dangerNotice','All test numbers and needs were cleared. Names and lists were kept.',true);
}
function resetEntireApp(){
  const answer=prompt(`RESET ENTIRE APP\n\nThis deletes inventory, needs, custom names, charity/size changes, and Google backup settings.\n\nA local recovery copy will be created first.\n\nType RESET EVERYTHING to continue:`);
  if(answer!=='RESET EVERYTHING')return notice('dangerNotice','Entire-app reset canceled. Nothing was deleted.');
  createRecoverySnapshot('Before resetting the entire app');data=normalizeData({});cloud={url:'',code:'',enabled:false,lastSentAt:'',lastStatus:''};persistCloud();save('Entire app reset to defaults',{external:false});loadExternalFields();renderAll();notice('dangerNotice','The app was reset to its original defaults.',true);
}

function loadExternalFields(){
  if(el('externalBackupUrl'))el('externalBackupUrl').value=cloud.url;if(el('externalBackupCode'))el('externalBackupCode').value=cloud.code;
  if(el('externalBackupEnabled'))el('externalBackupEnabled').checked=cloud.enabled;updateSaveStatus();
}
function validExternalUrl(v){try{const u=new URL(v);return u.protocol==='https:'&&/script\.google\.com$/i.test(u.hostname)&&/\/macros\/s\//.test(u.pathname)}catch{return false}}
function saveExternalBackupSettings(){
  const url=el('externalBackupUrl').value.trim(),code=el('externalBackupCode').value.trim(),enabled=el('externalBackupEnabled').checked;
  if((url||enabled)&&!validExternalUrl(url))return notice('externalBackupNotice','Paste the deployed Google Apps Script web-app address ending in /exec.');
  if(enabled&&!code)return notice('externalBackupNotice','Enter the same backup code used in the Google script.');
  cloud.url=url;cloud.code=code;cloud.enabled=enabled;persistCloud();updateSaveStatus();notice('externalBackupNotice',enabled?'Automatic Google backup enabled.':'Backup settings saved. Automatic sending is off.',true);
  if(enabled)sendExternalBackup(true,'Backup connection saved');
}
function queueExternalBackup(reason){
  if(!cloud.enabled||!cloud.url||!cloud.code)return;externalReason=reason||'Automatic save';clearTimeout(externalTimer);externalTimer=setTimeout(()=>sendExternalBackup(false,externalReason),1800);
}
function syncNow(){
  if(typeof window.lqFirebaseForceSync==='function'){window.lqFirebaseForceSync();return}
  notice('firebaseSettingsNotice','Shared-device sync is still loading.');
}
async function sendExternalBackup(manual=false,reason='Manual backup'){
  if(!cloud.url||!cloud.code){if(manual)notice('externalBackupNotice','Save the Apps Script address and backup code first.');return false}
  if(!navigator.onLine){cloud.lastStatus='Waiting for internet';persistCloud();updateSaveStatus();if(manual)notice('externalBackupNotice','No internet connection. The local copy is still saved.');return false}
  const payload={backupCode:cloud.code,appName:data.appName,organization:data.orgName,version:VERSION,generatedAt:new Date().toISOString(),reason,summary:{onHand:totalOnHand(),upcomingNeeds:totalNeeded(),transactions:data.transactions.length,needs:data.needs.length},data};
  try{
    await fetch(cloud.url,{method:'POST',mode:'no-cors',cache:'no-store',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload),keepalive:true});
    cloud.lastSentAt=new Date().toISOString();cloud.lastStatus='Request sent';persistCloud();updateSaveStatus();if(manual)notice('externalBackupNotice','Backup request sent. Check the Love Quilts Backups folder in Google Drive.',true);return true;
  }catch(error){cloud.lastStatus='Send failed';persistCloud();updateSaveStatus();if(manual)notice('externalBackupNotice','The external backup could not be sent. The local copy is still safe.');return false}
}
function sendExternalBackupNow(){sendExternalBackup(true,'Manual backup')}
function updateSaveStatus(){
  const local=status.lastSavedAt?`Last saved ${fmtDateTime(status.lastSavedAt)}`:'Saved automatically on this device';
  const external=cloud.url?(cloud.lastSentAt?`Last backup request ${fmtDateTime(cloud.lastSentAt)}`:(cloud.enabled?'Connected; not sent yet':'Connected; automatic sending off')):'Not connected';
  const firebaseState=window.lqFirebaseState||{},firebase=firebaseState.message||'Checking shared-device sync';
  if(el('localSaveStatus'))el('localSaveStatus').textContent=local;
  if(el('externalSaveStatus'))el('externalSaveStatus').textContent=external;
  if(el('firebaseSaveStatus'))el('firebaseSaveStatus').textContent=firebase;
}
function pdfPlain(v){
  return String(v??'')
    .replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/…/g,'...').replace(/→/g,'->').replace(/·/g,'-')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?');
}
function pdfEscape(v){return pdfPlain(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')}
function pdfFit(v,max){const s=pdfPlain(v);return s.length<=max?s:s.slice(0,Math.max(0,max-3))+'...'}
function makeOnePagePDF(){
  const commands=[];
  const text=(x,y,value,size=8,bold=false,color='')=>{
    if(color)commands.push(`${color} rg`);
    commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`);
    if(color)commands.push('0 0 0 rg');
  };
  const line=(x1,y1,x2,y2,w=.5)=>commands.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const rect=(x,y,w,h)=>commands.push(`0.6 w ${x} ${y} ${w} ${h} re S`);
  const shade=(x,y,w,h)=>commands.push(`0.965 g ${x} ${y} ${w} ${h} re f 0 g`);
  const diffColor=n=>n>0?'0.18 0.49 0.29':n<0?'0.71 0.23 0.28':'';

  text(36,754,pdfFit(data.appName,62),17,true);
  text(36,738,pdfFit(`${data.orgName} - ${effectiveReportTitle()}`,92),9,false);
  text(36,726,`Report generated ${new Date().toLocaleString()}`,7,false);

  const metricY=684,metricH=32,metricW=166;
  const toComplete=quiltsToCompleteTotal();
  [[36,data.homeStorageLabel,totalOnHand()],[223,data.homeNeededLabel,totalNeeded()],[410,data.homeDifferenceLabel,toComplete]].forEach(([x,label,num])=>{
    rect(x,metricY,metricW,metricH);text(x+8,metricY+18,String(num),14,true);
    pdfWrap(label,24).slice(0,2).forEach((part,i)=>text(x+42,metricY+21-i*9,pdfFit(part,24),6.8,true));
  });

  const stats=yearlyStatistics(selectedStatisticsYear());
  text(36,668,pdfFit(`${stats.year}: Made ${stats.made} | Distributed ${stats.distributed} | Net ${signedDifference(stats.netChange)} | Charities ${stats.charitiesServed} | Lifetime ${stats.lifetimeDistributed}`,92),7.2,true);
  text(36,653,pdfFit(`${data.homeStorageLabel.toUpperCase()} AND ${data.homeNeededLabel.toUpperCase()}`,74),10,true);line(36,647,576,647,.7);
  const xCharity=36,xSize=180,xOnHand=365,xRequested=455,xDifference=525;
  let y=633;
  const drawSummaryHeader=(x,label,maxChars,size)=>pdfWrap(label.toUpperCase(),maxChars).slice(0,3).forEach((part,i)=>text(x,y+7-i*7,pdfFit(part,maxChars),size,true));
  text(xCharity,y,'CHARITY',7,true);text(xSize,y,'SIZE',7,true);drawSummaryHeader(xOnHand-9,data.homeStorageLabel,14,5.5);drawSummaryHeader(xRequested-8,data.homeNeededLabel,14,5.5);drawSummaryHeader(xDifference-15,data.homeDifferenceLabel,13,5.5);line(36,y-14,576,y-14,.5);y-=29;
  const allRows=reportComparisonRows(),maxSummaryRows=20,shownRows=allRows.slice(0,maxSummaryRows);
  shownRows.forEach((row,rowIndex)=>{
    const bold=row.type!=='detail';
    if(rowIndex%2===1)shade(36,y-4,540,12);
    if(row.type!=='detail')line(36,y+8,576,y+8,.35);
    text(xCharity,y,pdfFit(row.charity,row.type==='detail'?25:34),7.2,bold);
    if(row.type==='detail')text(xSize,y,pdfFit(row.size,28),7.2,false);
    text(xOnHand,y,String(row.onHand),7.2,bold);
    text(xRequested,y,String(row.requestedNeeds),7.2,bold);
    text(xDifference,y,String(row.toComplete),7.2,row.type!=='detail',row.toComplete?'0.71 0.23 0.28':'0.18 0.49 0.29');
    y-=12;
  });
  if(allRows.length>shownRows.length){text(36,y,`+ ${allRows.length-shownRows.length} summary rows not shown`,7,true);y-=12}
  line(36,y+5,576,y+5,.7);

  const lowerTop=y-14;
  text(36,lowerTop,pdfFit(data.homeNeededLabel.toUpperCase(),40),9,true);line(36,lowerTop-5,294,lowerTop-5,.6);
  text(318,lowerTop,'RECENT ACTIVITY',9,true);line(318,lowerTop-5,576,lowerTop-5,.6);

  const needsRows=[];
  const needs=allocateNeedsForPlanning().filter(item=>item.n.month>=monthNow()&&item.remaining>0);
  if(!needs.length)needsRows.push({text:'No upcoming quilts needed.',bold:false});
  needs.forEach(item=>{
    const n=item.n;
    needsRows.push({text:`${fmtMonthShort(n.month)} - ${n.charity}`,bold:true});
    needsRows.push({text:`  ${n.size} | Quilts Needed ${n.qty} | Still Needed ${item.remaining}`,bold:false});
    needsRows.push({text:`  Available ${item.available} | Short ${item.shortage}`,bold:false});
  });

  const activityRows=[];
  const distributed=distributedNeedsForReport(),heldDistributed=holdDistributionsForReport();
  activityRows.push({text:`DISTRIBUTION RECORDS: ${distributed.length+heldDistributed.length}`,bold:true});
  const recentDistributionRows=[
    ...distributed.map(n=>({date:n.fulfilledDate||'',charity:n.charity,size:n.size,qty:fulfilledQty(n),left:remainingNeed(n),deferred:false})),
    ...heldDistributed.map(t=>({date:t.date||'',charity:t.charity,size:t.size,qty:Math.max(0,Number(t.qty)||0),left:0,deferred:true}))
  ].sort((a,b)=>String(b.date).localeCompare(String(a.date))||a.charity.localeCompare(b.charity));
  recentDistributionRows.slice(0,6).forEach(row=>{
    activityRows.push({text:`${row.date?fmtDate(row.date):'Date not entered'} - ${row.charity}`,bold:true});
    activityRows.push({text:`  ${row.size} | Sent ${row.qty}${row.deferred?' | From On Hold / Storage':row.left?` | Still Needed ${row.left}`:''}`,bold:false});
  });
  if(recentDistributionRows.length>6)activityRows.push({text:`  + ${recentDistributionRows.length-6} earlier distribution records`,bold:false});
  const adjustments=data.transactions.filter(t=>t.type==='ADJUST').sort((a,b)=>b.date.localeCompare(a.date));
  activityRows.push({text:'',bold:false});
  activityRows.push({text:`ADJUSTMENTS ON RECORD: ${adjustments.length}`,bold:true});
  adjustments.slice(0,8).forEach(t=>activityRows.push({text:`${fmtDate(t.date)} - ${t.charity} / ${t.size}: ${value(t)>0?'+':''}${value(t)}`,bold:false}));
  if(adjustments.length>8)activityRows.push({text:`  + ${adjustments.length-8} earlier adjustments`,bold:false});

  const drawRows=(rows,x,maxChars)=>{
    const rowH=10,startY=lowerTop-18,maxRows=Math.max(1,Math.floor((startY-38)/rowH));
    rows.slice(0,maxRows).forEach((r,i)=>text(x,startY-i*rowH,pdfFit(r.text,maxChars),7.2,!!r.bold));
    if(rows.length>maxRows)text(x,startY-(maxRows-1)*rowH,pdfFit(`+ ${rows.length-maxRows+1} more rows not shown`,maxChars),7.2,true);
  };
  drawRows(needsRows,36,48);
  drawRows(activityRows,318,48);
  text(36,24,pdfFit(COPYRIGHT_PDF,82),6.2,false);
  text(36,14,'Personal and authorized guild use only.',6.2,false);
  text(500,14,`Update ${VERSION}`,6.2,false);

  const content=commands.join('\n')+'\n';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`
  ];
  let pdf='%PDF-1.4\n%1234\n';
  const offsets=[0];
  objects.forEach((obj,i)=>{offsets[i+1]=pdf.length;pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`});
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes=new Uint8Array(pdf.length);
  for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;
  return bytes;
}
function pdfWrap(v,maxChars){
  const words=pdfPlain(v).trim().split(/\s+/).filter(Boolean),lines=[];
  let line='';
  words.forEach(word=>{
    if(word.length>maxChars){
      if(line){lines.push(line);line=''}
      for(let i=0;i<word.length;i+=maxChars)lines.push(word.slice(i,i+maxChars));
      return;
    }
    const next=line?`${line} ${word}`:word;
    if(next.length<=maxChars)line=next;
    else{if(line)lines.push(line);line=word}
  });
  if(line)lines.push(line);
  return lines.length?lines:[''];
}
function makeFullPDF(){
  const generated=new Date().toLocaleString();
  const pages=[];
  let page=null,currentSection='';
  const newPage=()=>{
    page={commands:[],y:704};pages.push(page);
    const text=(x,y,value,size=8,bold=false,color='')=>{if(color)page.commands.push(`${color} rg`);page.commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`);if(color)page.commands.push('0 0 0 rg')};
    const line=(x1,y1,x2,y2,w=.5)=>page.commands.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
    text(36,754,pdfFit(data.appName,68),16,true);
    text(36,738,pdfFit(`${data.orgName} - ${effectiveReportTitle()}`,96),9,false);
    text(36,726,`Report generated ${generated}`,7,false);
    line(36,716,576,716,.7);
    return page;
  };
  const text=(x,y,value,size=8,bold=false,color='')=>{if(color)page.commands.push(`${color} rg`);page.commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`);if(color)page.commands.push('0 0 0 rg')};
  const line=(x1,y1,x2,y2,w=.5)=>page.commands.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const rect=(x,y,w,h)=>page.commands.push(`0.6 w ${x} ${y} ${w} ${h} re S`);
  const shade=(x,y,w,h)=>page.commands.push(`0.965 g ${x} ${y} ${w} ${h} re f 0 g`);
  const sectionHeader=(label,continued=false)=>{
    const title=continued?`${label} (continued)`:label;
    text(36,page.y,title,11,true);line(36,page.y-6,576,page.y-6,.7);page.y-=22;
  };
  const ensure=(height)=>{
    if(page.y-height<48){newPage();if(currentSection)sectionHeader(currentSection,true)}
  };
  const addParagraph=(value,{size=8,bold=false,indent=0,after=4,lineHeight=null}={})=>{
    const lh=lineHeight||Math.max(10,size+3);
    const maxChars=Math.max(12,Math.floor((540-indent)/(size*.56)));
    const lines=pdfWrap(value,maxChars);
    ensure(lines.length*lh+after);
    lines.forEach((part,i)=>{text(36+indent,page.y-i*lh,part,size,bold)});
    page.y-=lines.length*lh+after;
  };
  const beginSection=label=>{
    currentSection=label;
    ensure(30);
    sectionHeader(label,false);
  };

  newPage();
  const metricY=656,metricH=36,metricW=166;
  const toComplete=quiltsToCompleteTotal();
  [[36,data.homeStorageLabel,totalOnHand()],[223,data.homeNeededLabel,totalNeeded()],[410,data.homeDifferenceLabel,toComplete]].forEach(([x,label,num])=>{
    rect(x,metricY,metricW,metricH);text(x+9,metricY+20,String(num),15,true);
    pdfWrap(label,24).slice(0,2).forEach((part,i)=>text(x+49,metricY+23-i*9,pdfFit(part,24),6.8,true));
  });
  page.y=632;

  const stats=yearlyStatistics(selectedStatisticsYear());
  beginSection(`${stats.year} YEARLY STATISTICS`);
  addParagraph(`Quilts Made: ${stats.made} | Quilts Distributed: ${stats.distributed} | Net Inventory Change: ${signedDifference(stats.netChange)}`,{size:8.5,bold:true,after:3});
  addParagraph(`Current Inventory: ${stats.currentInventory} | Charities Served: ${stats.charitiesServed} | Lifetime Quilts Distributed: ${stats.lifetimeDistributed}`,{size:8.5,after:9});

  beginSection(`${data.homeStorageLabel.toUpperCase()} AND ${data.homeNeededLabel.toUpperCase()}`);
  const comparisonRows=reportComparisonRows(),diffColor=n=>n>0?'0.18 0.49 0.29':n<0?'0.71 0.23 0.28':'';
  const drawComparisonHeader=()=>{
    const headerY=page.y,drawHeader=(x,label,maxChars,size)=>pdfWrap(label.toUpperCase(),maxChars).slice(0,3).forEach((part,i)=>text(x,headerY+7-i*7,pdfFit(part,maxChars),size,true));
    text(36,headerY,'CHARITY',7,true);text(185,headerY,'SIZE',7,true);drawHeader(356,data.homeStorageLabel,14,5.5);drawHeader(447,data.homeNeededLabel,14,5.5);drawHeader(510,data.homeDifferenceLabel,13,5.5);
    line(36,headerY-14,576,headerY-14,.5);page.y-=30;
  };
  drawComparisonHeader();
  comparisonRows.forEach((row,rowIndex)=>{
    if(page.y-15<48){newPage();sectionHeader(currentSection,true);drawComparisonHeader()}
    const bold=row.type!=='detail';
    if(rowIndex%2===1)shade(36,page.y-4,540,14);
    if(row.type!=='detail')line(36,page.y+8,576,page.y+8,.35);
    text(36,page.y,pdfFit(row.charity,row.type==='detail'?25:34),7.6,bold);
    if(row.type==='detail')text(185,page.y,pdfFit(row.size,29),7.6,false);
    text(365,page.y,String(row.onHand),7.6,bold);
    text(455,page.y,String(row.requestedNeeds),7.6,bold);
    text(525,page.y,String(row.toComplete),7.6,row.type!=='detail',row.toComplete?'0.71 0.23 0.28':'0.18 0.49 0.29');
    page.y-=14;
  });
  page.y-=8;

  beginSection(data.homeNeededLabel.toUpperCase());
  const needs=allocateNeedsForPlanning().filter(item=>item.n.month>=monthNow()&&item.remaining>0);
  if(!needs.length)addParagraph('No upcoming quilts needed.');
  needs.forEach(item=>{
    const n=item.n;
    addParagraph(`${fmtMonth(n.month)} - ${n.charity}`,{size:9,bold:true,after:2});
    addParagraph(`${n.size} | Quilts Needed: ${n.qty} | Sent: ${item.fulfilled} | Still Needed: ${item.remaining} | Available: ${item.available} | Shortage: ${item.shortage}`,{indent:16,after:n.note?1:6});
    if(n.note)addParagraph(`Note: ${n.note}`,{indent:16,size:7.5,after:6});
  });

  beginSection('DISTRIBUTED QUILTS');
  const distributed=distributedNeedsForReport();
  if(!distributed.length)addParagraph('No distributed quilts recorded.');
  distributed.forEach(n=>{
    addParagraph(`${n.fulfilledDate?fmtDate(n.fulfilledDate):'Date not entered'} - ${n.charity}`,{size:9,bold:true,after:2});
    addParagraph(`${n.size} | Month Needed: ${fmtMonth(n.month)} | Quilts Needed: ${n.qty} | Sent: ${fulfilledQty(n)} | Still Needed: ${remainingNeed(n)} | Status: ${distributionReportStatus(n)}`,{indent:16,after:n.note?1:6});
    if(n.note)addParagraph(`Note: ${n.note}`,{indent:16,size:7.5,after:6});
  });

  beginSection('ADJUSTED TRANSACTIONS');
  const adjustments=data.transactions.filter(t=>t.type==='ADJUST').sort((a,b)=>b.date.localeCompare(a.date)||a.charity.localeCompare(b.charity));
  if(!adjustments.length)addParagraph('No adjusted transactions.');
  adjustments.forEach(t=>{
    addParagraph(`${fmtDate(t.date)} - ${t.charity}`,{size:9,bold:true,after:2});
    addParagraph(`${t.size} | Change: ${value(t)>0?'+':''}${value(t)}`,{indent:16,after:t.note?1:6});
    if(t.note)addParagraph(`Note: ${t.note}`,{indent:16,size:7.5,after:6});
  });

  pages.forEach((p,i)=>{
    p.commands.push(`0.5 w 36 34 m 576 34 l S`);
    p.commands.push(`BT /F1 6.2 Tf 1 0 0 1 36 22 Tm (${pdfEscape(pdfFit(COPYRIGHT_PDF,82))}) Tj ET`);
    p.commands.push(`BT /F1 6.2 Tf 1 0 0 1 36 12 Tm (${pdfEscape('Personal and authorized guild use only.')}) Tj ET`);
    p.commands.push(`BT /F1 6.2 Tf 1 0 0 1 500 12 Tm (${pdfEscape(`Page ${i+1} of ${pages.length} - v${VERSION}`)}) Tj ET`);
  });

  const pageCount=pages.length;
  const pageIds=pages.map((_,i)=>5+i*2);
  const objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageCount} >>`;
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  pages.forEach((p,i)=>{
    const pageId=5+i*2,contentId=pageId+1;
    const content=p.commands.join('\n')+'\n';
    objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId]=`<< /Length ${content.length} >>\nstream\n${content}endstream`;
  });
  let pdf='%PDF-1.4\n%1234\n';
  const offsets=[0];
  for(let i=1;i<objects.length;i++){
    offsets[i]=pdf.length;
    pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes=new Uint8Array(pdf.length);
  for(let i=0;i<pdf.length;i++)bytes[i]=pdf.charCodeAt(i)&255;
  return bytes;
}

function exportFullPDF(){renderReports();const bytes=makeFullPDF();downloadBlob(`${filePart(data.itemName)}_Full_Report_${today()}.pdf`,new Blob([bytes],{type:'application/pdf'}))}
function exportCompactPDF(){try{renderReports();const bytes=makeOnePagePDF();downloadBlob(`${filePart(data.itemName)}_Compact_Report_${today()}.pdf`,new Blob([bytes],{type:'application/pdf'}));notice('reportNotice','Compact one-page PDF created.',true)}catch(error){console.error('Compact PDF export failed',error);notice('reportNotice','The compact PDF could not be created. Refresh the app and try again.')}}
async function shareReport(kind){
  renderReports();const full=kind==='full',bytes=full?makeFullPDF():makeOnePagePDF();
  const filename=`${filePart(data.itemName)}_${full?'Full':'Compact'}_Report_${today()}.pdf`,blob=new Blob([bytes],{type:'application/pdf'}),file=new File([blob],filename,{type:'application/pdf'});
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    try{await navigator.share({title:`${data.itemName} ${full?'Full':'Compact'} Report`,text:`${data.orgName} ${data.itemName} report`,files:[file]});notice('reportNotice','Report shared.',true);return}catch(error){if(error&&error.name==='AbortError')return}
  }
  downloadBlob(filename,blob);notice('reportNotice','This device could not attach the PDF directly. The report was downloaded instead.');
}
function shareFullReport(){shareReport('full')}
function shareCompactReport(){shareReport('compact')}
function clearPrintMode(){
  document.body.classList.remove('print-full','print-compact','print-home-summary','print-calendar');
  el('lqmPrintPageStyle')?.remove();
}
function runPrintMode(className,pageSize='letter portrait',margin='.35in'){
  clearPrintMode();document.body.classList.add(className);
  const style=document.createElement('style');style.id='lqmPrintPageStyle';style.textContent=`@media print{@page{size:${pageSize};margin:${margin}}`;document.head.appendChild(style);
  void document.body.offsetHeight;
  requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>window.print(),180)));
}
function calendarLegendHTML(){return'<div class="calendar-legend" aria-label="Calendar color key"><span><i class="calendar-swatch met"></i>Demand met / covered early</span><span><i class="calendar-swatch unmet"></i>Past demand not met</span><span><i class="calendar-swatch future"></i>Future month</span><span><i class="calendar-swatch current"></i>Current month</span><span><i class="calendar-swatch charity-met"></i>Charity met</span><span><i class="calendar-swatch charity-short"></i>Charity short</span></div>'}
function renderCalendarPrintReport(source='needs'){
  const home=source==='home',year=home?Number(monthNow().slice(0,4)):(Number(el('calendarYear')?.value)||Number(monthNow().slice(0,4)));
  const charity=home?(el('homeCalendarCharity')?.value||''):(el('calendarCharity')?.value||''),size=home?'':(el('calendarSize')?.value||'');
  const filters=[charity?`Charity: ${charity}`:'All charities',size?`Size: ${size}`:'All sizes'].join(' · ');
  const target=el('calendarPrintReport');if(!target)return;
  target.innerHTML=`<div class="calendar-print-header"><div><h1>${esc(data.appName)} — ${year} Calendar</h1><div class="small">${esc(data.orgName)} · ${esc(data.homeCalendarHeading)}</div></div><div class="calendar-print-meta">${esc(filters)}<br>Generated ${esc(new Date().toLocaleString())}</div></div><div class="needs-calendar">${calendarMarkup(year,charity,size,false,false)}</div>${calendarLegendHTML()}<div class="print-copyright">${esc(COPYRIGHT_TEXT)} Personal and authorized guild use only.</div>`;
}
function printCalendar(source='needs'){renderCalendarPrintReport(source);runPrintMode('print-calendar','letter portrait','.25in')}
function printHomeSummary(){renderHomeSummaryReport();runPrintMode('print-home-summary','letter portrait','.3in')}
function printFullReport(){renderReports();runPrintMode('print-full','letter portrait','.45in')}
function printMeetingReport(){renderReports();runPrintMode('print-compact','letter portrait','.3in')}
function exportMeetingPDF(){exportCompactPDF()}
window.addEventListener('afterprint',clearPrintMode);
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(el('entryReviewModal')?.classList.contains('open'))closeEntryReview();else if(el('calendarDistributionModal')?.classList.contains('open'))closeCalendarDistributionModal();else if(el('calendarActionModal')?.classList.contains('open'))closeCalendarActionModal();else if(el('calendarNeedModal')?.classList.contains('open'))closeCalendarNeedModal()});
window.addEventListener('online',()=>queueExternalBackup('Internet connection restored'));
function renderAll(){refreshSelects();applyNames();renderHome();renderInventory();renderHistory();renderNeeds();renderReports();renderRecoveryList();updateSaveStatus()}


window.lqGetData=()=>clone(data);
window.lqApplyRemoteData=(remoteData,reason='shared-device update')=>{
  try{
    const normalized=normalizeData(remoteData||{});
    const current=JSON.stringify(data);
    const incoming=JSON.stringify(normalized);
    if(current===incoming)return false;
    createRecoverySnapshot(`Before ${reason}`,data);
    data=normalized;
    localStorage.setItem(KEY,JSON.stringify(data));
    status.lastSavedAt=new Date().toISOString();persistStatus();
    renderAll();
    return true;
  }catch(error){console.error('Could not apply shared-device data.',error);return false}
};
window.lqRefreshSaveStatus=updateSaveStatus;

document.addEventListener('DOMContentLoaded',()=>{
  document.body.style.overflow='hidden';el('continueBtn').addEventListener('click',closeSplash);el('txDate').value=today();el('needMonth').value=monthNow();
  localStorage.setItem(KEY,JSON.stringify(data));if(!status.lastSavedAt){status.lastSavedAt=new Date().toISOString();persistStatus()}createRecoverySnapshot('Update 7.8.33 opened',data);
  loadExternalFields();renderAll();setMode('IN');
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=7.8.33',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}));
});
