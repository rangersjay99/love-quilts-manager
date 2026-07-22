'use strict';

// Copyright © 2026 Jay. All rights reserved.
// Personal and authorized guild use only. See LICENSE.txt.

const VERSION='7.7.9';
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
const COPYRIGHT_TEXT='© 2026 Jay. Love Quilts Manager. All rights reserved.';
const COPYRIGHT_PDF='Copyright (c) 2026 Jay. Love Quilts Manager. All rights reserved.';
const DEFAULT_CHARITIES=['Grassroots','SHP','St. Agnes','Bridges','Project Holiday'];
const DEFAULT_SIZES=["Children's Large",'Adult Large','Medium'];
let mode='IN',qty=0,editTxId=null,editNeedId=null,editNeedMode='details',externalTimer=null,externalReason='Automatic save';

const el=id=>document.getElementById(id);
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function today(){const d=new Date(),o=d.getTimezoneOffset();return new Date(d.getTime()-o*60000).toISOString().slice(0,10)}
function monthNow(){return today().slice(0,7)}
function parse(s){try{return JSON.parse(s)}catch{return null}}
function clone(v){return JSON.parse(JSON.stringify(v))}
function unique(a){return [...new Set((a||[]).filter(Boolean).map(v=>String(v).trim()).filter(Boolean))]}
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
function effectiveReportTitle(){return String(data.reportTitle||'').trim()||`${data.itemName||DEFAULT_ITEM} Inventory and Needs Report`}
function auditText(record){
  if(!record)return'';
  const createdBy=String(record.createdBy||'').trim(),updatedBy=String(record.updatedBy||'').trim();
  const createdAt=String(record.createdAt||''),updatedAt=String(record.updatedAt||'');
  if(updatedBy&&updatedAt&&(updatedBy!==createdBy||updatedAt!==createdAt))return`Entered by ${createdBy||'earlier user'} · Last edited by ${updatedBy} ${fmtDateTime(updatedAt)}`;
  if(createdBy)return`Entered by ${createdBy}${createdAt?' '+fmtDateTime(createdAt):''}`;
  return'';
}

function normalizeData(d={}){
  let tx=Array.isArray(d.transactions)?d.transactions.map(t=>({
    id:t.id||uid(),date:t.date||today(),type:['IN','OUT','ADJUST'].includes(t.type)?t.type:'IN',
    charity:String(t.charity||'Unknown'),size:String(t.size||'Other'),qty:Math.max(1,Number(t.qty||t.quantity||1)),
    adjustment:Number(t.adjustment||0),note:String(t.note||''),
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
    const fulfilled=Math.max(0,Math.min(needQty,Math.floor(Number(n.fulfilledQty??(legacyComplete?needQty:0))||0)));
    return{
      id:n.id||uid(),month:n.month||monthNow(),charity:String(n.charity||DEFAULT_CHARITIES[0]),
      size:String(n.size||DEFAULT_SIZES[0]),qty:needQty,note:String(n.note||''),
      fulfilledQty:fulfilled,fulfilledDate:String(n.fulfilledDate||n.completedDate||''),
      fulfilledBy:String(n.fulfilledBy||''),fulfilledAt:String(n.fulfilledAt||''),
      fulfilledHighWater:Math.max(fulfilled,Math.floor(Number(n.fulfilledHighWater??fulfilled)||0)),
      autoOutQty:Math.max(0,Math.floor(Number(n.autoOutQty||0))),
      createdBy:String(n.createdBy||''),createdAt:String(n.createdAt||''),updatedBy:String(n.updatedBy||''),updatedAt:String(n.updatedAt||'')
    };
  }):[];
  return{
    orgName:String(d.orgName||DEFAULT_ORG),appName:String(d.appName||DEFAULT_APP),itemName:String(d.itemName||DEFAULT_ITEM),
    reportTitle:String(d.reportTitle||''),splashTag:String(d.splashTag||''),splashMessage:String(d.splashMessage||''),
    charities:unique([...(Array.isArray(d.charities)?d.charities:[]),...tx.map(t=>t.charity),...needs.map(n=>n.charity),...DEFAULT_CHARITIES]),
    sizes:unique([...(Array.isArray(d.sizes)?d.sizes:[]),...tx.map(t=>t.size),...needs.map(n=>n.size),...DEFAULT_SIZES]),
    transactions:tx,needs
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
  const automaticSplashMessage=`Keeping track of ${lowerName()}…\none quilt at a time.`;
  const shownSplashMessage=data.splashMessage||automaticSplashMessage;
  el('headerOrg').textContent=data.orgName;el('headerAppName').textContent=data.appName;
  el('splashOrg').textContent=data.orgName;el('splashItemName').textContent=data.itemName;el('splashManager').textContent=splashSecondLine();
  el('splashTag').textContent=data.splashTag||DEFAULT_SPLASH_TAG;
  el('splashMessage').innerHTML=esc(shownSplashMessage).replace(/\n/g,'<br>');
  el('splashVersion').textContent=`${data.appName} · Update ${VERSION}`;
  el('orgNameInput').value=data.orgName;el('appNameInput').value=data.appName;el('itemNameInput').value=data.itemName;
  if(el('reportTitleInput')){el('reportTitleInput').value=data.reportTitle||'';el('reportTitleInput').placeholder=`${data.itemName} Inventory and Needs Report`}
  el('splashTagInput').value=data.splashTag;el('splashTagInput').placeholder=DEFAULT_SPLASH_TAG;
  el('splashMessageInput').value=data.splashMessage;el('splashMessageInput').placeholder=automaticSplashMessage;
  el('aboutAppName').textContent=data.appName;el('aboutItemName').textContent=data.itemName;el('aboutOrgName').textContent=data.orgName;
  el('homeRecordBtn').textContent=`Record ${data.itemName}`;el('recordHeading').textContent=`Record ${data.itemName}`;
  el('modeIn').textContent=`${data.itemName} In`;el('modeOut').textContent=`${data.itemName} Out`;
  el('historyInOption').textContent=`${data.itemName} In`;el('historyOutOption').textContent=`${data.itemName} Out`;
  el('inventoryNote').textContent=`Choose ${data.itemName} Out only when items physically leave storage. Use Adjust for corrections; adjustments are visibly flagged.`;
  el('needsNote').textContent=`Enter the number of ${lowerName()} needed by month. Available inventory and shortage are calculated in month order.`;if(el('needRecordOutName'))el('needRecordOutName').textContent=data.itemName;
  el('reportHeading').textContent=effectiveReportTitle();
  document.title=`${data.orgName} — ${data.appName}`;
  const appleTitle=document.querySelector('meta[name="apple-mobile-web-app-title"]');if(appleTitle)appleTitle.setAttribute('content',data.appName);
  setMode(mode);
}
function saveNames(){
  data.orgName=el('orgNameInput').value.trim()||DEFAULT_ORG;data.appName=el('appNameInput').value.trim()||DEFAULT_APP;data.itemName=el('itemNameInput').value.trim()||DEFAULT_ITEM;
  data.reportTitle=el('reportTitleInput')?.value.trim()||'';data.splashTag=el('splashTagInput').value.trim();data.splashMessage=el('splashMessageInput').value.trim();
  save('Names, report title, and splash wording changed');applyNames();renderAll();notice('nameNotice','Names, report title, and splash wording saved.',true);
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
  fill('txSize',data.sizes,'<option value="">Select size</option>');
  fill('needSize',data.sizes,'<option value="">Select size</option>');
  fill('deleteSize',data.sizes);
  fill('historyCharity',data.charities,'<option value="">All charities</option>');
  fill('calendarCharity',data.charities,'<option value="">All charities</option>');
  fill('calendarSize',data.sizes,'<option value="">All sizes</option>');
  refreshCalendarYears();
}
function setMode(m){
  mode=m;el('modeIn').className=m==='IN'?'active-in':'';el('modeOut').className=m==='OUT'?'active-out':'';el('modeAdjust').className=m==='ADJUST'?'active-adjust':'';
  el('dateLabel').textContent=m==='IN'?'Date In':m==='OUT'?'Date Out':'Adjustment Date';
  el('saveTxBtn').textContent=editTxId?'Save Changes':m==='IN'?'Add to Inventory':m==='OUT'?'Remove from Inventory':'Save Adjustment';
}
function setQty(value){
  const parsed=Math.floor(Number(value));
  qty=Number.isFinite(parsed)&&parsed>=1?parsed:1;
  if(el('qtyInput'))el('qtyInput').value=qty;
}
function clearQty(){qty=0;if(el('qtyInput'))el('qtyInput').value=''}
function syncQtyInput(){
  const input=el('qtyInput');if(!input)return;
  const raw=String(input.value??'').trim();
  if(raw===''){qty=0;return}
  const parsed=Math.floor(Number(raw));
  qty=Number.isFinite(parsed)&&parsed>=1?parsed:0;
}
function changeQty(d){syncQtyInput();setQty(Math.max(1,(qty||0)+d))}
function value(t){if(t.type==='IN')return Number(t.qty)||0;if(t.type==='OUT')return-(Number(t.qty)||0);return Number(t.adjustment)||Number(t.qty)||0}
function invMap(exclude=null){const m={};data.transactions.filter(t=>t.id!==exclude).forEach(t=>{const k=t.charity+'|'+t.size;m[k]=(m[k]||0)+value(t)});return m}
function onHand(c,s,exclude=null){return invMap(exclude)[c+'|'+s]||0}
function totalOnHand(exclude=null){return Object.values(invMap(exclude)).reduce((a,b)=>a+b,0)}
function confirmInventoryChange(type,c,s,change,exclude=null){
  const current=onHand(c,s,exclude),next=current+change,totalCurrent=totalOnHand(exclude),totalNext=totalCurrent+change,amount=Math.abs(change);
  const action=type==='OUT'?`Record ${amount} out from ${data.itemName}`:`Save inventory adjustment of ${change>0?'+':''}${change}`;
  return confirm(`Are you sure?\n\n${action}\n${c} — ${s}\n\nCurrent inventory: ${current}\nNew inventory: ${next}\n\nTotal ${lowerName()} on hand: ${totalCurrent} → ${totalNext}`);
}
function saveTransaction(){
  syncQtyInput();
  if(qty<1)return notice('txNotice','Please enter a quantity of 1 or more.');
  const c=el('txCharity').value,s=el('txSize').value,d=el('txDate').value||today(),noteText=el('txNote').value.trim();
  if(!c||!s)return notice('txNotice','Please select a charity and size.');
  const current=onHand(c,s,editTxId);let adj=0;
  if(mode==='OUT'&&qty>current)return notice('txNotice',`Only ${current} are on hand for ${c} — ${s}.`);
  if(mode==='ADJUST'){
    adj=confirm(`Choose the adjustment direction:\n\nPress OK to ADD ${qty}.\nPress Cancel to SUBTRACT ${qty}.`)?qty:-qty;
    if(current+adj<0)return notice('txNotice','That adjustment would make inventory negative.');
    if(!confirmInventoryChange('ADJUST',c,s,adj,editTxId))return notice('txNotice','Adjustment canceled. No changes were saved.');
  }
  if(mode==='OUT'&&!confirmInventoryChange('OUT',c,s,-qty,editTxId))return notice('txNotice',`${data.itemName} Out canceled. No changes were saved.`);
  const editing=!!editTxId,previous=editTxId?data.transactions.find(t=>t.id===editTxId):null,stamp=nowIso(),email=currentUserEmail();
  const r={id:editTxId||uid(),date:d,type:mode,charity:c,size:s,qty,adjustment:adj,note:noteText,
    createdBy:previous?.createdBy||email,createdAt:previous?.createdAt||stamp,updatedBy:email,updatedAt:stamp};
  if(editTxId){const i=data.transactions.findIndex(t=>t.id===editTxId);if(i>=0)data.transactions[i]=r}else data.transactions.push(r);
  save(editing?'Inventory transaction edited':'Inventory transaction added');cancelTxEdit();renderAll();notice('txNotice','Saved successfully.',true);
}
function editTx(id){
  const t=data.transactions.find(x=>x.id===id);if(!t)return;editTxId=id;mode=t.type;qty=Math.abs(value(t))||1;refreshSelects();
  el('txCharity').value=t.charity;el('txSize').value=t.size;el('txDate').value=t.date;el('txNote').value=t.note||'';setQty(qty);
  el('cancelTxBtn').style.display='block';setMode(mode);showView('inventory');
}
function cancelTxEdit(){editTxId=null;clearQty();el('txCharity').value='';el('txSize').value='';el('txNote').value='';el('txDate').value=today();el('cancelTxBtn').style.display='none';setMode(mode)}
function deleteTx(id){
  const t=data.transactions.find(x=>x.id===id);if(!t)return;
  const n=value(t),description=`${fmtDate(t.date)} — ${t.charity} — ${t.size} — ${n>0?'+':''}${n}`;
  if(confirm(`Delete this transaction?\n\n${description}\n\nThis changes the inventory total. A recovery copy will be kept.`)){
    createRecoverySnapshot('Before deleting an inventory transaction');data.transactions=data.transactions.filter(x=>x.id!==id);save('Inventory transaction deleted');renderAll();
  }
}
function renderInventory(){
  const groups={};Object.entries(invMap()).forEach(([k,n])=>{const split=k.lastIndexOf('|'),c=k.slice(0,split),s=k.slice(split+1);if(n!==0)(groups[c]??=[]).push({s,n})});
  const names=Object.keys(groups).sort();
  el('inventoryList').innerHTML=names.length?names.map(c=>`<div class="group"><div class="head"><div class="title">${esc(c)}</div><div class="badge">${groups[c].reduce((a,x)=>a+x.n,0)}</div></div>${groups[c].sort((a,b)=>a.s.localeCompare(b.s)).map(x=>`<div class="head" style="margin-top:8px"><div class="meta">${esc(x.s)}</div><b class="${x.n<0?'negative':''}">${x.n}</b></div>`).join('')}</div>`).join(''):`<div class="empty">No ${esc(lowerName())} currently on hand.</div>`;
}
function renderHistory(){
  const c=el('historyCharity').value,t=el('historyType').value;
  const list=[...data.transactions].filter(x=>(!c||x.charity===c)&&(!t||x.type===t)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  el('historyList').innerHTML=list.length?list.map(x=>{const n=value(x);return`<div class="item"><div class="head"><div><div class="title ${n<0?'negative':'positive'}">${n>0?'+':''}${n} ${esc(x.size)}</div><div class="meta">${esc(x.charity)} · ${fmtDate(x.date)}</div>${x.note?`<div class="meta">${esc(x.note)}</div>`:''}${auditText(x)?`<div class="audit-meta">${esc(auditText(x))}</div>`:''}${x.type==='ADJUST'?'<div class="meta"><span class="flag">Adjusted inventory</span></div>':''}</div><b>${x.type==='ADJUST'?'ADJUSTED':x.type}</b></div><div class="actions"><button onclick="editTx('${x.id}')">Edit</button><button onclick="deleteTx('${x.id}')">Delete</button></div></div>`}).join(''):'<div class="empty">No matching history.</div>';
}
function fulfilledQty(n){return Math.max(0,Math.min(Math.max(1,Number(n?.qty||1)),Math.floor(Number(n?.fulfilledQty||0))))}
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
function needValuesFromMainForm(){
  return{
    month:el('needMonth').value||monthNow(),charity:el('needCharity').value,size:el('needSize').value,
    qty:el('needQty').value,note:el('needNote').value.trim(),fulfilledQty:el('needFulfilledQty').value,
    fulfilledDate:el('needFulfilledDate').value||'',recordOut:!!el('needRecordOut').checked
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
function persistNeedRecord(values,id=null,messageTarget='needNotice'){
  const previous=id?data.needs.find(n=>n.id===id):null,stamp=nowIso(),email=currentUserEmail();
  if(id&&!previous){showNeedSaveMessage(messageTarget,'This need could not be found. It may have changed on another device.');editNeedId=null;renderNeeds();return false}
  const needQty=Math.floor(Number(values.qty));
  if(!Number.isFinite(needQty)||needQty<1){showNeedSaveMessage(messageTarget,'Quantity Needed must be 1 or more.');return false}
  const sentRaw=Math.floor(Number(values.fulfilledQty||0));
  if(!Number.isFinite(sentRaw)||sentRaw<0){showNeedSaveMessage(messageTarget,'Quantity Distributed must be zero or more.');return false}
  if(sentRaw>needQty){showNeedSaveMessage(messageTarget,'Quantity Distributed cannot be greater than Quantity Needed.');return false}
  const sentDate=String(values.fulfilledDate||'');
  if(sentRaw>0&&!sentDate){showNeedSaveMessage(messageTarget,'Please enter the distribution date.');return false}
  const charity=String(values.charity||''),size=String(values.size||'');
  if(!charity||!size){showNeedSaveMessage(messageTarget,'Please select a charity and size.');return false}
  const fulfillmentChanged=sentRaw!==fulfilledQty(previous)||sentDate!==String(previous?.fulfilledDate||'');
  const previousSent=fulfilledQty(previous),priorAutoOut=Math.max(0,Math.floor(Number(previous?.autoOutQty||0)));
  const priorHighWater=Math.max(previousSent,Math.floor(Number(previous?.fulfilledHighWater??previousSent)||0));
  const recordOut=!!values.recordOut,autoOutNeeded=recordOut?Math.max(0,sentRaw-priorHighWater):0;
  const r={id:id||uid(),month:String(values.month||monthNow()),charity,size,qty:needQty,note:String(values.note||'').trim(),
    fulfilledQty:sentRaw,fulfilledDate:sentRaw?sentDate:'',fulfilledBy:fulfillmentChanged?(sentRaw?email:''):String(previous?.fulfilledBy||''),fulfilledAt:fulfillmentChanged?(sentRaw?stamp:''):String(previous?.fulfilledAt||''),
    fulfilledHighWater:Math.max(priorHighWater,sentRaw),autoOutQty:priorAutoOut,
    createdBy:previous?.createdBy||email,createdAt:previous?.createdAt||stamp,updatedBy:email,updatedAt:stamp};
  if(autoOutNeeded>0){
    const current=onHand(r.charity,r.size);
    if(autoOutNeeded>current){showNeedSaveMessage(messageTarget,`Only ${current} are on hand for ${r.charity} — ${r.size}. Leave the Inventory Out box unchecked if this distribution was already recorded.`);return false}
    if(!confirmInventoryChange('OUT',r.charity,r.size,-autoOutNeeded)){showNeedSaveMessage(messageTarget,'Distribution save canceled. No changes were saved.');return false}
    data.transactions.push({id:uid(),date:r.fulfilledDate,type:'OUT',charity:r.charity,size:r.size,qty:autoOutNeeded,adjustment:0,
      note:`Distributed for ${fmtMonth(r.month)} planned need`,createdBy:email,createdAt:stamp,updatedBy:email,updatedAt:stamp});
    r.autoOutQty=priorAutoOut+autoOutNeeded;
  }
  if(id){const i=data.needs.findIndex(n=>n.id===id);if(i<0)return false;data.needs[i]=r}else data.needs.push(r);
  save(id?'Planned need edited':'Planned need added');editNeedId=null;editNeedMode='details';renderAll();
  if(id)notice('needNotice','Need changes saved.',true);else notice('needNotice',sentRaw>=needQty?'Need marked distributed.':'Need saved.',true);
  return true;
}
function prepareNeedDistribution(id){editNeed(id,true)}
function editNeed(id,distribution=false){
  const n=data.needs.find(x=>x.id===id);if(!n)return;
  editNeedId=id;editNeedMode=distribution?'distribution':'details';showView('needs');renderNeeds();
  requestAnimationFrame(()=>{
    const form=[...document.querySelectorAll('.need-inline-editor')].find(x=>x.dataset.needEditId===id);if(!form)return;
    if(distribution){
      const qtyField=form.querySelector('[name="fulfilledQty"]'),dateField=form.querySelector('[name="fulfilledDate"]');
      showNeedSaveMessage(form.querySelector('.inline-need-notice'),`Edit the distribution directly in this card. Check “Record as ${data.itemName} Out” only if it has not already been entered in Inventory.`);
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
  const sent=Math.max(0,Math.min(qty,Math.floor(Number(form.querySelector('[name="fulfilledQty"]')?.value||0))));
  const target=form.querySelector('[data-inline-remaining]');if(target)target.textContent=String(Math.max(0,qty-sent));
}
function cancelNeedEdit(){editNeedId=null;editNeedMode='details';renderNeeds()}
function deleteNeed(id){
  const n=data.needs.find(x=>x.id===id);if(!n)return;
  const sent=fulfilledQty(n),extra=sent?`
Distributed: ${sent}${n.fulfilledDate?' on '+fmtDate(n.fulfilledDate):''}

Deleting the need does not delete any Inventory Out transaction.`:'';
  if(confirm(`Delete this planned need?

${fmtMonth(n.month)} — ${n.charity} — ${n.size} — Need ${n.qty}${extra}

A recovery copy will be kept.`)){
    createRecoverySnapshot('Before deleting a planned need');data.needs=data.needs.filter(x=>x.id!==id);if(editNeedId===id){editNeedId=null;editNeedMode='details'}save('Planned need deleted');renderAll();
  }
}
function upcoming(){return data.needs.filter(n=>n.month>=monthNow()&&remainingNeed(n)>0)}
function totalNeeded(){return upcoming().reduce((a,n)=>a+remainingNeed(n),0)}
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
function shortageTotal(){return allocateNeedsForPlanning().filter(item=>item.n.month>=monthNow()&&item.remaining>0).reduce((sum,item)=>sum+item.shortage,0)}
function needInlineEditor(n,stateClass,stateLabel,info,editorMode='details'){
  const charityOptions=data.charities.map(c=>`<option value="${esc(c)}"${c===n.charity?' selected':''}>${esc(c)}</option>`).join('');
  const sizeOptions=data.sizes.map(size=>`<option value="${esc(size)}"${size===n.size?' selected':''}>${esc(size)}</option>`).join('');
  const sent=fulfilledQty(n),remaining=remainingNeed(n),complete=remaining===0,pastDue=needIsPastDue(n),available=Math.max(0,Number(info?.available||0)),short=Math.max(0,Number(info?.shortage||0));
  let metricTwo='',metricThree='';
  if(complete){metricTwo=`<div><b>${sent}</b><span>Sent</span></div>`;metricThree=`<div><b class="positive">0</b><span>Remaining</span></div>`}
  else if(sent>0||pastDue){metricTwo=`<div><b>${sent}</b><span>Sent</span></div>`;metricThree=`<div><b class="${pastDue?'negative':''}">${remaining}</b><span>Remaining</span></div>`}
  else{metricTwo=`<div><b>${available}</b><span>Available for this need</span></div>`;metricThree=`<div><b class="${short?'negative':'positive'}">${short}</b><span>Shortage</span></div>`}
  const distributionQty=sent||Number(n.qty)||1,distributionDate=n.fulfilledDate||today();
  const planner=editorMode==='distribution'
    ?`<div class="planner-edit-cell"><input name="qty" type="number" inputmode="numeric" min="1" step="1" value="${Number(n.qty)||1}" oninput="updateInlineNeedPreview(this.form)" aria-label="Quantity needed"><span>Need</span></div>
      <div class="planner-edit-cell"><input name="fulfilledQty" type="number" inputmode="numeric" min="0" step="1" value="${distributionQty}" oninput="updateInlineNeedPreview(this.form)" aria-label="Quantity sent"><span>Sent</span></div>
      <div><b data-inline-remaining>${Math.max(0,(Number(n.qty)||1)-distributionQty)}</b><span>Remaining</span></div>`
    :`<div class="planner-edit-cell"><input name="qty" type="number" inputmode="numeric" min="1" step="1" value="${Number(n.qty)||1}" aria-label="Quantity needed"><span>Need</span></div>${metricTwo}${metricThree}`;
  const distributionFields=editorMode==='distribution'
    ?`<div class="direct-distribution-row"><label>Date Distributed<input name="fulfilledDate" type="date" value="${esc(distributionDate)}"></label><label class="check-row inline-check"><input name="recordOut" type="checkbox"><span>Record newly distributed quantity as ${esc(data.itemName)} Out</span></label></div>
      <p class="small direct-edit-help">Leave the box unchecked when the quilts were already entered on the Inventory screen.</p>`
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
    planner=`<div><b>${n.qty}</b><span>Need</span></div><div><b>${sent}</b><span>Sent</span></div><div><b class="positive">0</b><span>Remaining</span></div>`;
    detail=`<div class="distribution-meta">✓ ${esc(distributionText(n)||'Distribution completed')}</div>`;
  }else if(sent>0||pastDue){
    stateClass=pastDue?'need-pastdue':'need-partial';stateLabel=pastDue?'Past Due': 'Partially Sent';
    planner=`<div><b>${n.qty}</b><span>Need</span></div><div><b>${sent}</b><span>Sent</span></div><div><b class="${pastDue?'negative':''}">${remaining}</b><span>Remaining</span></div>`;
    detail=`<div class="distribution-meta">${sent?esc(distributionText(n))+' · ':''}Available for this need ${available} · Short ${short}</div>`;
  }else{
    stateClass=short===0?'need-covered':available>0?'need-partial':'need-shortage';stateLabel=short===0?'Covered':available>0?'Partial':'Shortage';
    planner=`<div><b>${n.qty}</b><span>Need</span></div><div><b>${available}</b><span>Available for this need</span></div><div><b class="${short?'negative':'positive'}">${short}</b><span>Shortage</span></div>`;
  }
  if(actions&&editNeedId===n.id)return needInlineEditor(n,stateClass,stateLabel,info,editNeedMode);
  const actionButtons=actions?`<div class="actions need-actions"><button class="need-edit-button" onclick="editNeed(this.closest('.need-card').dataset.needId)">Edit</button><button class="need-distribute-button" onclick="prepareNeedDistribution(this.closest('.need-card').dataset.needId)">${complete?'Update Distribution':'Mark Distributed'}</button><button class="need-delete-button" onclick="deleteNeed(this.closest('.need-card').dataset.needId)">Delete</button></div>`:'';
  return`<div class="item need-card ${stateClass}" data-need-id="${esc(n.id)}"><div class="head"><div><div class="title">${fmtMonth(n.month)} — ${esc(n.charity)}</div><div class="meta">${esc(n.size)}${n.note?' · '+esc(n.note):''}</div>${auditText(n)?`<div class="audit-meta">${esc(auditText(n))}</div>`:''}</div><span class="need-status">${stateLabel}</span></div><div class="planner">${planner}</div>${detail}${actionButtons}</div>`;
}
function refreshCalendarYears(){
  const select=el('calendarYear');if(!select)return;
  const current=Number(monthNow().slice(0,4)),years=unique([current-1,current,current+1,current+2,...data.needs.map(n=>Number(String(n.month).slice(0,4))).filter(Boolean)]).map(Number).sort((a,b)=>a-b);
  const old=Number(select.value)||current;select.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');select.value=years.includes(old)?String(old):String(current);
}
function renderNeedsCalendar(){
  const box=el('needsCalendar');if(!box)return;
  refreshCalendarYears();
  const year=Number(el('calendarYear')?.value)||Number(monthNow().slice(0,4)),charity=el('calendarCharity')?.value||'',size=el('calendarSize')?.value||'';
  const allocations=allocateNeedsForPlanning(),byId=new Map(allocations.map(item=>[item.n.id,item]));
  const monthNames=Array.from({length:12},(_,i)=>new Date(year,i,1).toLocaleDateString(undefined,{month:'short'}));
  box.innerHTML=monthNames.map((name,index)=>{
    const month=`${year}-${String(index+1).padStart(2,'0')}`;
    const list=data.needs.filter(n=>n.month===month&&(!charity||n.charity===charity)&&(!size||n.size===size)).sort((a,b)=>a.charity.localeCompare(b.charity)||a.size.localeCompare(b.size)||String(a.createdAt||a.id).localeCompare(String(b.createdAt||b.id)));
    const rows=list.map(n=>byId.get(n.id)||allocationForNeed(n,allocations));
    const needed=list.reduce((sum,n)=>sum+Number(n.qty||0),0),sent=list.reduce((sum,n)=>sum+fulfilledQty(n),0),remainingTotal=list.reduce((sum,n)=>sum+remainingNeed(n),0),shortage=rows.reduce((sum,item)=>sum+item.shortage,0);
    const allComplete=list.length>0&&remainingTotal===0,pastDue=month<monthNow()&&remainingTotal>0;
    const hasPartial=rows.some(item=>item.available>0&&item.shortage>0),hasCovered=rows.some(item=>item.remaining>0&&item.shortage===0),hasShort=rows.some(item=>item.shortage>0);
    const state=!list.length?'empty-month':allComplete?'completed':pastDue?'past-due':!hasShort?'covered':(hasPartial||hasCovered)?'partial':'shortage';
    const label=!list.length?'No need':allComplete?'Distributed':pastDue?'Past Due':!hasShort?'Covered':(hasPartial||hasCovered)?'Partial':'Shortage';
    const details=list.length?rows.map(item=>{
      const n=item.n,nSent=fulfilledQty(n),nRemaining=remainingNeed(n);
      let summary;
      if(nRemaining===0)summary=`Need ${n.qty} · Sent ${nSent} · Remaining 0${n.fulfilledDate?' · '+fmtDate(n.fulfilledDate):''}`;
      else if(nSent>0||month<monthNow())summary=`Need ${n.qty} · Sent ${nSent} · Remaining ${nRemaining} · Available ${item.available} · Short ${item.shortage}`;
      else summary=`Need ${n.qty} · Available ${item.available} · Short ${item.shortage}`;
      return`<div class="month-need"><button type="button" onclick="editNeed('${n.id}')"><b>${esc(n.charity)}</b><br>${esc(n.size)} · ${summary}</button></div>`;
    }).join(''):'<div class="month-need">No planned need</div>';
    const totals=(allComplete||pastDue||sent>0)?`<div class="month-totals three"><div><b>${needed}</b><span>Needed</span></div><div><b>${sent}</b><span>Sent</span></div><div><b class="${remainingTotal?'negative':'positive'}">${remainingTotal}</b><span>Remaining</span></div></div>`:`<div class="month-totals"><div><b>${needed}</b><span>Needed</span></div><div><b class="${shortage?'negative':''}">${shortage}</b><span>Short</span></div></div>`;
    return`<div class="month-card ${state}"><h4><span>${name}</span><span class="month-status">${label}</span></h4>${totals}${details}</div>`;
  }).join('');
}
function renderNeeds(){
  if(editNeedId&&!data.needs.some(n=>n.id===editNeedId))editNeedId=null;
  renderNeedsCalendar();const allocations=allocateNeedsForPlanning();
  el('needsList').innerHTML=allocations.length?allocations.map(item=>needCard(item.n,true,item)).join(''):'<div class="empty">No planned needs entered yet.</div>';
  const next=allocations.filter(item=>item.n.month>=monthNow()&&item.remaining>0);
  el('homeNeedsList').innerHTML=next.length?next.map(item=>needCard(item.n,false,item)).join(''):'<div class="empty">No upcoming needs entered yet.</div>';
}
function renderHome(){el('homeOnHand').textContent=totalOnHand();el('homeNeeded').textContent=totalNeeded();el('homeShortage').textContent=shortageTotal();updateSaveStatus()}
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
      .map(size=>{const key=charity+'|'+size,onHand=Number(inventory[key]||0),requestedNeeds=Number(requested[key]||0);return{size,onHand,requestedNeeds,difference:onHand-requestedNeeds}})
      .filter(row=>row.onHand!==0||row.requestedNeeds!==0)
      .sort((a,b)=>a.size.localeCompare(b.size));
    if(!sizes.length)sizes.push({size:'',onHand:0,requestedNeeds:0,difference:0,empty:true});
    const totals=sizes.reduce((out,row)=>({onHand:out.onHand+row.onHand,requestedNeeds:out.requestedNeeds+row.requestedNeeds,difference:out.difference+row.difference}),{onHand:0,requestedNeeds:0,difference:0});
    return{charity,sizes,...totals};
  });
}
function signedDifference(n){return n>0?`+${n}`:String(n)}
function differenceClass(n){return n>0?'positive':n<0?'negative':''}
function reportComparisonRows(){
  const rows=[];
  reportComparisonGroups().forEach(group=>{
    group.sizes.forEach(row=>rows.push({type:'detail',charity:group.charity,size:row.empty?'None on hand':row.size,requestedNeeds:row.requestedNeeds,onHand:row.onHand,difference:row.difference,empty:!!row.empty}));
    rows.push({type:'subtotal',charity:`Total for ${group.charity}`,size:'',requestedNeeds:group.requestedNeeds,onHand:group.onHand,difference:group.difference});
  });
  rows.push({type:'grand',charity:'Grand Total',size:'',requestedNeeds:totalNeeded(),onHand:totalOnHand(),difference:totalOnHand()-totalNeeded()});
  return rows;
}
function reportInventoryHTML(){
  const rows=reportComparisonRows();if(!rows.length)return'<div class="empty">No charities available.</div>';
  const body=rows.filter(row=>row.type!=='grand').map(row=>{
    const isTotal=row.type==='subtotal';
    const rowClass=isTotal?' class="subtotal-row"':'';
    const charityCell=isTotal?esc(row.charity):esc(row.charity);
    const sizeCell=isTotal?'':(row.empty?'<span class="small">None on hand</span>':esc(row.size));
    const onHandCell=isTotal?`<b class="on-hand-value">${row.onHand}</b>`:String(row.onHand);
    const requestedCell=isTotal?`<b>${row.requestedNeeds}</b>`:String(row.requestedNeeds);
    const differenceCell=isTotal
      ?`<b><span class="difference-value ${differenceClass(row.difference)}">${signedDifference(row.difference)}</span></b>`
      :`<span class="difference-value ${differenceClass(row.difference)}">${signedDifference(row.difference)}</span>`;
    return`<tr${rowClass}><td>${charityCell}</td><td>${sizeCell}</td><td>${onHandCell}</td><td>${requestedCell}</td><td>${differenceCell}</td></tr>`;
  }).join('');
  const grand=rows.find(row=>row.type==='grand');
  return`<table class="report-summary-table"><colgroup><col class="col-charity"><col class="col-size"><col class="col-onhand"><col class="col-requested"><col class="col-difference"></colgroup><thead><tr><th>Charity</th><th>Size</th><th>On Hand</th><th>Requested Needs</th><th>Difference</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td>Grand Total</td><td></td><td><b class="on-hand-value">${grand.onHand}</b></td><td><b>${grand.requestedNeeds}</b></td><td><b><span class="difference-value ${differenceClass(grand.difference)}">${signedDifference(grand.difference)}</span></b></td></tr></tfoot></table>`;
}
function reportNeedsHTML(){
  const list=allocateNeedsForPlanning().filter(item=>item.n.month>=monthNow()&&item.remaining>0);
  return list.length?`<table><thead><tr><th>Month</th><th>Charity / Size</th><th>Need</th><th>Sent / Remaining</th><th>Available / Short</th></tr></thead><tbody>${list.map(item=>{const n=item.n;return`<tr><td>${fmtMonth(n.month)}</td><td>${esc(n.charity)}<br><span class="small">${esc(n.size)}</span></td><td>${n.qty}</td><td>${item.fulfilled} sent<br><span class="small">${item.remaining} remaining</span></td><td>${item.available} available<br><span class="small ${item.shortage?'negative':''}">${item.shortage} short</span></td></tr>`}).join('')}</tbody></table>`:'<div class="empty">No upcoming needs.</div>';
}
function distributedNeedsForReport(){
  return data.needs.filter(n=>fulfilledQty(n)>0).sort((a,b)=>String(b.fulfilledDate||'').localeCompare(String(a.fulfilledDate||''))||String(b.month||'').localeCompare(String(a.month||''))||a.charity.localeCompare(b.charity)||a.size.localeCompare(b.size));
}
function distributionReportStatus(n){return remainingNeed(n)===0?'Distributed':'Partially Sent'}
function reportDistributedHTML(){
  const list=distributedNeedsForReport();
  return list.length?`<table><thead><tr><th>Date Sent</th><th>Month Needed</th><th>Charity / Size</th><th>Need</th><th>Sent / Remaining</th><th>Status</th></tr></thead><tbody>${list.map(n=>`<tr><td>${n.fulfilledDate?fmtDate(n.fulfilledDate):'<span class="small">Not entered</span>'}</td><td>${fmtMonth(n.month)}</td><td>${esc(n.charity)}<br><span class="small">${esc(n.size)}</span></td><td>${n.qty}</td><td>${fulfilledQty(n)} sent<br><span class="small">${remainingNeed(n)} remaining</span></td><td><b>${distributionReportStatus(n)}</b></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No distributed needs recorded yet.</div>';
}
function compactDistributedHTML(limit=6){
  const all=distributedNeedsForReport(),list=all.slice(0,limit);
  if(!list.length)return'<div class="print-note">No distributed needs recorded.</div>';
  return`<table><thead><tr><th>Date</th><th>Charity / Size</th><th>Sent</th></tr></thead><tbody>${list.map(n=>`<tr><td>${n.fulfilledDate?fmtDate(n.fulfilledDate):'—'}</td><td>${esc(n.charity)}<br>${esc(n.size)}</td><td>${fulfilledQty(n)}${remainingNeed(n)?`<br><span class="small">${remainingNeed(n)} left</span>`:''}</td></tr>`).join('')}</tbody></table>${all.length>list.length?`<div class="print-note">Showing ${list.length} of ${all.length} distribution records.</div>`:''}`;
}
function compactAdjustmentsHTML(){const list=data.transactions.filter(t=>t.type==='ADJUST').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);if(!list.length)return'<div class="print-note">No adjusted transactions.</div>';return`<table><thead><tr><th>Date</th><th>Charity / Size</th><th>Change</th></tr></thead><tbody>${list.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${esc(t.charity)}<br>${esc(t.size)}</td><td>${value(t)>0?'+':''}${value(t)}</td></tr>`).join('')}</tbody></table>${data.transactions.filter(t=>t.type==='ADJUST').length>list.length?`<div class="print-note">Showing the ${list.length} most recent adjustments.</div>`:''}`}
function renderMeetingReport(){
  const generated=new Date().toLocaleString();
  el('meetingReport').innerHTML=`<h1>${esc(data.appName)}</h1><div class="print-meta">${esc(data.orgName)} · ${esc(effectiveReportTitle())} · Generated ${esc(generated)}</div><div class="print-metrics"><div class="print-metric"><b>${totalOnHand()}</b>Total On Hand</div><div class="print-metric"><b>${totalNeeded()}</b>Upcoming Needs</div><div class="print-metric"><b>${shortageTotal()}</b>Shortage</div></div><h2>Inventory and Requested Needs</h2>${reportInventoryHTML()}<div class="print-columns"><div><h2>Upcoming Needs</h2>${reportNeedsHTML()}</div><div><h2>Distributed Needs</h2>${compactDistributedHTML()}<h2>Recent Adjustments</h2>${compactAdjustmentsHTML()}</div></div><div class="print-copyright">${esc(COPYRIGHT_TEXT)} Personal and authorized guild use only.</div>`;
}
function renderReports(){
  el('reportHeading').textContent=effectiveReportTitle();el('reportDate').textContent=`${data.orgName} · Generated ${new Date().toLocaleString()}`;el('reportOnHand').textContent=totalOnHand();el('reportNeeded').textContent=totalNeeded();el('reportShortage').textContent=shortageTotal();
  el('reportInventory').innerHTML=reportInventoryHTML();el('reportNeeds').innerHTML=reportNeedsHTML();el('reportDistributed').innerHTML=reportDistributedHTML();
  const a=data.transactions.filter(t=>t.type==='ADJUST').sort((x,y)=>y.date.localeCompare(x.date));
  el('reportAdjustments').innerHTML=a.length?a.map(x=>`<div class="item"><div class="head"><div><div class="title">${value(x)>0?'+':''}${value(x)} ${esc(x.size)}</div><div class="meta">${esc(x.charity)} · ${fmtDate(x.date)}${x.note?' · '+esc(x.note):''}</div></div><span class="flag">Adjusted</span></div></div>`).join(''):'<div class="empty">No adjusted transactions.</div>';
  renderMeetingReport();
}
function addCharity(){const n=el('newCharity').value.trim();if(!n)return;if(data.charities.some(x=>x.toLocaleLowerCase()===n.toLocaleLowerCase()))return alert('That charity is already in the list.');data.charities.push(n);el('newCharity').value='';save('Charity added');renderAll()}
function removeCharity(){
  const n=el('deleteCharity').value;if(!n)return;if(data.transactions.some(t=>t.charity===n)||data.needs.some(x=>x.charity===n))return alert('This charity is being used in inventory or needs. Remove those entries first.');
  if(confirm(`Delete the charity “${n}”?\n\nThis removes it from the choices. A recovery copy will be kept.`)){createRecoverySnapshot('Before deleting a charity');data.charities=data.charities.filter(x=>x!==n);save('Charity deleted');renderAll()}
}
function addSize(){const n=el('newSize').value.trim();if(!n)return;if(data.sizes.some(x=>x.toLocaleLowerCase()===n.toLocaleLowerCase()))return alert('That size is already in the list.');data.sizes.push(n);el('newSize').value='';save('Quilt size added');renderAll()}
function removeSize(){
  const n=el('deleteSize').value;if(!n)return;if(data.transactions.some(t=>t.size===n)||data.needs.some(x=>x.size===n))return alert('This size is being used in inventory or needs. Remove those entries first.');
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
    const answer=prompt(`RESTORE SHARED BACKUP\n\nFile: ${f.name}\nTransactions: ${imported.transactions.length}\nPlanned needs: ${imported.needs.length}\nDate range: ${range}\n\nThis will replace the shared information on every synced device. The current data has already been saved as a recovery copy on this device.\n\nType RESTORE SHARED DATA to continue:`);
    if(answer==='RESTORE SHARED DATA'){
      data=imported;save(`Shared backup restored: ${f.name}`);renderAll();notice('settingsNotice','Shared backup restored and queued to sync.',true)
    }else notice('settingsNotice','Restore canceled. Current shared data was not changed.');
    e.target.value='';};r.readAsText(f);
}
function exportCSV(){const rows=[['Date','Type','Charity','Size','Quantity Change','Note','Entered By','Entered At','Last Edited By','Last Edited At']];data.transactions.forEach(t=>rows.push([t.date,t.type,t.charity,t.size,value(t),t.note||'',t.createdBy||'',t.createdAt||'',t.updatedBy||'',t.updatedAt||'']));const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');download(`${filePart(data.itemName)}_Transactions_${today()}.csv`,csv,'text/csv')}

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
  if(!data.transactions.length)return notice('dangerNotice','Inventory counts are already empty.');
  if(confirm(`Clear all inventory counts and transaction history?\n\nThis deletes ${data.transactions.length} transaction record(s). Planned needs, names, charities, and sizes will be kept.\n\nA recovery copy will be created first.`)){
    createRecoverySnapshot('Before clearing inventory counts');data.transactions=[];save('Inventory counts cleared');renderAll();notice('dangerNotice','Inventory counts cleared. Planned needs and settings were kept.',true)
  }
}
function startFreshForRealUse(){
  const answer=prompt(`START FRESH FOR REAL USE\n\nThis deletes all ${data.transactions.length} inventory transaction(s) and ${data.needs.length} planned need(s). Names, charities, and sizes will be kept.\n\nA recovery copy will be created first.\n\nType START FRESH to continue:`);
  if(answer!=='START FRESH')return notice('dangerNotice','Start Fresh canceled. Nothing was deleted.');
  createRecoverySnapshot('Before starting fresh for real use');data.transactions=[];data.needs=[];save('Started fresh for real use');renderAll();notice('dangerNotice','All test numbers were cleared. Names and lists were kept.',true);
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
  if(el('homeSaveStatus')){el('homeSaveStatus').textContent=firebaseState.verified?firebase:`${local} · Sync: ${firebase}`;el('homeSaveStatus').classList.toggle('verified',!!firebaseState.verified)}
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
  const diffColor=n=>n>0?'0.18 0.49 0.29':n<0?'0.71 0.23 0.28':'';

  text(36,754,pdfFit(data.appName,62),17,true);
  text(36,738,pdfFit(`${data.orgName} - ${effectiveReportTitle()}`,92),9,false);
  text(36,726,`Generated ${new Date().toLocaleString()}`,7,false);

  const metricY=684,metricH=32,metricW=166;
  [[36,'Total On Hand',totalOnHand()],[223,'Upcoming Needs',totalNeeded()],[410,'Shortage',shortageTotal()]].forEach(([x,label,num])=>{
    rect(x,metricY,metricW,metricH);text(x+8,metricY+18,String(num),14,true);text(x+42,metricY+19,label,8,true);
  });

  text(36,665,'INVENTORY AND REQUESTED NEEDS',10,true);line(36,659,576,659,.7);
  const xCharity=36,xSize=180,xOnHand=365,xRequested=455,xDifference=525;
  let y=645;
  text(xCharity,y,'CHARITY',7,true);text(xSize,y,'SIZE',7,true);text(xOnHand,y,'ON HAND',7,true);text(xRequested,y,'REQUESTED NEEDS',7,true);text(xDifference-10,y,'DIFFERENCE',7,true);line(36,y-5,576,y-5,.5);y-=16;
  const allRows=reportComparisonRows(),maxSummaryRows=20,shownRows=allRows.slice(0,maxSummaryRows);
  shownRows.forEach(row=>{
    const bold=row.type!=='detail';
    if(row.type!=='detail')line(36,y+8,576,y+8,.35);
    text(xCharity,y,pdfFit(row.charity,row.type==='detail'?25:34),7.2,bold);
    if(row.type==='detail')text(xSize,y,pdfFit(row.size,28),7.2,false);
    text(xOnHand,y,String(row.onHand),7.2,true);
    text(xRequested,y,String(row.requestedNeeds),7.2,bold);
    text(xDifference,y,signedDifference(row.difference),7.2,row.type!=='detail',diffColor(row.difference));
    y-=12;
  });
  if(allRows.length>shownRows.length){text(36,y,`+ ${allRows.length-shownRows.length} summary rows not shown`,7,true);y-=12}
  line(36,y+5,576,y+5,.7);

  const lowerTop=y-14;
  text(36,lowerTop,'UPCOMING NEEDS',9,true);line(36,lowerTop-5,294,lowerTop-5,.6);
  text(318,lowerTop,'RECENT ACTIVITY',9,true);line(318,lowerTop-5,576,lowerTop-5,.6);

  const needsRows=[];
  const needs=allocateNeedsForPlanning().filter(item=>item.n.month>=monthNow()&&item.remaining>0);
  if(!needs.length)needsRows.push({text:'No upcoming needs.',bold:false});
  needs.forEach(item=>{
    const n=item.n;
    needsRows.push({text:`${fmtMonthShort(n.month)} - ${n.charity}`,bold:true});
    needsRows.push({text:`  ${n.size} | Need ${n.qty} | Remaining ${item.remaining}`,bold:false});
    needsRows.push({text:`  Available ${item.available} | Short ${item.shortage}`,bold:false});
  });

  const activityRows=[];
  const distributed=distributedNeedsForReport();
  activityRows.push({text:`DISTRIBUTED NEEDS: ${distributed.length}`,bold:true});
  distributed.slice(0,6).forEach(n=>{
    activityRows.push({text:`${n.fulfilledDate?fmtDate(n.fulfilledDate):'Date not entered'} - ${n.charity}`,bold:true});
    activityRows.push({text:`  ${n.size} | Sent ${fulfilledQty(n)} | Remaining ${remainingNeed(n)}`,bold:false});
  });
  if(distributed.length>6)activityRows.push({text:`  + ${distributed.length-6} earlier distribution records`,bold:false});
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
    text(36,726,`Generated ${generated}`,7,false);
    line(36,716,576,716,.7);
    return page;
  };
  const text=(x,y,value,size=8,bold=false,color='')=>{if(color)page.commands.push(`${color} rg`);page.commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`);if(color)page.commands.push('0 0 0 rg')};
  const line=(x1,y1,x2,y2,w=.5)=>page.commands.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const rect=(x,y,w,h)=>page.commands.push(`0.6 w ${x} ${y} ${w} ${h} re S`);
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
  [[36,'Total On Hand',totalOnHand()],[223,'Upcoming Needs',totalNeeded()],[410,'Shortage',shortageTotal()]].forEach(([x,label,num])=>{
    rect(x,metricY,metricW,metricH);text(x+9,metricY+20,String(num),15,true);text(x+49,metricY+21,label,8,true);
  });
  page.y=632;

  beginSection('INVENTORY AND REQUESTED NEEDS');
  const comparisonRows=reportComparisonRows(),diffColor=n=>n>0?'0.18 0.49 0.29':n<0?'0.71 0.23 0.28':'';
  const drawComparisonHeader=()=>{
    text(36,page.y,'CHARITY',7,true);text(185,page.y,'SIZE',7,true);text(365,page.y,'ON HAND',7,true);text(455,page.y,'REQUESTED NEEDS',7,true);text(515,page.y,'DIFFERENCE',7,true);
    line(36,page.y-5,576,page.y-5,.5);page.y-=17;
  };
  drawComparisonHeader();
  comparisonRows.forEach(row=>{
    if(page.y-15<48){newPage();sectionHeader(currentSection,true);drawComparisonHeader()}
    const bold=row.type!=='detail';
    if(row.type!=='detail')line(36,page.y+8,576,page.y+8,.35);
    text(36,page.y,pdfFit(row.charity,row.type==='detail'?25:34),7.6,bold);
    if(row.type==='detail')text(185,page.y,pdfFit(row.size,29),7.6,false);
    text(365,page.y,String(row.onHand),7.6,true);
    text(455,page.y,String(row.requestedNeeds),7.6,bold);
    text(525,page.y,signedDifference(row.difference),7.6,row.type!=='detail',diffColor(row.difference));
    page.y-=14;
  });
  page.y-=8;

  beginSection('UPCOMING NEEDS');
  const needs=allocateNeedsForPlanning().filter(item=>item.n.month>=monthNow()&&item.remaining>0);
  if(!needs.length)addParagraph('No upcoming needs.');
  needs.forEach(item=>{
    const n=item.n;
    addParagraph(`${fmtMonth(n.month)} - ${n.charity}`,{size:9,bold:true,after:2});
    addParagraph(`${n.size} | Need: ${n.qty} | Sent: ${item.fulfilled} | Remaining: ${item.remaining} | Available: ${item.available} | Shortage: ${item.shortage}`,{indent:16,after:n.note?1:6});
    if(n.note)addParagraph(`Note: ${n.note}`,{indent:16,size:7.5,after:6});
  });

  beginSection('DISTRIBUTED NEEDS');
  const distributed=distributedNeedsForReport();
  if(!distributed.length)addParagraph('No distributed needs recorded.');
  distributed.forEach(n=>{
    addParagraph(`${n.fulfilledDate?fmtDate(n.fulfilledDate):'Date not entered'} - ${n.charity}`,{size:9,bold:true,after:2});
    addParagraph(`${n.size} | Month Needed: ${fmtMonth(n.month)} | Need: ${n.qty} | Sent: ${fulfilledQty(n)} | Remaining: ${remainingNeed(n)} | Status: ${distributionReportStatus(n)}`,{indent:16,after:n.note?1:6});
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
function exportCompactPDF(){renderReports();const bytes=makeOnePagePDF();downloadBlob(`${filePart(data.itemName)}_Compact_Report_${today()}.pdf`,new Blob([bytes],{type:'application/pdf'}))}
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
function clearPrintMode(){document.body.classList.remove('print-full','print-compact')}
function printFullReport(){renderReports();clearPrintMode();document.body.classList.add('print-full');void document.body.offsetHeight;window.print()}
function printMeetingReport(){renderReports();clearPrintMode();document.body.classList.add('print-compact');void document.body.offsetHeight;window.print()}
function exportMeetingPDF(){exportCompactPDF()}
window.addEventListener('afterprint',clearPrintMode);
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
  localStorage.setItem(KEY,JSON.stringify(data));if(!status.lastSavedAt){status.lastSavedAt=new Date().toISOString();persistStatus()}createRecoverySnapshot('Update 7.7.9 opened',data);
  loadExternalFields();renderAll();setMode('IN');
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=7.7.9',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}));
});
