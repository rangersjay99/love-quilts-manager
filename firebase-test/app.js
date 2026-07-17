'use strict';

// Copyright © 2026 Jay. All rights reserved.
// Personal and authorized guild use only. See LICENSE.txt.

const VERSION='7.6.0 Firebase Test';
const KEY='love_quilts_firebase_test_v1';
const RECOVERY_KEY='love_quilts_firebase_test_v1_recovery';
const CLOUD_KEY='love_quilts_firebase_test_cloud_v1';
const STATUS_KEY='love_quilts_firebase_test_status_v1';
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
let mode='IN',qty=1,editTxId=null,editNeedId=null,externalTimer=null,externalReason='Automatic save';

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

function normalizeData(d={}){
  let tx=Array.isArray(d.transactions)?d.transactions.map(t=>({
    id:t.id||uid(),date:t.date||today(),type:['IN','OUT','ADJUST'].includes(t.type)?t.type:'IN',
    charity:String(t.charity||'Unknown'),size:String(t.size||'Other'),qty:Math.max(1,Number(t.qty||t.quantity||1)),
    adjustment:Number(t.adjustment||0),note:String(t.note||'')
  })):[];
  if(d.inv&&!tx.length){
    Object.entries(d.inv).forEach(([k,v])=>{
      const parts=k.includes(' | ')?k.split(' | '):k.split('|'),c=parts[0],s=parts[1],n=Number(v)||0;
      if(n)tx.push({id:uid(),date:today(),type:'ADJUST',charity:c||'Unknown',size:s||'Other',qty:Math.abs(n),adjustment:n,note:'Imported from original app'});
    });
  }
  const needs=Array.isArray(d.needs)?d.needs.map(n=>({
    id:n.id||uid(),month:n.month||monthNow(),charity:String(n.charity||DEFAULT_CHARITIES[0]),
    size:String(n.size||DEFAULT_SIZES[0]),qty:Math.max(1,Number(n.qty||1)),note:String(n.note||'')
  })):[];
  return{
    orgName:String(d.orgName||DEFAULT_ORG),appName:String(d.appName||DEFAULT_APP),itemName:String(d.itemName||DEFAULT_ITEM),
    splashTag:String(d.splashTag||''),splashMessage:String(d.splashMessage||''),
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
function createRecoverySnapshot(reason,source=data){
  try{
    const snap={id:uid(),createdAt:new Date().toISOString(),reason:String(reason||'Automatic recovery copy'),data:clone(source)};
    const list=getRecovery();
    if(list[0]&&JSON.stringify(list[0].data)===JSON.stringify(snap.data))return;
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
  el('splashTagInput').value=data.splashTag;el('splashTagInput').placeholder=DEFAULT_SPLASH_TAG;
  el('splashMessageInput').value=data.splashMessage;el('splashMessageInput').placeholder=automaticSplashMessage;
  el('aboutAppName').textContent=data.appName;el('aboutItemName').textContent=data.itemName;el('aboutOrgName').textContent=data.orgName;
  el('homeRecordBtn').textContent=`Record ${data.itemName}`;el('recordHeading').textContent=`Record ${data.itemName}`;
  el('modeIn').textContent=`${data.itemName} In`;el('modeOut').textContent=`${data.itemName} Out`;
  el('historyInOption').textContent=`${data.itemName} In`;el('historyOutOption').textContent=`${data.itemName} Out`;
  el('inventoryNote').textContent=`Choose ${data.itemName} Out only when items physically leave storage. Use Adjust for corrections; adjustments are visibly flagged.`;
  el('needsNote').textContent=`Enter the number of ${lowerName()} needed by month. Current stock and shortage are calculated automatically.`;
  el('reportHeading').textContent=`${data.itemName} Inventory and Needs Report`;
  document.title=`${data.orgName} — ${data.appName}`;
  const appleTitle=document.querySelector('meta[name="apple-mobile-web-app-title"]');if(appleTitle)appleTitle.setAttribute('content',data.appName);
  setMode(mode);
}
function saveNames(){
  data.orgName=el('orgNameInput').value.trim()||DEFAULT_ORG;data.appName=el('appNameInput').value.trim()||DEFAULT_APP;data.itemName=el('itemNameInput').value.trim()||DEFAULT_ITEM;
  data.splashTag=el('splashTagInput').value.trim();data.splashMessage=el('splashMessageInput').value.trim();
  save('Names and splash wording changed');applyNames();renderAll();notice('nameNotice','Names and splash wording saved.',true);
}
function closeSplash(){el('splash').classList.add('hidden');document.body.style.overflow=''}
function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  if(id==='reports')renderReports();if(id==='settings'){renderRecoveryList();updateSaveStatus();loadExternalFields()}
  window.scrollTo({top:0,behavior:'smooth'});
}
function fill(id,vals,first=''){const e=el(id);if(!e)return;const old=e.value;e.innerHTML=first+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if(vals.includes(old))e.value=old}
function refreshSelects(){
  data.charities=unique(data.charities).sort((a,b)=>a.localeCompare(b));data.sizes=unique(data.sizes).sort((a,b)=>a.localeCompare(b));
  ['txCharity','needCharity','deleteCharity'].forEach(id=>fill(id,data.charities));['txSize','needSize','deleteSize'].forEach(id=>fill(id,data.sizes));
  fill('historyCharity',data.charities,'<option value="">All charities</option>');
}
function setMode(m){
  mode=m;el('modeIn').className=m==='IN'?'active-in':'';el('modeOut').className=m==='OUT'?'active-out':'';el('modeAdjust').className=m==='ADJUST'?'active-adjust':'';
  el('dateLabel').textContent=m==='IN'?'Date In':m==='OUT'?'Date Out':'Adjustment Date';
  el('saveTxBtn').textContent=editTxId?'Save Changes':m==='IN'?'Add to Inventory':m==='OUT'?'Remove from Inventory':'Save Adjustment';
}
function changeQty(d){qty=Math.max(1,qty+d);el('qtyDisplay').textContent=qty}
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
  const r={id:editTxId||uid(),date:d,type:mode,charity:c,size:s,qty,adjustment:adj,note:noteText};
  const editing=!!editTxId;
  if(editTxId){const i=data.transactions.findIndex(t=>t.id===editTxId);if(i>=0)data.transactions[i]=r}else data.transactions.push(r);
  save(editing?'Inventory transaction edited':'Inventory transaction added');cancelTxEdit();renderAll();notice('txNotice','Saved successfully.',true);
}
function editTx(id){
  const t=data.transactions.find(x=>x.id===id);if(!t)return;editTxId=id;mode=t.type;qty=Math.abs(value(t))||1;refreshSelects();
  el('txCharity').value=t.charity;el('txSize').value=t.size;el('txDate').value=t.date;el('txNote').value=t.note||'';el('qtyDisplay').textContent=qty;
  el('cancelTxBtn').style.display='block';setMode(mode);showView('inventory');
}
function cancelTxEdit(){editTxId=null;qty=1;el('qtyDisplay').textContent=1;el('txNote').value='';el('txDate').value=today();el('cancelTxBtn').style.display='none';setMode(mode)}
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
  el('historyList').innerHTML=list.length?list.map(x=>{const n=value(x);return`<div class="item"><div class="head"><div><div class="title ${n<0?'negative':'positive'}">${n>0?'+':''}${n} ${esc(x.size)}</div><div class="meta">${esc(x.charity)} · ${fmtDate(x.date)}</div>${x.note?`<div class="meta">${esc(x.note)}</div>`:''}${x.type==='ADJUST'?'<div class="meta"><span class="flag">Adjusted inventory</span></div>':''}</div><b>${x.type==='ADJUST'?'ADJUSTED':x.type}</b></div><div class="actions"><button onclick="editTx('${x.id}')">Edit</button><button onclick="deleteTx('${x.id}')">Delete</button></div></div>`}).join(''):'<div class="empty">No matching history.</div>';
}
function saveNeed(){
  const r={id:editNeedId||uid(),month:el('needMonth').value||monthNow(),charity:el('needCharity').value,size:el('needSize').value,qty:Math.max(1,Number(el('needQty').value||1)),note:el('needNote').value.trim()};
  if(!r.charity||!r.size)return notice('needNotice','Please select a charity and size.');const editing=!!editNeedId;
  if(editNeedId){const i=data.needs.findIndex(n=>n.id===editNeedId);if(i>=0)data.needs[i]=r}else data.needs.push(r);
  save(editing?'Planned need edited':'Planned need added');cancelNeedEdit();renderAll();notice('needNotice','Need saved.',true);
}
function editNeed(id){const n=data.needs.find(x=>x.id===id);if(!n)return;editNeedId=id;refreshSelects();el('needMonth').value=n.month;el('needCharity').value=n.charity;el('needSize').value=n.size;el('needQty').value=n.qty;el('needNote').value=n.note||'';el('saveNeedBtn').textContent='Save Changes';el('cancelNeedBtn').style.display='block';showView('needs')}
function cancelNeedEdit(){editNeedId=null;el('needMonth').value=monthNow();el('needQty').value=1;el('needNote').value='';el('saveNeedBtn').textContent='Add Need';el('cancelNeedBtn').style.display='none'}
function deleteNeed(id){
  const n=data.needs.find(x=>x.id===id);if(!n)return;
  if(confirm(`Delete this planned need?\n\n${fmtMonth(n.month)} — ${n.charity} — ${n.size} — Need ${n.qty}\n\nA recovery copy will be kept.`)){
    createRecoverySnapshot('Before deleting a planned need');data.needs=data.needs.filter(x=>x.id!==id);save('Planned need deleted');renderAll();
  }
}
function upcoming(){return data.needs.filter(n=>n.month>=monthNow())}
function totalNeeded(){return upcoming().reduce((a,n)=>a+n.qty,0)}
function shortageTotal(){return upcoming().reduce((a,n)=>a+Math.max(0,n.qty-onHand(n.charity,n.size)),0)}
function needCard(n,actions=true){const stock=onHand(n.charity,n.size),short=Math.max(0,n.qty-stock);return`<div class="item"><div class="head"><div><div class="title">${fmtMonth(n.month)} — ${esc(n.charity)}</div><div class="meta">${esc(n.size)}${n.note?' · '+esc(n.note):''}</div></div><div class="badge">${n.qty}</div></div><div class="planner"><div><b>${n.qty}</b><span>Need</span></div><div><b>${stock}</b><span>On Hand</span></div><div><b class="${short?'negative':'positive'}">${short}</b><span>Shortage</span></div></div>${actions?`<div class="actions"><button onclick="editNeed('${n.id}')">Edit</button><button onclick="deleteNeed('${n.id}')">Delete</button></div>`:''}</div>`}
function renderNeeds(){const list=[...data.needs].sort((a,b)=>a.month.localeCompare(b.month)||a.charity.localeCompare(b.charity));el('needsList').innerHTML=list.length?list.map(n=>needCard(n)).join(''):'<div class="empty">No planned needs entered yet.</div>';const next=upcoming().sort((a,b)=>a.month.localeCompare(b.month)).slice(0,5);el('homeNeedsList').innerHTML=next.length?next.map(n=>needCard(n,false)).join(''):'<div class="empty">No upcoming needs entered yet.</div>'}
function renderHome(){el('homeOnHand').textContent=totalOnHand();el('homeNeeded').textContent=totalNeeded();el('homeShortage').textContent=shortageTotal();updateSaveStatus()}
function inventoryGroups(){const inventory=invMap();return[...data.charities].sort((a,b)=>a.localeCompare(b)).map(c=>{const sizes=data.sizes.map(s=>({s,n:inventory[c+'|'+s]||0})).filter(x=>x.n!==0).sort((a,b)=>a.s.localeCompare(b.s));return{charity:c,sizes,total:sizes.reduce((sum,x)=>sum+x.n,0)}})}
function reportInventoryHTML(){
  const charities=inventoryGroups();if(!charities.length)return'<div class="empty">No charities available.</div>';
  const body=charities.map(g=>{const detail=g.sizes.length?g.sizes.map(x=>`<tr><td>${esc(g.charity)}</td><td>${esc(x.s)}</td><td>${x.n}</td></tr>`).join(''):`<tr><td>${esc(g.charity)}</td><td><span class="small">None on hand</span></td><td>0</td></tr>`;return`${detail}<tr class="subtotal-row"><td colspan="2">Total for ${esc(g.charity)}</td><td>${g.total}</td></tr>`}).join('');
  return`<table><thead><tr><th>Charity</th><th>Size</th><th>On Hand</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="2">Grand Total</td><td>${totalOnHand()}</td></tr></tfoot></table>`;
}
function reportNeedsHTML(){const list=upcoming().sort((a,b)=>a.month.localeCompare(b.month)||a.charity.localeCompare(b.charity));return list.length?`<table><thead><tr><th>Month</th><th>Charity / Size</th><th>Need</th><th>On Hand</th><th>Shortage</th></tr></thead><tbody>${list.map(n=>{const stock=onHand(n.charity,n.size),short=Math.max(0,n.qty-stock);return`<tr><td>${fmtMonth(n.month)}</td><td>${esc(n.charity)}<br><span class="small">${esc(n.size)}</span></td><td>${n.qty}</td><td>${stock}</td><td class="${short?'negative':''}">${short}</td></tr>`}).join('')}</tbody></table>`:'<div class="empty">No upcoming needs.</div>'}
function compactAdjustmentsHTML(){const list=data.transactions.filter(t=>t.type==='ADJUST').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);if(!list.length)return'<div class="print-note">No adjusted transactions.</div>';return`<table><thead><tr><th>Date</th><th>Charity / Size</th><th>Change</th></tr></thead><tbody>${list.map(t=>`<tr><td>${fmtDate(t.date)}</td><td>${esc(t.charity)}<br>${esc(t.size)}</td><td>${value(t)>0?'+':''}${value(t)}</td></tr>`).join('')}</tbody></table>${data.transactions.filter(t=>t.type==='ADJUST').length>list.length?`<div class="print-note">Showing the ${list.length} most recent adjustments.</div>`:''}`}
function renderMeetingReport(){const generated=new Date().toLocaleString();el('meetingReport').innerHTML=`<h1>${esc(data.appName)}</h1><div class="print-meta">${esc(data.orgName)} · ${esc(data.itemName)} Inventory and Needs Report · Generated ${esc(generated)}</div><div class="print-metrics"><div class="print-metric"><b>${totalOnHand()}</b>Total On Hand</div><div class="print-metric"><b>${totalNeeded()}</b>Upcoming Needs</div><div class="print-metric"><b>${shortageTotal()}</b>Shortage</div></div><div class="print-columns"><div><h2>Inventory On Hand</h2>${reportInventoryHTML()}</div><div><h2>Upcoming Needs</h2>${reportNeedsHTML()}<h2>Recent Adjustments</h2>${compactAdjustmentsHTML()}</div></div><div class="print-copyright">${esc(COPYRIGHT_TEXT)} Personal and authorized guild use only.</div>`}
function renderReports(){
  el('reportDate').textContent=`${data.orgName} · Generated ${new Date().toLocaleString()}`;el('reportOnHand').textContent=totalOnHand();el('reportNeeded').textContent=totalNeeded();el('reportShortage').textContent=shortageTotal();
  el('reportInventory').innerHTML=reportInventoryHTML();el('reportNeeds').innerHTML=reportNeedsHTML();
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
    if(confirm(`Replace the current app data with “${f.name}”?\n\nA recovery copy of the current data will be kept first.`)){
      createRecoverySnapshot('Before importing a backup');data=normalizeData(d);save('Backup imported');renderAll();notice('settingsNotice','Backup imported.',true)
    }e.target.value='';};r.readAsText(f);
}
function exportCSV(){const rows=[['Date','Type','Charity','Size','Quantity Change','Note']];data.transactions.forEach(t=>rows.push([t.date,t.type,t.charity,t.size,value(t),t.note||'']));const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');download(`${filePart(data.itemName)}_Transactions_${today()}.csv`,csv,'text/csv')}

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
  const firebase=window.lqFirebaseState?.message||'Sign in to start Firebase test sync';
  if(el('localSaveStatus'))el('localSaveStatus').textContent=local;
  if(el('externalSaveStatus'))el('externalSaveStatus').textContent=external;
  if(el('firebaseSaveStatus'))el('firebaseSaveStatus').textContent=firebase;
  if(el('homeSaveStatus'))el('homeSaveStatus').textContent=`${local} · Firebase: ${firebase}`;
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
  const text=(x,y,value,size=8,bold=false)=>commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`);
  const line=(x1,y1,x2,y2,w=.5)=>commands.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const rect=(x,y,w,h)=>commands.push(`0.6 w ${x} ${y} ${w} ${h} re S`);

  text(36,754,pdfFit(data.appName,62),17,true);
  text(36,738,pdfFit(`${data.orgName} - ${data.itemName} Inventory and Needs Report`,92),9,false);
  text(36,726,`Generated ${new Date().toLocaleString()}`,7,false);

  const metricY=684,metricH=32,metricW=166;
  [[36,'Total On Hand',totalOnHand()],[223,'Upcoming Needs',totalNeeded()],[410,'Shortage',shortageTotal()]].forEach(([x,label,num])=>{
    rect(x,metricY,metricW,metricH);text(x+8,metricY+18,String(num),14,true);text(x+42,metricY+19,label,8,true);
  });

  text(36,665,'INVENTORY ON HAND',10,true);line(36,659,294,659,0.7);
  text(318,665,'UPCOMING NEEDS',10,true);line(318,659,576,659,0.7);

  const inventoryRows=[];
  inventoryGroups().forEach(g=>{
    inventoryRows.push({text:g.charity,bold:true});
    if(g.sizes.length)g.sizes.forEach(x=>inventoryRows.push({text:`  ${x.s}: ${x.n}`,bold:false}));
    else inventoryRows.push({text:'  None on hand',bold:false});
    inventoryRows.push({text:`  Total: ${g.total}`,bold:true});
  });
  inventoryRows.push({text:`GRAND TOTAL: ${totalOnHand()}`,bold:true});

  const needsRows=[];
  const needs=upcoming().sort((a,b)=>a.month.localeCompare(b.month)||a.charity.localeCompare(b.charity));
  if(!needs.length)needsRows.push({text:'No upcoming needs.',bold:false});
  needs.forEach(n=>{
    const stock=onHand(n.charity,n.size),short=Math.max(0,n.qty-stock);
    needsRows.push({text:`${fmtMonthShort(n.month)} - ${n.charity}`,bold:true});
    needsRows.push({text:`  ${n.size} | Need ${n.qty} | Hand ${stock} | Short ${short}`,bold:false});
  });
  const adjustments=data.transactions.filter(t=>t.type==='ADJUST').sort((a,b)=>b.date.localeCompare(a.date));
  needsRows.push({text:'',bold:false});
  needsRows.push({text:`ADJUSTMENTS ON RECORD: ${adjustments.length}`,bold:true});
  adjustments.slice(0,8).forEach(t=>needsRows.push({text:`${fmtDate(t.date)} - ${t.charity} / ${t.size}: ${value(t)>0?'+':''}${value(t)}`,bold:false}));
  if(adjustments.length>8)needsRows.push({text:`  + ${adjustments.length-8} earlier adjustments`,bold:false});

  const drawRows=(rows,x,maxChars)=>{
    const maxRows=58,startY=647,rowH=10;
    rows.slice(0,maxRows).forEach((r,i)=>text(x,startY-i*rowH,pdfFit(r.text,maxChars),7.4,!!r.bold));
    if(rows.length>maxRows)text(x,startY-(maxRows-1)*rowH,pdfFit(`+ ${rows.length-maxRows+1} more rows not shown`,maxChars),7.4,true);
  };
  drawRows(inventoryRows,36,48);
  drawRows(needsRows,318,48);
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
    const text=(x,y,value,size=8,bold=false)=>page.commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`);
    const line=(x1,y1,x2,y2,w=.5)=>page.commands.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
    text(36,754,pdfFit(data.appName,68),16,true);
    text(36,738,pdfFit(`${data.orgName} - ${data.itemName} Inventory and Needs Report`,96),9,false);
    text(36,726,`Generated ${generated}`,7,false);
    line(36,716,576,716,.7);
    return page;
  };
  const text=(x,y,value,size=8,bold=false)=>page.commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`);
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

  beginSection('INVENTORY ON HAND');
  const groups=inventoryGroups();
  if(!groups.length)addParagraph('No charities available.');
  groups.forEach(g=>{
    addParagraph(g.charity,{size:9,bold:true,after:2});
    if(g.sizes.length)g.sizes.forEach(x=>addParagraph(`${x.s}: ${x.n}`,{indent:16,after:1}));
    else addParagraph('None on hand: 0',{indent:16,after:1});
    addParagraph(`Total for ${g.charity}: ${g.total}`,{indent:16,bold:true,after:6});
  });
  addParagraph(`Grand Total: ${totalOnHand()}`,{size:9,bold:true,after:10});

  beginSection('UPCOMING NEEDS');
  const needs=upcoming().sort((a,b)=>a.month.localeCompare(b.month)||a.charity.localeCompare(b.charity)||a.size.localeCompare(b.size));
  if(!needs.length)addParagraph('No upcoming needs.');
  needs.forEach(n=>{
    const stock=onHand(n.charity,n.size),short=Math.max(0,n.qty-stock);
    addParagraph(`${fmtMonth(n.month)} - ${n.charity}`,{size:9,bold:true,after:2});
    addParagraph(`${n.size} | Need: ${n.qty} | On Hand: ${stock} | Shortage: ${short}`,{indent:16,after:n.note?1:6});
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
function printFullReport(){renderReports();clearPrintMode();document.body.classList.add('print-full');setTimeout(()=>{window.print();setTimeout(clearPrintMode,500)},50)}
function printMeetingReport(){renderReports();clearPrintMode();document.body.classList.add('print-compact');setTimeout(()=>{window.print();setTimeout(clearPrintMode,500)},50)}
function exportMeetingPDF(){exportCompactPDF()}
window.addEventListener('afterprint',clearPrintMode);
window.addEventListener('online',()=>queueExternalBackup('Internet connection restored'));
function renderAll(){refreshSelects();applyNames();renderHome();renderInventory();renderHistory();renderNeeds();renderReports();renderRecoveryList();updateSaveStatus()}


window.lqGetData=()=>clone(data);
window.lqApplyRemoteData=(remoteData,reason='Firebase update')=>{
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
  }catch(error){console.error('Could not apply Firebase data.',error);return false}
};
window.lqRefreshSaveStatus=updateSaveStatus;

document.addEventListener('DOMContentLoaded',()=>{
  document.body.style.overflow='hidden';el('continueBtn').addEventListener('click',closeSplash);el('txDate').value=today();el('needMonth').value=monthNow();
  localStorage.setItem(KEY,JSON.stringify(data));if(!status.lastSavedAt){status.lastSavedAt=new Date().toISOString();persistStatus()}createRecoverySnapshot('Firebase test build opened',data);
  loadExternalFields();renderAll();setMode('IN');
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=7.6.0-test').catch(()=>{}));
});
