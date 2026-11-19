/* Edison Lab – library, collection tracker and deck editor. Uses globals from the duel page: CI, PRE, $, esc, tile, nm, toast, showSheet, closeSheet. */
"use strict";
const RARITIES=['Common','Short Print','Rare','Super Rare','Ultra Rare','Secret Rare','Ultimate Rare','Ghost Rare','Gold Rare','Parallel Rare','Other'];
const KEY='edison-lab-v1';
let S=null,D=[],remote=null,wTimer=null,wBusy=false,wDirty=false,TAB='duel',LVIEW='lib',CURDECK=null,SEC='main',PICK=null,SHOWN=60;
const LF0=()=>({q:'',txt:false,type:'all',sub:new Set(),attr:new Set(),race:new Set(),lvMin:'',lvMax:'',atkMin:'',atkMax:'',dfMin:'',dfMax:'',lim:'all',own:'all',photo:'all',sort:'name'});
let LF=LF0(),LDECK=null,EQ='';
const sum=o=>Object.values(o||{}).reduce((a,b)=>a+b,0);
const used=(d,id)=>(d.main[id]||0)+(d.extra[id]||0)+(d.side[id]||0);
const ownedTotal=id=>sum(S.owned[id]);
const byId=id=>CI[id];
/* ---------- storage ---------- */
function freshDeck(p,i){return{id:'p'+i,name:p.name,note:p.note||'',preset:i,main:{...p.main},extra:{...p.extra},side:{...(p.side||{})}}}
function loadLocal(){try{const r=localStorage.getItem(KEY);if(r)return JSON.parse(r)}catch(e){}return null}
function setStatus(t){const e=$('sync');if(e)e.textContent=t}
function saveS(touch){if(touch!==false)S.t=Date.now();try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
  refreshSelects();
  if(remote&&touch!==false){clearTimeout(wTimer);setStatus('saving…');wTimer=setTimeout(pushRemote,800)}}
async function pushRemote(){if(!remote)return;if(wBusy){wDirty=true;return}wBusy=true;
  try{await remote.set({S:JSON.parse(JSON.stringify(S))});setStatus('☁ saved')}catch(e){setStatus('local only')}
  wBusy=false;if(wDirty){wDirty=false;pushRemote()}}
async function initRemote(){
  try{if(!(window.claude&&window.claude.use))return;
    const db=await window.claude.use('db'),user=await window.claude.use('user');if(!db||!user)return;
    const uid=await user.id();if(!uid)return;const ref=db.doc('data/users/'+uid+'/lab');const snap=await ref.get();remote=ref;
    const r=snap.exists?(snap.data()||{}).S:null;
    if(r&&r.decks&&r.owned&&(r.t||0)>(S.t||0)){S=r;try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}refreshSelects();renderLab();setStatus('☁ synced')}
    else if((S.t||0)>0)await pushRemote();else setStatus('☁ synced');
  }catch(e){setStatus('local only')}}
/* ---------- deck logic ---------- */
function validate(d){
  const out=[],m=sum(d.main),e=sum(d.extra),s=sum(d.side);
  if(m<40)out.push('Main deck has '+m+' cards (minimum 40).');if(m>60)out.push('Main deck has '+m+' cards (maximum 60).');
  if(e>15)out.push('Extra deck has '+e+' cards (maximum 15).');if(s>15)out.push('Side deck has '+s+' cards (maximum 15).');
  for(const k of new Set([...Object.keys(d.main),...Object.keys(d.extra),...Object.keys(d.side)])){const c=byId(k);if(!c){out.push('Unknown card '+k+'.');continue}
    const n=used(d,k);if(c.lim===0)out.push(c.n+' is Forbidden.');else if(n>c.lim)out.push(c.n+': '+n+' copies (limit '+c.lim+').');
    if(d.main[k]&&c.ex)out.push(c.n+' belongs in the Extra Deck.');if(d.extra[k]&&!c.ex)out.push(c.n+" can't be in the Extra Deck.")}
  return out}
function missing(d){let uniq=0,tot=0;for(const k of new Set([...Object.keys(d.main),...Object.keys(d.extra),...Object.keys(d.side)])){const need=used(d,k),have=ownedTotal(k);if(need>have){uniq++;tot+=need-have}}return{uniq,tot}}
function addToDeck(d,id,sec){const c=byId(id);if(!c)return'Unknown card';if(c.lim===0)return c.n+' is Forbidden';if(used(d,id)>=c.lim)return c.n+': limit '+c.lim+' reached';
  if(sec==='main'&&c.ex)sec='extra';if(sec==='extra'&&!c.ex)sec='main';
  if(sec==='main'&&sum(d.main)>=60)return'Main deck is full (60)';if(sec==='extra'&&sum(d.extra)>=15)return'Extra deck is full (15)';if(sec==='side'&&sum(d.side)>=15)return'Side deck is full (15)';
  d[sec][id]=(d[sec][id]||0)+1;saveS();return null}
function removeFromDeck(d,id,sec){if(d[sec][id]){d[sec][id]--;if(!d[sec][id])delete d[sec][id]}saveS()}
function toYdk(d){const L=['#created by Edison Lab','#main'];for(const[k,n]of Object.entries(d.main))for(let i=0;i<n;i++)L.push(k);L.push('#extra');for(const[k,n]of Object.entries(d.extra))for(let i=0;i<n;i++)L.push(k);L.push('!side');for(const[k,n]of Object.entries(d.side))for(let i=0;i<n;i++)L.push(k);return L.join('\n')+'\n'}
function fromYdk(txt,name){const d={id:'u'+Date.now(),name:name||'Imported deck',note:'Imported .ydk',main:{},extra:{},side:{}};let sec='main',skip=0;
  for(let l of txt.split(/\r?\n/)){l=l.trim();if(l.startsWith('#extra'))sec='extra';else if(l.startsWith('!side'))sec='side';else if(l.startsWith('#main'))sec='main';
    else if(/^\d+$/.test(l)){const c=byId(+l);if(!c){skip++;continue}let s=sec;if(s==='main'&&c.ex)s='extra';d[s][+l]=(d[s][+l]||0)+1}}return{d,skip}}
function addOwned(id,delta,rar){const o=S.owned[id]||(S.owned[id]={});rar=rar||S.rar||'Common';
  if(delta>0)o[rar]=(o[rar]||0)+1;else{const k=o[rar]>0?rar:Object.keys(o).find(k=>o[k]>0);if(k){o[k]--;if(!o[k])delete o[k]}}
  if(!Object.keys(o).length)delete S.owned[id];saveS()}
/* ---------- refs for duel page ---------- */
function refreshSelects(){
  const a=$('dA'),b=$('dB');if(!a||!S)return;const va=a.value,vb=b.value;
  const lab=d=>d.name+' ('+sum(d.main)+(validate(d).length?' ⚠':'')+')';
  a.innerHTML=S.decks.map(d=>'<option value="'+d.id+'">'+esc(lab(d))+'</option>').join('');
  b.innerHTML='<optgroup label="Built-in AI decks">'+PRE.map((p,i)=>'<option value="p'+i+'">'+esc(p.name)+'</option>').join('')+'</optgroup>'+(S.decks.length?'<optgroup label="Your decks">'+S.decks.map(d=>'<option value="d'+d.id+'">'+esc(d.name)+'</option>').join('')+'</optgroup>':'');
  if([...a.options].some(o=>o.value===va))a.value=va;if([...b.options].some(o=>o.value===vb))b.value=vb;homeSums()}
function homeSums(){for(const[s,m]of[['dA','sumA'],['dB','sumB']]){const el=$(m);if(!el)continue;const d=deckByRef($(s).value);if(!d){el.textContent='';continue}const v=validate(d);el.innerHTML=sum(d.main)+' main · '+sum(d.extra)+' extra · '+sum(d.side)+' side · '+(v.length?'<span class="bad">⚠ '+v.length+' issue'+(v.length>1?'s':'')+'</span>':'<span class="ok">✓ legal</span>')}}
document.addEventListener('change',e=>{if(e.target.id==='dA'||e.target.id==='dB')homeSums()});
function deckByRef(ref){ // 'p3' preset, 'd<id>' user deck, else deck id
  if(/^p\d+$/.test(ref)){const p=PRE[+ref.slice(1)];return{name:p.name,main:{...p.main},extra:{...p.extra},side:{...(p.side||{})}}}
  const id=ref[0]==='d'&&S.decks.some(x=>x.id===ref.slice(1))?ref.slice(1):ref;const d=S.decks.find(x=>x.id===id);return d&&{name:d.name,main:{...d.main},extra:{...d.extra},side:{...d.side}}}
/* ---------- init ---------- */
function labInit(){
  D=Object.values(CI).sort((a,b)=>a.n.localeCompare(b.n));for(const c of D){c.nl=c.n.toLowerCase();c.tl=(c.x||'').toLowerCase()}
  S=loadLocal();if(!S||!S.decks||!S.owned)S={v:1,t:0,owned:{},decks:PRE.map(freshDeck),rar:'Common',seed:PRE.length};
  if(S.seed==null)S.seed=Math.min(6,PRE.length);
  if(S.seed<PRE.length){for(let i=S.seed;i<PRE.length;i++)S.decks.push(freshDeck(PRE[i],i));S.seed=PRE.length;saveS(false)}
  phLoad().then(()=>{refreshSelects();if(TAB!=='duel')renderLab()});refreshSelects();drawTabs();showTab('duel');initRemote()}
function drawTabs(){
  const T=[['duel','Duel','<circle cx="12" cy="12" r="8"/><path d="M10 9l5 3-5 3z"/>'],['decks','Decks','<rect x="5" y="4" width="10" height="15" rx="2"/><path d="M9 8h10v11H9"/>'],['lib','Library','<path d="M4 5h16M4 12h16M4 19h16"/>'],['binder','Binder','<path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2z"/><path d="M9 4v16M12 9h4M12 13h4"/>']];
  $('tabs').innerHTML=T.map(([k,l,p])=>'<button data-tab="'+k+'" class="'+(TAB===k?'on':'')+'"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>'+l+'</button>').join('')}
function showTab(t){
  TAB=t;PICK=null;drawTabs();
  const inGame=$('duel').style.display==='flex';
  $('tabs').style.display=inGame?'none':'flex';
  if(inGame){$('lab').style.display='none';return}
  $('setup').style.display=t==='duel'?'block':'none';
  $('lab').style.display=t==='duel'?'none':'flex';
  if(t==='decks'){LVIEW='decks'}else if(t==='lib'){LVIEW='lib'}else if(t==='binder'){LVIEW='binder'}
  if(t!=='duel')renderLab();
  refreshSelects()}
$('tabs')&&($('tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});
/* ---------- library ---------- */
function filtered(){
  const toks=LF.q.trim().toLowerCase().split(/\s+/).filter(Boolean);const dk=ldeck();
  const num=v=>v===''?null:+v;const lv0=num(LF.lvMin),lv1=num(LF.lvMax),a0=num(LF.atkMin),a1=num(LF.atkMax),d0=num(LF.dfMin),d1=num(LF.dfMax);
  const monF=LF.attr.size||LF.race.size||lv0!=null||lv1!=null||a0!=null||a1!=null||d0!=null||d1!=null;
  let r=D.filter(c=>{
    if(LF.type==='Monster'&&(c.cat!=='Monster'||c.ex))return false;if(LF.type==='Spell'&&c.cat!=='Spell')return false;if(LF.type==='Trap'&&c.cat!=='Trap')return false;if(LF.type==='Extra'&&!c.ex)return false;
    if(LF.sub.size){let ok=false;for(const s of LF.sub)if((c.sub||'').split(' / ').includes(s)||(s==='Flip'&&/Flip/.test(c.sub)))ok=true;if(!ok)return false}
    if(monF&&c.cat!=='Monster')return false;
    if(LF.attr.size&&!LF.attr.has(c.attr))return false;if(LF.race.size&&!LF.race.has(c.race))return false;
    if(lv0!=null&&c.lv<lv0)return false;if(lv1!=null&&c.lv>lv1)return false;if(a0!=null&&c.atk<a0)return false;if(a1!=null&&c.atk>a1)return false;if(d0!=null&&c.df<d0)return false;if(d1!=null&&c.df>d1)return false;
    if(LF.lim!=='all'&&String(c.lim)!==LF.lim)return false;
    if(LF.own==='deck'&&(!dk||!used(dk,c.id)))return false;if(LF.photo==='has'&&!PH[c.id])return false;if(LF.photo==='no'&&PH[c.id])return false;
    for(const t of toks)if(!(c.nl.includes(t)||(LF.txt&&c.tl.includes(t))))return false;return true});
  const so=LF.sort;if(so!=='name')r=[...r].sort((a,b)=>so==='atk'?(b.atk||-1)-(a.atk||-1):so==='df'?(b.df||-1)-(a.df||-1):so==='lv'?(b.lv||0)-(a.lv||0):ownedTotal(b.id)-ownedTotal(a.id)||a.nl.localeCompare(b.nl));
  return r}
function limBadge(c){return c.lim===0?'<span class="bd f">FORBIDDEN</span>':c.lim===1?'<span class="bd l">LIMITED</span>':c.lim===2?'<span class="bd s">SEMI</span>':''}
function subLine(c){return c.cat==='Monster'?esc(c.attr)+' · '+esc(c.race)+' · '+esc(c.sub)+' · Lv'+c.lv+' · '+(c.atk<0?'?':c.atk)+'/'+(c.df<0?'?':c.df):esc(c.sub)+' '+esc(c.cat)}
function activeChips(){const ch=[];
  if(LF.type!=='all')ch.push(['type',LF.type]);for(const s of LF.sub)ch.push(['sub',s]);for(const s of LF.attr)ch.push(['attr',s]);for(const s of LF.race)ch.push(['race',s]);
  if(LF.lvMin!==''||LF.lvMax!=='')ch.push(['lv','Lv '+(LF.lvMin||'0')+'–'+(LF.lvMax||'12')]);if(LF.atkMin!==''||LF.atkMax!=='')ch.push(['atk','ATK '+(LF.atkMin||'0')+'–'+(LF.atkMax||'∞')]);if(LF.dfMin!==''||LF.dfMax!=='')ch.push(['df','DEF '+(LF.dfMin||'0')+'–'+(LF.dfMax||'∞')]);
  if(LF.lim!=='all')ch.push(['lim',{0:'Forbidden',1:'Limited',2:'Semi-Limited',3:'Unlimited'}[LF.lim]]);if(LF.photo!=='all')ch.push(['photo',LF.photo==='has'?'Has photo':'Missing photo']);if(LF.own!=='all')ch.push(['own','In selected deck']);return ch}
function ldeck(){if(PICK)return S.decks.find(x=>x.id===PICK.deck);if(LVIEW==='deck')return S.decks.find(x=>x.id===CURDECK);
  let d=S.decks.find(x=>x.id===LDECK);if(!d){d=S.decks.find(x=>x.id===CURDECK)||S.decks[0];LDECK=d&&d.id}return d}
function inLine(c){const a=S.decks.filter(d=>used(d,c.id)).map(d=>esc(d.name.replace(/ \(.*$/,''))+' ×'+used(d,c.id));return a.length?'In: '+a.join(' · '):''}
function rowHTML(c){
  const d=ldeck(),n=d?(PICK&&PICK.sec==='side'?(d.side[c.id]||0):used(d,c.id)):0;
  const ctl=d?'<div class="ctl"><button class="sq" data-lrem="'+c.id+'">−</button><b class="ownn '+(n?'':'zero')+'">'+n+'</b><button class="sq pri" data-ladd="'+c.id+'" '+(c.lim===0?'disabled':'')+'>+</button></div>':'';
  return'<div class="lrow" data-card="'+c.id+'" style="border-left-color:'+colorOf(c.id)+'"><div class="lt">'+tile({code:c.id},false)+'</div><div class="lx"><b>'+esc(c.n)+'</b> '+limBadge(c)+'<div class="mut s">'+subLine(c)+'</div><div class="inl s">'+inLine(c)+'</div></div>'+ctl+'</div>'}
function listHTML(list){return list.slice(0,SHOWN).map(rowHTML).join('')+(list.length>SHOWN?'<button class="more" data-act="more">Show more ('+(list.length-SHOWN)+')</button>':'')+(list.length?'':'<div class="mut" style="padding:20px;text-align:center">No cards match.</div>')}
function renderLab(){
  const el=$('lab');if(!S)return;
  if(LVIEW==='binder'){renderBinder();return}
  if(LVIEW==='deck'){renderEditor();return}
  if(LVIEW==='decks'&&!PICK){renderDecks();return}
  const list=filtered(),chips=activeChips(),dk=ldeck();
  const keep=document.getElementById('llist')&&!PICK?document.getElementById('llist').scrollTop:0;
  let h='<div class="lhead">'+(PICK?'<button class="sq" data-act="pickdone">‹</button><div class="lt2"><b>Add to “'+esc(dk.name)+'”</b><div class="mut s" id="pcount">'+{main:'Main/Extra',side:'Side'}[PICK.sec]+' · '+sum(dk.main)+' main · '+sum(dk.extra)+' extra · '+sum(dk.side)+' side</div></div><button class="pri" data-act="pickdone">Done</button>':
    '<div class="lt2"><b style="font-size:18px">Library</b><div class="mut s">'+(dk?'Adding to deck:':'Create a deck in the Decks tab first')+'</div></div>'+'<button data-act="photos">📷</button>'+(dk?'<select id="ldeck" style="width:48%">'+S.decks.map(x=>'<option value="'+x.id+'" '+(x.id===dk.id?'selected':'')+'>'+esc(x.name)+' ('+sum(x.main)+')</option>').join('')+'</select>':''))+'</div>';
  h+='<div class="lsearch"><input id="q" placeholder="Search name…" value="'+esc(LF.q)+'"><button data-act="filters" class="'+(chips.length?'pri':'')+'">Filters'+(chips.length?' ('+chips.length+')':'')+'</button></div>';
  h+='<div class="lchips">'+['all','Monster','Spell','Trap','Extra'].map(t=>'<button class="chip2 '+(LF.type===t?'on':'')+'" data-type="'+t+'">'+(t==='all'?'All':t==='Extra'?'Extra Deck':t+'s')+'</button>').join('')+'<select id="sort">'+[['name','Name'],['atk','ATK ↓'],['df','DEF ↓'],['lv','Level ↓']].map(([v,l])=>'<option value="'+v+'" '+(LF.sort===v?'selected':'')+'>'+l+'</option>').join('')+'</select></div>';
  if(chips.length)h+='<div class="lchips act">'+chips.map(([k,v])=>'<button class="chip2 on" data-rm="'+k+'|'+esc(v)+'">'+esc(v)+' ✕</button>').join('')+'<button class="chip2" data-act="reset">Clear all</button></div>';
  h+='<div class="mut s" style="padding:2px 12px" id="lcount">'+list.length+' cards</div><div class="llist" id="llist">'+listHTML(list)+'</div>';
  el.innerHTML=h;if(keep)document.getElementById('llist').scrollTop=keep;
  $('q').oninput=e=>{LF.q=e.target.value;SHOWN=60;const l=filtered();$('lcount').textContent=l.length+' cards';$('llist').innerHTML=listHTML(l);$('llist').scrollTop=0};
  $('sort').onchange=e=>{LF.sort=e.target.value;SHOWN=60;renderLab()};
  if($('ldeck'))$('ldeck').onchange=e=>{LDECK=e.target.value;renderLab()}}
/* ---------- decks list ---------- */
function deckCard(d){
  const v=validate(d);
  const hue=[...d.name].reduce((a,ch)=>(a*31+ch.charCodeAt(0))%360,7);
  return'<div class="dcard" data-deck="'+d.id+'" style="--hue:hsl('+hue+',85%,62%)"><div class="dtop"><b>'+esc(d.name)+'</b><button class="sq" data-menu="'+d.id+'">⋯</button></div><div class="mut s">'+esc(d.note||'')+'</div>'+
    '<div class="dstat"><span>Main '+sum(d.main)+'</span><span>Extra '+sum(d.extra)+'</span><span>Side '+sum(d.side)+'</span><span class="'+(v.length?'bad':'ok')+'">'+(v.length?'⚠ '+v.length+' issue'+(v.length>1?'s':''):'✓ legal')+'</span></div></div>'}
function renderDecks(){
  $('lab').innerHTML='<div class="lhead"><div class="lt2"><b style="font-size:18px">Decks</b><div class="mut s">'+S.decks.length+' saved · <span id="sync">'+(remote?'☁ saved':'local')+'</span></div></div><button data-act="import">Import</button><button class="pri" data-act="newdeck">+ New</button></div><div class="llist">'+(S.decks.map(deckCard).join('')||'<div class="mut" style="padding:20px;text-align:center">No decks yet.</div>')+'<button class="more" data-act="backup">Backup &amp; restore</button></div>'}
/* ---------- deck editor ---------- */
function editorBody(d){
  const q=EQ.trim().toLowerCase();
  if(q){const toks=q.split(/\s+/);const res=D.filter(c=>toks.every(t=>c.nl.includes(t))).slice(0,40);
    return'<div class="gh">Search results — tap + to add to '+SEC+'</div>'+(res.map(rowHTML).join('')||'<div class="mut" style="padding:16px;text-align:center">No cards found.</div>')}
  const typeOrder=c=>c.cat==='Monster'?0:c.cat==='Spell'?1:2;
  const rows=Object.keys(d[SEC]).map(k=>byId(k)).filter(Boolean).sort((a,b)=>typeOrder(a)-typeOrder(b)||a.nl.localeCompare(b.nl));
  let body='';
  for(const g of ['Monster','Spell','Trap']){const gr=rows.filter(x=>x.cat===g);if(!gr.length)continue;body+='<div class="gh">'+g+'s · '+gr.reduce((a,x)=>a+d[SEC][x.id],0)+'</div>'+gr.map(x=>'<div class="lrow" data-card="'+x.id+'" style="border-left-color:'+colorOf(x.id)+'"><div class="lt">'+tile({code:x.id},false)+'</div><div class="lx"><b>'+esc(x.n)+'</b> '+limBadge(x)+'<div class="mut s">'+subLine(x)+'</div></div><div class="ctl"><button class="sq" data-dec="'+x.id+'">−</button><b class="ownn">'+d[SEC][x.id]+'</b><button class="sq pri" data-inc="'+x.id+'">+</button></div></div>').join('')}
  return body||'<div class="mut" style="padding:24px;text-align:center">No cards in the '+SEC+' deck yet.<br>Search above, or tap “Browse library”.</div>'}
function renderEditor(){
  const d=S.decks.find(x=>x.id===CURDECK);if(!d){LVIEW='decks';renderLab();return}
  const v=validate(d),c={main:sum(d.main),extra:sum(d.extra),side:sum(d.side)};
  $('lab').innerHTML='<div class="lhead"><button class="sq" data-act="backdecks">‹</button><div class="lt2"><b data-act="rename" style="font-size:17px">'+esc(d.name)+' ✎</b><div class="s '+(v.length?'bad':'ok')+'" data-act="issues">'+(v.length?'⚠ '+v.length+' issue'+(v.length>1?'s':'')+' — tap to view':'✓ legal Edison deck')+'</div></div><button data-menu="'+d.id+'">⋯</button></div>'+
   '<div class="lsearch"><input id="eq" placeholder="Search any card to add…" value="'+esc(EQ)+'"></div>'+
   '<div class="seg3">'+['main','extra','side'].map(s=>'<button class="'+(SEC===s?'on':'')+'" data-sec="'+s+'">'+s[0].toUpperCase()+s.slice(1)+' <b>'+c[s]+'</b></button>').join('')+'</div>'+
   '<div class="llist" id="ebody">'+editorBody(d)+'</div><div class="ebar"><button class="pri" data-act="addcards" style="flex:2">Browse library</button><button data-act="testhand">Test hand</button><button data-act="playtest">Playtest</button></div>';
  $('eq').oninput=e=>{EQ=e.target.value;$('ebody').innerHTML=editorBody(d);$('ebody').scrollTop=0}}
function testHand(d){const arr=expandMain(d);for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
const expandMain=d=>Object.entries(d.main).flatMap(([k,n])=>Array(n).fill(+k));
/* ---------- card detail ---------- */
function openDetail(id){
  const c=byId(id);if(!c)return;
  const inDecks=S.decks.filter(d=>used(d,id)).map(d=>esc(d.name)+' ×'+used(d,id));
  let h='<div class="detail"><div class="mt">'+tile({code:id},false)+'</div><div class="tx"><b style="font-size:16px;color:#fff">'+esc(c.n)+'</b> '+limBadge(c)+'\n'+subLine(c)+'</div></div><div class="sub">'+esc(c.x||'')+'</div>';
  if(inDecks.length)h+='<div class="sub">In decks: '+inDecks.join(', ')+'</div>';
  const d=ldeck();
  h+='<div class="btns"><button id="phbtn">📷 '+(PH[id]?'Photo…':'Add photo')+'</button></div>';
  h+='<div class="btns">'+(d?'<button class="pri" data-addto="main">Add to “'+esc(d.name)+'”</button><button data-addto="side">Add to side</button>':'')+'<button data-close>Close</button></div>';
  if(PH[id])h='<img class="bigph" src="'+PH[id]+'">'+h;
  showSheet(h);const sh=$('sheet');$('phbtn').onclick=()=>photoFlow(id,()=>{});
  sh.querySelectorAll('[data-addto]').forEach(b=>b.onclick=()=>{const e=addToDeck(d,id,b.dataset.addto);if(e)toast(e);else{toast('Added');openDetail(id);renderLab()}})}
/* ---------- filters sheet ---------- */
function filtersSheet(){
  const chip=(set,v)=>'<button class="chip2 '+(LF[set].has(v)?'on':'')+'" data-fs="'+set+'|'+esc(v)+'">'+esc(v)+'</button>';
  const monSub=['Normal','Effect','Fusion','Ritual','Synchro','Tuner','Flip','Gemini','Spirit','Union','Toon'],stSub=['Quick-Play','Continuous','Equip','Field','Counter'];
  const attrs=['LIGHT','DARK','EARTH','WATER','FIRE','WIND','DIVINE'],races=[...new Set(D.map(c=>c.race).filter(Boolean))].sort();
  const rng=(a,b,l)=>'<div class="rng"><span>'+l+'</span><input type="number" inputmode="numeric" data-f="'+a+'" value="'+LF[a]+'" placeholder="min"><i>–</i><input type="number" inputmode="numeric" data-f="'+b+'" value="'+LF[b]+'" placeholder="max"></div>';
  const seg=(k,opts)=>'<div class="chips">'+opts.map(([v,l])=>'<button class="chip2 '+(LF[k]===v?'on':'')+'" data-fv="'+k+'|'+v+'">'+l+'</button>').join('')+'</div>';
  showSheet('<h3>Filters</h3><div class="fs"><div class="gh">Card type</div>'+seg('type',[['all','All'],['Monster','Monsters'],['Spell','Spells'],['Trap','Traps'],['Extra','Extra Deck']])+
   '<div class="gh">Monster type</div><div class="chips">'+monSub.map(v=>chip('sub',v)).join('')+'</div><div class="gh">Spell / Trap type</div><div class="chips">'+stSub.map(v=>chip('sub',v)).join('')+'</div>'+
   '<div class="gh">Attribute</div><div class="chips">'+attrs.map(v=>chip('attr',v)).join('')+'</div><div class="gh">Race / Type</div><div class="chips">'+races.map(v=>chip('race',v)).join('')+'</div>'+
   '<div class="gh">Stats</div>'+rng('lvMin','lvMax','Level/Rank')+rng('atkMin','atkMax','ATK')+rng('dfMin','dfMax','DEF')+
   '<div class="gh">Banlist status</div>'+seg('lim',[['all','Any'],['0','Forbidden'],['1','Limited'],['2','Semi'],['3','Unlimited']])+
   '<div class="gh">Photo</div>'+seg('photo',[['all','All'],['has','Has photo'],['no','Missing photo']])+'<div class="gh">Deck</div>'+seg('own',[['all','All cards'],['deck','Only cards in the selected deck']])+
   '<label class="chk"><input type="checkbox" id="txt" '+(LF.txt?'checked':'')+'> Also search card text</label></div><div class="btns"><button class="pri" data-close>Show '+filtered().length+' cards</button><button data-act="reset2">Reset filters</button></div>');
  const sh=$('sheet');
  sh.querySelectorAll('[data-fs]').forEach(b=>b.onclick=()=>{const[k,v]=b.dataset.fs.split('|');LF[k].has(v)?LF[k].delete(v):LF[k].add(v);SHOWN=60;filtersSheet();renderLab()});
  sh.querySelectorAll('[data-fv]').forEach(b=>b.onclick=()=>{const[k,v]=b.dataset.fv.split('|');LF[k]=v;SHOWN=60;filtersSheet();renderLab()});
  sh.querySelectorAll('[data-f]').forEach(i=>i.onchange=()=>{LF[i.dataset.f]=i.value;SHOWN=60;filtersSheet();renderLab()});
  $('txt').onchange=e=>{LF.txt=e.target.checked;renderLab()};
  sh.querySelector('[data-act=reset2]').onclick=()=>{LF=LF0();filtersSheet();renderLab()}}
/* ---------- menus / text sheets ---------- */
function textSheet(title,body,btns){showSheet('<h3>'+title+'</h3>'+body+'<div class="btns">'+(btns||'')+'<button data-close>Close</button></div>')}
function deckMenu(id){const d=S.decks.find(x=>x.id===id);
  showSheet('<h3>'+esc(d.name)+'</h3><div class="btns"><button class="pri" data-m="open">Edit deck</button><button data-m="play">Playtest this deck</button><button data-m="dup">Duplicate</button><button data-m="ren">Rename</button><button data-m="ydk">Export .ydk (copy)</button>'+(d.preset!=null?'<button data-m="reset">Reset to built-in list</button>':'')+'<button class="bad" data-m="del">Delete</button><button data-close>Close</button></div>');
  $('sheet').querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>deckAct(b.dataset.m,id))}
function deckAct(k,id){const d=S.decks.find(x=>x.id===id);
  if(k==='open'){closeSheet();CURDECK=id;LVIEW='deck';SEC='main';EQ='';TAB='decks';drawTabs();renderLab()}
  else if(k==='play'){closeSheet();showTab('duel');$('dA').value=id;toast('Deck selected — choose a mode and Start')}
  else if(k==='own'){for(const id of new Set([...Object.keys(d.main),...Object.keys(d.extra),...Object.keys(d.side)])){const need=used(d,id)-ownedTotal(id);for(let i=0;i<need;i++)addOwned(+id,1)}closeSheet();renderLab();toast('Collection updated')}
  else if(k==='dup'){const n=JSON.parse(JSON.stringify(d));n.id='u'+Date.now();n.name=d.name+' (copy)';n.preset=null;S.decks.push(n);saveS();closeSheet();renderLab();toast('Duplicated')}
  else if(k==='ren'){showSheet('<h3>Rename deck</h3><input id="rn" value="'+esc(d.name)+'"><div class="btns"><button class="pri" id="rnok">Save</button><button data-close>Cancel</button></div>');$('rnok').onclick=()=>{d.name=$('rn').value.trim()||d.name;saveS();closeSheet();renderLab()}}
  else if(k==='ydk'){textSheet('Export .ydk','<div class="sub">Select all and copy. Paste into any YGOPro-compatible tool.</div><textarea id="yt" rows="8" readonly>'+esc(toYdk(d))+'</textarea>')}
  else if(k==='reset'){const f=freshDeck(PRE[d.preset],d.preset);Object.assign(d,{main:f.main,extra:f.extra,side:f.side});saveS();closeSheet();renderLab();toast('Reset')}
  else if(k==='del'){showSheet('<h3>Delete “'+esc(d.name)+'”?</h3><div class="sub">This cannot be undone.</div><div class="btns"><button class="bad" id="delok">Delete</button><button data-close>Cancel</button></div>');$('delok').onclick=()=>{S.decks=S.decks.filter(x=>x.id!==id);saveS();closeSheet();LVIEW='decks';renderLab()}}}
/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const lab=e.target.closest('#lab');if(!lab)return;const t=e.target;
  let b;
  if(b=t.closest('[data-ladd]')||t.closest('[data-lrem]')){const add=!!b.dataset.ladd,id=+(b.dataset.ladd||b.dataset.lrem),d=ldeck();if(!d)return;
    if(add){const er=addToDeck(d,id,PICK?PICK.sec:(LVIEW==='deck'?SEC:'main'));if(er){toast(er);return}}
    else{const order=PICK&&PICK.sec==='side'?['side','main','extra']:LVIEW==='deck'?[SEC,'main','extra','side']:['main','extra','side'];const s=order.find(k=>d[k][id]);if(s)removeFromDeck(d,id,s)}
    const row=b.closest('.lrow');const n=PICK&&PICK.sec==='side'?(d.side[id]||0):used(d,id);row.querySelector('.ownn').textContent=n;row.querySelector('.ownn').classList.toggle('zero',!n);
    const il=row.querySelector('.inl');if(il)il.innerHTML=inLine(byId(id));const pc=$('pcount');if(pc)pc.textContent={main:'Main/Extra',side:'Side'}[PICK.sec]+' · '+sum(d.main)+' main · '+sum(d.extra)+' extra · '+sum(d.side)+' side';
    if(LVIEW==='deck'){const sc=$('ebody').scrollTop;if(!EQ.trim()){renderLab();}else{document.querySelectorAll('.seg3 b').forEach((x,i)=>x.textContent=sum(d[['main','extra','side'][i]]))}}return}
  if(b=t.closest('[data-inc]')){const d=S.decks.find(x=>x.id===CURDECK),er=addToDeck(d,+b.dataset.inc,SEC);if(er)toast(er);renderLab();return}
  if(b=t.closest('[data-dec]')){const d=S.decks.find(x=>x.id===CURDECK);removeFromDeck(d,+b.dataset.dec,SEC);renderLab();return}
  if(b=t.closest('[data-sec]')){SEC=b.dataset.sec;renderLab();return}
  if(b=t.closest('[data-menu]')){e.stopPropagation();deckMenu(b.dataset.menu);return}
  if(b=t.closest('[data-type]')){LF.type=b.dataset.type;SHOWN=60;renderLab();return}
  if(b=t.closest('[data-rm]')){const[k,v]=b.dataset.rm.split('|');
    if(k==='type')LF.type='all';else if(k==='sub'||k==='attr'||k==='race')LF[k].delete(v);else if(k==='lv'){LF.lvMin=LF.lvMax=''}else if(k==='atk'){LF.atkMin=LF.atkMax=''}else if(k==='df'){LF.dfMin=LF.dfMax=''}else if(k==='lim')LF.lim='all';else if(k==='own')LF.own='all';else if(k==='photo')LF.photo='all';renderLab();return}
  if(b=t.closest('[data-act]')){actions(b.dataset.act);return}
  if(b=t.closest('[data-deck]')){deckAct('open',b.dataset.deck);return}
  if(b=t.closest('[data-card]')){openDetail(+b.dataset.card);return}
});
function actions(a){
  const d=CURDECK&&S.decks.find(x=>x.id===CURDECK);
  switch(a){
    case'filters':filtersSheet();break;case'photos':photoMenu();break;case'reset':LF=LF0();SHOWN=60;renderLab();break;case'more':SHOWN+=80;renderLab();break;
    case'newdeck':showSheet('<h3>New deck</h3><input id="nn" placeholder="Deck name"><div class="btns"><button class="pri" id="nnok">Create</button><button data-close>Cancel</button></div>');$('nnok').onclick=()=>{const n={id:'u'+Date.now(),name:$('nn').value.trim()||'New deck',note:'',main:{},extra:{},side:{}};S.decks.unshift(n);saveS();closeSheet();CURDECK=n.id;LVIEW='deck';SEC='main';EQ='';renderLab()};break;
    case'import':textSheet('Import deck (.ydk)','<input type="file" id="yf" accept=".ydk,.txt" style="margin-bottom:8px"><div class="sub">…or paste the deck list text</div><input id="yn" placeholder="Deck name" style="margin-bottom:8px"><textarea id="yt" rows="6"></textarea>','<button class="pri" id="yok">Import</button>');
      $('yf').onchange=ev=>{const f=ev.target.files[0];if(!f)return;$('yn').value=f.name.replace(/\.[^.]+$/,'');const r=new FileReader();r.onload=()=>{$('yt').value=r.result};r.readAsText(f)};
      $('yok').onclick=()=>{const{d,skip}=fromYdk($('yt').value,$('yn').value.trim()||'Imported deck');if(!sum(d.main)&&!sum(d.extra)){toast('No cards found');return}S.decks.unshift(d);saveS();closeSheet();renderLab();toast('Imported'+(skip?' · '+skip+' cards not in the Edison pool were skipped':''))};break;
    case'backup':textSheet('Backup & restore','<div class="sub">Your decks save to your private storage and this browser. A copyable backup is extra safety (also reads backups from the earlier Edison Lab app).</div><textarea id="bt" rows="5" placeholder="Paste a backup here to restore"></textarea>','<button class="pri" id="bex">Show my backup</button><button id="bim">Restore from text</button>');
      $('bex').onclick=()=>{$('bt').value=JSON.stringify(S)};$('bim').onclick=()=>{try{const j=JSON.parse($('bt').value);if(!j.decks||!j.owned)throw 0;S=j;S.t=Date.now();saveS();closeSheet();renderLab();toast('Backup restored')}catch(x){toast('Not a valid backup')}};break;
    case'backdecks':LVIEW='decks';renderLab();break;
    case'rename':deckAct('ren',CURDECK);break;
    case'issues':{const v=validate(d);textSheet('Deck check',v.length?'<div class="sub" style="color:var(--bad)">'+v.map(esc).join('\n')+'</div>':'<div class="sub" style="color:var(--ok)">No issues. Deck is legal for Edison.</div>');break}
    case'addcards':PICK={deck:CURDECK,sec:SEC==='side'?'side':'main'};LVIEW='lib';EQ='';renderLab();break;
    case'pickdone':PICK=null;LVIEW='deck';renderLab();break;
    case'testhand':{const arr=testHand(d);if(arr.length<5){toast('Add some main-deck cards first');break}const hand=arr.slice(0,5);
      showSheet('<h3>Test hand</h3><div class="grid5">'+hand.map(c=>'<div class="gc5">'+tile({code:c},false)+'</div>').join('')+'</div><div class="sub">'+hand.map(c=>esc(nm(c))).join(' · ')+'</div><div class="btns"><button class="pri" id="again">Draw again</button><button data-close>Close</button></div>');$('again').onclick=()=>actions('testhand');break}
    case'playtest':deckAct('play',CURDECK);break;
  }}

/* ---------- card photos (IndexedDB, blobs -> object URLs) ---------- */
const phDB=()=>new Promise((res,rej)=>{try{const r=indexedDB.open('edison-lab-photos',1);r.onupgradeneeded=()=>r.result.createObjectStore('p');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}});
let phOK=false;
async function phLoad(){try{PHON=localStorage.getItem('edison-ph-on')!=='0'}catch(e){}
  try{const db=await phDB(),st=db.transaction('p').objectStore('p');const keys=await new Promise(r=>{const q=st.getAllKeys();q.onsuccess=()=>r(q.result)}),vals=await new Promise(r=>{const q=st.getAll();q.onsuccess=()=>r(q.result)});
    keys.forEach((k,i)=>{PH[k]=URL.createObjectURL(vals[i])});phOK=true}catch(e){phOK=false}}
async function phPut(id,blob){const db=await phDB();await new Promise((res,rej)=>{const t=db.transaction('p','readwrite');t.objectStore('p').put(blob,id);t.oncomplete=res;t.onerror=()=>rej(t.error)});if(PH[id])URL.revokeObjectURL(PH[id]);PH[id]=URL.createObjectURL(blob);(S.pt||(S.pt={}))[id]=Date.now();saveS()}
async function phDel(id){const db=await phDB();await new Promise(res=>{const t=db.transaction('p','readwrite');t.objectStore('p').delete(id);t.oncomplete=res});if(PH[id])URL.revokeObjectURL(PH[id]);delete PH[id]}
function pickFile(capture,cb){const i=document.createElement('input');i.type='file';i.accept='image/*';if(capture)i.setAttribute('capture','environment');i.onchange=()=>{if(i.files[0])cb(i.files[0])};i.click()}
function cropUI(id,file,onSaved,onBack){
  const c=byId(id),W=230,H=335,img=new Image(),url=URL.createObjectURL(file);
  img.onload=()=>{const st={z:1,x:0,y:0,r:0};
    showSheet('<h3>'+esc(c.n)+'</h3><div class="sub">Drag to position the card inside the frame. Zoom so the card fills it.</div><canvas id="crop" width="'+W+'" height="'+H+'"></canvas><input type="range" id="zm" min="0.5" max="3" step="0.01" value="1" style="width:100%;margin:10px 0 4px"><div class="orow"><span>Add to binder as</span><select id="prar"><option value="">— don\'t add —</option>'+rarOpts(S.lastRar||'Common')+'</select></div><div class="btns"><button class="pri" id="pSave">Save photo</button><button id="pRot">Rotate ↻</button><button id="pBack">Back</button></div>');
    const cv=$('crop'),cx=cv.getContext('2d');
    const render=(ctx,w,h,k)=>{ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w/2+st.x*k,h/2+st.y*k);ctx.rotate(st.r*Math.PI/2);const sw=st.r%2?img.height:img.width,sh=st.r%2?img.width:img.height,s=Math.max(w/sw,h/sh)*st.z;ctx.drawImage(img,-img.width*s/2,-img.height*s/2,img.width*s,img.height*s);ctx.restore()};
    const draw=()=>render(cx,W,H,1);draw();
    let dr=null;cv.onpointerdown=e=>{dr={x:e.clientX,y:e.clientY};cv.setPointerCapture(e.pointerId)};cv.onpointermove=e=>{if(!dr)return;st.x+=e.clientX-dr.x;st.y+=e.clientY-dr.y;dr={x:e.clientX,y:e.clientY};draw()};cv.onpointerup=()=>dr=null;
    $('zm').oninput=e=>{st.z=+e.target.value;draw()};$('pRot').onclick=()=>{st.r=(st.r+1)%4;draw()};
    $('pBack').onclick=()=>{URL.revokeObjectURL(url);onBack()};
    $('pSave').onclick=()=>{const o=document.createElement('canvas');o.width=354;o.height=516;render(o.getContext('2d'),354,516,354/W);const rv=$('prar').value;if(rv){S.lastRar=rv;if(!bindHas(id))addEntry(id,rv,'',1)}o.toBlob(async b=>{try{await phPut(id,b);URL.revokeObjectURL(url);toast('Photo saved');onSaved()}catch(e){toast('Could not save photo (storage blocked)')}},'image/jpeg',.86)}};
  img.onerror=()=>toast('Could not read that image');img.src=url}
function photoFlow(id,after){const c=byId(id);
  showSheet('<h3>Photo: '+esc(c.n)+'</h3>'+(PH[id]?'<img class="bigph" src="'+PH[id]+'">':'<div class="sub">Photograph the whole card flat, in good light. The photo replaces the placeholder card face in duels.</div>')+'<div class="btns"><button class="pri" id="pCam">📷 Take photo</button><button id="pGal">Choose from gallery</button>'+(PH[id]?'<button class="bad" id="pDel">Remove photo</button>':'')+'<button data-close>Close</button></div>');
  const go=f=>cropUI(id,f,()=>{closeSheet();after&&after();renderLab()},()=>photoFlow(id,after));
  $('pCam').onclick=()=>pickFile(true,go);$('pGal').onclick=()=>pickFile(false,go);
  if($('pDel'))$('pDel').onclick=async()=>{await phDel(id);toast('Photo removed');closeSheet();after&&after();renderLab()}}
function queueFlow(ids,i){if(i>=ids.length){closeSheet();toast('All done — '+ids.length+' cards photographed');renderLab();return}
  const id=ids[i],c=byId(id);
  showSheet('<h3>Card '+(i+1)+' of '+ids.length+'</h3><div class="sub" style="font-size:16px;color:#fff"><b>'+esc(c.n)+'</b></div><div class="sub">'+subLine(c)+'</div><div class="btns"><button class="pri" id="qCam">📷 Take photo</button><button id="qGal">Choose from gallery</button><button id="qSkip">Skip</button><button data-close>Stop</button></div>');
  const go=f=>cropUI(id,f,()=>queueFlow(ids,i+1),()=>queueFlow(ids,i));
  $('qCam').onclick=()=>pickFile(true,go);$('qGal').onclick=()=>pickFile(false,go);$('qSkip').onclick=()=>queueFlow(ids,i+1)}
function photoMenu(){const n=Object.keys(PH).length,d=ldeck();
  const miss=d?[...new Set([...Object.keys(d.main),...Object.keys(d.extra),...Object.keys(d.side)])].filter(k=>!PH[k]).map(Number):[];
  showSheet('<h3>Card photos</h3><div class="sub">'+n+' photo'+(n===1?'':'s')+' saved on this device'+(phOK?'':' — storage unavailable here, photos will not persist')+'.</div><label class="chk"><input type="checkbox" id="phon" '+(PHON?'checked':'')+'> Use photos in duels and decks</label>'+
   (d?'<div class="btns"><button class="pri" id="phq" '+(miss.length?'':'disabled')+'>📷 Photograph missing cards in “'+esc(d.name)+'” ('+miss.length+')</button></div>':'')+
   '<div class="sub">Tip: in the Library, filter by “Photo: Missing” and tap a card to add one. Photos are small JPEGs stored privately in this browser.</div><div class="btns"><button class="bad" id="phdel" '+(n?'':'disabled')+'>Delete all photos</button><button data-close>Close</button></div>');
  $('phon').onchange=e=>{PHON=e.target.checked;try{localStorage.setItem('edison-ph-on',PHON?'1':'0')}catch(x){}renderLab()};
  if($('phq'))$('phq').onclick=()=>queueFlow(miss,0);
  $('phdel').onclick=()=>{showSheet('<h3>Delete all '+n+' photos?</h3><div class="sub">This cannot be undone.</div><div class="btns"><button class="bad" id="phdok">Delete</button><button data-close>Cancel</button></div>');$('phdok').onclick=async()=>{for(const k of Object.keys(PH))await phDel(k);closeSheet();renderLab();toast('Photos deleted')}}}

/* ---------- binder (manual slots, many copies/rarities) ---------- */
const RG=[['Basic',[['Common','C','#9aa4b8',0],['Short Print','SP','#b7c0d4',0],['Super Short Print','SSP','#c9d1e0',0],['Rare','R','#dfe4ee',0],['Super Rare','SR','#5ab0ff',1],['Ultra Rare','UR','#ffc83d',1],['Ultimate Rare','UtR','#b184ff',1]]],
 ['Secret',[['Secret Rare','ScR','#ff6ac1',1],['Ultra Secret Rare','USR','#ff9ad8',1],['Prismatic Secret Rare','PSR','#ff7bf0',1],['Platinum Rare','PlR','#cfe3ff',1],['Platinum Secret Rare','PlSR','#e6efff',1],['Extra Secret Rare','ESR','#ff5c8a',1],['Quarter Century Secret Rare','QCSR','#ffd1f0',1]]],
 ['Gold / Ghost / Special',[['Gold Rare','GlR','#ffb300',1],['Gold Secret Rare','GSR','#ffcf4a',1],['Premium Gold Rare','PGR','#ffc233',1],['Ghost Rare','GR','#f4f6ff',1],['Ghost/Gold Rare','GGR','#fff1b8',1],['Starlight Rare','StR','#a6f0ff',1],["Collector's Rare",'CR','#b0ffd9',1],["Prismatic Collector's Rare",'PCR','#7dffe0',1]]],
 ['Parallel',[['Parallel Rare','PR','#3de0ff',1],['Normal Parallel Rare','NPR','#6fe3ff',1],['Super Parallel Rare','SPR','#4aa8ff',1],['Ultra Parallel Rare','UPR','#ffd04a',1],['Secret Parallel Rare','ScPR','#ff8ad0',1],['Duel Terminal Normal Parallel Rare','DNPR','#79e8ff',1],['Duel Terminal Rare Parallel Rare','DRPR','#9ad8ff',1],['Duel Terminal Super Parallel Rare','DSPR','#6aa8ff',1],['Duel Terminal Ultra Parallel Rare','DUPR','#ffcf5a',1]]],
 ['Foil types',[['Mosaic Rare','MsR','#9ff0ff',1],['Shatterfoil Rare','ShR','#b4a0ff',1],['Starfoil Rare','SfR','#9ac4ff',1],['Holographic Rare','HR','#c9a0ff',1],['Millennium Rare','MlR','#ffd25a',1],['Millennium Super Rare','MSR','#6cc4ff',1],['Millennium Ultra Rare','MUR','#ffcc66',1],['Millennium Gold Rare','MGR','#ffbb00',1]]],
 ['Promo / other',[['Promo (Normal)','PRM','#9aa4b8',0],['Promo (Foil)','PRF','#e0e8ff',1],['Tournament Prize','TP','#ffb36b',1],['Oversized','OS','#9aa4b8',0],['Misprint / Error','ERR','#ff6b7d',0],['Other','•','#8f9bb3',0]]]];
const RMAP={};RG.forEach(g=>g[1].forEach(r=>RMAP[r[0]]=r));
const rc=r=>RMAP[r]||[r,(r||'').replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase()||'•','#8f9bb3',0];
const EDS=['','1st Edition','Unlimited','Limited Edition'],EDA={'1st Edition':'1st','Unlimited':'Unl','Limited Edition':'Ltd'};
function rarOpts(sel){const known=!sel||RMAP[sel];return RG.map(g=>'<optgroup label="'+g[0]+'">'+g[1].map(r=>'<option '+(r[0]===sel?'selected':'')+'>'+esc(r[0])+'</option>').join('')+'</optgroup>').join('')+(known?'':'<optgroup label="Custom"><option selected>'+esc(sel)+'</option></optgroup>')+'<option value="__custom">Custom…</option>'}
let BPAGE=0,BQ='',BHL=null,BARR=false,BHOLD=null,BMODE='swap';
function bindInit(){
  if(S.bind&&S.bind.slots)return;
  const ids=D.filter(c=>PH[c.id]);const slots=ids.map(c=>({u:'e'+c.id,id:c.id,r:(S.rarity||{})[c.id]||'',e:'',n:1,t:(S.pt||{})[c.id]||0}));
  S.bind={v:1,slots};padSlots();if(ids.length)saveS()}
function padSlots(){const s=S.bind.slots;while(s.length%9||s.length<9)s.push(null)}
const bindHas=id=>S.bind&&S.bind.slots.some(x=>x&&x.id===id);
let uidn=0;const newUid=()=>'e'+Date.now().toString(36)+(uidn++);
function addEntry(id,r,e,n,at){bindInit();const s=S.bind.slots;let i=(at!=null&&!s[at])?at:s.findIndex(x=>!x);if(i<0){i=s.length;s.push(...Array(9).fill(null))}
  s[i]={u:newUid(),id,r:r||'',e:e||'',n:n||1,t:Date.now()};padSlots();saveS();return i}
function pocket(x,i){
  if(!x)return'<div class="pocket empty" data-si="'+i+'">'+(BARR&&BHOLD!=null?'<b class="drop">⬇</b>':'<b class="plus">+</b>')+'</div>';
  const t=x.r?rc(x.r):null,c=byId(x.id)||{};
  return'<div class="pocket'+(t&&t[3]?' foil':'')+(BHL===i?' hl':'')+(BHOLD===i?' held':'')+'" data-si="'+i+'">'+(PH[x.id]?'<img src="'+PH[x.id]+'" alt="">':tile({code:x.id},false))+(t?'<span class="rtag" style="background:'+t[2]+'">'+esc(t[1])+'</span>':'')+(x.n>1?'<span class="qty">×'+x.n+'</span>':'')+(x.e?'<span class="ed">'+EDA[x.e]+'</span>':'')+'</div>'}
function renderBinder(){
  bindInit();padSlots();const s=S.bind.slots,pages=s.length/9;if(BPAGE>=pages)BPAGE=pages-1;if(BPAGE<0)BPAGE=0;
  const ents=s.filter(Boolean),copies=ents.reduce((a,x)=>a+x.n,0);
  let h='<div class="lhead"><div class="lt2"><b style="font-size:18px">Binder</b><div class="mut s">'+ents.length+' pocket'+(ents.length===1?'':'s')+' · '+copies+' cop'+(copies===1?'y':'ies')+' · '+pages+' page'+(pages===1?'':'s')+'</div></div><button class="'+(BARR?'pri':'')+'" data-bb="arr">'+(BARR?'Done':'↕ Arrange')+'</button><button class="pri" data-bb="add">＋</button><button data-bb="tools">⋯</button></div>';
  h+='<div class="lsearch" style="position:relative"><input id="bq" placeholder="Find a card in the binder…" value="'+esc(BQ)+'"><div id="bres" class="bres"></div></div>';
  if(BARR)h+='<div class="barr">'+(BHOLD!=null?'Holding <b>'+esc(byId(s[BHOLD].id).n)+'</b> — turn pages with ‹ ›, then tap where it goes. ':'Tap a card to pick it up, then tap its new spot. ')+'<span class="seg4"><button data-bm="swap" class="'+(BMODE==='swap'?'on':'')+'">Swap</button><button data-bm="ins" class="'+(BMODE==='ins'?'on':'')+'">Insert</button></span>'+(BHOLD!=null?'<button data-bb="drop">Cancel</button>':'')+'</div>';
  h+='<div class="bwrap"><div class="bpage" id="bpage">'+s.slice(BPAGE*9,BPAGE*9+9).map((x,k)=>pocket(x,BPAGE*9+k)).join('')+'</div></div>';
  h+='<div class="bnav"><button class="sq" data-bn="-1" '+(BPAGE?'':'disabled')+'>‹</button><button id="bjump" class="bpg">Page '+(BPAGE+1)+' / '+pages+'</button><button class="sq" data-bn="1" '+(BPAGE<pages-1?'':'disabled')+'>›</button></div>';
  $('lab').innerHTML=h;wireBinder()}
function bFlip(d){const n=BPAGE+d,pages=S.bind.slots.length/9;if(n<0||n>=pages)return;BPAGE=n;BHL=null;renderBinder();const e=$('bpage');if(e){e.classList.add(d>0?'fl':'fr');setTimeout(()=>e.classList.remove('fl','fr'),260)}}
function wireBinder(){
  const s=S.bind.slots,pages=s.length/9,q=$('bq');
  const matches=()=>{const t=BQ.trim().toLowerCase().split(/\s+/).filter(Boolean);if(!t.length)return[];const r=[];s.forEach((x,i)=>{if(x){const c=byId(x.id);if(c&&t.every(w=>c.nl.includes(w)))r.push({x,i,c})}});return r.slice(0,10)};
  const go=m=>{BPAGE=Math.floor(m.i/9);BHL=m.i;BQ='';renderBinder();const h=document.querySelector('.pocket.hl');if(h)h.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>{BHL=null;const z=document.querySelector('.pocket.hl');if(z)z.classList.remove('hl')},2400)};
  const showRes=()=>{const m=matches(),el=$('bres');if(!el)return;el.innerHTML=m.length?m.map((r,k)=>'<div class="bri" data-bk="'+k+'">'+(PH[r.c.id]?'<img src="'+PH[r.c.id]+'">':'<span class="bth"></span>')+'<span><b>'+esc(r.c.n)+'</b><i>Page '+(Math.floor(r.i/9)+1)+' · slot '+(r.i%9+1)+(r.x.r?' · '+esc(r.x.r):'')+(r.x.n>1?' · ×'+r.x.n:'')+'</i></span></div>').join(''):(BQ.trim()?'<div class="bri"><span>No match in binder</span></div>':'');el.style.display=el.innerHTML?'block':'none';el.querySelectorAll('[data-bk]').forEach(r=>r.onclick=()=>go(m[+r.dataset.bk]))};
  q.oninput=e=>{BQ=e.target.value;showRes()};q.onkeydown=e=>{if(e.key==='Enter'){const m=matches();if(m[0])go(m[0])}};if(BQ)showRes();
  document.querySelectorAll('[data-bn]').forEach(b=>b.onclick=()=>bFlip(+b.dataset.bn));
  document.querySelectorAll('[data-bm]').forEach(b=>b.onclick=()=>{BMODE=b.dataset.bm;renderBinder()});
  document.querySelectorAll('[data-bb]').forEach(b=>b.onclick=()=>{const k=b.dataset.bb;if(k==='arr'){BARR=!BARR;BHOLD=null;renderBinder()}else if(k==='add')addFlow(null);else if(k==='tools')binderTools();else if(k==='drop'){BHOLD=null;renderBinder()}});
  const bj=$('bjump');if(bj)bj.onclick=()=>{showSheet('<h3>Go to page</h3><div class="sub">1 – '+pages+'</div><input id="pgn" type="number" inputmode="numeric" min="1" max="'+pages+'" value="'+(BPAGE+1)+'"><div class="btns"><button class="pri" id="pgok">Go</button><button data-close>Cancel</button></div>');$('pgok').onclick=()=>{BPAGE=Math.max(0,Math.min(pages-1,(+$('pgn').value||1)-1));closeSheet();renderBinder()}};
  const bp=$('bpage');let sx=null,sy=null;bp.ontouchstart=e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY};bp.ontouchend=e=>{if(sx==null)return;const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;sx=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)bFlip(dx<0?1:-1)};
  bp.onclick=e=>{const p=e.target.closest('[data-si]');if(p)pocketTap(+p.dataset.si)}}
function pocketTap(i){const s=S.bind.slots,x=s[i];
  if(BARR){if(BHOLD==null){if(x){BHOLD=i;renderBinder()}return}
    if(i===BHOLD){BHOLD=null;renderBinder();return}
    const e=s[BHOLD];
    if(!x||BMODE==='swap'){s[BHOLD]=x||null;s[i]=e}else{s.splice(BHOLD,1);s.splice(i>BHOLD?i-1:i,0,e)}
    BHL=null;BHOLD=null;padSlots();saveS();renderBinder();return}
  if(!x)addFlow(i);else entrySheet(i)}
function entrySheet(i){const s=S.bind.slots,x=s[i],c=byId(x.id);
  showSheet((PH[x.id]?'<img class="bigph" src="'+PH[x.id]+'">':'')+'<div class="detail" style="display:block"><b style="font-size:16px;color:#fff">'+esc(c.n)+'</b> '+limBadge(c)+'<div class="mut s">'+subLine(c)+'</div><div class="mut s">Page '+(Math.floor(i/9)+1)+' · slot '+(i%9+1)+'</div></div>'+
   '<div class="orow"><span>Rarity</span><select id="erar"><option value="">— none —</option>'+rarOpts(x.r)+'</select></div><div class="orow"><span>Edition</span><select id="eed">'+EDS.map(e=>'<option value="'+e+'" '+(e===x.e?'selected':'')+'>'+(e||'— none —')+'</option>').join('')+'</select></div><div class="orow"><span>Copies in this pocket</span><span><button class="sq" id="eq-">−</button> <b id="eqn">'+x.n+'</b> <button class="sq pri" id="eq+">+</button></span></div><div class="sub">'+esc(c.x||'')+'</div>'+
   '<div class="btns"><button id="emove">↕ Move</button><button id="eanother">＋ Another rarity / copy</button><button id="ephoto">📷 Photo…</button><button class="bad" id="erem">Remove from binder</button><button data-close>Close</button></div>');
  const upd=()=>{saveS();renderBinder()};
  $('erar').onchange=e=>{if(e.target.value==='__custom'){showSheet('<h3>Custom rarity</h3><input id="crn" placeholder="e.g. Ultra Rare (Alt Art)"><div class="btns"><button class="pri" id="crok">Save</button><button data-close>Cancel</button></div>');$('crok').onclick=()=>{const v=$('crn').value.trim();if(v){x.r=v;S.lastRar=v}closeSheet();upd()};return}x.r=e.target.value;if(x.r)S.lastRar=x.r;upd()};
  $('eed').onchange=e=>{x.e=e.target.value;upd()};
  $('eq-').onclick=()=>{if(x.n>1){x.n--;$('eqn').textContent=x.n;upd()}};$('eq+').onclick=()=>{x.n++;$('eqn').textContent=x.n;upd()};
  $('emove').onclick=()=>{closeSheet();BARR=true;BHOLD=i;renderBinder()};
  $('eanother').onclick=()=>{addFlow(null,x.id)};
  $('ephoto').onclick=()=>photoFlow(x.id,()=>renderBinder());
  $('erem').onclick=()=>{showSheet('<h3>Remove from binder?</h3><div class="sub">'+esc(c.n)+(x.r?' ('+esc(x.r)+')':'')+(x.n>1?' ×'+x.n:'')+' — its pocket becomes empty. The card photo is kept.</div><div class="btns"><button class="bad" id="remok">Remove</button><button data-close>Cancel</button></div>');$('remok').onclick=()=>{s[i]=null;saveS();closeSheet();renderBinder()}}}
function addFlow(at,presetId){
  const form=id=>{const c=byId(id),last=S.lastRar||'Common';
    showSheet('<h3>Add to binder</h3><div class="detail" style="display:block"><b style="color:#fff">'+esc(c.n)+'</b><div class="mut s">'+subLine(c)+'</div></div><div class="orow"><span>Rarity</span><select id="arar"><option value="">— none —</option>'+rarOpts(last)+'</select></div><div class="orow"><span>Edition</span><select id="aed">'+EDS.map(e=>'<option value="'+e+'">'+(e||'— none —')+'</option>').join('')+'</select></div><div class="orow"><span>Copies</span><span><button class="sq" id="an-">−</button> <b id="ann">1</b> <button class="sq pri" id="an+">+</button></div><div class="btns"><button class="pri" id="aok">Add to binder</button><button data-close>Cancel</button></div>');
    let n=1;$('an-').onclick=()=>{if(n>1)$('ann').textContent=--n};$('an+').onclick=()=>$('ann').textContent=++n;
    const fin=r=>{const i=addEntry(id,r,$('aed').value,n,at);if(r)S.lastRar=r;saveS();BPAGE=Math.floor(i/9);BHL=i;closeSheet();renderBinder();setTimeout(()=>{BHL=null;const z=document.querySelector('.pocket.hl');if(z)z.classList.remove('hl')},2400)};
    $('aok').onclick=()=>{const r=$('arar').value;if(r==='__custom'){showSheet('<h3>Custom rarity</h3><input id="crn" placeholder="e.g. Ultra Rare (Alt Art)"><div class="btns"><button class="pri" id="crok">Add</button><button data-close>Cancel</button></div>');$('crok').onclick=()=>{const v=$('crn').value.trim();if(v)fin(v)}}else fin(r)}};
  if(presetId){form(presetId);return}
  showSheet('<h3>Add a card</h3><input id="aq" placeholder="Search card name…" autocomplete="off"><div id="ares" style="margin-top:8px"></div><div class="btns"><button data-close>Cancel</button></div>');
  $('aq').oninput=e=>{const t=e.target.value.trim().toLowerCase().split(/\s+/).filter(Boolean);if(!t.length){$('ares').innerHTML='';return}
    const res=D.filter(c=>t.every(w=>c.nl.includes(w))).slice(0,25);$('ares').innerHTML=res.map(c=>'<div class="lrow" data-ac="'+c.id+'" style="border-left-color:'+colorOf(c.id)+'"><div class="lt">'+tile({code:c.id},false)+'</div><div class="lx"><b>'+esc(c.n)+'</b><div class="mut s">'+subLine(c)+'</div></div></div>').join('')||'<div class="mut s">No cards found</div>';
    $('ares').querySelectorAll('[data-ac]').forEach(r=>r.onclick=()=>form(+r.dataset.ac))}}
function binderTools(){const s=S.bind.slots,pages=s.length/9,empty=s.slice(BPAGE*9,BPAGE*9+9).every(x=>!x),miss=D.filter(c=>PH[c.id]&&!bindHas(c.id)).length;
  showSheet('<h3>Binder tools</h3><div class="btns"><button id="t1">＋ Add empty page at end</button><button id="t2">Insert empty page after page '+(BPAGE+1)+'</button><button id="t3" '+(empty&&pages>1?'':'disabled')+'>Delete page '+(BPAGE+1)+(empty?'':' (must be empty)')+'</button><button id="t4">Tidy up — close empty gaps</button><button id="t5">Sort whole binder…</button><button id="t6" '+(miss?'':'disabled')+'>Add photographed cards not in binder ('+miss+')</button><button id="t7">📷 Card photos…</button><button data-close>Close</button></div>');
  const done=m=>{saveS();closeSheet();renderBinder();if(m)toast(m)};
  $('t1').onclick=()=>{s.push(...Array(9).fill(null));BPAGE=s.length/9-1;done()};
  $('t2').onclick=()=>{s.splice((BPAGE+1)*9,0,...Array(9).fill(null));BPAGE++;done()};
  $('t3').onclick=()=>{s.splice(BPAGE*9,9);padSlots();done('Page deleted')};
  $('t4').onclick=()=>{S.bind.slots=s.filter(Boolean);padSlots();BPAGE=0;done('Gaps closed')};
  $('t6').onclick=()=>{D.filter(c=>PH[c.id]&&!bindHas(c.id)).forEach(c=>addEntry(c.id,S.lastRar||'',''  ,1));done('Added')};
  $('t7').onclick=()=>photoMenu();
  $('t5').onclick=()=>{showSheet('<h3>Sort whole binder</h3><div class="sub">This rearranges every pocket and closes gaps. You can still move cards by hand afterwards.</div><div class="btns"><button data-so="name">By name</button><button data-so="type">By card type</button><button data-so="rarity">By rarity</button><button data-so="new">Newest first</button><button data-close>Cancel</button></div>');
    $('sheet').querySelectorAll('[data-so]').forEach(b=>b.onclick=()=>{const k=b.dataset.so,all=s.filter(Boolean),ro=[].concat(...RG.map(g=>g[1].map(r=>r[0]))),to=e=>{const c=byId(e.id);return c.cat==='Monster'?(c.ex?1:0):c.cat==='Spell'?2:3},nm2=e=>byId(e.id).nl;
      all.sort((a,b)=>k==='type'?to(a)-to(b)||nm2(a).localeCompare(nm2(b)):k==='rarity'?((b.r?ro.length-Math.max(0,ro.indexOf(b.r)):-1)-(a.r?ro.length-Math.max(0,ro.indexOf(a.r)):-1))||nm2(a).localeCompare(nm2(b)):k==='new'?(b.t||0)-(a.t||0):nm2(a).localeCompare(nm2(b)));
      S.bind.slots=all;padSlots();BPAGE=0;done('Sorted')})}}
