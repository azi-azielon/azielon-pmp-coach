const state={token:localStorage.getItem('az_token')||'',user:null,notes:[],diagrams:[],tricky:[],session:null,qIndex:0,reviewResults:null,reviewIndex:0,currentView:'',adminKind:'questions',zoom:1,hasAccess:false,paymentMode:'test',pendingTrial:false,tierCode:null,features:[],examKind:'mock',billing:null,practiceTimerHandle:null,examCatalog:[],examSession:null,examIndex:0,examTimerHandle:null,examReviewResults:null,examReviewIndex:0,examLock:false,studyStates:{},studySummary:null,noteIndex:0,noteMode:'study',diagramIndex:0,diagramMode:'study',trickyMode:'study',flashIndex:0,conceptReviewFilter:'all'};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
async function api(path,opts={}){const headers={'Content-Type':'application/json',...(opts.headers||{})};if(state.token)headers.Authorization=`Bearer ${state.token}`;const r=await fetch(path,{...opts,headers});let data={};try{data=await r.json()}catch{}if(!r.ok)throw new Error(data.detail||data.error||`Request failed (${r.status})`);return data}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[m]))}
function jsonText(v){return JSON.stringify(v??null,null,2)}
function generatedVisual(v){
  if(!v)return '';
  if(typeof v==='string'){try{v=JSON.parse(v)}catch{return `<pre class="visual-json">${escapeHtml(v)}</pre>`}}
  const d=v.data||{};
  if(v.asset){
    const src='/'+String(v.asset).replace(/^\/+/, '');
    return `<div class="generated-visual asset-visual"><img src="${escapeHtml(src)}" alt="${escapeHtml(v.alt||'Question exhibit')}" onerror="this.closest('.asset-visual').classList.add('asset-missing')"><div class="asset-fallback">${escapeHtml(v.alt||'Visual exhibit')}</div></div>`;
  }
  if(v.kind==='table'){
    return `<div class="generated-visual"><table class="visual-table"><thead><tr>${(v.columns||[]).map(x=>`<th>${escapeHtml(x)}</th>`).join('')}</tr></thead><tbody>${(v.rows||[]).map(r=>`<tr>${r.map(x=>`<td>${escapeHtml(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  if(v.kind==='network'){
    const nodes=v.nodes||{}, edges=v.edges||[];
    return `<div class="generated-visual network-visual"><div class="network-nodes">${Object.entries(nodes).map(([k,val])=>`<span class="network-node"><b>${escapeHtml(k)}</b><small>${escapeHtml(val)}d</small></span>`).join('')}</div><div class="network-edges">${edges.map(e=>`<span>${escapeHtml(e[0])} → ${escapeHtml(e[1])}</span>`).join('')}</div></div>`;
  }
  if(['bar','barh','line','control','cumulative-flow','kanban','role-map','workflow'].includes(v.kind)){
    const rows=[];
    if(d.labels&&d.values) d.labels.forEach((x,i)=>rows.push([x,d.values[i]]));
    else Object.entries(d).forEach(([k,val])=>{if(!Array.isArray(val)&&typeof val!=='object')rows.push([k,val])});
    const body=rows.length?`<table class="visual-table compact"><tbody>${rows.map(([k,val])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(val)}</td></tr>`).join('')}</tbody></table>`:`<pre class="visual-json">${escapeHtml(JSON.stringify(d,null,2))}</pre>`;
    return `<div class="generated-visual generated-data"><b>${escapeHtml((v.kind||'visual').replaceAll('-',' '))}</b>${body}</div>`;
  }
  return `<pre class="visual-json">${escapeHtml(JSON.stringify(v,null,2))}</pre>`;
}
function setAuth(msg=''){ $('#authMessage').textContent=msg; }
function storeAuth(data,opts={}){state.token=data.token;state.user=data.user;if(opts.pendingTrial)state.pendingTrial=true;localStorage.setItem('az_token',state.token);bootApp()}
$$('[data-auth-tab]').forEach(b=>b.onclick=()=>{$$('[data-auth-tab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#loginForm').classList.toggle('hidden',b.dataset.authTab!=='login');$('#registerForm').classList.toggle('hidden',b.dataset.authTab!=='register');setAuth('')});
$('#loginForm').onsubmit=async e=>{e.preventDefault();try{storeAuth(await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('#loginEmail').value,password:$('#loginPassword').value})}),{pendingTrial:state.pendingTrial})}catch(err){setAuth(err.message)}};
$('#registerForm').onsubmit=async e=>{e.preventDefault();try{storeAuth(await api('/api/auth/register',{method:'POST',body:JSON.stringify({name:$('#regName').value,email:$('#regEmail').value,password:$('#regPassword').value})}),{pendingTrial:true})}catch(err){setAuth(err.message)}};
$('#logoutBtn').onclick=()=>{localStorage.removeItem('az_token');location.reload()};
function hasFeature(name){return isStaff()||state.features.includes(name)}
function featureForView(id){return ({studyplan:'progress',notes:'notes',diagrams:'diagrams',tricky:'tricky',practice:'practice',review:'review',coach:'ai_coach',progress:'progress'})[id]||null}
function showView(id){
  if(state.examLock&&id!=='exams'){alert('A Real Mock exam is active. Submit or finish the exam before opening study content.');id='exams'}
  const needed=featureForView(id);
  if(needed&&!hasFeature(needed)){showView('billing');$('#billingMessage').textContent='This feature is not included in your current plan.';return}
  state.currentView=id;$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===id));$('#pageTitle').textContent=({dashboard:'My Learning',notes:'Topic Notes',diagrams:'Diagrams & Models',tricky:'Tricky Words',practice:'Practice',review:'Concepts to Review',coach:'AI Coach',progress:'My Progress',billing:'Plans & Billing',admin:'Instructor Studio',exams:(state.examKind==='mock'?'Full Mock Exams':'Concept Mastery Exams')})[id]||'Azielon';updateContentProtection(id);window.scrollTo({top:0,behavior:'smooth'});if(id==='progress'||id==='dashboard')loadProgress();if(id==='review')loadConceptReview();if(id==='billing')loadBilling();if(id==='admin')loadAdmin();if(id==='exams')loadExamCatalog();if(id==='practice'){loadPracticeAvailability();loadProgress()}}
$$('#nav button').forEach(b=>b.onclick=()=>{if(b.dataset.examKind)state.examKind=b.dataset.examKind;showView(b.dataset.view)});$$('[data-jump]').forEach(b=>b.onclick=()=>showView(b.dataset.jump));
if($('#createPractice'))$('#createPractice').onclick=createPracticeSession;
bindSmartPracticeBuilder();
async function boot(){try{await api('/api/health');$('#healthPill').textContent='Learning system ready'}catch{$('#healthPill').textContent='Server offline'}if(state.token){try{state.user=await api('/api/me');bootApp();return}catch{localStorage.removeItem('az_token');state.token=''}}$('#authGate').classList.remove('hidden')}
function isStaff(){return ['admin','instructor','content_editor','reviewer'].includes(state.user?.role)}
function isProtectedView(id=state.currentView){return ['notes','diagrams','tricky','practice','exams','review','coach'].includes(id)}
function updateContentProtection(id=state.currentView){
  const enabled=!!state.user&&!isStaff()&&state.hasAccess&&isProtectedView(id);
  document.body.classList.toggle('copy-protected',enabled);
  let wm=$('#contentWatermark');
  if(!wm){wm=document.createElement('div');wm.id='contentWatermark';wm.className='content-watermark hidden';document.body.appendChild(wm)}
  if(enabled){wm.textContent=`Licensed viewer: ${state.user.email}`;wm.classList.remove('hidden')}else wm.classList.add('hidden');
}
function protectedInteractionTarget(target){return !!target?.closest?.('#notes,#diagrams,#tricky,#practice,#exams,#review,#coach')&&!target.closest('input,textarea,select,button,[contenteditable="true"]')}
document.addEventListener('copy',e=>{if(document.body.classList.contains('copy-protected')&&protectedInteractionTarget(e.target)){e.preventDefault()}});
document.addEventListener('cut',e=>{if(document.body.classList.contains('copy-protected')&&protectedInteractionTarget(e.target)){e.preventDefault()}});
document.addEventListener('contextmenu',e=>{if(document.body.classList.contains('copy-protected')&&protectedInteractionTarget(e.target)){e.preventDefault()}});
document.addEventListener('dragstart',e=>{if(document.body.classList.contains('copy-protected')&&protectedInteractionTarget(e.target)){e.preventDefault()}});
document.addEventListener('keydown',e=>{if(!document.body.classList.contains('copy-protected'))return;const k=e.key.toLowerCase(),active=document.activeElement;if(active&&active.matches('input,textarea,select,[contenteditable="true"]'))return;if((e.ctrlKey||e.metaKey)&&['c','x','s','p','u'].includes(k))e.preventDefault()});
function applyAccessNavigation(){
  const all=['dashboard','notes','diagrams','tricky','practice','exams','review','coach','progress'];
  all.forEach(id=>{document.querySelectorAll(`#nav button[data-view="${id}"]`).forEach(b=>b.classList.remove('nav-locked'))});
  document.querySelectorAll('#nav button[data-feature]').forEach(b=>b.classList.toggle('nav-locked',!hasFeature(b.dataset.feature)));
  document.querySelectorAll('#nav button[data-view="notes"]').forEach(b=>b.classList.toggle('nav-locked',!hasFeature('notes')));
  document.querySelectorAll('#nav button[data-view="tricky"]').forEach(b=>b.classList.toggle('nav-locked',!hasFeature('tricky')));
  document.querySelectorAll('#nav button[data-view="practice"]').forEach(b=>b.classList.toggle('nav-locked',!hasFeature('practice')));
  document.querySelectorAll('#nav button[data-view="review"]').forEach(b=>b.classList.toggle('nav-locked',!hasFeature('review')));
  document.querySelectorAll('#nav button[data-view="progress"]').forEach(b=>b.classList.toggle('nav-locked',!hasFeature('progress')));
  document.querySelectorAll('#nav button[data-view="exams"]').forEach(b=>{
    const ok=b.dataset.examKind==='mock'?(hasFeature('mock1')||hasFeature('mock2')):(hasFeature('mastery3')||hasFeature('mastery4')||hasFeature('mastery5'));
    b.classList.toggle('nav-locked',!ok);
  });
  const billingBtn=document.querySelector('#nav button[data-view="billing"]');if(billingBtn)billingBtn.classList.remove('nav-locked');
  if(isStaff())$('#adminNav').classList.remove('hidden');
}
async function bootApp(){
  if(!state.user)state.user=await api('/api/me');
  $('#authGate').classList.add('hidden');$('#app').classList.remove('hidden');document.body.classList.remove('landing-active');
  $('#userBadge').textContent=`${state.user.name} · ${state.user.role}`;
  $('#avatar').textContent=state.user.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  const bm=await api('/api/billing/me');
  state.billing=bm;
  state.hasAccess=!!bm.has_access;state.paymentMode=bm.payment_mode||'test';state.tierCode=bm.tier_code||bm.entitlement?.tier_code||null;state.features=bm.features||[];
  applyAccessNavigation();updateContentProtection(state.currentView);
  await loadBilling(bm);
  if(state.hasAccess||isStaff()){
    await Promise.all([hasFeature('notes')?loadNotes():Promise.resolve(),hasFeature('diagrams')?loadDiagrams():Promise.resolve(),hasFeature('tricky')?loadTricky():Promise.resolve(),hasFeature('progress')?loadProgress():Promise.resolve()]);await loadStudySummary();await loadPracticeAvailability();
    showView(isStaff()?'admin':'dashboard');
  }else{
    showView('billing');
    $('#billingMessage').textContent='Your free account is active. Try the 5-question starter drill, then choose a plan when you are ready.';
    if(state.pendingTrial){
      state.pendingTrial=false;
      setTimeout(()=>openPublicTrial(),180);
    }
  }
}

let noteDomain='',diagramDomain='';
async function loadNotes(){state.notes=await api('/api/notes'+(noteDomain?`?domain=${encodeURIComponent(noteDomain)}`:''));renderNotes()}
function statusLabel(s){return ({not_started:'Not Studied',reviewed:'Reviewed',needs_review:'Needs Review',mastered:'Mastered'})[s]||'Not Studied'}
async function setStudyStatus(type,id,status){await api(`/api/study/items/${type}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({status})});await loadStudySummary();if(type==='note')await loadNotes();if(type==='diagram')await loadDiagrams();if(type==='tricky')await loadTricky()}
function studySelect(type,id,status){return `<select class="study-status-select" data-study-type="${type}" data-study-id="${escapeHtml(id)}"><option value="not_started" ${status==='not_started'?'selected':''}>Not Studied</option><option value="reviewed" ${status==='reviewed'?'selected':''}>Reviewed</option><option value="needs_review" ${status==='needs_review'?'selected':''}>Needs Review</option><option value="mastered" ${status==='mastered'?'selected':''}>Mastered</option></select>`}
function studyStatusBadge(status){return `<span class="study-status-badge status-${escapeHtml(status||'not_started')}">${escapeHtml(statusLabel(status||'not_started'))}</span>`}
function reviewToggleButton(id,status){const marked=status==='needs_review';return `<button id="${id}" class="secondary review-toggle ${marked?'is-marked':''}">${marked?'✓ Marked for Review':'Mark for Review'}</button>`}
async function toggleReviewMark(type,id,status){await setStudyStatus(type,id,status==='needs_review'?'not_started':'needs_review')}
function bindStudySelects(){$$('.study-status-select').forEach(x=>x.onchange=()=>setStudyStatus(x.dataset.studyType,x.dataset.studyId,x.value))}
function noteRows(){const q=($('#notesSearch')?.value||'').trim().toLowerCase();let rows=state.notes.filter(n=>(!noteDomain||n.domain===noteDomain)&&(!q||JSON.stringify(n).toLowerCase().includes(q)));if(state.noteMode==='study')rows=rows.filter(n=>['not_started','needs_review'].includes(n.studyStatus||'not_started'));if(state.noteMode==='needs_review')rows=rows.filter(n=>(n.studyStatus||'')==='needs_review');return rows}
function noteDetailHtml(n){return `<div class="note-study-body"><p class="note-summary">${escapeHtml(n.summary||'')}</p><div class="note-section-grid"><section><h4>Key rules</h4><ul>${(n.keyRules||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>—</li>'}</ul></section><section><h4>Trigger words</h4><p>${escapeHtml((n.triggerWords||[]).join(' · ')||'—')}</p></section><section class="note-do-first"><h4>What should the PM do first?</h4><p>${escapeHtml(n.doFirst||'—')}</p></section><section><h4>Tricky distinctions</h4><ul>${(n.trickyDistinctions||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>—</li>'}</ul></section><section class="note-traps"><h4>Exam traps</h4><ul>${(n.examTraps||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')||'<li>—</li>'}</ul></section><section class="note-memory"><h4>Memory / Flow</h4><p><b>${escapeHtml(n.flowOrMemory||'—')}</b></p></section></div></div>`}
function renderNotesBrowse(rows){$('#notesGrid').className='notes-grid';$('#notesGrid').innerHTML=rows.length?rows.map((n,i)=>`<article class="note-card browse-note"><div class="card-topline"><span class="pill">${escapeHtml(n.domain)}</span>${studySelect('note',n.id,n.studyStatus||'not_started')}</div><h3>${escapeHtml(n.title)}</h3><p class="summary">${escapeHtml(n.summary||'')}</p><button class="secondary" data-open-note="${i}">Study note</button></article>`).join(''):'<div class="panel empty-state"><h3>No notes match.</h3><p>Try another domain or search term.</p></div>';bindStudySelects();$$('[data-open-note]').forEach(b=>b.onclick=()=>{const n=rows[+b.dataset.openNote];state.noteMode='all';state.noteIndex=Math.max(0,state.notes.findIndex(x=>x.id===n.id));$$('[data-note-mode]').forEach(x=>x.classList.toggle('active',x.dataset.noteMode==='all'));$('#notesSearch').value='';noteDomain='';$('#noteDomainSelect').value='';renderNotesSingle([n],0,true)})}
function renderNotesSingle(rows,indexOverride=null,isolated=false){if(!rows.length){$('#notesGrid').className='notes-study-view';$('#notesGrid').innerHTML='<div class="panel empty-state"><h3>Nothing waiting in this view.</h3><p>Switch to Browse All or choose another domain.</p></div>';return}if(indexOverride!==null)state.noteIndex=indexOverride;state.noteIndex=Math.min(Math.max(0,state.noteIndex),rows.length-1);const n=rows[state.noteIndex],status=n.studyStatus||'not_started';$('#notesGrid').className='notes-study-view';$('#notesGrid').innerHTML=`<article class="note-viewer"><div class="note-view-head"><div><span class="eyebrow">${escapeHtml(n.domain||'PMP')} · ${isolated?'Selected note':`${state.noteIndex+1} of ${rows.length}`}</span><h3>${escapeHtml(n.title)}</h3></div>${studyStatusBadge(status)}</div>${noteDetailHtml(n)}<div class="note-nav"><button id="notePrev" class="secondary">‹ Previous</button>${reviewToggleButton('noteNeeds',status)}<button id="noteReviewed" class="secondary ${status==='reviewed'||status==='mastered'?'is-complete':''}">${status==='reviewed'||status==='mastered'?'✓ Reviewed':'Mark Reviewed'}</button><button id="noteNext" class="secondary">Next ›</button></div></article>`;$('#notePrev').disabled=isolated;$('#noteNext').disabled=isolated;$('#notePrev').onclick=()=>{state.noteIndex=(state.noteIndex-1+rows.length)%rows.length;renderNotes()};$('#noteNext').onclick=()=>{state.noteIndex=(state.noteIndex+1)%rows.length;renderNotes()};$('#noteNeeds').onclick=()=>toggleReviewMark('note',n.id,status);$('#noteReviewed').onclick=()=>setStudyStatus('note',n.id,'reviewed')}
function renderNotes(){const rows=noteRows();const allCount=state.notes.length,doneCount=state.notes.filter(n=>['reviewed','mastered'].includes(n.studyStatus||'not_started')).length,needCount=state.notes.filter(n=>(n.studyStatus||'')==='needs_review').length;const line=$('#notesProgressLine');if(line)line.innerHTML=`<span><b>${doneCount}/${allCount}</b> studied</span><span>${needCount} need review</span><span>${Math.max(0,allCount-doneCount-needCount)} not studied</span>`;if(state.noteMode==='all')renderNotesBrowse(rows);else renderNotesSingle(rows)}
$('#notesSearch').oninput=()=>{state.noteIndex=0;renderNotes()};$$('[data-note-mode]').forEach(b=>b.onclick=()=>{$$('[data-note-mode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.noteMode=b.dataset.noteMode;state.noteIndex=0;renderNotes()});$('#noteDomainSelect').onchange=e=>{noteDomain=e.target.value;state.noteIndex=0;loadNotes()};

async function loadDiagrams(){state.diagrams=await api('/api/diagrams');renderDiagrams()}
const protectedImageCache={};
function imgPath(d){let f=d.imageFile||d.image_file||'';return '/api/assets/diagrams/'+encodeURIComponent(f.split('/').pop())}
async function resolveProtectedImage(d){const key=d.imageFile||d.image_file||'';if(!key)return '';if(protectedImageCache[key])return protectedImageCache[key];const headers={};if(state.token)headers.Authorization=`Bearer ${state.token}`;const r=await fetch(imgPath(d),{headers});if(!r.ok)throw new Error(`Image request failed (${r.status})`);const blob=await r.blob();const u=URL.createObjectURL(blob);protectedImageCache[key]=u;return u}
function diagramRows(){let rows=state.diagrams.filter(d=>!diagramDomain||d.domain===diagramDomain);if(state.diagramMode==='study')rows=rows.filter(d=>['not_started','needs_review'].includes(d.studyStatus||'not_started'));if(state.diagramMode==='needs_review')rows=rows.filter(d=>(d.studyStatus||'')==='needs_review');return rows}
async function renderDiagrams(){const rows=diagramRows();if(!rows.length){$('#diagramGrid').innerHTML='<div class="panel empty-state"><h3>Nothing waiting in this view.</h3><p>Switch to Browse All or mark an item for review.</p></div>';return}state.diagramIndex=Math.min(state.diagramIndex,rows.length-1);const d=rows[state.diagramIndex],status=d.studyStatus||'not_started';$('#diagramGrid').innerHTML=`<article class="diagram-viewer"><div class="diagram-view-head"><div><span class="eyebrow">${escapeHtml(d.domain||'PMP')} · ${state.diagramIndex+1} of ${rows.length}</span><h3>${escapeHtml(d.title)}</h3></div>${studyStatusBadge(status)}</div><div class="diagram-stage"><div class="diagram-placeholder">Loading diagram…</div><img id="activeDiagramImage" alt="${escapeHtml(d.title)}"></div><div class="diagram-nav"><button id="diagramPrev" class="secondary">‹ Previous</button><button id="diagramFit" class="secondary">Fit</button><button id="diagramZoom" class="secondary">Zoom</button><button id="diagramFull" class="secondary">Full Screen</button>${reviewToggleButton('diagramNeeds',status)}<button id="diagramReviewed" class="secondary ${status==='reviewed'||status==='mastered'?'is-complete':''}">${status==='reviewed'||status==='mastered'?'✓ Reviewed':'Mark Reviewed'}</button>${state.diagramMode==='all'?'<button id="diagramNext" class="secondary">Next ›</button>':''}</div><div class="diagram-study-meta"><p>${escapeHtml(d.whyItMatters||d.whatItIs||'')}</p><p><b>Memory:</b> ${escapeHtml(d.memoryHook||'')}</p></div></article>`;try{const src=await resolveProtectedImage(d);const img=$('#activeDiagramImage');img.src=src;img.onload=()=>img.closest('.diagram-stage').querySelector('.diagram-placeholder')?.remove()}catch{$('.diagram-placeholder').textContent='Unable to load image'}$('#diagramPrev').onclick=()=>{state.diagramIndex=(state.diagramIndex-1+rows.length)%rows.length;renderDiagrams()};if($('#diagramNext'))$('#diagramNext').onclick=()=>{state.diagramIndex=(state.diagramIndex+1)%rows.length;renderDiagrams()};$('#diagramNeeds').onclick=()=>toggleReviewMark('diagram',d.id,status);$('#diagramReviewed').onclick=()=>setStudyStatus('diagram',d.id,'reviewed');$('#diagramZoom').onclick=async()=>openZoom(d.title,`<img class="zoom-image" src="${await resolveProtectedImage(d)}" alt="${escapeHtml(d.title)}">`);$('#diagramFit').onclick=()=>{$('#activeDiagramImage').style.transform='';$('#activeDiagramImage').style.maxHeight='100%'};$('#diagramFull').onclick=()=>$('#diagramGrid .diagram-stage')?.requestFullscreen?.()}
$$('[data-diagram-mode]').forEach(b=>b.onclick=()=>{$$('[data-diagram-mode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.diagramMode=b.dataset.diagramMode;state.diagramIndex=0;renderDiagrams()});$('#diagramDomainSelect').onchange=e=>{diagramDomain=e.target.value;state.diagramIndex=0;renderDiagrams()};
async function loadTricky(){state.tricky=await api('/api/tricky-words');renderTricky()}
function flashcardRows(){return state.tricky.slice().sort((a,b)=>{const ad=a.nextDueAt?new Date(a.nextDueAt).getTime():0,bd=b.nextDueAt?new Date(b.nextDueAt).getTime():0;return ad-bd})}
async function rateFlashcard(id,rating){const labels={again:'Added to review again',hard:'Marked for review',got_it:'Marked as known'};await api(`/api/study/flashcards/${encodeURIComponent(id)}/review`,{method:'POST',body:JSON.stringify({rating})});const msg=$('#flashRatingMsg');if(msg)msg.textContent=labels[rating]||'Saved';await loadStudySummary();await loadTricky();if(state.trickyMode==='flashcards'&&rating!=='again'){const rows=flashcardRows();if(rows.length){state.flashIndex=Math.min(state.flashIndex,rows.length-1);renderTricky()}}}
function trickyRows(){const q=($('#trickySearch')?.value||'').toLowerCase();let rows=state.tricky.filter(t=>!q||JSON.stringify(t).toLowerCase().includes(q));if(state.trickyMode==='study')rows=rows.filter(t=>['not_started','needs_review'].includes(t.studyStatus||'not_started'));if(state.trickyMode==='needs_review')rows=rows.filter(t=>(t.studyStatus||'')==='needs_review');return rows}
function trickyGuideHtml(t){return `<div class="tricky-guide-sections"><section class="tricky-what"><h4>What it is</h4><div class="tricky-definition-grid"><div><b>${escapeHtml(t.left)}</b><p>${escapeHtml(t.leftMeaning||'')}</p></div><div><b>${escapeHtml(t.right)}</b><p>${escapeHtml(t.rightMeaning||'')}</p></div></div></section><section><h4>Why it matters</h4><p>${escapeHtml(t.hook||'')}</p></section><section><h4>How to read it</h4><p>Identify which side of the distinction the scenario describes, then use the definitions above to eliminate the look-alike answer.</p></section><section class="tricky-trap"><h4>Common exam trap</h4><p>${escapeHtml(t.trap||'')}</p></section><section class="tricky-memory"><h4>Memory hook</h4><p><b>${escapeHtml(t.memory||'')}</b></p></section></div>`}
function renderTricky(){let rows=trickyRows();if(state.trickyMode==='flashcards'){rows=flashcardRows();if(!rows.length){$('#trickyGrid').innerHTML='<p>No flashcards available.</p>';return}state.flashIndex=Math.min(state.flashIndex,rows.length-1);const t=rows[state.flashIndex];$('#trickyGrid').className='tricky-grid';$('#trickyGrid').innerHTML=`<article class="flashcard"><div class="flash-top"><span class="eyebrow">Card ${state.flashIndex+1} of ${rows.length}</span>${studyStatusBadge(t.studyStatus||'not_started')}</div><div class="flash-front"><h3>${escapeHtml(t.left)} <span>vs.</span> ${escapeHtml(t.right)}</h3><p>${escapeHtml(t.hook||'')}</p><button id="revealFlash" class="primary">Reveal answer</button></div><div id="flashBack" class="flash-back hidden"><div class="flash-compare"><div><b>${escapeHtml(t.left)}</b><p>${escapeHtml(t.leftMeaning||'')}</p></div><div><b>${escapeHtml(t.right)}</b><p>${escapeHtml(t.rightMeaning||'')}</p></div></div><div class="trap"><b>Exam trap:</b> ${escapeHtml(t.trap||'')}</div><div class="memory"><b>${escapeHtml(t.memory||'')}</b></div><div class="flash-ratings"><button data-rating="again" class="secondary">Review Again</button><button data-rating="hard" class="secondary">Needs Review</button><button data-rating="got_it" class="primary">Know It</button></div><div id="flashRatingMsg" class="flash-rating-msg"></div></div><div class="diagram-nav"><button id="flashPrev" class="secondary">‹ Previous</button><button id="flashNext" class="secondary">Next ›</button></div></article>`;$('#revealFlash').onclick=()=>$('#flashBack').classList.remove('hidden');$$('[data-rating]').forEach(b=>b.onclick=()=>rateFlashcard(t.id,b.dataset.rating));$('#flashPrev').onclick=()=>{state.flashIndex=(state.flashIndex-1+rows.length)%rows.length;renderTricky()};$('#flashNext').onclick=()=>{state.flashIndex=(state.flashIndex+1)%rows.length;renderTricky()};return}if(state.trickyMode==='all'){$('#trickyGrid').className='tricky-grid';$('#trickyGrid').innerHTML=rows.length?rows.map(t=>`<article class="tricky-card study-guide-card"><div class="card-topline">${studyStatusBadge(t.studyStatus||'not_started')}</div><div class="vs"><div class="term">${escapeHtml(t.left)}</div><div class="vsmark">VS</div><div class="term">${escapeHtml(t.right)}</div></div>${trickyGuideHtml(t)}</article>`).join(''):'<p>No matching terms.</p>';return}if(!rows.length){$('#trickyGrid').innerHTML='<div class="panel empty-state"><h3>Nothing in this view.</h3><p>Switch to Browse All, Study View, or Flashcards.</p></div>';return}state.flashIndex=Math.min(state.flashIndex,rows.length-1);const t=rows[state.flashIndex],status=t.studyStatus||'not_started';$('#trickyGrid').className='notes-study-view';$('#trickyGrid').innerHTML=`<article class="note-viewer tricky-study-viewer"><div class="note-view-head"><div><span class="eyebrow">Pair ${state.flashIndex+1} of ${rows.length}</span><h3>${escapeHtml(t.left)} <span class="vs-inline">vs.</span> ${escapeHtml(t.right)}</h3></div>${studyStatusBadge(status)}</div>${trickyGuideHtml(t)}<div class="note-nav"><button id="trickyPrev" class="secondary">‹ Previous</button>${reviewToggleButton('trickyNeeds',status)}<button id="trickyReviewed" class="secondary ${status==='reviewed'||status==='mastered'?'is-complete':''}">${status==='reviewed'||status==='mastered'?'✓ Reviewed':'Mark Reviewed'}</button><button id="trickyNext" class="secondary">Next ›</button></div></article>`;$('#trickyPrev').onclick=()=>{state.flashIndex=(state.flashIndex-1+rows.length)%rows.length;renderTricky()};$('#trickyNext').onclick=()=>{state.flashIndex=(state.flashIndex+1)%rows.length;renderTricky()};$('#trickyNeeds').onclick=()=>toggleReviewMark('tricky',t.id,status);$('#trickyReviewed').onclick=()=>setStudyStatus('tricky',t.id,'reviewed')}
$('#trickySearch').oninput=()=>{state.flashIndex=0;renderTricky()};$$('[data-tricky-mode]').forEach(b=>b.onclick=()=>{$$('[data-tricky-mode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.trickyMode=b.dataset.trickyMode;state.flashIndex=0;renderTricky()});

function renderVisual(v){if(!v)return'';const inner=generatedVisual(v);return `<div class="q-visual visual-stage"><div class="visual-head"><span>Exhibit</span><button class="secondary zoom-question">↗ Zoom</button></div><div class="visual-content">${inner}</div>${v.alt?`<p class="visual-caption">${escapeHtml(v.alt)}</p>`:''}</div>`}
const practiceOptionCatalog={
  domain:[['People','People'],['Process','Process'],['Business Environment','Business Environment']],
  approach:[['Predictive','Predictive'],['Agile','Agile'],['Hybrid','Hybrid']],
  type:[['single','Single answer'],['multiple','Multiple response'],['matching','Matching'],['ordering','Ordering'],['numeric','Numeric']]
};
let practiceFacetBusy=false;
function practiceFacetQuery(){
  const q=new URLSearchParams();
  const d=$('#pDomain')?.value,a=$('#pApproach')?.value,t=$('#pType')?.value;
  if(d)q.set('domain',d); if(a)q.set('delivery_approach',a); if(t)q.set('question_type',t);
  if($('#pDiagram')?.checked)q.set('diagram_only','true');
  const rf=$('#pReviewFocus')?.value;if(rf)q.set('review_focus',rf);
  return q.toString();
}
function rebuildPracticeSelect(id,mixedLabel,catalog,counts){
  const el=$(id); if(!el)return false;
  const previous=el.value;
  const available=catalog.filter(([value])=>(counts?.[value]||0)>0);
  el.innerHTML=`<option value="">${escapeHtml(mixedLabel)}</option>`+available.map(([value,label])=>`<option value="${escapeHtml(value)}">${escapeHtml(label)} (${counts[value]})</option>`).join('');
  const stillAvailable=previous===''||available.some(([value])=>value===previous);
  el.value=stillAvailable?previous:'';
  return !stillAvailable;
}
function setSmartToggle(id,count,label){
  const box=$(id); if(!box)return false;
  const wrapper=box.closest('label');
  const wasChecked=box.checked;
  const available=(count||0)>0;
  box.disabled=!available;
  if(!available)box.checked=false;
  if(wrapper){
    wrapper.classList.toggle('smart-disabled',!available);
    wrapper.title=available?`${count} ${label} available`:`No ${label} match the current selections`;
  }
  return wasChecked&&!available;
}
async function loadPracticeAvailability(retry=true){
  const el=$('#practiceAvailability'); if(!el||!state.token||!hasFeature('practice')||practiceFacetBusy)return;
  practiceFacetBusy=true;
  try{
    const query=practiceFacetQuery();
    const a=await api('/api/practice/availability'+(query?'?'+query:''));
    let changed=false;
    changed=rebuildPracticeSelect('#pDomain','All domains',practiceOptionCatalog.domain,a.by_domain||{})||changed;
    changed=rebuildPracticeSelect('#pApproach','All approaches',practiceOptionCatalog.approach,a.by_approach||{})||changed;
    changed=rebuildPracticeSelect('#pType','All question types',practiceOptionCatalog.type,a.by_type||{})||changed;
    changed=setSmartToggle('#pDiagram',a.visual_count,'visual questions')||changed;
    changed=rebuildPracticeSelect('#pReviewFocus','All questions',[["incorrect_now","Incorrect now"],["last_session_incorrect","Incorrect from last session"],["ever_missed","Missed at least once"],["bookmarked","Bookmarked"]],a.review_focus_counts||{})||changed;

    const count=$('#pCount');
    if(count){
      count.max=Math.max(1,a.total||1);
      if(a.total>0&&Number(count.value)>a.total)count.value=a.total;
    }
    const btn=$('#createPractice');
    if(btn){btn.disabled=a.total===0;btn.title=a.total===0?'No questions match the current selections':''}
    el.classList.toggle('zero',a.total===0);
    el.innerHTML=a.total>0
      ? `<strong>${a.total}</strong> question${a.total===1?'':'s'} available with these selections <span>· unavailable choices are hidden automatically</span>`
      : `<strong>No questions available.</strong> An incompatible selection was removed automatically.`;

    practiceFacetBusy=false;
    if(changed&&retry){await loadPracticeAvailability(false)}
  }catch(err){
    practiceFacetBusy=false;
    el.textContent='Unable to load question availability.';
  }
}
function bindSmartPracticeBuilder(){
  ['#pDomain','#pApproach','#pType'].forEach(id=>{const el=$(id);if(el)el.addEventListener('change',()=>loadPracticeAvailability())});
  ['#pDiagram'].forEach(id=>{const el=$(id);if(el)el.addEventListener('change',()=>loadPracticeAvailability())});const rf=$('#pReviewFocus');if(rf)rf.addEventListener('change',()=>loadPracticeAvailability());
}
async function createPracticeSession(){
  const btn=$('#createPractice');
  if(!btn)return;
  const count=Math.max(1,Math.min(180,Number($('#pCount').value||5)));
  const timerRaw=$('#pTimer').value.trim();
  const payload={
    count,
    domain:$('#pDomain').value||null,
    delivery_approach:$('#pApproach').value||null,
    question_type:$('#pType').value||null,
    diagram_only:$('#pDiagram').checked,
    review_focus:$('#pReviewFocus').value||null,
    feedback_mode:$('#pFeedback').value||'immediate',
    timer_minutes:timerRaw?Number(timerRaw):null
  };
  $('#practiceMessage').textContent='';
  btn.disabled=true; const oldText=btn.textContent; btn.textContent='Building session…';
  try{
    const r=await api('/api/practice/sessions',{method:'POST',body:JSON.stringify(payload)});
    state.session=r; state.qIndex=0; state.reviewResults=null; state.reviewIndex=0;
    $('#sessionArea').classList.remove('hidden');
    renderQuestion(); startPracticeTimer();
    $('#sessionArea').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){
    $('#practiceMessage').textContent=err.message;
    state.session=null;
  }finally{btn.disabled=false;btn.textContent=oldText}
}
function answerArea(q){const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ';if(q.type==='matching'){return `<div class="matching-grid">${(q.left_items||[]).map((l,i)=>`<div class="matching-row" data-left-id="${escapeHtml(l.id)}"><div><span class="option-letter">${i+1}</span>${escapeHtml(l.text)}</div><select class="match-select"><option value="">Choose…</option>${(q.options||[]).map(o=>`<option value="${escapeHtml(o.id)}">${escapeHtml(o.text)}</option>`).join('')}</select></div>`).join('')}</div>`}if(q.type==='numeric'){return `<div class="numeric-answer"><label>Your answer</label><input id="numericAnswer" type="number" step="any" placeholder="Enter a number"></div>`}return `<div class="options">${(q.options||[]).map((o,i)=>`<button class="option" data-id="${escapeHtml(o.id)}"><span class="option-letter">${letters[i]}</span><span>${escapeHtml(o.text)}</span></button>`).join('')}</div>`}
function currentQuestion(){return state.session?.question||null}
function renderQuestion(){const q=currentQuestion();if(!q){renderSessionComplete();return}$('#sessionProgress').textContent=`Question ${state.qIndex+1} of ${state.session.total}`;$('#questionCard').innerHTML=`<div class="question-meta"><span class="pill">${escapeHtml(q.domain||'PMP')}</span><span class="pill">${escapeHtml(q.delivery_approach||'Mixed')}</span><span class="pill">${escapeHtml(q.type||'single')}</span>${q.visual?'<span class="pill">Visual</span>':''}</div><div class="question-stem">${escapeHtml(q.stem)}</div>${renderVisual(q.visual)}${answerArea(q)}<div id="feedback"></div><div class="question-actions"><button id="bookmarkCurrent" class="secondary">☆ Bookmark</button><button id="submitCurrent" class="primary">Submit</button><button id="nextCurrent" class="primary hidden">Next</button></div>`;$$('.option').forEach(b=>b.onclick=()=>{if(q.type==='multiple'){b.classList.toggle('selected')}else{$$('.option').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')}});const zb=$('.zoom-question');if(zb)zb.onclick=()=>openZoom('Question exhibit',generatedVisual(q.visual));$('#bookmarkCurrent').onclick=async()=>{const r=await api(`/api/bookmarks/${q.id}`,{method:'POST'});$('#bookmarkCurrent').textContent=r.bookmarked?'★ Bookmarked':'☆ Bookmark'};$('#submitCurrent').onclick=()=>submitCurrent(q);$('#nextCurrent').onclick=advanceQuestion}
async function advanceQuestion(){if(!state.session)return;const next=state.qIndex+1;if(next>=state.session.total){await renderSessionComplete();return}try{const r=await api(`/api/practice/sessions/${state.session.session_id}/questions/${next}`);state.qIndex=next;state.session.question=r.question;$('#practiceMessage').textContent='';renderQuestion()}catch(err){$('#practiceMessage').textContent=err.message}}
function immediateFeedback(q,r){if(q.type==='matching'){$$('.matching-row').forEach(row=>{const sel=row.querySelector('select');row.classList.toggle('correct',r.correct_pairs?.[row.dataset.leftId]===sel.value);row.classList.toggle('wrong',r.correct_pairs?.[row.dataset.leftId]!==sel.value);sel.disabled=true})}else if(q.type==='numeric'){$('#numericAnswer').disabled=true}else{$$('.option').forEach(o=>{if((r.correct_option_ids||[]).includes(o.dataset.id))o.classList.add('correct');else if(o.classList.contains('selected'))o.classList.add('wrong')})}const e=r.explanation||{};let correctLine='';if(q.type==='matching')correctLine=e.correctAnswer?`<p><strong>Correct matching:</strong> ${escapeHtml(e.correctAnswer)}</p>`:'';if(q.type==='numeric')correctLine=`<p><strong>Expected:</strong> ${escapeHtml(r.correct_numeric_value)} ${escapeHtml(r.numeric_unit||'')}</p>`;$('#feedback').innerHTML=`<div class="feedback"><b>${r.is_correct?'Correct':'Review the reasoning'}</b>${correctLine}<p>${escapeHtml(e.plainLanguageRationale||e.correctAnswer||'')}</p><p><strong>Principle:</strong> ${escapeHtml(e.underlyingPrinciple||'')}</p></div>`}
async function submitCurrent(q){let payload={session_id:state.session.session_id,question_id:q.id,selected_option_ids:[]};if(q.type==='matching'){const pairs={};let missing=false;$$('.matching-row').forEach(r=>{const v=r.querySelector('select').value;if(!v)missing=true;pairs[r.dataset.leftId]=v});if(missing){$('#practiceMessage').textContent='Complete every match before submitting.';return}payload.matching_pairs=pairs}else if(q.type==='numeric'){const v=$('#numericAnswer').value;if(v===''){$('#practiceMessage').textContent='Enter a numeric answer before submitting.';return}payload.numeric_value=Number(v)}else{payload.selected_option_ids=$$('.option.selected').map(x=>x.dataset.id);if(!payload.selected_option_ids.length){$('#practiceMessage').textContent='Select an answer before submitting.';return}}try{const r=await api('/api/practice/attempts',{method:'POST',body:JSON.stringify(payload)});$('#submitCurrent').classList.add('hidden');$('#nextCurrent').classList.remove('hidden');if(state.session.feedback_mode==='end'){$('#feedback').innerHTML='<div class="feedback neutral"><b>Answer saved.</b><p>Your correct answer and explanation will be available after you finish the session.</p></div>'}else immediateFeedback(q,r);$('#practiceMessage').textContent='';loadProgress()}catch(err){$('#practiceMessage').textContent=err.message}}
async function renderSessionComplete(){if(!state.session)return;clearPracticeTimer();if(state.session.feedback_mode==='end'){try{const r=await api(`/api/practice/sessions/${state.session.session_id}/results`);state.reviewResults=r;state.reviewIndex=0;$('#sessionProgress').textContent='Session complete';$('#questionCard').innerHTML=`<div class="session-summary"><h3>Session complete</h3><p><strong>${r.correct} of ${r.total}</strong> correct · ${r.accuracy==null?'—':r.accuracy+'%'}</p><p>Your answers are now available for review, one question at a time.</p><button id="reviewAnswers" class="primary">Review answers</button><button class="secondary" onclick="showView('progress')">View progress</button></div>`;$('#reviewAnswers').onclick=renderEndReview;return}catch(err){$('#practiceMessage').textContent=err.message;return}}$('#sessionProgress').textContent='Session complete';$('#questionCard').innerHTML='<h3>Session complete</h3><p>Your attempts have been stored.</p><button class="primary" onclick="showView(\'progress\')">View progress</button>'}
function selectedText(q,id){return (q.options||[]).find(o=>o.id===id)?.text||id||'—'}
function reviewAnswerArea(item){const q=item.question,a=item.answer||{},sel=item.selected||{};if(q.type==='matching'){const correct=Object.fromEntries((a.pairs||[]).map(p=>[p.leftId,p.rightId]));const submitted=sel.matching_pairs||{};return `<div class="review-matching">${(q.left_items||[]).map(l=>`<div class="review-pair"><b>${escapeHtml(l.text)}</b><span>Your answer: ${escapeHtml(selectedText(q,submitted[l.id]))}</span><span>Correct: ${escapeHtml(selectedText(q,correct[l.id]))}</span></div>`).join('')}</div>`}if(q.type==='numeric')return `<div class="review-answer"><p><b>Your answer:</b> ${escapeHtml(sel.numeric_value)}</p><p><b>Expected:</b> ${escapeHtml(a.value)} ${escapeHtml(a.unit||'')}</p></div>`;const correct=new Set(a.correctOptionIds||[]),chosen=new Set(sel.selected_option_ids||[]);return `<div class="options review-options">${(q.options||[]).map((o,i)=>`<div class="option ${correct.has(o.id)?'correct':''} ${chosen.has(o.id)&&!correct.has(o.id)?'wrong':''}"><span class="option-letter">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i]}</span><span>${escapeHtml(o.text)}${chosen.has(o.id)?' <em>— your choice</em>':''}${correct.has(o.id)?' <strong>— correct</strong>':''}</span></div>`).join('')}</div>`}
function renderEndReview(){const pack=state.reviewResults,item=pack?.results?.[state.reviewIndex];if(!item)return;const q=item.question,e=item.explanation||{};$('#sessionProgress').textContent=`Answer review ${state.reviewIndex+1} of ${pack.total}`;$('#questionCard').innerHTML=`<div class="question-meta"><span class="pill">${item.is_correct?'Correct':'Incorrect'}</span><span class="pill">${escapeHtml(q.domain||'PMP')}</span></div><div class="question-stem">${escapeHtml(q.stem)}</div>${renderVisual(q.visual)}${reviewAnswerArea(item)}<div class="feedback"><p>${escapeHtml(e.plainLanguageRationale||e.correctAnswer||'')}</p><p><strong>Principle:</strong> ${escapeHtml(e.underlyingPrinciple||'')}</p></div><div class="question-actions"><button id="reviewPrev" class="secondary" ${state.reviewIndex===0?'disabled':''}>Previous</button><button id="reviewNext" class="primary">${state.reviewIndex+1>=pack.total?'Finish review':'Next answer'}</button></div>`;const zb=$('.zoom-question');if(zb)zb.onclick=()=>openZoom('Question exhibit',generatedVisual(q.visual));$('#reviewPrev').onclick=()=>{if(state.reviewIndex>0){state.reviewIndex--;renderEndReview()}};$('#reviewNext').onclick=()=>{if(state.reviewIndex+1<pack.total){state.reviewIndex++;renderEndReview()}else showView('progress')}}

async function loadStudySummary(){if(!state.token||!state.hasAccess)return;try{state.studySummary=await api('/api/study/summary');renderContinueLearning();renderLearningDashboard(state.lastProgress||null)}catch(e){}}
function groupRow(label,key,action){const g=state.studySummary?.groups?.[key]||{total:0,complete:0,pct:0};return `<div class="study-row"><button class="study-check ${g.pct===100?'done':''}" data-study-jump="${action}">${g.pct===100?'✓':'○'}</button><div class="study-row-main"><div><b>${label}</b><span>${g.complete} / ${g.total}</span></div><div class="mini-track"><i style="width:${g.pct}%"></i></div></div><b class="study-pct">${g.pct}%</b></div>`}
function pctText(x){return `${Math.round(x||0)}%`}
function learningCard(title,key,view,summary,extra=''){
  const x=summary||{total:0,complete:0,pct:0};
  const done=x.total>0&&x.complete>=x.total;
  return `<article class="learning-check-card" data-learning-key="${escapeHtml(key)}"><div class="learning-check-top"><span class="learning-checkmark ${done?'done':''}">${done?'✓':'○'}</span><div><h4>${escapeHtml(title)}</h4><p>${x.complete||0} of ${x.total||0} complete${extra?` · ${escapeHtml(extra)}`:''}</p></div><b>${pctText(x.pct)}</b></div><div class="mini-track"><i style="width:${Math.min(100,x.pct||0)}%"></i></div><button class="text-btn" data-learning-jump="${view}">${done?'Review':'Continue'} →</button></article>`
}
function learningPathIcon(key){
  const icons={
    notes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22V5.5Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22V5.5Z"/></svg>',
    diagrams:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="17" r="2.2"/><circle cx="19" cy="17" r="2.2"/><path d="M10.9 6.9 6.1 15M13.1 6.9l4.8 8.1M7.3 17h9.4"/></svg>',
    tricky:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5v14M4 9h6M14 6l5 12M19 6l-5 12"/></svg>',
    practice:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h5l10-10-5-5L4 14v5Z"/><path d="m12.5 5.5 5 5M4 14l5 5"/></svg>',
    mock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8l1 3h3v13H4V7h3l1-3Z"/><path d="M9 12h6M9 16h4"/><path d="m16 16 1.5 1.5L20 15"/></svg>',
    mastery:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.3 4.7 5.2.8-3.8 3.7.9 5.3-4.6-2.5-4.6 2.5.9-5.3-3.8-3.7 5.2-.8L12 3Z"/></svg>'
  };
  return icons[key]||icons.practice;
}
function learningDots(pct){
  const p=Math.max(0,Math.min(100,Number(pct)||0));
  return Array.from({length:5},(_,i)=>{
    const start=i*20,fill=Math.max(0,Math.min(100,(p-start)*5));
    return `<span class="journey-dot ${fill>=100?'filled':fill>0?'partial':''}" style="--dot-fill:${fill}%" title="${Math.min((i+1)*20,100)}% milestone"></span>`
  }).join('');
}
function workflowStep(label,pct,view,index,key){
  const p=Math.round(Number(pct)||0),done=p>=100;
  const palettes=['navy','teal','mint','violet','gold','blue'];
  const tone=palettes[(index-1)%palettes.length];
  return `<button class="journey-stage tone-${tone} ${done?'is-complete':''}" data-learning-jump="${view}" data-learning-key="${key}" aria-label="${escapeHtml(label)}, ${p}% complete"><span class="journey-node">${learningPathIcon(key)}${done?'<i class="journey-check">✓</i>':''}</span><span class="journey-label">${escapeHtml(label)}</span><span class="journey-dots">${learningDots(p)}</span><span class="journey-percent">${p}%</span></button>`
}
function renderLearningDashboard(p){
  if(!$('#learningWorkflow')||!state.studySummary)return;
  const g=state.studySummary.groups||{}; p=p||state.lastProgress||{};
  const tier=state.tierCode||state.billing?.tier_code||state.billing?.entitlement?.tier_code||'full';
  const practice={total:p.practice_bank_total||0,complete:p.practice_unique_attempted||0,pct:p.practice_coverage||0};
  const cards=p.exam_cards||[];
  const mockRows=cards.filter(x=>x.kind==='mock'), masteryRows=cards.filter(x=>x.kind==='mastery');
  const mock={total:mockRows.length,complete:mockRows.filter(x=>x.completed).length}; mock.pct=mock.total?Math.round(mock.complete/mock.total*100):0;
  const mastery={total:masteryRows.length,complete:masteryRows.filter(x=>x.completed).length}; mastery.pct=mastery.total?Math.round(mastery.complete/mastery.total*100):0;
  const defs={
    notes:['Topic Notes','notes',g.notes||{}],diagrams:['Diagrams & Models','diagrams',g.diagrams||{}],tricky:['Tricky Words','tricky',g.tricky||{}],practice:['Practice Questions','practice',practice],mock:['Full Mock Exams','exams',mock],mastery:['Concept Mastery Exams','exams',mastery]
  };
  let keys=tier==='drills'?['practice','mock']:tier==='concept'?['notes','tricky','mastery']:['notes','diagrams','tricky','practice','mock','mastery'];
  keys=keys.filter(k=>(defs[k][2].total||0)>0);
  const avg=keys.length?Math.round(keys.reduce((a,k)=>a+(defs[k][2].pct||0),0)/keys.length):0;
  $('#learningOverallPct').textContent=avg+'%';
  $('#learningPlanTitle').textContent='Your Learning Path';
  $('#learningWorkflow').innerHTML=keys.map((k,i)=>workflowStep(defs[k][0],defs[k][2].pct,defs[k][1],i+1,k)).join('<span class="journey-connector" aria-hidden="true"><i>›</i></span>');
  $('#learningChecklist').innerHTML=keys.map(k=>learningCard(defs[k][0],k,defs[k][1],defs[k][2])).join('');
  $$('[data-learning-jump]').forEach(b=>b.onclick=()=>{const v=b.dataset.learningJump;if(v==='exams'){const key=b.dataset.learningKey||b.closest('.learning-check-card')?.dataset.learningKey||'';state.examKind=key==='mastery'||b.textContent.includes('Concept')?'mastery':'mock'}showView(v)});
}

function renderContinueLearning(){if(!$('#continueTitle')||!state.studySummary)return;const n=state.studySummary.next_item;if(!n){$('#continueTitle').textContent='You are caught up';$('#continueMeta').textContent='Review weak areas or start a practice session.';$('#continueBtn').textContent='Practice';$('#continueBtn').onclick=()=>showView('practice');return}$('#continueTitle').textContent=n.title;$('#continueMeta').textContent=`Next ${n.status==='needs_review'?'review':'unstudied'} ${n.content_type}`;$('#continueBtn').textContent='Continue';$('#continueBtn').onclick=()=>{if(n.content_type==='diagram'){state.diagramMode='study';state.diagramIndex=0;showView('diagrams')}else if(n.content_type==='tricky'){state.trickyMode='flashcards';showView('tricky')}else showView('notes')}}
function renderPracticeProgress(p){
  if(!p)return;
  const unique=Number(p.practice_unique_attempted||0),bank=Number(p.practice_bank_total||0),coverage=Number(p.practice_coverage||0);
  const attempts=Number(p.practice_answered||0),correct=Number(p.practice_correct||0),missed=Number(p.practice_unique_missed||0);
  const txt=$('#practiceCoverageText');if(txt)txt.textContent=bank?`${unique} / ${bank} practiced`:`${unique} practiced`;
  const bar=$('#practiceCoverageBar');if(bar)bar.style.width=`${Math.max(0,Math.min(100,coverage))}%`;
  const a=$('#practiceAttempts');if(a)a.textContent=attempts;
  const c=$('#practiceCorrect');if(c)c.textContent=correct;
  const ac=$('#practiceAccuracy');if(ac)ac.textContent=p.practice_accuracy==null?'—':`${p.practice_accuracy}%`;
  const m=$('#practiceMissed');if(m)m.textContent=missed;
}
function fmtAccessDate(value){
  if(!value)return '—';
  const normalized=/Z$|[+-]\d\d:\d\d$/.test(value)?value:value+'Z';
  const d=new Date(normalized);
  return Number.isNaN(d.getTime())?value:d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
}
function planLabel(tier){
  return ({drills:'Drills + Simulator',concept:'Concept + Exam',full:'Premium / Full Access'})[tier]||tier||'No active plan';
}
function renderProgressPlan(bm){
  const e=bm?.entitlement;
  if(isStaff()){
    $('#progressPlanName').textContent='Staff / Instructor Access';
    $('#progressPlanDetail').textContent='Administrative access does not expire with a learner subscription.';
    return;
  }
  if(!e){
    $('#progressPlanName').textContent='No active plan';
    $('#progressPlanDetail').textContent='Choose a plan to unlock learner content.';
    return;
  }
  const name=e.plan_name||planLabel(e.tier_code);
  $('#progressPlanName').textContent=name;
  const end=e.ends_at?new Date((/Z$|[+-]\d\d:\d\d$/.test(e.ends_at)?e.ends_at:e.ends_at+'Z')):null;
  const days=end&&!Number.isNaN(end.getTime())?Math.max(0,Math.ceil((end-Date.now())/86400000)):null;
  $('#progressPlanDetail').textContent=`${planLabel(e.tier_code)} · Active through ${fmtAccessDate(e.ends_at)}${days!=null?` · ${days} day${days===1?'':'s'} remaining`:''}`;
}
function examStatusLabel(x){if(x.completed)return x.result==='PASS'?'✓ PASS':'! BELOW BENCHMARK';if(x.status==='paused')return 'Ⅱ PAUSED';if(x.status==='active')return '• IN PROGRESS';return '○ NOT STARTED'}
function examActionLabel(x){if(x.completed)return 'View report';if(x.status==='paused'||x.status==='active')return 'Resume exam';return 'Start exam'}
async function openExamFromProgress(code,sessionId,status){state.examKind=String(code||'').startsWith('mock')?'mock':'mastery';showView('exams');await loadExamCatalog();if(sessionId&&(status==='active'||status==='paused')){const card=state.examCatalog.find(x=>x.code===code);if(card?.active_session)await resumeExam(card.active_session)}else if(sessionId&&(status==='submitted'||status==='expired')){state.examSession={session_id:sessionId};await showExamResults()}}
window.openExamFromProgress=openExamFromProgress;
async function loadProgress(){if(!state.token)return;const [p,bm]=await Promise.all([api('/api/progress'),state.billing?Promise.resolve(state.billing):api('/api/billing/me')]);state.lastProgress=p;state.billing=bm;renderProgressPlan(bm);renderPracticeProgress(p);state.studySummary=p.study_summary||state.studySummary;renderContinueLearning();renderLearningDashboard(p);
const set=(id,val)=>{const el=$(id);if(el)el.textContent=val};
set('#pAnswered',p.answered);set('#pCorrect',p.correct);set('#pAccuracy',p.accuracy==null?'—':p.accuracy+'%');set('#pCompletedExams',p.completed_exams||0);set('#pPracticeAnswered',p.practice_answered||0);set('#pExamAnswered',p.exam_answered||0);set('#pBookmarks',p.bookmarks);set('#pReviewCount',p.review_queue.length);
$('#progressBenchmarkNote').textContent=`Azielon benchmark: ${p.benchmark||70}% · practice benchmark only, not PMI's passing score.`;
$('#examReportCards').innerHTML=(p.exam_cards||[]).map(x=>`<article class="exam-report-card ${x.completed?'completed':x.status==='active'||x.status==='paused'?'in-progress':''}"><div class="exam-report-top"><span class="report-check">${x.completed?'✓':x.status==='active'||x.status==='paused'?'◐':'○'}</span><div><span class="eyebrow">${escapeHtml(x.kind==='mock'?'Full Mock':'Concept Mastery')}</span><h4>${escapeHtml(x.exam_name||x.exam_code)}</h4></div><span class="report-status ${x.result==='PASS'?'pass':x.result?'below':''}">${examStatusLabel(x)}</span></div><div class="exam-report-score"><b>${x.correct}/${x.total}</b><span>${x.completed?(x.accuracy+'%'):(x.answered+'/'+x.total+' answered')}</span></div><div class="mini-track"><i style="width:${Math.min(100,(x.answered/x.total)*100)}%"></i></div><button class="secondary report-action" onclick="openExamFromProgress('${escapeHtml(x.exam_code)}',${x.session_id||'null'},'${escapeHtml(x.status)}')">${examActionLabel(x)} →</button></article>`).join('')||'<p class="small-note">No exams are included in the current plan.</p>';
$('#domainBars').innerHTML=['People','Process','Business Environment'].map(d=>{const x=p.domains[d]||{answered:0,correct:0};const pct=x.answered?Math.round(x.correct/x.answered*100):0;return `<div class="bar-row"><span>${d}</span><div class="bar-track"><i style="width:${pct}%"></i></div><b>${x.answered?pct+'%':'—'}</b></div>`}).join('');
if($('#progressPracticeReport'))$('#progressPracticeReport').innerHTML=`<div><span>Unique questions practiced</span><b>${p.practice_unique_attempted||0}/${p.practice_bank_total||0}</b></div><div><span>Practice coverage</span><b>${p.practice_coverage==null?'—':p.practice_coverage+'%'}</b></div><div><span>Total practice attempts</span><b>${p.practice_answered||0}</b></div><div><span>Practice accuracy</span><b>${p.practice_accuracy==null?'—':p.practice_accuracy+'%'}</b></div>`;
$('#examHistory').innerHTML=(p.exam_history||[]).length?(p.exam_history||[]).map(x=>`<div class="exam-history-row"><div><b>${escapeHtml(x.exam_name)}</b><small>${escapeHtml((x.mode||'').replaceAll('_',' '))} · ${fmtAccessDate(x.completed_at)}</small></div><div class="exam-history-score"><b>${x.accuracy==null?'—':x.accuracy+'%'}</b><small>${x.correct}/${x.total} correct · ${x.answered}/${x.total} answered</small></div><button class="text-btn" onclick="openExamFromProgress('${escapeHtml(x.exam_code)}',${x.session_id},'${escapeHtml(x.status)}')">View report</button></div>`).join(''):'<p class="small-note">No submitted exams yet.</p>';
try{const cr=await api('/api/review/concepts');set('#learningReviewCount',cr.count||0);set('#pReviewCount',cr.count||0)}catch(e){}
}

async function loadConceptReview(){if(!state.token)return;try{const r=await api('/api/review/concepts');let items=r.items||[];const f=state.conceptReviewFilter||'all';if(f==='marked')items=items.filter(x=>(x.marked_count||0)>0||(x.needs_review_count||0)>0);if(f==='incorrect')items=items.filter(x=>(x.incorrect_count||0)>0);if(f==='learning')items=items.filter(x=>(x.needs_review_count||0)>0);if($('#conceptReviewSummary'))$('#conceptReviewSummary').innerHTML=items.length?`<b>${items.length}</b><span>concept${items.length===1?'':'s'} in this view</span>`:'<b>✓</b><span>Nothing in this view.</span>';if($('#learningReviewCount'))$('#learningReviewCount').textContent=r.count||0;$('#reviewList').innerHTML=items.length?items.map(x=>{const reasons=[];if(x.incorrect_count)reasons.push(`${x.incorrect_count} incorrect answer${x.incorrect_count===1?'':'s'}`);if(x.marked_count)reasons.push(`${x.marked_count} exam mark${x.marked_count===1?'':'s'}`);if(x.needs_review_count)reasons.push(`${x.needs_review_count} study item${x.needs_review_count===1?'':'s'} marked for review`);return `<article class="concept-review-card"><div><span class="eyebrow">${escapeHtml(x.domain||'PMP concept')}</span><h3>${escapeHtml(x.concept)}</h3><p>${escapeHtml(reasons.join(' · '))}</p><small>${escapeHtml((x.sources||[]).join(' · '))}</small></div><div class="concept-review-actions"><button class="secondary" onclick="openConceptSource('${escapeHtml(x.action_type||'')}','${escapeHtml(x.action_id||'')}','${escapeHtml(x.exam_code||'')}')">Review concept</button><button class="text-btn" onclick="markConceptReviewed('${escapeHtml(x.concept_id)}',this)">Done reviewing</button></div></article>`}).join(''):'<div class="panel empty-state"><h3>Nothing in this view.</h3><p>Try another filter or continue studying.</p></div>'}catch(err){$('#reviewList').innerHTML=`<p>${escapeHtml(err.message)}</p>`}}
$$('[data-review-filter]').forEach(b=>b.onclick=()=>{$$('[data-review-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.conceptReviewFilter=b.dataset.reviewFilter;loadConceptReview()});
window.markConceptReviewed=async(id,btn)=>{if(btn){btn.disabled=true;btn.textContent='✓ Done'}await api(`/api/study/items/concept/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({status:'reviewed'})});setTimeout(()=>loadConceptReview(),250)}
window.openConceptSource=async(type,id,examCode)=>{if(type==='practice'){return retryQuestion(id)}if(type==='note'){state.noteMode='study';showView('notes');setTimeout(()=>{const i=state.notes.findIndex(x=>x.id===id);if(i>=0){state.noteIndex=i;renderNotes()}},50);return}if(type==='diagram'){state.diagramMode='all';showView('diagrams');setTimeout(()=>{const rows=diagramRows();const i=rows.findIndex(x=>x.id===id);if(i>=0){state.diagramIndex=i;renderDiagrams()}},50);return}if(type==='tricky'){state.trickyMode='study';showView('tricky');setTimeout(()=>{const rows=trickyRows();const i=rows.findIndex(x=>x.id===id);if(i>=0){state.flashIndex=i;renderTricky()}},50);return}if(type==='exam'){state.examKind=(examCode||'').startsWith('mastery')?'mastery':'mock';showView('exams');return}showView('notes')}
window.retryQuestion=async id=>{showView('practice');try{state.session=await api('/api/practice/sessions',{method:'POST',body:JSON.stringify({count:1,question_id:id,feedback_mode:$('#pFeedback')?.value||'immediate'})});state.qIndex=0;state.reviewResults=null;$('#sessionArea').classList.remove('hidden');renderQuestion()}catch(err){$('#practiceMessage').textContent=err.message}}


function fmtTime(sec){sec=Math.max(0,Math.floor(sec||0));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),ss=sec%60;return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}
function clearPracticeTimer(){if(state.practiceTimerHandle){clearInterval(state.practiceTimerHandle);state.practiceTimerHandle=null}}
function startPracticeTimer(){clearPracticeTimer();const el=$('#practiceTimer');if(!state.session?.timer_minutes){el?.classList.add('hidden');return}el.classList.remove('hidden');let remaining=state.session.timer_minutes*60;el.textContent=fmtTime(remaining);state.practiceTimerHandle=setInterval(async()=>{remaining--;el.textContent=fmtTime(remaining);if(remaining<=0){clearPracticeTimer();$('#practiceMessage').textContent='Time is up. The practice session has ended.';try{await api(`/api/practice/sessions/${state.session.session_id}/end`,{method:'POST'});const r=await api(`/api/practice/sessions/${state.session.session_id}/results`);state.reviewResults=r;state.reviewIndex=0;$('#sessionProgress').textContent='Time expired';$('#questionCard').innerHTML=`<div class="session-summary"><h3>Time is up</h3><p><strong>${r.correct} of ${r.total}</strong> correct · ${r.answered||0} answered</p><button id="reviewTimedAnswers" class="primary">Review answers</button></div>`;$('#reviewTimedAnswers').onclick=renderEndReview}catch(err){$('#questionCard').innerHTML=`<div class="session-summary"><h3>Time is up</h3><p>${escapeHtml(err.message)}</p></div>`}}},1000)}

$('#coachForm').onsubmit=async e=>{e.preventDefault();const m=$('#coachInput').value.trim();if(!m)return;appendChat(m,true);$('#coachInput').value='';try{const r=await api('/api/ai/coach',{method:'POST',body:JSON.stringify({message:m})});appendChat(r.text||'No response.')}catch(err){appendChat(err.message)}};
function appendChat(text,user=false){const d=document.createElement('div');d.className='bubble '+(user?'user':'ai');d.innerHTML=`<b>${user?'You':'Azielon Coach'}</b><p>${escapeHtml(text).replace(/\n/g,'<br>')}</p>`;$('#chat').appendChild(d);$('#chat').scrollTop=99999}

function openZoom(title,html){state.zoom=1;$('#zoomTitle').textContent=title;$('#zoomBody').innerHTML=`<div class="zoom-transform">${html}</div>`;$('#zoomModal').classList.remove('hidden');applyZoom()}
function applyZoom(){const el=$('#zoomBody .zoom-transform');if(el)el.style.transform=`scale(${state.zoom})`;$('#zoomPct').textContent=Math.round(state.zoom*100)+'%'}
$('#zoomIn').onclick=()=>{state.zoom=Math.min(3,state.zoom+.25);applyZoom()};$('#zoomOut').onclick=()=>{state.zoom=Math.max(.5,state.zoom-.25);applyZoom()};$('#zoomReset').onclick=()=>{state.zoom=1;applyZoom()};$('#zoomFull').onclick=()=>$('#zoomBody')?.requestFullscreen?.();
$$('[data-close-modal]').forEach(x=>x.onclick=()=>$('#'+x.dataset.closeModal).classList.add('hidden'));


// ---------------- Mock + Concept Mastery Exams ----------------
async function loadExamCatalog(){if(!state.token||(!state.hasAccess&&!isStaff()))return;try{state.examCatalog=await api('/api/exams/catalog');const h=document.querySelector('#exams .section-intro h2');const p=document.querySelector('#exams .section-intro p');if(h)h.textContent=state.examKind==='mock'?'Full Mock Exams':'Concept Mastery Exams';if(p)p.textContent=state.examKind==='mock'?'180-question, 240-minute exam simulations.':'Flexible rule-review and mastery practice, with Real Mock mode reserved for Premium.';renderExamCatalog()}catch(err){$('#examCatalog').innerHTML=`<p>${escapeHtml(err.message)}</p>`}}
function renderExamCatalog(){
  const rows=state.examCatalog.filter(e=>e.kind===state.examKind);
  $('#examCatalog').innerHTML=rows.map(e=>`<article class="exam-card"><span class="pill">${e.kind==='mock'?'Full Simulation':'Concept Mastery'}</span><h3>${escapeHtml(e.name)}</h3><p>${e.question_count} questions · ${e.duration_minutes} minutes</p><p>${e.kind==='mastery'?'Take it as a real mock or review rules before practice blocks.':'Rules and explanations stay hidden until submission.'}</p>${e.active_session?`<button class="primary exam-resume" data-code="${e.code}">Resume active exam</button>`:`<button class="primary exam-choose" data-code="${e.code}">Choose exam</button>`}</article>`).join('');
  $$('.exam-choose').forEach(b=>b.onclick=()=>openExamSetup(b.dataset.code));$$('.exam-resume').forEach(b=>b.onclick=()=>resumeExam(b.dataset.code));
}
function openExamSetup(code){const e=state.examCatalog.find(x=>x.code===code);if(!e)return;state.selectedExam=e;$('#examResults').classList.add('hidden');$('#examSessionArea').classList.add('hidden');$('#ruleReviewArea').classList.add('hidden');const mastery=e.kind==='mastery';$('#examSetup').innerHTML=`<span class="eyebrow">${escapeHtml(e.name)}</span><h3>Choose how you want to learn.</h3><div class="mode-grid"><button class="mode-card start-exam-mode" data-mode="real_mock"><b>Real Mock</b><span>180 questions · 240-minute timer · answers at the end</span></button>${mastery?`<button class="mode-card start-exam-mode" data-mode="block_rules"><b>10 Rules → 10 Questions</b><span>Review each rule block before its paired questions</span></button><button class="mode-card start-exam-mode" data-mode="review_all"><b>Review All Rules First</b><span>Study all 180 rules, then take the exam</span></button><button class="mode-card" id="rulesOnlyBtn"><b>Rules Review Only</b><span>Browse the 180 rules without starting a timed exam</span></button>`:''}</div>${mastery?`<label class="feedback-setting">Learning-mode feedback <select id="examFeedback"><option value="immediate">After each question</option><option value="block">After each 10-question block</option><option value="end">At the end</option></select></label>`:''}<div id="examSetupMessage" class="message"></div>`;$('#examSetup').classList.remove('hidden');$$('.start-exam-mode').forEach(b=>b.onclick=()=>startExam(code,b.dataset.mode));if(mastery)$('#rulesOnlyBtn').onclick=()=>showRulesOnly(code)}
async function showRulesOnly(code){try{const r=await api(`/api/exams/${code}/rules`);renderRules(r.rules,'Rules Review Only',null)}catch(err){$('#examSetupMessage').textContent=err.message}}
async function resumeExam(code){try{const e=state.examCatalog.find(x=>x.code===code),a=e?.active_session;if(!a)return;const st=await api(`/api/exam-sessions/${a.session_id}/status`);state.examSession={session_id:a.session_id,exam_code:code,exam_name:e.name,mode:a.mode,feedback_mode:a.feedback_mode,total:180,duration_seconds:e.duration_minutes*60,remaining_seconds:st.remaining_seconds};state.examIndex=a.current_index||0;state.examLock=(a.mode==='real_mock');$('#examSetup').classList.add('hidden');$('#examResults').classList.add('hidden');if(a.mode==='review_all'){beginExamQuestions()}else if(a.mode==='block_rules'){beginExamQuestions()}else beginExamQuestions()}catch(err){$('#examSetupMessage').textContent=err.message}}
async function startExam(code,mode){try{const feedback=mode==='real_mock'?'end':($('#examFeedback')?.value||'immediate');state.examSession=await api(`/api/exams/${code}/start`,{method:'POST',body:JSON.stringify({mode,feedback_mode:feedback})});state.examIndex=0;state.examReviewResults=null;state.examLock=(mode==='real_mock');$('#examSetup').classList.add('hidden');$('#examResults').classList.add('hidden');if(mode==='block_rules'){await showExamRuleBlock(1)}else if(mode==='review_all'){const r=await api(`/api/exams/${code}/rules`);renderRules(r.rules,'Review all 180 rules before starting',async()=>{await api(`/api/exam-sessions/${state.examSession.session_id}/rules-viewed/all`,{method:'POST'});beginExamQuestions()})}else beginExamQuestions()}catch(err){$('#examSetupMessage').textContent=err.message}}
async function showExamRuleBlock(blockNo){try{const code=state.examSession.exam_code;const r=await api(`/api/exams/${code}/rules?block=${blockNo}`);renderRules(r.rules,`Block ${blockNo}: Review these 10 rules`,async()=>{await api(`/api/exam-sessions/${state.examSession.session_id}/rules-viewed/${blockNo}`,{method:'POST'});state.examIndex=(blockNo-1)*10;beginExamQuestions()})}catch(err){$('#examMessage').textContent=err.message}}
function renderRules(rules,title,onContinue){$('#examSessionArea').classList.add('hidden');const area=$('#ruleReviewArea');area.innerHTML=`<div class="rule-review-head"><div><span class="eyebrow">Concept review</span><h3>${escapeHtml(title)}</h3></div></div><div class="rule-list">${rules.map((r,i)=>`<div class="rule-row"><span>${r.position||i+1}</span><div><b>${escapeHtml(r.topic||r.block_title||'PMP Rule')}</b><p>${escapeHtml(r.text)}</p><small>${escapeHtml(r.domain)} · ${escapeHtml(r.approach||'Mixed')}</small></div></div>`).join('')}</div>${onContinue?'<button id="rulesContinue" class="primary wide">I reviewed these rules — continue</button>':'<button id="rulesBack" class="secondary">Back to exams</button>'}`;area.classList.remove('hidden');if(onContinue)$('#rulesContinue').onclick=onContinue;else $('#rulesBack').onclick=()=>{area.classList.add('hidden');renderExamCatalog()}}
function beginExamQuestions(){ $('#ruleReviewArea').classList.add('hidden');$('#examSessionArea').classList.remove('hidden');$('#examModePill').textContent=state.examSession.mode==='real_mock'?'Real Mock':state.examSession.mode==='block_rules'?'Rules + Practice':'Reviewed Rules First';renderExamNavigator();startExamTimer(state.examSession.remaining_seconds||state.examSession.duration_seconds);loadExamQuestion(state.examIndex)}
function renderExamNavigator(){const n=180;$('#examNavigator').innerHTML=Array.from({length:n},(_,i)=>`<button class="exam-nav-q" data-i="${i}">${i+1}</button>`).join('');$$('.exam-nav-q').forEach(b=>b.onclick=()=>loadExamQuestion(+b.dataset.i))}
async function loadExamQuestion(i){try{const r=await api(`/api/exam-sessions/${state.examSession.session_id}/questions/${i}`);state.examIndex=i;state.examCurrent=r;$('#examProgress').textContent=`Question ${i+1} of ${r.total}`;renderExamQuestion(r.question,r.saved_response,r.marked);$$('.exam-nav-q').forEach(b=>b.classList.toggle('current',+b.dataset.i===i))}catch(err){if(state.examSession.mode==='block_rules'&&/Review the 10 rules/.test(err.message)){const b=Math.floor(i/10)+1;await showExamRuleBlock(b)}else $('#examMessage').textContent=err.message}}
function examAnswerArea(q,saved){if(q.type==='matching'){const current=saved?.matching_pairs||{};return `<div class="matching-area">${(q.matching_left||[]).map((l,i)=>`<label class="matching-row" data-left="${escapeHtml(l)}"><span>${escapeHtml(l)}</span><select><option value="">Choose match…</option>${(q.matching_right||[]).map(r=>`<option value="${escapeHtml(r)}" ${current[l]===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}</select></label>`).join('')}</div>`}const selected=new Set(saved?.selected_option_ids||[]);return `<div class="options">${(q.options||[]).map((o,i)=>{const L=String.fromCharCode(65+i);return `<button class="option exam-option ${selected.has(L)?'selected':''}" data-id="${L}"><span>${L}</span>${escapeHtml(o)}</button>`}).join('')}</div>`}
function renderExamQuestion(q,saved,marked){const multi=q.type==='multiple_response';$('#examQuestionCard').innerHTML=`<div class="question-meta"><span class="pill">${escapeHtml(q.domain||'PMP')}</span><span class="pill">${escapeHtml(q.approach||'Mixed')}</span><span class="pill">${escapeHtml(q.type||'single')}</span></div><div class="question-stem">${escapeHtml(q.stem)}</div>${examAnswerArea(q,saved)}<div id="examFeedback"></div><div class="question-actions"><button id="examPrev" class="secondary" ${state.examIndex===0?'disabled':''}>Previous</button><button id="examMark" class="secondary">${marked?'★ Marked':'☆ Mark for review'}</button><button id="examSave" class="primary">Save & Next</button><button id="examSubmit" class="danger-btn">Submit Exam</button></div>`;$$('.exam-option').forEach(b=>b.onclick=()=>{if(multi)b.classList.toggle('selected');else{$$('.exam-option').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')}});$('#examPrev').onclick=()=>loadExamQuestion(Math.max(0,state.examIndex-1));$('#examMark').onclick=async()=>{const next=!marked;await api(`/api/exam-sessions/${state.examSession.session_id}/mark`,{method:'POST',body:JSON.stringify({question_id:q.id,marked:next})});$('#examMark').textContent=next?'★ Marked':'☆ Mark for review';const nav=$(`.exam-nav-q[data-i="${state.examIndex}"]`);nav?.classList.toggle('marked',next)};$('#examSave').onclick=()=>saveExamAnswer(q,true);$('#examSubmit').onclick=()=>submitExamConfirm()}
async function saveExamAnswer(q,goNext){let payload={question_id:q.id,selected_option_ids:[]};if(q.type==='matching'){const pairs={};let missing=false;$$('#examQuestionCard .matching-row').forEach(r=>{const v=r.querySelector('select').value;if(!v)missing=true;pairs[r.dataset.left]=v});if(missing){$('#examMessage').textContent='Complete every match before saving.';return}payload.matching_pairs=pairs}else{payload.selected_option_ids=$$('#examQuestionCard .exam-option.selected').map(x=>x.dataset.id);if(!payload.selected_option_ids.length){$('#examMessage').textContent='Select an answer before saving.';return}}try{const r=await api(`/api/exam-sessions/${state.examSession.session_id}/attempts`,{method:'POST',body:JSON.stringify(payload)});const nav=$(`.exam-nav-q[data-i="${state.examIndex}"]`);nav?.classList.add('answered');$('#examMessage').textContent='Answer saved.';if(r.is_correct!==undefined)$('#examFeedback').innerHTML=`<div class="feedback"><b>${r.is_correct?'Correct':'Review this concept'}</b><p>${escapeHtml(r.explanation||'')}</p></div>`;await updateExamBreakAvailability();if(goNext){const next=state.examIndex+1;if(next>=180){await submitExamConfirm()}else if(state.examSession.mode==='block_rules'&&next%10===0){await showExamRuleBlock(Math.floor(next/10)+1)}else loadExamQuestion(next)}}catch(err){$('#examMessage').textContent=err.message}}
async function updateExamBreakAvailability(){try{const st=await api(`/api/exam-sessions/${state.examSession.session_id}/status`);const due=(st.break_number===0&&st.answered>=60)||(st.break_number===1&&st.answered>=120);$('#examBreakBtn').classList.toggle('hidden',!due);if(st.status==='expired')await finishExpiredExam()}catch{}}
function clearExamTimer(){if(state.examTimerHandle){clearInterval(state.examTimerHandle);state.examTimerHandle=null}}
function startExamTimer(seconds){clearExamTimer();let remaining=seconds;$('#examTimer').textContent=fmtTime(remaining);state.examTimerHandle=setInterval(async()=>{remaining--;$('#examTimer').textContent=fmtTime(remaining);if(remaining<=0){clearExamTimer();await finishExpiredExam()}else if(remaining%30===0){try{const st=await api(`/api/exam-sessions/${state.examSession.session_id}/status`);remaining=st.remaining_seconds;if(st.status==='expired'){clearExamTimer();await finishExpiredExam()}}catch{}}},1000)}
async function finishExpiredExam(){try{$('#examMessage').textContent='Time is up. The exam has been submitted automatically.';await showExamResults()}catch(err){$('#examMessage').textContent=err.message}}
$('#examPauseBtn').onclick=async()=>{if(!state.examSession)return;try{const r=await api(`/api/exam-sessions/${state.examSession.session_id}/pause`,{method:'POST'});clearExamTimer();$('#examQuestionCard').innerHTML=`<div class="pause-card"><span class="eyebrow">Exam paused</span><h3>Your timer is stopped.</h3><p>You can resume when ready. This is an Azielon study convenience, not PMI test-center timing.</p><div class="pause-time">${fmtTime(r.remaining_seconds)}</div><button id="resumePausedExam" class="primary">Resume exam</button></div>`;$('#examPauseBtn').classList.add('hidden');$('#examBreakBtn').classList.add('hidden');$('#resumePausedExam').onclick=async()=>{const rr=await api(`/api/exam-sessions/${state.examSession.session_id}/resume`,{method:'POST'});$('#examPauseBtn').classList.remove('hidden');startExamTimer(rr.remaining_seconds);loadExamQuestion(state.examIndex)}}catch(err){$('#examMessage').textContent=err.message}};
$('#examBreakBtn').onclick=async()=>{try{const r=await api(`/api/exam-sessions/${state.examSession.session_id}/break/start`,{method:'POST'});clearExamTimer();$('#examQuestionCard').innerHTML=`<div class="break-card"><span class="eyebrow">Break ${r.break_number}</span><h2>10-minute pacing break</h2><div id="breakClock" class="exam-timer">10:00</div><p>This is an Azielon simulation break for pacing practice.</p><button id="endBreak" class="primary">End break and continue</button></div>`;let rem=600;const h=setInterval(()=>{rem--;const e=$('#breakClock');if(e)e.textContent=fmtTime(rem);if(rem<=0){clearInterval(h);$('#endBreak')?.click()}},1000);$('#endBreak').onclick=async()=>{clearInterval(h);await api(`/api/exam-sessions/${state.examSession.session_id}/break/end`,{method:'POST'});const st=await api(`/api/exam-sessions/${state.examSession.session_id}/status`);startExamTimer(st.remaining_seconds);$('#examBreakBtn').classList.add('hidden');loadExamQuestion(state.examIndex)}}catch(err){$('#examMessage').textContent=err.message}}
async function submitExamConfirm(){if(!confirm('Submit this exam now? You will then see your results and explanations.'))return;try{await api(`/api/exam-sessions/${state.examSession.session_id}/submit`,{method:'POST'});clearExamTimer();await showExamResults()}catch(err){$('#examMessage').textContent=err.message}}
async function showExamResults(){const r=await api(`/api/exam-sessions/${state.examSession.session_id}/results`);state.examLock=false;state.examReviewResults=r;state.examReviewIndex=0;$('#examSessionArea').classList.add('hidden');$('#ruleReviewArea').classList.add('hidden');const area=$('#examResults');const metricCards=(obj)=>Object.entries(obj||{}).map(([d,x])=>`<div class="result-metric"><span>${escapeHtml(d.replaceAll('_',' '))}</span><b>${x.accuracy}%</b><small>${x.correct}/${x.total} correct</small></div>`).join('');area.innerHTML=`<div class="panel exam-report-final"><div class="final-report-head"><div><span class="eyebrow">Exam report</span><h2>${escapeHtml(r.result_label)}</h2><p>${r.correct}/${r.total} correct · ${r.accuracy}% · ${r.answered}/${r.total} answered</p></div><div class="result-badge ${r.result_label==='PASS'?'pass':'below'}">${r.accuracy}%</div></div><p class="benchmark-note">Benchmark: ${r.benchmark}% · ${escapeHtml(r.benchmark_note||'')}</p><h3>By PMP domain</h3><div class="result-metric-grid">${metricCards(r.domains)}</div><h3>By delivery approach</h3><div class="result-metric-grid">${metricCards(r.approaches)}</div><h3>By question type</h3><div class="result-metric-grid">${metricCards(r.question_types)}</div><div class="report-actions"><button id="reviewExamAnswers" class="primary">Review answers</button><button id="backToExams" class="secondary">Back to exams</button><button id="goProgress" class="secondary">My Progress</button></div></div><div id="examReviewCard"></div>`;area.classList.remove('hidden');$('#reviewExamAnswers').onclick=()=>renderExamReview(0);$('#backToExams').onclick=()=>{area.classList.add('hidden');renderExamCatalog()};$('#goProgress').onclick=()=>showView('progress');await loadProgress()}
function renderExamReview(i){const r=state.examReviewResults;if(!r)return;const x=r.results[i];state.examReviewIndex=i;const q=x.question;const selected=x.selected?.selected_option_ids||[];const answer=Array.isArray(x.answer)?x.answer:[x.answer];$('#examReviewCard').innerHTML=`<div class="question-card"><div class="question-meta"><span class="pill">Review ${i+1} of ${r.total}</span><span class="pill">${escapeHtml(q.domain||'')}</span></div><div class="question-stem">${escapeHtml(q.stem)}</div>${q.type==='matching'?`<pre class="review-pre">Your match: ${escapeHtml(JSON.stringify(x.selected?.matching_pairs||{},null,2))}\nCorrect: ${escapeHtml(JSON.stringify(x.answer||{},null,2))}</pre>`:`<div class="options review-options">${(q.options||[]).map((o,j)=>{const L=String.fromCharCode(65+j);const cls=answer.includes(L)?'correct':selected.includes(L)?'wrong':'';return `<div class="option ${cls}"><span>${L}</span>${escapeHtml(o)}</div>`}).join('')}</div>`}<div class="feedback"><b>${x.unanswered?'Unanswered':x.is_correct?'Correct':'Review the reasoning'}</b><p>${escapeHtml(x.explanation||'')}</p>${x.rule_id?`<p><strong>Paired rule:</strong> ${escapeHtml(x.rule_id)}</p>`:''}</div><div class="question-actions"><button id="reviewPrev" class="secondary" ${i===0?'disabled':''}>Previous</button><button id="reviewNext" class="primary" ${i===r.total-1?'disabled':''}>Next</button></div></div>`;$('#reviewPrev').onclick=()=>renderExamReview(Math.max(0,i-1));$('#reviewNext').onclick=()=>renderExamReview(Math.min(r.total-1,i+1))}

async function loadAdmin(){
  try{
    const es=await api('/api/admin/email-status');
    if($('#adminEmailStatus')){
      $('#adminEmailStatus').textContent=es.configured?`Email ready → ${es.notify_email}`:'Email not configured';
      $('#adminEmailStatus').className='email-status-chip '+(es.configured?'ready':'not-ready');
    }
  }catch(_){}
if($('#adminNav').classList.contains('hidden'))return;const q=$('#adminSearch').value.toLowerCase();try{let rows=[];if(state.adminKind==='questions')rows=await api('/api/admin/questions'+(q?`?q=${encodeURIComponent(q)}`:''));if(state.adminKind==='notes')rows=(await api('/api/admin/notes')).filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));if(state.adminKind==='diagrams')rows=(await api('/api/admin/diagrams')).filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));if(state.adminKind==='tricky')rows=(await api('/api/admin/tricky')).filter(x=>!q||JSON.stringify(x).toLowerCase().includes(q));if(state.adminKind==='registrations')rows=await api('/api/admin/program-registrations'+(q?`?q=${encodeURIComponent(q)}`:''));renderAdminRows(rows);const audit=await api('/api/admin/audit');$('#auditList').innerHTML=audit.map(a=>`<div class="queue-item"><span>${escapeHtml(a.action)} · ${escapeHtml(a.entity_id||'')}</span><small>${new Date(a.created_at).toLocaleString()}</small></div>`).join('')}catch(err){$('#adminTable').innerHTML=`<p>${escapeHtml(err.message)}</p>`}}
function renderAdminRows(rows){
  if(state.adminKind==='registrations'){
    $('#adminTable').innerHTML=`<div class="admin-reg-head"><b>Learner</b><b>Preferred class</b><b>Program</b><b>Payment</b><b>Action</b></div>`+
      rows.map(x=>`<div class="admin-reg-row">
        <div><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.email)}</small><small>Registered ${new Date(x.created_at).toLocaleDateString()}</small></div>
        <div><b>${x.preferred_date?new Date(x.preferred_date).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'}):'—'}</b><small>${escapeHtml(x.schedule||'')}</small></div>
        <div><b>$${escapeHtml(x.price)}</b><small>${escapeHtml(String(x.hours))} hours live online</small></div>
        <div><span class="registration-status ${x.payment_status==='paid'?'paid':'pending'}">${x.payment_status==='paid'?'✓ Paid':'Payment pending'}</span>${x.paid_at?`<small>${new Date(x.paid_at).toLocaleString()}</small>`:''}${x.notification_sent_at?'<small>✓ Admin email sent</small>':''}</div>
        <div class="registration-actions">${x.payment_status!=='paid'?`<button class="primary mark-reg-paid" data-id="${x.id}">Mark paid + email</button>`:`<button class="secondary resend-reg-email" data-id="${x.id}">Resend email</button>`}</div>
      </div>`).join('');
    $$('.mark-reg-paid').forEach(b=>b.onclick=()=>markRegistrationPaid(b.dataset.id,b));
    $$('.resend-reg-email').forEach(b=>b.onclick=()=>resendRegistrationEmail(b.dataset.id,b));
    return;
  }
  if(state.adminKind==='questions'){
    $('#adminTable').innerHTML=`<div class="admin-row admin-row-actions"><b>ID</b><b>Concept</b><b>Domain</b><b>State</b><b></b></div>`+rows.map((x,i)=>`<div class="admin-row admin-row-actions"><span>${escapeHtml(x.id)}</span><span>${escapeHtml(x.primary_concept||'')}</span><span>${escapeHtml(x.domain||'')}</span><span>${escapeHtml(x.lifecycle_state||'')}</span><button class="secondary admin-edit" data-i="${i}">Edit</button></div>`).join('')
  }else{
    $('#adminTable').innerHTML=`<div class="admin-row admin-row-actions"><b>ID</b><b>Title / Terms</b><b>Domain</b><b></b><b></b></div>`+rows.map((x,i)=>`<div class="admin-row admin-row-actions"><span>${escapeHtml(x.id)}</span><span>${escapeHtml(x.title||((x.left||'')+' vs '+(x.right||'')))}</span><span>${escapeHtml(x.domain||'')}</span><span></span><button class="secondary admin-edit" data-i="${i}">Edit</button></div>`).join('')
  }
  $$('.admin-edit').forEach(b=>b.onclick=()=>openEditor(false,rows[+b.dataset.i]))
}
async function markRegistrationPaid(id,btn){
  btn.disabled=true;btn.textContent='Saving…';
  try{
    const r=await api(`/api/admin/program-registrations/${id}/mark-paid`,{method:'POST'});
    $('#adminMessage').textContent=r.email_sent?'✓ Marked paid and email sent to azi@azielon.com':'✓ Marked paid. Email was not sent — check SMTP settings.';
    await loadAdmin();
  }catch(err){$('#adminMessage').textContent=err.message;btn.disabled=false;btn.textContent='Mark paid + email'}
}
async function resendRegistrationEmail(id,btn){
  btn.disabled=true;btn.textContent='Sending…';
  try{
    await api(`/api/admin/program-registrations/${id}/send-email`,{method:'POST'});
    $('#adminMessage').textContent='✓ Registration email sent to azi@azielon.com';
    await loadAdmin();
  }catch(err){$('#adminMessage').textContent=err.message;btn.disabled=false;btn.textContent='Resend email'}
}
$('#adminSearch').oninput=()=>{clearTimeout(window._adm);window._adm=setTimeout(loadAdmin,250)};
$$('#adminTabs button').forEach(b=>b.onclick=()=>{$$('#adminTabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.adminKind=b.dataset.adminKind;$('#adminSearch').value='';$('#adminAddBtn').classList.toggle('hidden',state.adminKind==='registrations');loadAdmin()});
$('#adminAddBtn').onclick=()=>openEditor(true,null);
$$('[data-admin-add]').forEach(b=>b.onclick=()=>{state.adminKind=b.dataset.adminAdd;$$('#adminTabs button').forEach(x=>x.classList.toggle('active',x.dataset.adminKind===state.adminKind));$('#adminAddBtn').textContent='+ Add '+({questions:'Question',notes:'Topic Note',diagrams:'Diagram',tricky:'Tricky Words'}[state.adminKind]);loadAdmin();openEditor(true,null)});
function inputField(name,label,value='',type='text',readonly=false){return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value??'')}" ${readonly?'readonly':''}></label>`}
function textareaField(name,label,value=''){return `<label>${label}<textarea name="${name}" rows="6">${escapeHtml(value??'')}</textarea></label>`}
function openEditor(isNew,item){const f=$('#editorForm');$('#editorTitle').textContent=(isNew?'Add ':'Edit ')+({questions:'Question',notes:'Topic Note',diagrams:'Diagram',tricky:'Tricky Words'}[state.adminKind]);let html='';if(state.adminKind==='questions'){const x=item||{};html=`<div class="editor-grid">${inputField('id','Question ID',x.id||'', 'text',!isNew)}${inputField('type','Type',x.type||'single')}${inputField('domain','Domain',x.domain||'')}${inputField('delivery_approach','Approach',x.delivery_approach||'')}${inputField('difficulty','Difficulty',x.difficulty||'')}${inputField('primary_concept','Primary concept',x.primary_concept||'')}</div>${textareaField('stem','Question stem',x.stem||'')}${textareaField('options','Options JSON',jsonText(x.options||[]))}${textareaField('left_items','Matching left items JSON',jsonText(x.left_items||[]))}${textareaField('answer','Answer JSON',jsonText(x.answer||{}))}${textareaField('explanation','Explanation JSON',jsonText(x.explanation||{}))}${textareaField('visual','Visual JSON (null if none)',jsonText(x.visual??null))}<div class="editor-grid">${inputField('review_status','Review status',x.review_status||'Draft')}${inputField('lifecycle_state','Lifecycle state',x.lifecycle_state||'Draft')}<label class="check"><input name="instructor_approved" type="checkbox" ${x.instructor_approved?'checked':''}> Instructor approved</label></div>`}else if(state.adminKind==='notes'){const x=item||{};html=`<div class="editor-grid">${inputField('id','Note ID',x.id||'', 'text',!isNew)}${inputField('domain','Domain',x.domain||'')}${inputField('title','Title',x.title||'')}</div>${textareaField('body','Note body JSON',jsonText(x))}`}else if(state.adminKind==='diagrams'){const x=item||{};html=`<div class="editor-grid">${inputField('id','Diagram ID',x.id||'', 'text',!isNew)}${inputField('domain','Domain',x.domain||'')}${inputField('title','Title',x.title||'')}${inputField('category','Category',x.category||'')}${inputField('image_file','Image file',x.image_file||x.imageFile||'')}</div>${textareaField('metadata','Metadata JSON',jsonText(x.metadata||x))}`}else{const x=item||{};html=`<div class="editor-grid">${inputField('id','ID',x.id||'', 'text',!isNew)}${inputField('left','Left term',x.left||'')}${inputField('right','Right term',x.right||'')}</div>${textareaField('tags','Tags JSON',jsonText(x.tags||[]))}${textareaField('body','Body JSON',jsonText(x.body||x))}`}f.innerHTML=html+`<div id="editorMessage" class="message"></div><div class="editor-actions"><button type="button" class="secondary" data-close-modal="editorModal">Cancel</button><button class="primary">Save</button></div>`;f.querySelector('[data-close-modal]').onclick=()=>$('#editorModal').classList.add('hidden');f.onsubmit=e=>saveEditor(e,isNew,item);$('#editorModal').classList.remove('hidden')}
function parseJsonField(fd,name,fallback){const v=fd.get(name);if(v==null||v==='')return fallback;try{return JSON.parse(v)}catch{throw new Error(`${name} must contain valid JSON`)}}
async function saveEditor(e,isNew,item){e.preventDefault();const fd=new FormData(e.currentTarget);try{let payload,path;if(state.adminKind==='questions'){payload={id:fd.get('id'),stem:fd.get('stem'),type:fd.get('type'),domain:fd.get('domain')||null,delivery_approach:fd.get('delivery_approach')||null,difficulty:fd.get('difficulty')||null,primary_concept:fd.get('primary_concept')||null,options:parseJsonField(fd,'options',[]),left_items:parseJsonField(fd,'left_items',[]),answer:parseJsonField(fd,'answer',{}),explanation:parseJsonField(fd,'explanation',{}),visual:parseJsonField(fd,'visual',null),review_status:fd.get('review_status'),lifecycle_state:fd.get('lifecycle_state'),instructor_approved:fd.get('instructor_approved')==='on'};path=isNew?'/api/admin/questions':`/api/admin/questions/${encodeURIComponent(item.id)}`}else if(state.adminKind==='notes'){payload={id:fd.get('id'),domain:fd.get('domain')||null,title:fd.get('title'),body:parseJsonField(fd,'body',{})};path=isNew?'/api/admin/notes':`/api/admin/notes/${encodeURIComponent(item.id)}`}else if(state.adminKind==='diagrams'){payload={id:fd.get('id'),domain:fd.get('domain')||null,title:fd.get('title'),category:fd.get('category')||null,image_file:fd.get('image_file'),metadata:parseJsonField(fd,'metadata',{})};path=isNew?'/api/admin/diagrams':`/api/admin/diagrams/${encodeURIComponent(item.id)}`}else{payload={id:fd.get('id'),left:fd.get('left'),right:fd.get('right'),tags:parseJsonField(fd,'tags',[]),body:parseJsonField(fd,'body',{})};path=isNew?'/api/admin/tricky':`/api/admin/tricky/${encodeURIComponent(item.id)}`}await api(path,{method:isNew?'POST':'PATCH',body:JSON.stringify(payload)});$('#editorModal').classList.add('hidden');$('#adminMessage').textContent='Saved.';await Promise.all([loadAdmin(),loadNotes(),loadDiagrams(),loadTricky()])}catch(err){$('#editorMessage').textContent=err.message}}

async function loadBilling(prefetched=null){if(!state.token)return;try{const catalog=await api('/api/billing/catalog');const bm=prefetched||await api('/api/billing/me');state.hasAccess=!!bm.has_access;state.paymentMode=bm.payment_mode||'test';state.tierCode=bm.tier_code||bm.entitlement?.tier_code||null;state.features=bm.features||[];applyAccessNavigation();renderBilling(catalog,bm)}catch(err){const m=$('#billingMessage');if(m)m.textContent=err.message}}
function money(cents,currency='USD'){return new Intl.NumberFormat('en-US',{style:'currency',currency}).format(cents/100)}
function renderBilling(catalog,bm){
  const ent=bm.entitlement,test=bm.payment_mode==='test';
  $('#stripeProvider').textContent=test?'Card: local test mode':'Stripe Checkout: '+(bm.providers.stripe?'available':'not configured');$('#stripeProvider').className='provider-pill '+(test||bm.providers.stripe?'on':'off');
  $('#paymentModeTitle').textContent=test?'TEST mode — dummy card accepted':'Stripe hosted checkout';
  $('#paymentModeText').textContent=test?'Use dummy card details for local testing. No external processor is contacted.':'PMP Practice Coach tier payments are completed on Stripe Checkout. Azielon does not store raw card details.';
  $('#entitlementBox').innerHTML=ent?`<div class="entitlement-active"><div><b>${escapeHtml(ent.tier_code.toUpperCase())} access active</b><p>Plan: ${escapeHtml(ent.plan_code)} · Provider: ${escapeHtml(ent.provider)}</p></div><div><span class="pill">Expires</span><p>${new Date(ent.ends_at).toLocaleString()}</p></div></div>`:'<p>Select a plan below to unlock the learning content.</p>';
  const groups={};catalog.forEach(p=>(groups[p.tier_code]=groups[p.tier_code]||[]).push(p));const order=['full','concept','drills'];
  $('#planGrid').innerHTML=order.filter(k=>groups[k]).map(k=>{const plans=groups[k];const base=plans.find(x=>x.cadence==='monthly')||plans[0];return `<article class="plan-card"><span class="eyebrow">${escapeHtml(k)}</span><h3>${escapeHtml(base.name)}</h3><p>Select an access period.</p><ul>${(base.features||[]).map(f=>`<li>${escapeHtml(f)}</li>`).join('')}</ul>${plans.sort((a,b)=>a.duration_days-b.duration_days).map(p=>`<div class="billing-option"><div class="price">${money(p.amount_cents,p.currency)} <small>· ${escapeHtml(p.cadence)}</small></div><div class="billing-actions"><button class="primary stripe-buy" data-plan="${escapeHtml(p.code)}" ${(!test&&!bm.providers.stripe)?'disabled':''}>${test?'Test card payment':'Pay securely with Stripe'}</button></div></div>`).join('')}</article>`}).join('');
  $$('.stripe-buy').forEach(b=>b.onclick=()=>test?openTestPayment(b.dataset.plan,'card'):startStripe(b.dataset.plan));
}
function openTestPayment(plan,method='card'){$('#testPlanCode').value=plan;$('#testPaymentMethod').value='card';$('#testPaymentTitle').textContent='Test Card Payment';$('#testPaymentMessage').textContent='';$('#testPaymentModal').classList.remove('hidden');$$('#testPaymentModal [data-close-modal]').forEach(b=>b.onclick=()=>$('#testPaymentModal').classList.add('hidden'))}
$('#testPaymentForm').onsubmit=async e=>{e.preventDefault();const details={card_number:$('#testCardNumber').value,expiry:$('#testCardExpiry').value,cvv:$('#testCardCvv').value};try{$('#testPaymentMessage').textContent='Completing test purchase…';const r=await api('/api/billing/test/checkout',{method:'POST',body:JSON.stringify({plan_code:$('#testPlanCode').value,method:'card',details})});if(r.paid){$('#testPaymentModal').classList.add('hidden');state.hasAccess=true;await loadBilling();applyAccessNavigation();$('#billingMessage').textContent='Test purchase complete. Your learning access is active.';showView('dashboard')}}catch(err){$('#testPaymentMessage').textContent=err.message}}
async function startStripe(plan){$('#billingMessage').textContent='Creating checkout…';try{const r=await api('/api/billing/stripe/checkout-session',{method:'POST',body:JSON.stringify({plan_code:plan})});location.href=r.checkout_url}catch(err){$('#billingMessage').textContent=err.message}}
async function handleBillingReturn(){if(!state.token)return;const qs=new URLSearchParams(location.search);const mode=qs.get('billing');if(!mode)return;try{let paid=false;if(mode==='stripe-success'){const sid=qs.get('session_id');if(sid){showView('billing');$('#billingMessage').textContent='Confirming payment…';const r=await api('/api/billing/stripe/confirm?session_id='+encodeURIComponent(sid));paid=!!r.paid;$('#billingMessage').textContent=paid?'Payment confirmed. Access is active.':'Checkout returned, but payment is not marked paid yet.'}}else if(mode==='cancelled'){showView('billing');$('#billingMessage').textContent='Checkout was cancelled.'}if(paid){state.hasAccess=true;await loadBilling();applyAccessNavigation();showView('dashboard')}}catch(err){showView('billing');$('#billingMessage').textContent=err.message}history.replaceState({},'',location.pathname)}
const _origBootApp=bootApp;bootApp=async function(){await _origBootApp();await handleBillingReturn()};
boot();

// v3.9.5 password recovery
let passwordResetToken=new URLSearchParams(location.search).get('reset_token')||'';
function hideAuthForms(){['loginForm','registerForm','forgotForm','resetForm'].forEach(id=>{const el=$('#'+id);if(el)el.classList.add('hidden')})}
function showForgotPassword(){hideAuthForms();document.querySelectorAll('[data-auth-tab]').forEach(x=>x.classList.remove('active'));$('#forgotForm').classList.remove('hidden');setAuth('')}
function showResetPassword(token){passwordResetToken=token||passwordResetToken;hideAuthForms();document.querySelectorAll('[data-auth-tab]').forEach(x=>x.classList.remove('active'));$('#resetForm').classList.remove('hidden');setAuth('')}
$('#forgotPasswordBtn').onclick=showForgotPassword;
$('#forgotBackBtn').onclick=()=>activateAuthTab('login');
$('#resetBackBtn').onclick=()=>{passwordResetToken='';history.replaceState({},'',location.pathname);activateAuthTab('login')};
$('#forgotForm').onsubmit=async e=>{e.preventDefault();setAuth('Sending reset instructions…');try{const r=await api('/api/auth/forgot-password',{method:'POST',body:JSON.stringify({email:$('#forgotEmail').value})});if(r.test_token){showResetPassword(r.test_token);setAuth('Test mode: reset link created. Choose your new password now.')}else setAuth(r.message||'If the account exists, reset instructions have been sent.')}catch(err){setAuth(err.message)}};
$('#resetForm').onsubmit=async e=>{e.preventDefault();const p1=$('#resetPassword').value,p2=$('#resetPassword2').value;if(p1!==p2){setAuth('Passwords do not match.');return}try{const r=await api('/api/auth/reset-password',{method:'POST',body:JSON.stringify({token:passwordResetToken,new_password:p1})});passwordResetToken='';history.replaceState({},'',location.pathname);activateAuthTab('login');setAuth(r.message||'Password updated. You can now sign in.')}catch(err){setAuth(err.message)}};
if(passwordResetToken){setTimeout(()=>showResetPassword(passwordResetToken),0)}

// v3.9 public sales preview — five protected sample questions, no account/card required.
const trialState={index:0,question:null,selected:null,answered:false,score:0};
function activateAuthTab(name){
  const btn=document.querySelector(`[data-auth-tab="${name}"]`); if(!btn)return;
  document.querySelectorAll('[data-auth-tab]').forEach(x=>x.classList.toggle('active',x===btn));
  $('#loginForm').classList.toggle('hidden',name!=='login');
  $('#registerForm').classList.toggle('hidden',name!=='register');
  const ff=$('#forgotForm'); if(ff)ff.classList.add('hidden');
  const rf=$('#resetForm'); if(rf)rf.classList.add('hidden');
  setAuth('');
}
async function openPublicTrial(){
  if(!state.token||!state.user){requestFreeDrillSignup();return}
  trialState.index=0;trialState.question=null;trialState.selected=null;trialState.answered=false;trialState.score=0;
  $('#trialSubmitBtn').textContent='Check answer';$('#trialSubmitBtn').onclick=handleTrialSubmit;
  $('#publicTrial').classList.remove('hidden');
  await loadPublicTrialQuestion();
}
function requestFreeDrillSignup(){
  state.pendingTrial=true;
  activateAuthTab('register');
  setAuth('Create your free account, or choose Sign in if you already have one, to unlock the 5-question drill.');
  const name=$('#regName'); if(name)name.focus({preventScroll:true});
  document.querySelector('.auth-card')?.scrollIntoView({behavior:'smooth',block:'center'});
}
$('#trialStartBtn').onclick=requestFreeDrillSignup;

function thanksgivingDate(year){
  const d=new Date(year,10,1,12); // November 1
  const offset=(4-d.getDay()+7)%7;
  return new Date(year,10,1+offset+21,12);
}
function mondayOfWeek(d){
  const x=new Date(d); const day=x.getDay(); const diff=(day+6)%7; x.setDate(x.getDate()-diff); x.setHours(12,0,0,0); return x;
}
function sameDate(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function isHolidayWeekTuesday(d){
  if(d.getDay()!==2)return true;
  const y=d.getFullYear();
  const tg=thanksgivingDate(y);
  const tgTuesday=new Date(tg); tgTuesday.setDate(tg.getDate()-2);
  if(sameDate(d,tgTuesday))return true;
  const christmas=new Date(y,11,25,12);
  const christmasWeekMonday=mondayOfWeek(christmas);
  const christmasTuesday=new Date(christmasWeekMonday); christmasTuesday.setDate(christmasWeekMonday.getDate()+1);
  if(sameDate(d,christmasTuesday))return true;
  return false;
}
function eligibleClassTuesdays(){
  const out=[]; const now=new Date(); now.setHours(12,0,0,0);
  const end=new Date(now); end.setMonth(end.getMonth()+18);
  const d=new Date(now);
  while(d.getDay()!==2)d.setDate(d.getDate()+1);
  for(;d<=end;d.setDate(d.getDate()+7)){
    const x=new Date(d);
    if(!isHolidayWeekTuesday(x))out.push(x);
  }
  return out;
}
function populateClassDates(){
  const select=$('#classDate'); if(!select)return;
  const current=select.value;
  select.innerHTML='<option value="">Choose an available Tuesday</option>'+eligibleClassTuesdays().map(d=>{
    const value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const label=d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    return `<option value="${value}">${label}</option>`;
  }).join('');
  if([...select.options].some(o=>o.value===current))select.value=current;
}
$('#liveClassBtn').onclick=()=>{
  populateClassDates();
  const modal=$('#liveClassModal'); if(modal)modal.classList.remove('hidden');
};
function isUnavailableClassDate(value){
  if(!value)return 'Choose an available Tuesday start date.';
  const d=new Date(value+'T12:00:00');
  if(d.getDay()!==2)return 'Classes can only start on Tuesday.';
  if(isHolidayWeekTuesday(d))return 'That Tuesday is unavailable because it falls in Thanksgiving or Christmas week.';
  return '';
}
if($('#classDate'))$('#classDate').onchange=e=>{
  const msg=isUnavailableClassDate(e.target.value);
  $('#classRegistrationMessage').textContent=msg;
  $('#classRegistrationMessage').classList.toggle('error',!!msg);
};
if($('#liveClassForm'))$('#liveClassForm').onsubmit=async e=>{
  e.preventDefault();
  const date=$('#classDate').value;
  const invalid=isUnavailableClassDate(date);
  if(invalid){$('#classRegistrationMessage').textContent=invalid;return}
  const btn=e.currentTarget.querySelector('button[type="submit"]');
  btn.disabled=true;btn.textContent='Saving your date…';
  try{
    const r=await api('/api/public/pmp-class/register',{
      method:'POST',
      body:JSON.stringify({name:$('#className').value,email:$('#classEmail').value,preferred_date:date})
    });
    const selected=new Date(r.preferred_date+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    $('#classRegistrationMessage').textContent=r.pending_email_sent
      ?`✓ ${selected} saved. Registration notice emailed to Azielon. Opening secure payment…`
      :`✓ ${selected} saved. Opening secure payment… Email is not configured yet; admin can fix this in Instructor Studio.`;
    setTimeout(()=>window.open(r.payment_url,'_blank','noopener'),350);
    btn.textContent='Saved ✓';
  }catch(err){
    $('#classRegistrationMessage').textContent=err.message||'Unable to save registration.';
    btn.disabled=false;btn.textContent='Continue to Secure Online Payment →';
  }
};

if($('#memberTrialBtn'))$('#memberTrialBtn').onclick=openPublicTrial;
$('#trialCloseBtn').onclick=()=>$('#publicTrial').classList.add('hidden');
async function loadPublicTrialQuestion(){
  $('#trialFeedback').classList.add('hidden');$('#trialFeedback').innerHTML='';
  $('#trialNextBtn').classList.add('hidden');$('#trialSubmitBtn').classList.remove('hidden');
  $('#trialSubmitBtn').textContent='Check answer';$('#trialSubmitBtn').onclick=handleTrialSubmit;
  $('#trialSubmitBtn').disabled=true;trialState.selected=null;trialState.answered=false;
  try{
    const r=await api(`/api/public/trial/question/${trialState.index}`);
    trialState.question=r.question;
    $('#trialProgress').textContent=`Question ${trialState.index+1} of 5`;
    $('#trialTrackFill').style.width=`${(trialState.index+1)*20}%`;
    const opts=Array.isArray(r.question.options)?r.question.options:[];
    $('#trialQuestion').innerHTML=`<h3>${escapeHtml(r.question.stem)}</h3>${opts.map((o,i)=>{
      const id=o.id??o.option_id??String(i); const text=o.text??o.label??o.value??String(o);
      return `<button class="trial-option" type="button" data-trial-option="${escapeHtml(id)}"><b>${String.fromCharCode(65+i)}</b><span>${escapeHtml(text)}</span></button>`
    }).join('')}`;
    $$('.trial-option').forEach(b=>b.onclick=()=>{if(trialState.answered)return;$$('.trial-option').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');trialState.selected=b.dataset.trialOption;$('#trialSubmitBtn').disabled=false});
  }catch(err){
    $('#trialQuestion').innerHTML=`<p>${escapeHtml(err.message)}</p>`;$('#trialSubmitBtn').classList.add('hidden');
  }
}
function trialExplanationText(ex){
  if(!ex)return 'Review the underlying principle and why the distractors do not fit the scenario.';
  if(typeof ex==='string')return ex;
  for(const k of ['plainRationale','rationale','correctAnswer','whyCorrect','explanation','lesson']) if(typeof ex[k]==='string'&&ex[k].trim())return ex[k];
  const vals=[];const walk=v=>{if(typeof v==='string'&&v.trim())vals.push(v.trim());else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk)};walk(ex);
  return vals[0]||'Review the underlying principle and why the distractors do not fit the scenario.';
}
async function handleTrialSubmit(){
  if(!trialState.question||!trialState.selected)return;
  try{
    const r=await api('/api/public/trial/answer',{method:'POST',body:JSON.stringify({question_id:trialState.question.id,selected_option_ids:[trialState.selected]})});
    trialState.answered=true;if(r.is_correct)trialState.score++;
    $$('.trial-option').forEach(b=>{if((r.correct_option_ids||[]).includes(b.dataset.trialOption))b.classList.add('correct');else if(b.dataset.trialOption===trialState.selected)b.classList.add('wrong');b.disabled=true});
    $('#trialFeedback').innerHTML=`<strong>${r.is_correct?'Correct — good reasoning.':'Not quite — here’s the pattern.'}</strong><br>${escapeHtml(trialExplanationText(r.explanation))}`;
    $('#trialFeedback').classList.remove('hidden');$('#trialSubmitBtn').classList.add('hidden');$('#trialNextBtn').classList.remove('hidden');
    $('#trialNextBtn').textContent=trialState.index===4?'See my preview result':'Next question';
  }catch(err){$('#trialFeedback').textContent=err.message;$('#trialFeedback').classList.remove('hidden')}
}
$('#trialSubmitBtn').onclick=handleTrialSubmit;
$('#trialNextBtn').onclick=async()=>{
  if(trialState.index<4){trialState.index++;await loadPublicTrialQuestion();return}
  $('#trialQuestion').innerHTML=`<div class="trial-result"><span class="sales-kicker">Preview complete</span><h3>You got ${trialState.score} of 5.</h3><p>The score is only the start. Azielon is built to teach the reasoning pattern behind every decision so you know what to do when the wording changes.</p></div>`;
  $('#trialFeedback').classList.add('hidden');$('#trialNextBtn').classList.add('hidden');
  $('#trialSubmitBtn').classList.remove('hidden');$('#trialSubmitBtn').disabled=false;$('#trialSubmitBtn').textContent='Create my account';
  $('#trialSubmitBtn').onclick=()=>{$('#publicTrial').classList.add('hidden');activateAuthTab('register');document.querySelector('.auth-card').scrollIntoView({behavior:'smooth',block:'center'})};
};

document.addEventListener('click',e=>{
  const b=e.target.closest('#nav button.nav-locked');
  if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  showView('billing');
  const m=$('#billingMessage');if(m)m.textContent='Upgrade your plan to unlock this feature.';
},true);

$('#progressManagePlan').onclick=()=>showView('billing');

if($('#practiceViewProgress'))$('#practiceViewProgress').onclick=()=>showView('progress');

$$('[data-admin-open]').forEach(b=>b.onclick=()=>{
  state.adminKind=b.dataset.adminOpen;
  $$('#adminTabs button').forEach(x=>x.classList.toggle('active',x.dataset.adminKind===state.adminKind));
  $('#adminAddBtn').classList.toggle('hidden',state.adminKind==='registrations');
  $('#adminSearch').value='';
  loadAdmin();
});

if($('#adminEmailTestBtn'))$('#adminEmailTestBtn').onclick=async()=>{
  const b=$('#adminEmailTestBtn');b.disabled=true;b.textContent='Sending…';
  try{
    const r=await api('/api/admin/email-test',{method:'POST'});
    $('#adminMessage').textContent=`✓ Test email sent to ${r.sent_to}`;
  }catch(err){
    $('#adminMessage').textContent=err.message;
  }finally{
    b.disabled=false;b.textContent='Send test email';
  }
};
