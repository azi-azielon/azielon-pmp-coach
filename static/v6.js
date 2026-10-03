
/* Per-browser memory of today's practice scores (shown in "Done today"). */
function v6SetScore(id,v){try{localStorage.setItem('v6score:'+id,v)}catch(e){}}
function v6GetScore(id){try{return localStorage.getItem('v6score:'+id)||''}catch(e){return''}}
/* Azielon PMP Coach — v6 learner experience layer.
   Loads after app.js. Re-renders the shell and the "Today" home so the learner
   always sees one clear next step. All data and actions come from app.js. */
(function(){
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>(typeof escapeHtml==='function'?escapeHtml(String(s??'')):String(s??''));
  document.body.classList.add('v6');

  /* ---------- Shell: stepper into top bar, exam chip, health pill ---------- */
  const topbar=q('.topbar'),actions=q('.top-actions'),journey=q('#learnerJourney');
  if(topbar&&journey&&actions)topbar.insertBefore(journey,actions);
  let chip=null;
  if(actions){
    chip=document.createElement('button');chip.type='button';chip.id='v6ExamChip';chip.className='v6-exam-chip is-unset';chip.hidden=true;
    actions.insertBefore(chip,actions.firstChild);
    chip.onclick=()=>{state.dashboardFocus='readiness';showView('dashboard');setTimeout(()=>{state.dashboardFocus='readiness';renderFeatureLaunchpad(state.lastProgress||{})},0)};
  }
  const pill=q('#healthPill');
  if(pill)new MutationObserver(()=>pill.classList.toggle('is-offline',/offline/i.test(pill.textContent))).observe(pill,{childList:true,characterData:true,subtree:true});

  function fmtDate(iso){if(!iso)return'';const d=new Date(iso+'T12:00:00');return isNaN(d)?'':d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}
  function updateChip(p){
    if(chip){chip.hidden=true;return}const staff=typeof isStaff==='function'&&isStaff();
    if(staff||!p||!p.adaptive_plan){chip.hidden=true;return}
    const days=p.adaptive_plan.days_until_exam;chip.hidden=false;
    if(days==null){chip.className='v6-exam-chip is-unset';chip.innerHTML='Set your exam date';chip.title='Add your exam date so your plan paces itself'}
    else if(days<0){chip.className='v6-exam-chip is-unset';chip.innerHTML='Update exam date';chip.title='Your saved exam date has passed'}
    else{chip.className='v6-exam-chip';chip.innerHTML=`<b>${days}</b><span>day${days===1?'':'s'} to exam</span>`;chip.title=`Exam: ${fmtDate(p.study_profile?.exam_date)}`}
  }
  function enhanceJourneyTips(){
    qa('.topbar .journey-stage[data-journey-tip]').forEach(b=>{if(b.querySelector('.v6-tip'))return;const t=document.createElement('span');t.className='v6-tip';t.textContent=b.dataset.journeyTip||'';b.appendChild(t);b.removeAttribute('title')});
  }
  if(typeof renderLearnerJourney==='function'){
    const orig=renderLearnerJourney;
    window.renderLearnerJourney=function(p){orig(p);enhanceJourneyTips();updateChip(p||state.lastProgress)};
  }

  /* ---------- Home tabs: only the views that live on Home ---------- */
  const HOME_TABS=[['today','Today'],['done','Done today'],['plan','Full plan'],['mistakes','Fix mistakes']];
  window.renderFeatureLaunchpad=function(p){
    const host=q('#featureLaunchpad');if(!host)return;
    let focus=state.dashboardFocus||'today';
    if(!HOME_TABS.some(t=>t[0]===focus)){
      // Legacy focus values map onto real screens in the sidebar
      const map={notes:'notes',tricky:'tricky',diagrams:'diagrams',practice:'practice',exams:'exams',coach:'coach',readiness:'progress'};
      if(map[focus]&&state.currentView==='dashboard'){state.dashboardFocus='today';showView(map[focus]);return}
      focus='today';state.dashboardFocus='today';
    }
    host.innerHTML=HOME_TABS.map(([k,t])=>`<button class="pmp-focus-tab ${focus===k?'active':''}" type="button" role="tab" aria-selected="${focus===k}" data-dashboard-focus="${k}"><span class="feature-launch-icon" aria-hidden="true">${typeof launchpadIcon==='function'?launchpadIcon(k):''}</span><span>${esc(t)}${k==='done'&&typeof v6DoneTodayTasks==='function'&&v6DoneTodayTasks().length?` <em class="v6-tab-count">${v6DoneTodayTasks().length}</em>`:''}</span></button>`).join('');
    const ws=q('#dashboardWorkspace');if(ws)ws.classList.toggle('v6-today-host',focus==='today');
    const overall=q('#dashboardOverallPct');if(overall&&typeof learningOverview==='function')overall.textContent=learningOverview(p||{}).avg+'%';
    qa('[data-dashboard-focus]',host).forEach(b=>b.onclick=()=>{state.dashboardFocus=b.dataset.dashboardFocus;window.renderFeatureLaunchpad(p)});
    if(focus==='done'&&typeof v6RenderDoneToday==='function'){v6RenderDoneToday()}else renderDashboardWorkspace(focus,p);
    renderGlobalStudyNav(p);
  };

  /* ---------- Today ---------- */
  const TYPE={
    note:{label:'Topic note',verb:'Read this note',icon:'notes'},
    tricky:{label:'Tricky words',verb:'Compare the terms',icon:'tricky'},
    diagram:{label:'Diagram',verb:'Study the diagram',icon:'diagrams'},
    practice:{label:'Practice',verb:'Start practice',icon:'practice'},
    exam:{label:'Mock exam',verb:'Resume exam',icon:'exams'},
    review:{label:'Fix mistakes',verb:'Review now',icon:'mistakes'}
  };
  const icon=k=>typeof launchpadIcon==='function'?launchpadIcon(k):'';

  function ring(score){
    const v=Math.max(0,Math.min(100,Number(score)||0));
    return `<div class="v6-score"><b>${v}</b><span>/100</span></div><div class="v6-thinbar"><i style="width:${v}%"></i></div>`;
  }
  function readinessCard(p){
    const r=p?.readiness||{},plan=p?.adaptive_plan||{},prof=p?.study_profile||{},days=plan.days_until_exam;
    let line;
    if(days==null||days<0){
      line=`<p>${days<0?'Your exam date has passed. Set your new date':'Add your exam date'} and your daily plan will pace itself.</p><form class="v6-date-form" id="v6DateForm"><input type="date" id="v6DateInput" required min="${todayDateKey()}" aria-label="Exam date"><button type="submit">Save</button></form>`;
    }else{
      const perWeek=plan.target_questions_per_week?` · ${plan.target_questions_per_week} questions/week`:'';
      line=`<p><b>${days} day${days===1?'':'s'}</b> to your exam · ${esc(fmtDate(prof.exam_date))}</p><p>${esc(plan.phase||'Foundation')} phase${esc(perWeek)}</p>`;
    }
    return `<section class="v6-card v6-ready">${ring(r.score)}<div><span class="v6-kicker">Exam readiness</span><h4>${esc(r.label||'Getting started')}</h4>${line}</div></section>`;
  }
  function watchCard(p){
    const pat=(p?.mistake_patterns||[])[0],weak=(p?.adaptive_plan?.weak_domains||[])[0];
    if(pat){
      const weakLine=weak?`<div class="v6-watch-sub"><span>Weakest domain: <b>${esc(weak.domain)} · ${weak.accuracy}%</b></span><button class="v6-link" type="button" data-dash-practice data-count="10" data-domain="${esc(weak.domain)}">Practice it →</button></div>`:'';
      return `<section class="v6-card v6-watch"><span class="v6-kicker">Watch out for</span><h4>${esc(pat.title)}</h4><p>${esc(pat.tip||'')}${pat.count?` Seen in ${pat.count} of your recent misses.`:''}</p><div class="v6-watch-actions"><button class="v6-link" type="button" data-dash-focus="mistakes">Fix this pattern →</button></div>${weakLine}</section>`;
    }
    if(weak)return `<section class="v6-card v6-watch"><span class="v6-kicker">Weakest area</span><h4>${esc(weak.domain)} · ${weak.accuracy}%</h4><p>Your lowest-scoring domain so far. Today’s practice leans toward it automatically.</p><button class="v6-link" type="button" data-dash-practice data-count="10" data-domain="${esc(weak.domain)}">Practice ${esc(weak.domain)} →</button></section>`;
    return `<section class="v6-card v6-watch is-good"><span class="v6-kicker">How this works</span><h4>We plan it. You follow the next step.</h4><p>As you study and practice, this card will point out the reasoning habits costing you points.</p></section>`;
  }
  function dateNudge(p){
    const days=p?.adaptive_plan?.days_until_exam;if(days!=null&&days>=0)return'';
    return `<section class="v6-nudge"><span class="v6-kicker">One-time setup</span><p>${days<0?'Your exam date has passed. Add the new date':'Add your exam date'} so your daily plan paces itself.</p><form class="v6-date-form" id="v6DateForm"><input type="date" id="v6DateInput" required min="${todayDateKey()}" aria-label="Exam date"><button type="submit">Save</button></form></section>`;
  }
  function statsCard(p){
    const acc=p?.practice_accuracy,done=p?.practice_unique_attempted||0,total=p?.practice_bank_total||0,rev=(p?.review_queue||[]).length;
    return `<section class="v6-card v6-stats"><button class="v6-stat" type="button" data-dash-open="progress"><b>${acc==null?'—':Math.round(acc)+'%'}</b><span>Accuracy</span></button><button class="v6-stat" type="button" data-dash-open="practice"><b>${done}</b><span>of ${total} practiced</span></button><button class="v6-stat" type="button" data-dash-open="review"><b>${rev}</b><span>to review</span></button></section>`;
  }
  function taskRow(t,isNext){
    const st=taskState(t),meta=TYPE[t.type]||{label:t.label||'Study'};
    const cls=st==='done'?'is-done':st==='in_progress'?'is-progress':'';
    return `<div class="v6-task ${cls} ${isNext?'is-next':''}"><button class="v6-task-dot" type="button" ${st==='done'?'disabled aria-label="Done"':`data-today-done="${esc(t.id)}" aria-label="Mark done" title="Mark done"`}>✓</button><div class="v6-task-copy"><div class="v6-task-meta"><span class="v6-task-type">${esc(meta.label)}</span>${t.carriedFrom?'<span class="v6-task-flag">· carried over</span>':''}${st==='in_progress'?'<span class="v6-task-flag">· in progress</span>':''}${isNext?'<span class="v6-task-flag">· up next</span>':''}</div><p class="v6-task-title" title="${esc(t.title)}">${esc(t.title)}</p></div><button class="v6-task-open" type="button" data-today-open="${esc(t.id)}">${st==='done'?'Review':'Open'} →</button></div>`;
  }
  function nextHero(p,tasks){
    const next=tasks.find(t=>taskState(t)!=='done');
    const j=typeof learnerJourneyState==='function'?learnerJourneyState(p||{}):null;
    const stage=j?`Stage ${j.index+1} of 5 · ${j.stages[j.index].title}`:'';
    if(next){
      const meta=TYPE[next.type]||{label:next.label,verb:'Open',icon:'today'};
      const why=next.reason?`<div class="v6-next-why">★ ${esc(next.reason)}</div>`:'';
      return `<section class="v6-next"><div class="v6-next-top"><span class="v6-kicker">Your next step</span><span class="v6-next-type">${icon(meta.icon)}${esc(meta.label)}</span></div><h2>${esc(next.title)}</h2><p>${esc(next.detail||'')}</p>${why}<div class="v6-next-actions"><button class="v6-btn-gold" type="button" data-today-open="${esc(next.id)}">${esc(meta.verb)} <span aria-hidden="true">→</span></button><button class="v6-btn-quiet" type="button" data-today-done="${esc(next.id)}">Mark done</button></div></section>`;
    }
    const n=typeof nextAfterTodayAction==='function'?nextAfterTodayAction(p||{}):null;
    return `<section class="v6-next v6-done-hero"><div class="v6-next-top"><span class="v6-kicker">Today’s plan is complete</span>${stage?`<span class="v6-next-type">${esc(stage)}</span>`:''}</div><h2>Great work today.</h2><p>${n?esc('Want to keep going? Next up: '+n.title+'.'):'Come back tomorrow for your next plan.'}</p>${n?`<div class="v6-next-actions"><button class="v6-btn-gold" type="button" data-next-after-today="${esc(n.kind)}" data-next-item="${esc(n.itemId||'')}">${esc(n.button||'Keep going')} →</button></div>`:''}</section>`;
  }

  function upNext(p,tasks){
    if(typeof nextFourTasks!=='function')return'';let rows=[];try{rows=nextFourTasks(p||{},tasks).slice(0,2)}catch(e){return''}
    if(!rows.length)return'';
    return `<section class="v6-card v6-plan v6-upnext"><div class="v6-plan-head"><h3>Coming up after today</h3><span class="v6-plan-count">Planned for you</span></div><div class="v6-plan-list">${rows.map(t=>{const meta=TYPE[t.type]||{label:t.label||'Study'};return `<div class="v6-task"><span class="v6-task-dot" aria-hidden="true"></span><div class="v6-task-copy"><div class="v6-task-meta"><span class="v6-task-type">${esc(meta.label)}</span></div><p class="v6-task-title" title="${esc(t.title)}">${esc(t.title)}</p></div><button class="v6-task-open" type="button" data-next-preview-open="${esc(t.type)}" data-next-preview-id="${esc(String(t.itemId||''))}">Preview →</button></div>`}).join('')}</div></section>`;
  }
  window.renderTodayPlanFromDb=function(p,tasks){
    const host=q('#dashboardWorkspace');if(!host)return;host.classList.add('v6-today-host');
    tasks=tasks||[];const done=tasks.filter(t=>taskState(t)==='done').length,pct=tasks.length?Math.round(done/tasks.length*100):0;
    const nextId=(tasks.find(t=>taskState(t)!=='done')||{}).id;
    host.innerHTML=`<div class="v6-home"><div class="v6-col">${nextHero(p,tasks)}<section class="v6-card v6-plan"><div class="v6-plan-head"><h3>Today’s plan</h3><div class="v6-plan-bar" aria-hidden="true"><i style="width:${pct}%"></i></div><span class="v6-plan-count">${done} of ${tasks.length} done</span></div><div class="v6-plan-list">${tasks.length?tasks.map(t=>taskRow(t,t.id===nextId)).join(''):'<p class="v6-task-flag" style="padding:10px 6px">You are caught up for today.</p>'}</div></section>${upNext(p,tasks)}</div><div class="v6-col">${watchCard(p)}${dateNudge(p)}</div></div>`;
    state.todayTaskJustAdded=false;
    bindDashboardWorkspaceActions();
    const f=q('#v6DateForm');
    if(f)f.onsubmit=async e=>{e.preventDefault();const v=q('#v6DateInput').value;if(!v)return;const btn=f.querySelector('button');btn.textContent='Saving…';
      const prof=p?.study_profile||{};
      try{await api('/api/coach/profile',{method:'PUT',body:JSON.stringify({exam_date:v,weekly_hours:prof.weekly_hours||7,study_days_per_week:prof.study_days_per_week||5,session_minutes:prof.session_minutes||45})});await loadProgress();}
      catch(err){btn.textContent='Save';alert(err.message||'Could not save your exam date.')}};
  };

  // Loading state that matches the new layout (avoids a jump)
  const origLoad=typeof loadAndRenderTodayPlan==='function'?loadAndRenderTodayPlan:null;
  if(origLoad)window.loadAndRenderTodayPlan=async function(p){
    const host=q('#dashboardWorkspace');
    if(host&&!host.querySelector('.v6-home')){host.classList.add('v6-today-host');host.innerHTML='<div class="v6-home"><div class="v6-col"><section class="v6-next"><span class="v6-kicker">Your next step</span><h2 style="opacity:.55">Preparing today’s plan…</h2></section></div><div class="v6-col"></div></div>'}
    return origLoad(p);
  };
})();

/* Fix: My Progress summary was never rendered (function existed but was not called). */
(function(){
  if(typeof renderCompactProgressDashboard!=='function')return;
  const safe=()=>{try{if(state.lastProgress)renderCompactProgressDashboard(state.lastProgress)}catch(e){console.warn('progress summary',e)}};
  if(typeof loadProgress==='function'){const orig=loadProgress;window.loadProgress=async function(){const r=await orig.apply(this,arguments);safe();return r}}
  if(typeof showView==='function'){const orig=showView;window.showView=function(id){const r=orig.apply(this,arguments);if(id==='progress')safe();return r}}
})();

/* My Progress = report card. Today's task list lives on Today; here we link to it. */
(function(){
  const panel=document.querySelector('.progress-next-panel');if(!panel)return;
  const b=document.createElement('button');b.type='button';b.className='primary v6-progress-today';b.textContent='Open today’s plan →';
  b.onclick=()=>{state.dashboardFocus='today';showView('dashboard');setTimeout(()=>{state.dashboardFocus='today';renderFeatureLaunchpad(state.lastProgress||{})},0)};
  panel.appendChild(b);
})();

/* Practice focus mode: while a session runs, show only the question. */
(function(){
  const view=document.getElementById('practice'),area=document.getElementById('sessionArea');if(!view||!area)return;
  const top=area.querySelector('.session-top');
  if(top&&!top.querySelector('.v6-session-exit')){
    const b=document.createElement('button');b.type='button';b.className='v6-session-exit';b.textContent='← Practice setup';
    b.onclick=()=>{if(typeof clearPracticeTimer==='function')try{clearPracticeTimer()}catch(e){}area.classList.add('hidden');if(typeof loadProgress==='function')loadProgress().catch(()=>{})};
    top.insertBefore(b,top.firstChild);
  }
  const sync=()=>view.classList.toggle('v6-in-session',!area.classList.contains('hidden'));
  new MutationObserver(sync).observe(area,{attributes:true,attributeFilter:['class']});sync();
})();

/* "Done" flow: marking a topic done moves the learner forward.
   Opened from Today -> back to Today (next step is waiting). Otherwise -> next item. */
(function(){
  let fromToday=false;
  if(typeof openTodayTask==='function'){const o=openTodayTask;window.openTodayTask=async function(t){
    const kind=t&&t.type;
    if(!['note','tricky','diagram'].includes(kind)){fromToday=false;return o.apply(this,arguments)}
    // Open the exact item in the one-at-a-time study view (not the browse grid)
    if(taskState(t)!=='done'&&typeof setDailyTaskStatus==='function'){try{await setDailyTaskStatus(t,'in_progress')}catch(e){}}
    const cfg={note:['notes','noteMode','noteIndex',()=>noteRows(),()=>renderNotes(),'data-note-mode'],
               tricky:['tricky','trickyMode','flashIndex',()=>trickyRows(),()=>renderTricky(),'data-tricky-mode'],
               diagram:['diagrams','diagramMode','diagramIndex',()=>diagramRows(),()=>renderDiagrams(),'data-diagram-mode']}[kind];
    const [view,modeKey,idxKey,rowsFn,renderFn,attr]=cfg;
    showView(view);
    setTimeout(()=>{
      fromToday=true;
      state[modeKey]='study';let rows=rowsFn(),i=rows.findIndex(x=>String(x.id)===String(t.itemId));
      if(i<0){state[modeKey]='all';rows=rowsFn();i=Math.max(0,rows.findIndex(x=>String(x.id)===String(t.itemId)));state[modeKey]='study';
        if(kind==='note'&&typeof renderNotesSingle==='function'){renderNotesSingle(rows,i,true);fromToday=true;return}}
      state[idxKey]=Math.max(0,i);renderFn();
      document.querySelectorAll(`[${attr}]`).forEach(b=>b.classList.toggle('active',b.getAttribute(attr)==='study'));
      fromToday=true;
    },60);
  }}
  document.addEventListener('click',e=>{if(e.target.closest('#nav button'))fromToday=false},true);
  if(typeof setStudyStatus!=='function')return;
  const orig=setStudyStatus;
  const KIND={
    note:{list:'notes',btn:'noteReviewed',idx:'noteIndex',rows:()=>noteRows(),render:()=>renderNotes(),next:'Next topic'},
    tricky:{list:'tricky',btn:'trickyReviewed',idx:'flashIndex',rows:()=>trickyRows(),render:()=>renderTricky(),next:'Next pair'},
    diagram:{list:'diagrams',btn:'diagramReviewed',idx:'diagramIndex',rows:()=>diagramRows(),render:()=>renderDiagrams(),next:'Next diagram'}};
  const curId={};
  function backToToday(){fromToday=false;state.dashboardFocus='today';showView('dashboard');setTimeout(()=>{state.dashboardFocus='today';if(typeof loadProgress==='function')loadProgress().then(()=>renderFeatureLaunchpad(state.lastProgress||{})).catch(()=>renderFeatureLaunchpad(state.lastProgress||{}))},0)}
  async function goNext(type){
    if(fromToday){
      // From Today the system drives: finish this step, then open the next one.
      const k=KIND[type],id=curId[type],item=(state[k.list]||[]).find(x=>String(x.id)===String(id));
      if(item&&!['reviewed','mastered'].includes(item.studyStatus)){try{await api(`/api/study/items/${type}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({status:'reviewed'})});item.studyStatus='reviewed'}catch(e){alert(e.message||'Could not save. Try again.');return}}
      const nxt=typeof v7NextTask==='function'?v7NextTask(`${type}:${id}`):null;
      if(nxt){fromToday=false;return openTodayTask(nxt)}
      return backToToday();
    }
    const k=KIND[type],rows=k.rows(),pos=rows.findIndex(x=>String(x.id)===String(curId[type]));
    // A finished item drops out of the "to study" list, so the same position is already the next item.
    state[k.idx]=pos>=0?(pos+1)%Math.max(1,rows.length):Math.min(state[k.idx]||0,Math.max(0,rows.length-1));
    k.render();const v=document.querySelector('.view.active');if(v)v.scrollTop=0;
  }
  // One clear action bar under every note, tricky pair and diagram: [Review later] [Mark as done] [Next →]
  function decorate(type,item){
    const k=KIND[type],done=document.getElementById(k.btn);if(!done)return;
    if(!item){const rows=k.rows();item=rows[Math.min(state[k.idx]||0,rows.length-1)]}
    if(item)curId[type]=item.id;
    const bar=done.parentElement;bar.classList.add('v6-study-bar');if(bar.querySelector('.v6-study-next'))return;
    const isDone=done.classList.contains('is-complete');
    done.textContent=isDone?'✓ Done':'Mark as done';done.disabled=isDone;
    done.title='Saves this as studied. It counts toward your progress and Today’s plan.';
    const nx=document.createElement('button');nx.type='button';nx.className='v6-study-next'+(isDone?' is-ready':'');
    if(fromToday){const nt=typeof v7NextTask==='function'?v7NextTask(`${type}:${item?item.id:''}`):null;const lab=nt?({note:'Topic note',tricky:'Tricky words',diagram:'Diagram',practice:'Practice',exam:'Mock exam'}[nt.type]||'Next step'):'';
      done.hidden=true;nx.classList.add('is-ready');nx.textContent=nt?`Done — next: ${lab} →`:'Done — back to Today →'}
    else nx.textContent=k.next+' →';
    nx.onclick=()=>{nx.disabled=true;Promise.resolve(goNext(type)).finally(()=>{nx.disabled=false})};bar.appendChild(nx);
  }
  if(typeof renderNotesSingle==='function'){const o=renderNotesSingle;window.renderNotesSingle=function(rows,i,iso){const r=o.apply(this,arguments);try{decorate('note',rows&&rows[state.noteIndex])}catch(e){}return r}}
  if(typeof renderTricky==='function'){const o=renderTricky;window.renderTricky=function(){const r=o.apply(this,arguments);try{decorate('tricky')}catch(e){}return r}}
  if(typeof renderDiagrams==='function'){const o=renderDiagrams;window.renderDiagrams=async function(){const r=await o.apply(this,arguments);try{decorate('diagram')}catch(e){}return r}}
  window.setStudyStatus=async function(type,id,status){
    const k=KIND[type],btn=k&&document.getElementById(k.btn);
    if(status!=='reviewed'||!btn)return orig.apply(this,arguments);
    // Mark as done = save it as studied and stay on the page; Next moves on.
    btn.disabled=true;btn.textContent='Saving…';
    try{await api(`/api/study/items/${type}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({status})})}
    catch(e){btn.disabled=false;btn.textContent='Mark as done';alert(e.message||'Could not save. Try again.');return}
    const item=(state[k.list]||[]).find(x=>String(x.id)===String(id));if(item)item.studyStatus='reviewed';
    curId[type]=id;btn.textContent='✓ Done';btn.classList.add('is-complete');
    const art=btn.closest('article');const badge=art&&art.querySelector('.study-status-badge, .status-badge');if(badge){badge.textContent='Done';badge.className=badge.className.replace(/\bstatus-\S+/g,'')+' status-reviewed'}
    const nx=btn.parentElement.querySelector('.v6-study-next');if(nx){nx.classList.add('is-ready');nx.focus({preventScroll:true})}
    if(typeof loadStudySummary==='function')loadStudySummary().catch(()=>{});
  };
})();

/* Exam focus mode: once an exam is chosen or running, show only that exam. */
(function(){
  const view=document.getElementById('exams');if(!view)return;
  const ids=['examSetup','ruleReviewArea','examSessionArea','examResults'];
  const els=ids.map(id=>document.getElementById(id)).filter(Boolean);
  const back=document.createElement('button');back.type='button';back.className='v6-session-exit v6-exam-back';back.textContent='← All exams';
  back.onclick=()=>{if(state.examLock)return;els.forEach(e=>e.classList.add('hidden'));view.scrollTop=0};
  view.insertBefore(back,view.firstChild);
  const sync=()=>{
    const open=els.some(e=>!e.classList.contains('hidden')&&e.innerHTML.trim());
    view.classList.toggle('v6-exam-focus',open);
    back.hidden=!open||!!state.examLock||!document.getElementById('examSessionArea').classList.contains('hidden');
    if(open)view.scrollTop=0;
  };
  els.forEach(e=>new MutationObserver(sync).observe(e,{attributes:true,attributeFilter:['class']}));sync();
})();
/* Keep the current exam question visible in the one-line navigator */
(function(){const nav=document.getElementById('examNavigator');if(!nav)return;new MutationObserver(()=>{const c=nav.querySelector('.current, .active, [aria-current="true"]');if(c)c.scrollIntoView({block:'nearest',inline:'center'})}).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']})})();

/* ---------- Daily plan practice: on today's topics, and it completes ---------- */
(function(){
  // 1) Attach today's note / tricky pair / diagram to the practice request so questions match what was studied.
  if(typeof api==='function'){
    const origApi=api;
    window.api=function(path,opts){
      if(state.v6RelatedTo&&path==='/api/practice/sessions'&&opts&&opts.method==='POST'){
        try{const b=JSON.parse(opts.body||'{}');b.related_to=state.v6RelatedTo;opts={...opts,body:JSON.stringify(b)}}catch(e){}
        state.v6RelatedTo=null;
      }
      return origApi.call(this,path,opts);
    };
  }
  function todaysTopics(task){
    const plan=state.todayPlan||[],out={};let i=task?plan.findIndex(t=>t.id===task.id):-1;
    if(i<0)i=plan.findIndex(t=>t.type==='practice'&&taskState(t)!=='done');
    for(let k=i-1;k>=0;k--){const t=plan[k];if(t.type==='practice'||t.type==='exam')break;if(['note','tricky','diagram'].includes(t.type)&&t.itemId&&!out[t.type])out[t.type]=String(t.itemId)}
    return out;
  }
  // 2) Starting practice from Today: remember the task, use today's topics, mixed domains.
  if(typeof openTodayTask==='function'){
    const o=window.openTodayTask;
    window.openTodayTask=async function(t){
      if(t&&t.type==='practice'){
        state.v6PracticeTask=t;const rel=todaysTopics(t);state.v6RelatedTo=Object.keys(rel).length?rel:null;
        if(state.v6RelatedTo){t={...t,domain:'',focus:''}} // topic-matched set replaces the domain/missed filters
      }else if(t&&t.type!=='practice'){state.v6PracticeTask=null}
      return o.call(this,t);
    };
  }
  document.addEventListener('click',e=>{const b=e.target.closest('#nav button');if(b&&b.dataset.view!=='practice'){state.v6PracticeTask=null}},true);
  // 3) Session finished: mark today's practice task done and point to the next step.
  if(typeof renderSessionComplete==='function'){
    const orig=renderSessionComplete;
    window.renderSessionComplete=async function(){
      const sess=state.session,task=state.v6PracticeTask;
      const r=await orig.apply(this,arguments);
      if(!sess)return r;
      let res=null;try{res=await api(`/api/practice/sessions/${sess.session_id}/results`)}catch(e){}
      let planTask=task;
      if(!planTask){planTask=(state.todayPlan||[]).find(x=>x.type==='practice'&&taskState(x)!=='done'&&(sess.total||0)>=Math.min(10,Number(x.count||10)))||null}
      const withMatch=planTask&&typeof v6StartMatchQueue==='function'&&typeof hasFeature==='function'&&hasFeature('match');
      if(withMatch){try{localStorage.setItem('v6pq:'+planTask.id,'1')}catch(e){}}
      else if(planTask&&taskState(planTask)!=='done'&&typeof setDailyTaskStatus==='function'){try{await setDailyTaskStatus(planTask,'done')}catch(e){}}
      state.v6PracticeTask=null;
      const card=document.getElementById('questionCard');if(!card)return r;
      const acc=res&&res.accuracy!=null?Math.round(res.accuracy):null;
      if(planTask&&res)v6SetScore(planTask.id,`${res.correct}/${res.total}${acc!=null?` · ${acc}%`:''}`);
      const verdict=acc==null?'':acc>=80?'Exam-ready accuracy on these topics.':acc>=65?'Close. Review the misses, then move on.':'These topics need another pass. Review each miss before moving on.';
      const box=document.createElement('div');box.className='v6-session-done';
      box.innerHTML=`<span class="v6-kicker">${planTask?'Today’s practice complete':'Session complete'}</span><h3>${res?`${res.correct} of ${res.total} correct`:'Answers saved'}${acc!=null?` <span>· ${acc}%</span>`:''}</h3>${verdict?`<p>${verdict}</p>`:''}<div class="v6-next-actions"><button class="v6-btn-gold" type="button" id="v6BackToday">${withMatch?'Next: 2 match sets on these topics →':'Continue to next step →'}</button>${res&&res.correct<res.total?'<button class="v6-btn-quiet" type="button" id="v6ReviewMisses">Practice my misses</button>':''}</div>`;
      const existing=card.querySelector('.session-summary');
      if(existing){existing.prepend(box);existing.querySelector('h3:not(.v6-session-done h3)')?.remove()}else{card.innerHTML='';card.appendChild(box)}
      const back=box.querySelector('#v6BackToday');back.onclick=async()=>{if(withMatch){document.getElementById('sessionArea').classList.add('hidden');const ok=await v6StartMatchQueue(planTask,v6BlockTopicText(planTask));if(ok)return;try{await setDailyTaskStatus(planTask,'done')}catch(e){}}document.getElementById('sessionArea').classList.add('hidden');state.dashboardFocus='today';showView('dashboard');try{await loadProgress()}catch(e){}renderFeatureLaunchpad(state.lastProgress||{})};
      const miss=box.querySelector('#v6ReviewMisses');if(miss)miss.onclick=()=>{const f=document.getElementById('pReviewFocus');if(f)f.value='last_session_incorrect';const c=document.getElementById('pCount');if(c)c.value=Math.min(10,(res.total-res.correct)||5);createPracticeSession()};
      return r;
    };
  }
})();

/* ---------- Pacing engine: finish everything before exam day ---------- */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const MIN={note:20,tricky:10,diagram:12,question:2,exam:300}; // exam = 4 h sitting + 1 h review
  const EXAM_TARGET=5,EXAM_PASS=80,REVIEW_DAYS=5;
  const tierFull=()=>{const t=String(state.tierCode||state.billing?.tier_code||state.billing?.entitlement?.tier_code||'');return t==='full'||t.startsWith('full')||(typeof isStaff==='function'&&isStaff())};
  const open=rows=>(rows||[]).filter(x=>['not_started','needs_review'].includes(x.studyStatus||'not_started'));
  window.v6Pace=function(p){
    p=p||state.lastProgress||{};const plan=p.adaptive_plan||{},prof=p.study_profile||{};
    const days=plan.days_until_exam;const perWeek=Math.max(1,Math.min(7,Number(prof.study_days_per_week||plan.study_days_per_week||5)));
    const left={note:open(state.notes).length,tricky:open(state.tricky).length,diagram:tierFull()?open(state.diagrams).length:0,
      question:Math.max(0,Number(p.practice_bank_total||0)-Number(p.practice_unique_attempted||0))};
    const hist=(p.exam_history||[]).filter(x=>x.total&&x.correct/x.total*100>=EXAM_PASS&&x.answered>=x.total*0.9&&(x.counts_for_target===undefined||x.counts_for_target));
    const examsDone=Math.min(EXAM_TARGET,hist.length);const examsLeft=EXAM_TARGET-examsDone;
    const out={blocksPerDay:1,perBlockQuestions:15,days,left,examsDone,examsLeft,examTarget:EXAM_TARGET,examPass:EXAM_PASS,perDay:{note:1,tricky:1,diagram:tierFull()?1:0,question:15},hoursPerDay:null,studyDays:null,learnDays:null,examEvery:null,status:'no-date'};
    if(days==null||days<0)return out;
    const studyDays=Math.max(1,Math.floor(days*perWeek/7));
    // keep the final stretch for exams + review; learning must finish before it
    // Learning gets at least 60% of the study days; exams and review share the rest (they can overlap when time is short).
    const review=Math.min(REVIEW_DAYS,Math.floor(studyDays/6));
    const examDays=Math.min(examsLeft*2,Math.max(studyDays>1?1:0,Math.floor(studyDays*0.4)));
    const learnDays=Math.min(studyDays,Math.max(1,Math.ceil(studyDays*0.6),studyDays-examDays-review));
    const per=k=>left[k]?Math.max(1,Math.ceil(left[k]/learnDays)):0;
    out.perDay={note:per('note'),tricky:per('tricky'),diagram:per('diagram'),question:Math.max(10,Math.min(60,Math.ceil(left.question/Math.max(1,studyDays-examsLeft))))};
    const total=left.note*MIN.note+left.tricky*MIN.tricky+left.diagram*MIN.diagram+left.question*MIN.question+examsLeft*MIN.exam;
    out.hoursPerDay=Math.max(0.5,Math.ceil(total/60/studyDays*2)/2);
    out.studyDays=studyDays;out.learnDays=learnDays;out.examEvery=examsLeft?Math.max(1,Math.floor(Math.max(1,studyDays-learnDays)/examsLeft)):null;out.examsFit=Math.min(examsLeft,Math.max(1,studyDays-learnDays+Math.floor(learnDays/3)));
    out.learningDone=!left.note&&!left.tricky&&!left.diagram;
    out.blocksPerDay=Math.max(1,out.perDay.note,out.perDay.tricky,out.perDay.diagram);
    out.perBlockQuestions=Math.max(8,Math.min(30,Math.ceil(out.perDay.question/out.blocksPerDay)));
    out.examPhase=out.learningDone||studyDays<=examDays+1;
    out.status=out.hoursPerDay>8?'unrealistic':out.hoursPerDay>5?'tight':out.hoursPerDay>3?'steady':'comfortable';
    return out;
  };

  // Daily plan built from the pace: N topics, N tricky pairs, N diagrams, practice on those topics, and an exam when it's time.
  // A study block = one topic note + one tricky pair + one diagram + questions on exactly those topics.
  function buildBlock(p,n,exclude){
    const pace=v6Pace(p),weak=p?.adaptive_plan?.weak_domains?.[0]?.domain||'';exclude=exclude||new Set();
    const first=rows=>{let c=open(rows).filter(x=>!exclude.has(String(x.id)));if(weak){const w=c.find(x=>String(x.domain||'').toLowerCase()===weak.toLowerCase());if(w)return w}return c[0]||null};
    const base=(n-1)*10,t=[];
    const note=first(state.notes),tr=first(state.tricky),dg=pace.perDay.diagram?first(state.diagrams):null;
    if(note)t.push({id:`note:${note.id}`,type:'note',itemId:note.id,label:'Read',title:note.title,detail:(note.keyRules||[])[0]||note.summary||'',view:'notes',reason:`Block ${n} · topic`,sortOrder:base+t.length});
    if(tr)t.push({id:`tricky:${tr.id}`,type:'tricky',itemId:tr.id,label:'Compare',title:`${tr.left} vs ${tr.right}`,detail:typeof trickyDecisionText==='function'?trickyDecisionText(tr):'',view:'tricky',reason:`Block ${n} · tricky words`,sortOrder:base+t.length});
    if(dg)t.push({id:`diagram:${dg.id}`,type:'diagram',itemId:dg.id,label:'Visualize',title:dg.title,detail:dg.whyItMatters||dg.whatItIs||'',view:'diagrams',reason:`Block ${n} · diagram`,sortOrder:base+t.length});
    const q=pace.perBlockQuestions;
    t.push({id:`practice:${todayDateKey()}:b${n}`,type:'practice',label:'Practice',title:(t.length?`${q} questions on these ${t.length===1?'topic':'topics'}`:`${q} mixed questions`)+(typeof hasFeature==='function'&&hasFeature('match')?' + 2 match sets':''),detail:t.length?`Questions on ${t.map(x=>x.title).join(' · ')}.`:'Build coverage and speed.',view:'practice',count:q,focus:'',domain:'',reason:`Block ${n} · practice`,sortOrder:base+t.length});
    if(n===1&&pace.examsLeft>0&&pace.examPhase){
      const ex=(p?.exam_cards||[]).find(x=>!x.completed||(x.total&&x.correct/x.total*100<pace.examPass));
      if(ex)t.push({id:`exam:${ex.exam_code}:${todayDateKey()}`,type:'exam',label:'Exam',title:`${ex.exam_name||'Full exam'} — aim for ${pace.examPass}%+`,detail:`${pace.examsDone} of ${pace.examTarget} exams passed at ${pace.examPass}%+.`,view:'exams',examKind:ex.kind||'mock',reason:'Exam stamina and pacing',sortOrder:base+t.length});
    }
    return t;
  }
  window.v6BlockCount=tasks=>(tasks||[]).filter(t=>t.type==='practice').length||1;
  if(typeof buildFreshTodayTasks==='function')window.buildFreshTodayTasks=function(p){return buildBlock(p,1)};
  // When a block is finished and the pace needs more today, add the next block.
  if(typeof appendOneNextTodayTask==='function'){
    window.appendOneNextTodayTask=async function(p,tasks){
      const pace=v6Pace(p),done=v6BlockCount(tasks);
      if(pace.hoursPerDay==null&&done>=1)return false;
      if(done>=pace.blocksPerDay)return false;
      const used=new Set((tasks||[]).map(t=>String(t.itemId||'')));
      const next=buildBlock(p,done+1,used).filter(t=>t.type!=='exam');
      if(next.length<=1&&!next.some(t=>t.type!=='practice')&&done>=1)return false;
      await api('/api/study/daily-plan/import-local',{method:'POST',body:JSON.stringify({plans:[{plan_date:todayDateKey(),tasks:next.map(t=>({...t,status:'not_started'}))}]})});
      const r=await api(`/api/study/daily-plan?plan_date=${encodeURIComponent(todayDateKey())}`);
      state.todayPlan=(r.tasks||[]).map(hydrateDbTask).filter(Boolean);state.todayTaskJustAdded=true;return true;
    };
  }

  // One quiet pacing line on Today, full breakdown on My Progress.
  function paceLine(p){
    const s=v6Pace(p);if(s.hoursPerDay==null)return'';
    return `<p class="v6-pace">Study about <b>${s.hoursPerDay} h/day</b> on ${s.studyDays} study day${s.studyDays===1?'':'s'} to finish every topic and <b>${s.examTarget} exams at ${s.examPass}%+</b> before exam day <span>(${s.examsDone} of ${s.examTarget} done)</span>. <button type="button" class="v6-datebar-btn" data-go-plan>Change exam date</button>${(p&&p.study_profile&&!p.study_profile.background)?' · <button type="button" class="v6-datebar-btn" data-go-ready>Set your study-hours target</button>':''}</p>`;
  }
  const origToday=window.renderTodayPlanFromDb;
  window.renderTodayPlanFromDb=function(p,tasks){
    tasks=tasks||[];const blocks=[];let cur=[];
    tasks.forEach(t=>{cur.push(t);if(t.type==='practice'||t.type==='exam'){blocks.push(cur);cur=[]}});if(cur.length)blocks.push(cur);
    let idx=blocks.findIndex(b=>b.some(t=>taskState(t)!=='done'));if(idx<0)idx=blocks.length-1;
    const shown=blocks.length?blocks[Math.max(0,idx)]:tasks;
    origToday(p,shown);
    const pace=v6Pace(p),total=Math.max(pace.blocksPerDay||1,blocks.filter(b=>b.some(t=>t.type==='practice')).length);
    const cnt=document.querySelector('.v6-plan-count');if(cnt&&blocks.length){const d=shown.filter(t=>taskState(t)==='done').length;cnt.textContent=`${total<=8?`Block ${Math.max(1,idx+1)} of ${total}`:`Block ${Math.max(1,idx+1)} today`} · ${d} of ${shown.length} done`}
    const head=document.querySelector('.v6-plan-head');if(head&&!document.querySelector('.v6-pace'))head.insertAdjacentHTML('afterend',paceLine(p));
  };

  function renderPacePanel(){
    const host=document.querySelector('#progress [data-progress-panel="overview"]');if(!host)return;
    let box=document.getElementById('v6PacePanel');if(!box){box=document.createElement('section');box.id='v6PacePanel';box.className='v6-pace-panel';host.appendChild(box)}
    const s=v6Pace(state.lastProgress);
    if(s.hoursPerDay==null){box.innerHTML=`<span class="v6-kicker">Your plan to exam day</span><p>Add your exam date under <b>My Plan</b> and Azielon will pace every topic, question and exam for you.</p>`;return}
    const L=s.left,row=(label,left,per,unit)=>left?`<div><b>${left}</b><span>${label} left</span><small>${per} ${unit}${per===1?'':'s'} a day</small></div>`:`<div class="is-done"><b>✓</b><span>${label}</span><small>complete</small></div>`;
    const bars=Array.from({length:s.examTarget},(_,i)=>`<i class="${i<s.examsDone?'on':''}"></i>`).join('');
    const tone={comfortable:'Comfortable pace.',steady:'Steady pace — keep it daily.',tight:'Tight timeline — add study days per week or move your exam date if you can.',unrealistic:`That is more than most people can study in a day. Move your exam date if you can; otherwise focus on topic notes, tricky words and practice, and skim the diagrams.`}[s.status];
    box.innerHTML=`<div class="v6-pace-head"><div><span class="v6-kicker">Your plan to exam day</span><h3>${s.hoursPerDay} hours a day · ${s.days} days left</h3><p>${tone} Based on ${s.studyDays} study days before your exam.</p></div><div class="v6-exam-goal"><span class="v6-kicker">Exams at ${s.examPass}%+</span><div class="v6-exam-bars">${bars}</div><small>${s.examsDone} of ${s.examTarget} · pass ${s.examTarget} before exam day</small></div></div><div class="v6-pace-grid">${row('Topic notes',L.note,s.perDay.note,'topic')}${row('Tricky words',L.tricky,s.perDay.tricky,'pair')}${tierFull()?row('Diagrams',L.diagram,s.perDay.diagram,'diagram'):''}${row('Practice questions',L.question,s.perDay.question,'question')}</div><p class="v6-pace-note">${s.learningDone?'All topics are done.':`Learning is spread over your first ${s.learnDays} study day${s.learnDays===1?'':'s'}.`} ${s.examsLeft?(s.examsFit<s.examsLeft?`There is time for about ${s.examsFit} full exam${s.examsFit===1?'':'s'} (each is about 4 hours); aim for ${s.examPass}%+ on each.`:`Then take a full exam ${s.examEvery<=1?'every study day':`every ${s.examEvery} study days`} until you have ${s.examTarget} scores at ${s.examPass}%+.`):''} Keep the last days for review.</p>`;
  }
  if(typeof renderCompactProgressDashboard==='function'){
    const o=window.renderCompactProgressDashboard;window.renderCompactProgressDashboard=function(p){const r=o.apply(this,arguments);try{renderPacePanel()}catch(e){console.warn(e)}return r};
  }
})();

/* ---------- Lesson-style explanations + readable matching review ---------- */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const LABELS=['Concept','Spot it','In this scenario','Why not the others','Remember'];
  function lessonHTML(text){
    const lines=String(text||'').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    return '<div class="v6-lesson">'+lines.map(l=>{
      const m=l.match(/^([^:]{2,60}):\s*(.+)$/);
      if(!m)return `<p>${esc(l)}</p>`;
      const k=m[1].trim(),known=LABELS.includes(k);
      return `<div class="v6-lesson-row ${known?'is-'+k.toLowerCase().replace(/\s+/g,'-'):'is-pair'}"><b>${esc(k)}</b><span>${esc(m[2])}</span></div>`;
    }).join('')+'</div>';
  }
  window.v6LessonHTML=lessonHTML;
  function upgrade(root){
    (root||document).querySelectorAll('.feedback p:not([data-v6])').forEach(p=>{
      const t=p.textContent||'';if(!/^Concept:/.test(t.trim()))return;
      const d=document.createElement('div');d.innerHTML=lessonHTML(t);d.firstChild.dataset.v6='1';p.replaceWith(d.firstChild);
    });
  }
  new MutationObserver(ms=>{for(const m of ms)if(m.addedNodes.length){upgrade(document.getElementById('app'));break}}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  // Matching review: a table instead of raw JSON
  if(typeof renderExamReview==='function'){
    const orig=renderExamReview;
    window.renderExamReview=function(i){
      orig.apply(this,arguments);
      try{
        const x=state.examReviewResults.results[i];if(!x||x.question?.type!=='matching')return;
        const pre=document.querySelector('#examReviewCard .review-pre');if(!pre)return;
        const mine=x.selected?.matching_pairs||{},ans=x.answer||{};
        const rows=Object.keys(ans).map(l=>{const ok=mine[l]===ans[l];return `<tr class="${ok?'ok':'no'}"><td>${esc(l)}</td><td>${mine[l]?esc(mine[l]):'<i>not answered</i>'}</td><td>${ok?'✓':esc(ans[l])}</td></tr>`}).join('');
        const t=document.createElement('div');t.className='v6-match-review';
        t.innerHTML=`<table><thead><tr><th>Item</th><th>Your match</th><th>Correct</th></tr></thead><tbody>${rows}</tbody></table>`;
        pre.replaceWith(t);
      }catch(e){}
    };
  }
})();


/* ---------- v6.3: Done today tab ---------- */
function v6DoneTodayTasks(){return (state.todayPlan||[]).filter(t=>taskState(t)==='done')}
function v6RenderDoneToday(){
  const host=document.getElementById('dashboardWorkspace');if(!host)return;host.classList.add('v6-today-host');
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const LBL={note:'Topic note',tricky:'Tricky words',diagram:'Diagram',practice:'Practice',exam:'Exam'};
  const done=v6DoneTodayTasks(),left=(state.todayPlan||[]).length-done.length;
  const counts=['note','tricky','diagram','practice'].map(t=>[t,done.filter(x=>x.type===t).length]).filter(x=>x[1]);
  const rows=done.map(t=>{const sc=(t.type==='practice'||t.type==='exam')?v6GetScore(t.id):'';const canReview=['note','tricky','diagram'].includes(t.type);
    return `<div class="v6-task is-done"><span class="v6-task-dot" aria-hidden="true">✓</span><div class="v6-task-copy"><div class="v6-task-meta"><span class="v6-task-type">${esc(LBL[t.type]||t.label||'Study')}</span>${sc?`<span class="v6-done-score">· ${esc(sc)}</span>`:''}</div><p class="v6-task-title" title="${esc(t.title)}">${esc(t.title)}</p></div>${canReview?`<button class="v6-task-open" type="button" data-today-open="${esc(t.id)}">Review →</button>`:''}</div>`}).join('');
  const summary=counts.length?counts.map(([t,n])=>`${n} ${({note:'topic',tricky:'tricky pair',diagram:'diagram',practice:'practice set'})[t]}${n===1?'':'s'}`).join(' · '):'';
  host.innerHTML=`<div class="v6-home"><div class="v6-col"><section class="v6-card v6-plan v6-done-page"><div class="v6-plan-head"><h3>Done today</h3><span class="v6-plan-count">${done.length} finished${left>0?` · ${left} to go`:''}</span></div>${summary?`<p class="v6-pace">${summary}</p>`:''}<div class="v6-plan-list">${rows||'<p class="v6-task-flag" style="padding:14px 6px">Nothing finished yet today. Your first step is waiting on the <b>Today</b> tab.</p>'}</div>${left>0?'<div class="v6-next-actions" style="margin-top:14px"><button class="v6-btn-gold" type="button" data-dashboard-focus-go="today">Continue today’s plan →</button></div>':''}</section></div></div>`;
  bindDashboardWorkspaceActions();
  const go=host.querySelector('[data-dashboard-focus-go]');if(go)go.onclick=()=>{state.dashboardFocus='today';renderFeatureLaunchpad(state.lastProgress||{})};
}

/* ---------- v6.3: exam report: actions on top, answer review opens at the top ---------- */
(function(){
  if(typeof showExamResults==='function'){
    const o=showExamResults;
    window.showExamResults=async function(){
      const r=await o.apply(this,arguments);
      const area=document.getElementById('examResults');if(!area)return r;
      const rep=area.querySelector('.exam-report-final'),acts=rep&&rep.querySelector('.report-actions'),head=rep&&rep.querySelector('.final-report-head');
      if(acts&&head){head.after(acts);acts.classList.add('v6-report-top')}
      area.classList.remove('v6-reviewing');const v=document.getElementById('exams');if(v)v.scrollTop=0;
      return r;
    };
  }
  if(typeof renderExamReview==='function'){
    const o=renderExamReview;
    window.renderExamReview=function(i){
      const r=o.apply(this,arguments);
      const area=document.getElementById('examResults'),card=document.getElementById('examReviewCard');
      if(area&&card&&area.contains(card)){
        area.classList.add('v6-reviewing');
        if(!card.querySelector('.v6-review-back')){const b=document.createElement('button');b.type='button';b.className='v6-session-exit v6-review-back';b.textContent='← Back to exam report';b.onclick=()=>{area.classList.remove('v6-reviewing');card.innerHTML='';const v=document.getElementById('exams');if(v)v.scrollTop=0};card.prepend(b)}
      }
      if(card){const qc=card.querySelector('.question-card'),acts=qc&&qc.querySelector('.question-actions'),meta=qc&&qc.querySelector('.question-meta');if(acts&&meta){acts.classList.add('v6-review-nav');meta.after(acts)}}
      const v=document.getElementById('exams');if(v)v.scrollTop=0;window.scrollTo(0,0);
      return r;
    };
  }
})();

/* ---------- v6.3: practice summary: all actions in one row at the top ---------- */
(function(){
  if(typeof renderSessionComplete!=='function')return;
  const o=renderSessionComplete;
  window.renderSessionComplete=async function(){
    const r=await o.apply(this,arguments);
    const box=document.querySelector('#questionCard .v6-session-done'),acts=box&&box.querySelector('.v6-next-actions'),rev=document.getElementById('reviewAnswers');
    if(acts&&rev){rev.className='v6-btn-quiet';rev.textContent='Review my answers';acts.appendChild(rev);
      const sum=box.closest('.session-summary');if(sum)[...sum.children].forEach(ch=>{if(ch!==box)ch.remove()})}
    return r;
  };
})();

/* Practice answer review: Previous / Next at the top of the card */
(function(){
  if(typeof renderEndReview!=='function')return;
  const o=renderEndReview;
  window.renderEndReview=function(){const r=o.apply(this,arguments);
    const qc=document.querySelector('#questionCard .question-card')||document.getElementById('questionCard'),acts=qc&&qc.querySelector('.question-actions'),meta=qc&&qc.querySelector('.question-meta');
    if(acts&&meta){acts.classList.add('v6-review-nav');meta.after(acts)}
    const v=document.querySelector('.view.active');if(v)v.scrollTop=0;return r};
})();

/* ---------- v6.4: exams — pause & exit, resume later; timer continues across rule reviews ---------- */
(function(){
  const sid=()=>state.examSession&&state.examSession.session_id;
  async function exitExam(){
    clearExamTimer();state.examLock=false;state.v6RulePaused=false;
    document.getElementById('examSessionArea')?.classList.add('hidden');document.getElementById('ruleReviewArea')?.classList.add('hidden');
    state.examSession=null;
    try{await loadExamCatalog()}catch(e){}
    if(typeof renderExamCatalog==='function')renderExamCatalog();
    const v=document.getElementById('exams');if(v)v.scrollTop=0;
  }
  window.v6ExitExam=exitExam;
  const pb=document.getElementById('examPauseBtn');
  if(pb&&pb.onclick){const o=pb.onclick;pb.textContent='Pause';pb.onclick=async function(e){
    await o.call(this,e);
    const card=document.querySelector('#examQuestionCard .pause-card');if(!card||card.querySelector('#v6ExitExam'))return;
    const p=card.querySelector('p');if(p)p.textContent='Resume now, or exit and come back later. You will pick up at this question with the same time left.';
    const btn=document.createElement('button');btn.id='v6ExitExam';btn.type='button';btn.className='secondary';btn.textContent='Exit — resume later';btn.onclick=exitExam;
    const r=card.querySelector('#resumePausedExam');if(r){const row=document.createElement('div');row.className='v6-next-actions';r.replaceWith(row);row.append(r,btn)}else card.appendChild(btn);
  }}
  // Resuming a paused exam from the exam list restarts its timer on the server first.
  if(typeof resumeExam==='function'){const o=resumeExam;window.resumeExam=async function(code){
    const e=(state.examCatalog||[]).find(x=>x.code===code),a=e&&e.active_session;
    if(a&&a.paused){try{await api(`/api/exam-sessions/${a.session_id}/resume`,{method:'POST'})}catch(err){}}
    return o.apply(this,arguments)}}
  // Reviewing the 10 rules between blocks stops the clock; it continues where it left off.
  if(typeof showExamRuleBlock==='function'){const o=showExamRuleBlock;window.showExamRuleBlock=async function(n){
    if(sid()&&state.examTimerHandle&&!state.v6RulePaused){clearExamTimer();try{await api(`/api/exam-sessions/${sid()}/pause`,{method:'POST'});state.v6RulePaused=true}catch(e){}}
    return o.apply(this,arguments)}}
  if(typeof beginExamQuestions==='function'){const o=beginExamQuestions;window.beginExamQuestions=async function(){
    try{
      if(state.v6RulePaused){const rr=await api(`/api/exam-sessions/${sid()}/resume`,{method:'POST'});state.v6RulePaused=false;state.examSession.remaining_seconds=Math.max(1,rr.remaining_seconds)}
      else if(sid()){const st=await api(`/api/exam-sessions/${sid()}/status`);if(st&&st.remaining_seconds!=null)state.examSession.remaining_seconds=Math.max(1,st.remaining_seconds)}
    }catch(e){}
    return o.apply(this,arguments)}}
})();

/* ---------- v6.5: Match the Following ---------- */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const THEMES=[['all','All'],['agile','Agile & Scrum'],['documents','Documents & flow'],['ownership','Who owns what'],['flows','Process flows'],['people','People & leadership'],['tools','Tools & techniques'],['risk_procurement','Risk & procurement'],['business','Business environment']];
  const THEME_LABEL=Object.fromEntries(THEMES);
  const host=()=>document.getElementById('matchHost');
  const M=state.v6Match={sets:null,theme:'all',play:null,queue:null};
  const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  const canMatch=()=>typeof hasFeature==='function'&&hasFeature('match');
  async function loadSets(force){if(M.sets&&!force)return M.sets;M.sets=await api('/api/match-sets');return M.sets}
  window.v6LoadMatchSets=loadSets;

  // Topic-linked choice: rank sets by word overlap with today's block topics.
  const STOP=new Set('the a an and or of to in on for vs with by is are be as at from this that what which who your into each its it how when why not do does'.split(' '));
  const toks=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.has(w));
  window.v6PickMatchSets=function(topicText,n=2){
    const want=new Set(toks(topicText));const sets=M.sets||[];
    const scored=sets.map(s=>{const bag=toks([s.title,s.prompt,(s.keywords||[]).join(' '),s.pairs.map(p=>p.left).join(' ')].join(' '));let sc=0;bag.forEach(w=>{if(want.has(w))sc++});(s.keywords||[]).forEach(k=>{if(String(topicText).toLowerCase().includes(k.toLowerCase()))sc+=3});
      if(s.studyStatus==='mastered')sc-=4;return {s,sc:sc+Math.random()*0.5}});
    scored.sort((a,b)=>b.sc-a.sc);return scored.slice(0,n).map(x=>x.s);
  };

  function statusDot(s){return s.studyStatus==='mastered'?'<span class="v6-m-dot is-done" title="Mastered">✓</span>':s.studyStatus==='needs_review'?'<span class="v6-m-dot is-retry" title="Try again">↻</span>':'<span class="v6-m-dot" aria-hidden="true"></span>'}
  function renderList(){
    const h=host();if(!h)return;const sets=M.sets||[];
    const rows=sets.filter(s=>M.theme==='all'||s.theme===M.theme);
    const mastered=sets.filter(s=>s.studyStatus==='mastered').length,retry=sets.filter(s=>s.studyStatus==='needs_review').length;
    const next=sets.find(s=>s.studyStatus==='needs_review')||sets.find(s=>s.studyStatus==='not_started');
    h.innerHTML=`<div class="v6-m-top"><p class="v6-m-intro">The exam asks these as drag-and-drop matching. Pair each term with what it does, who owns it, or what comes next.</p><span class="v6-m-count"><b>${mastered}</b> of ${sets.length} mastered${retry?` · ${retry} to retry`:''}</span>${next?`<button class="primary v6-m-next" type="button" data-m-open="${esc(next.id)}">${next.studyStatus==='needs_review'?'Retry':'Start'}: ${esc(next.title)} →</button>`:''}</div>
      <div class="v6-m-chips" role="tablist">${THEMES.map(([k,t])=>{const n=k==='all'?sets.length:sets.filter(s=>s.theme===k).length;return `<button type="button" class="${M.theme===k?'active':''}" data-m-theme="${k}">${esc(t)} <span>${n}</span></button>`}).join('')}</div>
      <div class="v6-m-list">${rows.map(s=>`<button type="button" class="v6-m-row" data-m-open="${esc(s.id)}">${statusDot(s)}<span class="v6-m-title">${esc(s.title)}</span><span class="v6-m-theme">${esc(THEME_LABEL[s.theme]||'')}</span><span class="v6-m-meta">${s.pairs.length} pairs${s.lastScore?` · last ${esc(s.lastScore)}`:''}</span><span class="v6-m-go">${s.studyStatus==='mastered'?'Practice again':s.studyStatus==='needs_review'?'Retry':'Start'} →</span></button>`).join('')}</div>`;
    h.querySelectorAll('[data-m-theme]').forEach(b=>b.onclick=()=>{M.theme=b.dataset.mTheme;renderList()});
    h.querySelectorAll('[data-m-open]').forEach(b=>b.onclick=()=>openSet(b.dataset.mOpen));
  }

  function openSet(id,only){
    const s=(M.sets||[]).find(x=>x.id===id);if(!s)return;
    M.play={set:s,order:shuffle(s.pairs.map((p,i)=>i)),pick:{},active:0,checked:false,intro:true,only:only&&only.length?only:null};
    renderPlay();
  }
  /* v7.12: "Read this first" — the terms and what they mean, before the student is asked to match them */
  function renderIntro(){
    const h=host(),P=M.play,s=P.set,q=M.queue;
    const idx=P.only||s.pairs.map((_,i)=>i);
    const qline=q?`<span class="v6-m-q">Today’s practice · match set ${q.i+1} of ${q.ids.length}</span>`:'';
    h.innerHTML=`<div class="v6-m-play v6-m-intro">
      <div class="v6-m-head"><button type="button" class="v6-session-exit" data-m-back>${q?'← Today':'← All sets'}</button>${qline}<span class="v6-kicker">${P.only?'Read these again':'Read this first'} · ${esc(s.domain)}</span><h2>${esc(s.title)}</h2>
      <div class="v6-m-introbar"><p>${P.only?`You missed ${idx.length} last time. Read ${idx.length===1?'it':'them'} once more, then match the whole set again.`:P.back?'Your matches so far are saved. Read, then go back and finish.':`You will match these ${s.pairs.length} terms next. Read what each one means first.`}</p><button type="button" class="primary" data-m-start>${P.back?'Back to matching →':'Start matching →'}</button></div></div>
      <div class="v6-m-readlist">${idx.map(i=>`<div class="v6-m-read"><b>${esc(s.pairs[i].left)}</b><p>${esc(s.pairs[i].lesson)}</p></div>`).join('')}</div>
    </div>`;
    const v=document.getElementById('match');if(v)v.scrollTop=0;
    h.querySelector('[data-m-back]').onclick=()=>{if(q){M.queue=null;backToToday()}else{M.play=null;renderList()}};
    h.querySelector('[data-m-start]').onclick=()=>{P.intro=false;renderPlay()};
  }
  window.v6OpenMatchSet=async function(id){showView('match');await loadSets();openSet(id)};

  function renderPlay(){
    const h=host(),P=M.play;if(!h||!P)return;const s=P.set,n=s.pairs.length;
    if(P.intro)return renderIntro();
    const used=new Set(Object.values(P.pick));const filled=Object.keys(P.pick).length;
    const q=M.queue;const qline=q?`<span class="v6-m-q">Today’s practice · match set ${q.i+1} of ${q.ids.length}</span>`:'';
    let res='';
    if(P.checked){
      const right=s.pairs.filter((p,i)=>P.pick[i]===i).length;P.score=right;
      res=`<div class="v6-m-result ${right===n?'is-perfect':''}"><b>${right} of ${n} correct</b><span>${right===n?'You have this one. ✓':'Read the lesson under each pair, then try again.'}</span><div class="v6-m-actions v6-m-actions-top">${right<n?'<button type="button" class="secondary" data-m-retry>Try again</button>':''}<button type="button" class="primary" data-m-continue>${q?(q.i+1<q.ids.length?'Next match set →':'Finish practice step →'):'Next set →'}</button></div></div>`;
    }
    h.innerHTML=`<div class="v6-m-play">
      <div class="v6-m-head"><button type="button" class="v6-session-exit" data-m-back>${q?'← Today':'← All sets'}</button>${qline}<span class="v6-kicker">${esc(THEME_LABEL[s.theme]||'')} · ${esc(s.domain)}${s.approach&&s.approach!=='Mixed'?' · '+esc(s.approach):''}</span><h2>${esc(s.title)}</h2><p>${esc(s.prompt)}${P.checked?'':' Tap a term, then tap its match.'}${P.checked?'':' <button type="button" class="v6-m-reread" data-m-reread>Read the notes again</button>'}</p></div>
      ${res}${P.checked?`<div class="v6-m-remember"><span class="v6-kicker">Remember</span><p>${esc(s.remember)}</p></div>`:''}
      <div class="v6-m-board ${P.checked?'is-checked':''}">
        <div class="v6-m-left">${s.pairs.map((p,i)=>{const pk=P.pick[i];const ok=P.checked&&pk===i,bad=P.checked&&pk!==i;
          return `<div class="v6-m-pair ${P.active===i&&!P.checked?'is-active':''} ${ok?'is-ok':''} ${bad?'is-bad':''}" data-m-left="${i}" role="button" tabindex="0"><span class="v6-m-term">${esc(p.left)}</span><span class="v6-m-slot">${pk!=null?esc(s.pairs[pk].right):'<i>Choose a match</i>'}</span>${P.checked?`<span class="v6-m-mark">${ok?'✓':'✗'}</span>`:''}${P.checked?`<div class="v6-m-lesson">${bad?`<b>Correct match:</b> ${esc(p.right)}<br>`:''}${esc(p.lesson)}</div>`:''}</div>`}).join('')}</div>
        ${P.checked?'':`<div class="v6-m-right">${P.order.map(j=>`<button type="button" class="v6-m-opt ${used.has(j)?'is-used':''}" data-m-right="${j}">${esc(s.pairs[j].right)}</button>`).join('')}</div>`}
      </div>
      ${P.checked?'':`<div class="v6-m-actions"><button type="button" class="secondary" data-m-clear ${filled?'':'disabled'}>Clear</button><button type="button" class="primary" data-m-check ${filled===n?'':'disabled'}>Check answers</button></div>`}
    </div>`;
    const v=document.getElementById('match');if(v)v.scrollTop=0;
    h.querySelector('[data-m-back]').onclick=()=>{if(q){M.queue=null;backToToday()}else{M.play=null;renderList()}};
    if(!P.checked){
      const rr=h.querySelector('[data-m-reread]');if(rr)rr.onclick=()=>{P.intro=true;P.only=null;P.back=true;renderPlay()};
      h.querySelectorAll('[data-m-left]').forEach(el=>{const f=()=>{const i=+el.dataset.mLeft;if(P.pick[i]!=null&&P.active===i){delete P.pick[i]}P.active=i;renderPlay()};el.onclick=f;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f()}}});
      h.querySelectorAll('[data-m-right]').forEach(el=>el.onclick=()=>{const j=+el.dataset.mRight;
        for(const k in P.pick)if(P.pick[k]===j)delete P.pick[k];
        P.pick[P.active]=j;const nextEmpty=s.pairs.findIndex((_,i)=>P.pick[i]==null);P.active=nextEmpty<0?P.active:nextEmpty;renderPlay()});
      const cl=h.querySelector('[data-m-clear]');if(cl)cl.onclick=()=>{P.pick={};P.active=0;renderPlay()};
      const ck=h.querySelector('[data-m-check]');if(ck)ck.onclick=async()=>{P.checked=true;renderPlay();
        try{const r=await api(`/api/match-sets/${encodeURIComponent(s.id)}/result`,{method:'POST',body:JSON.stringify({correct:P.score,total:n})});s.studyStatus=r.status;s.lastScore=r.last_rating;s.attempts=r.review_count}catch(e){}
        if(q)q.scores.push([P.score,n]);};
    }else{
      const rt=h.querySelector('[data-m-retry]');if(rt)rt.onclick=()=>{if(q)q.scores.pop();openSet(s.id,s.pairs.map((_,i)=>i).filter(i=>P.pick[i]!==i))};
      h.querySelector('[data-m-continue]').onclick=()=>{
        if(q){q.i++;if(q.i<q.ids.length)return openSet(q.ids[q.i]);return finishQueue()}
        const list=(M.sets||[]).filter(x=>M.theme==='all'||x.theme===M.theme);const i=list.findIndex(x=>x.id===s.id);
        const nxt=list.slice(i+1).find(x=>x.studyStatus!=='mastered')||list.find(x=>x.studyStatus!=='mastered'&&x.id!==s.id);
        if(nxt)openSet(nxt.id);else{M.play=null;renderList()}
      };
    }
  }

  function backToToday(){state.dashboardFocus='today';showView('dashboard');if(typeof loadProgress==='function')loadProgress().then(()=>renderFeatureLaunchpad(state.lastProgress||{})).catch(()=>{})}
  async function finishQueue(){
    const q=M.queue;M.queue=null;M.play=null;
    if(q&&q.task&&typeof setDailyTaskStatus==='function'){try{await setDailyTaskStatus(q.task,'done')}catch(e){}}
    if(q&&q.task){const m=q.scores.reduce((a,[c,t])=>[a[0]+c,a[1]+t],[0,0]);const prev=v6GetScore(q.task.id);v6SetScore(q.task.id,(prev?prev+' · ':'')+`match ${m[0]}/${m[1]}`);try{localStorage.removeItem('v6pq:'+q.task.id)}catch(e){}}
    backToToday();
  }
  // Start the match part of today's practice step.
  window.v6StartMatchQueue=async function(task,topicText){
    try{await loadSets()}catch(e){return false}
    const picks=v6PickMatchSets(topicText,2);if(!picks.length)return false;
    M.queue={task,ids:picks.map(x=>x.id),i:0,scores:[]};showView('match');openSet(M.queue.ids[0]);return true;
  };

  if(typeof showView==='function'){const o=window.showView;window.showView=function(id){const r=o.apply(this,arguments);
    if(id==='match'&&state.currentView==='match'){if(!M.play){if(M.sets)renderList();const hh=host();if(hh&&!M.sets)hh.innerHTML='<p class="v6-task-flag" style="padding:16px 0">Loading match sets…</p>';loadSets(true).then(()=>{if(!M.play)renderList()}).catch(err=>{const hh2=host();if(hh2)hh2.innerHTML=`<p class="v6-task-flag">${esc(err.message||'Could not load match sets.')}</p>`})}}
    return r}}
  // "Review concept" on a match item opens that set.
  if(typeof window.openConceptSource==='function'){const o=window.openConceptSource;window.openConceptSource=async function(type,id){if(type==='match')return v6OpenMatchSet(id);return o.apply(this,arguments)}}
})();

/* Practice step = questions, then 2 match sets on the same topics */
function v6BlockTopicText(task){
  const plan=state.todayPlan||[];const i=plan.findIndex(t=>t.id===task.id);const out=[];
  for(let k=i-1;k>=0;k--){const t=plan[k];if(t.type==='practice'||t.type==='exam')break;const it=t.item||{};out.push(t.title,it.title,it.summary,(it.keyRules||[]).join(' '),it.left,it.right,it.whatItIs)}
  return out.filter(Boolean).join(' ')||String(task.detail||task.title||'');
}
(function(){
  if(typeof openTodayTask!=='function')return;const o=window.openTodayTask;
  window.openTodayTask=async function(t){
    let resume=false;try{resume=t&&t.type==='practice'&&localStorage.getItem('v6pq:'+t.id)==='1'}catch(e){}
    if(resume&&typeof hasFeature==='function'&&hasFeature('match')){const ok=await v6StartMatchQueue(t,v6BlockTopicText(t));if(ok)return}
    return o.apply(this,arguments);
  };
})();

/* ---------- v6.6: Full plan tab + change exam date ---------- */
function v6ExamDateBar(p){
  p=p||state.lastProgress||{};const prof=p.study_profile||{},s=v6Pace(p);
  const esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const d=prof.exam_date?new Date(prof.exam_date+'T12:00:00'):null;
  const nice=d?d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Not set';
  const days=prof.study_days_per_week||5;
  const summary=d?`<b>${esc(nice)}</b> · ${s.days} days left${s.hoursPerDay!=null?` · about <b>${typeof v7Hrs==='function'?v7Hrs(s.dailyMin):s.hoursPerDay+' h'}</b> a day, ${days} days a week`:''}`:'<b>Add your exam date</b> so the plan can pace itself.';
  return `<div class="v6-datebar" id="v6DateBar"><span class="v6-kicker">Exam date</span><span class="v6-datebar-text">${summary}</span><button type="button" class="v6-datebar-btn" data-datebar-edit>${d?'Change date':'Set date'}</button>
    <form class="v6-datebar-form" hidden><label>Exam date <input type="date" name="d" required min="${todayDateKey()}" value="${esc(prof.exam_date||'')}"></label><label>Study days a week <select name="w">${[3,4,5,6,7].map(n=>`<option ${n==days?'selected':''}>${n}</option>`).join('')}</select></label><label>Study time a day <select name="m">${[[60,'1 hour'],[90,'1.5 hours'],[120,'2 hours'],[150,'2.5 hours'],[180,'3 hours']].map(([v,t])=>`<option value="${v}" ${v==(s.capMin||120)?'selected':''}>${t}</option>`).join('')}</select></label><button type="submit" class="primary">Save &amp; re-plan</button><button type="button" class="secondary" data-datebar-cancel>Cancel</button><span class="v6-datebar-msg"></span></form></div>`;
}
function v6BindDateBar(root){
  const bar=(root||document).querySelector('#v6DateBar');if(!bar)return;
  const f=bar.querySelector('form'),ed=bar.querySelector('[data-datebar-edit]');
  ed.onclick=()=>{f.hidden=false;ed.hidden=true;bar.querySelector('.v6-datebar-text').hidden=true};
  bar.querySelector('[data-datebar-cancel]').onclick=()=>{f.hidden=true;ed.hidden=false;bar.querySelector('.v6-datebar-text').hidden=false};
  f.onsubmit=async e=>{e.preventDefault();const msg=f.querySelector('.v6-datebar-msg'),btn=f.querySelector('[type=submit]');btn.disabled=true;msg.textContent='Saving…';
    const prof=(state.lastProgress||{}).study_profile||{};
    try{await api('/api/coach/profile',{method:'PUT',body:JSON.stringify({exam_date:f.d.value,study_days_per_week:Number(f.w.value),weekly_hours:prof.weekly_hours||8,session_minutes:Number(f.m.value)||120})});
      await loadProgress();msg.textContent='';
      const s=v6Pace(state.lastProgress);
      if(typeof renderFeatureLaunchpad==='function'&&state.currentView==='dashboard')renderFeatureLaunchpad(state.lastProgress||{});
      if(state.currentView==='progress'&&typeof renderCompactProgressDashboard==='function')renderCompactProgressDashboard(state.lastProgress);
      const nb=document.querySelector('#v6DateBar .v6-datebar-text');if(nb)nb.insertAdjacentHTML('beforeend',` <em class="v6-datebar-ok">✓ Plan updated</em>`);
    }catch(err){btn.disabled=false;msg.textContent=err.message||'Could not save.'}};
}
(function(){
  if(typeof renderFeatureLaunchpad!=='function')return;const o=window.renderFeatureLaunchpad;
  window.renderFeatureLaunchpad=function(p){
    const r=o.apply(this,arguments);const focus=state.dashboardFocus||'today';const host=document.getElementById('dashboardWorkspace');
    if(focus==='plan'&&host){v6RenderFullPlan(p||state.lastProgress||{})}
    return r;
  };
  // My Progress: the same exam-date bar above the pace panel
  if(typeof renderCompactProgressDashboard==='function'){const oc=window.renderCompactProgressDashboard;window.renderCompactProgressDashboard=function(p){const r=oc.apply(this,arguments);
    try{const panel=document.getElementById('v6PacePanel');if(panel){document.getElementById('v6DateBar')?.remove();panel.insertAdjacentHTML('beforebegin',v6ExamDateBar(p));v6BindDateBar(panel.parentElement)}}catch(e){}return r}}
})();

document.addEventListener('click',e=>{const b=e.target.closest('[data-go-plan]');if(!b)return;state.dashboardFocus='plan';if(state.currentView!=='dashboard')showView('dashboard');renderFeatureLaunchpad(state.lastProgress||{});setTimeout(()=>document.querySelector('#v6DateBar [data-datebar-edit]')?.click(),50)});

/* ---------- v6.7: Full plan with section tabs and status filters ---------- */
(function(){
  const esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const tierFull=()=>{const t=String(state.tierCode||state.billing?.tier_code||state.billing?.entitlement?.tier_code||'');return t==='full'||t.startsWith('full')||(typeof isStaff==='function'&&isStaff())};
  const has=f=>typeof hasFeature==='function'?hasFeature(f):true;
  const bucket=st=>st==='reviewed'||st==='mastered'?'done':st==='needs_review'?'review':'todo';
  const S=state.v6Plan=state.v6Plan||{sec:'notes',filter:'todo',domain:''};
  function sections(p){
    const out=[];
    if(has('notes'))out.push({k:'notes',label:'Topic notes',rows:(state.notes||[]).map(x=>({id:x.id,type:'note',title:x.title,sub:x.domain,st:bucket(x.studyStatus),domain:x.domain}))});
    if(has('tricky'))out.push({k:'tricky',label:'Tricky words',rows:(state.tricky||[]).map(x=>({id:x.id,type:'tricky',title:`${x.left} vs ${x.right}`,sub:x.domain||'',st:bucket(x.studyStatus),domain:x.domain}))});
    if(tierFull()&&has('diagrams'))out.push({k:'diagrams',label:'Diagrams',rows:(state.diagrams||[]).map(x=>({id:x.id,type:'diagram',title:x.title,sub:x.domain,st:bucket(x.studyStatus),domain:x.domain}))});
    if(has('match'))out.push({k:'match',label:'Match sets',rows:((state.v6Match||{}).sets||[]).map(x=>({id:x.id,type:'match',title:x.title,sub:`${x.domain}${x.lastScore?' · last '+x.lastScore:''}`,st:bucket(x.studyStatus),domain:x.domain})),loading:!(state.v6Match||{}).sets});
    out.push({k:'exams',label:'Exams',rows:(p?.exam_cards||[]).map(x=>({id:x.exam_code,type:'exam',title:x.exam_name||x.exam_code,sub:x.completed?`${x.accuracy}% · ${x.result==='PASS'?'passed':'below 80%'}`:(x.status==='active'||x.status==='paused')?`${x.answered}/${x.total} answered`:'Not taken',st:x.completed?'done':(x.status==='active'||x.status==='paused')?'review':'todo',exam:x}))});
    out.push({k:'practice',label:'Practice',practice:true});
    return out;
  }
  const FL={todo:'Need to study',review:'Need review',done:'Done'};
  const FL_EXAM={todo:'To take',review:'In progress',done:'Done'};
  function rowHTML(r){
    const act=r.st==='done'?'Review':r.st==='review'?(r.type==='exam'?'Resume':'Review'):(r.type==='exam'?'Start':'Study');
    const attrs=r.type==='match'?`data-m-plan-open="${esc(r.id)}"`:r.type==='exam'?`data-full-plan-open="exam" data-exam-code="${esc(r.id)}" data-session-id="${esc(r.exam.session_id||'')}" data-exam-status="${esc(r.exam.status||'')}"`:`data-full-plan-open="${r.type}" data-full-plan-id="${esc(r.id)}"`;
    return `<div class="v6-plan-row st-${r.st}"><span class="v6-plan-dot" aria-hidden="true">${r.st==='done'?'✓':r.st==='review'?'↻':''}</span><div class="v6-plan-copy"><b title="${esc(r.title)}">${esc(r.title)}</b><small>${esc(r.sub||'')}</small></div><button type="button" class="v6-task-open" ${attrs}>${act} →</button></div>`;
  }
  window.v6RenderFullPlan=function(p){
    const host=document.getElementById('dashboardWorkspace');if(!host)return;p=p||state.lastProgress||{};
    const secs=sections(p);if(!secs.some(s=>s.k===S.sec))S.sec=secs[0].k;const sec=secs.find(s=>s.k===S.sec);
    const L=sec.k==='exams'?FL_EXAM:FL;
    let body='';
    if(sec.practice){
      const done=p.practice_unique_attempted||0,total=p.practice_bank_total||0,miss=p.practice_currently_incorrect||0,acc=p.practice_accuracy;
      body=`<div class="v6-plan-practice"><div><b>${done}</b><span>of ${total} questions practiced</span></div><div><b>${acc==null?'—':Math.round(acc)+'%'}</b><span>accuracy</span></div><div><b>${miss}</b><span>still wrong — need review</span></div></div><div class="v6-next-actions"><button type="button" class="primary" data-plan-practice="new">Practice new questions →</button>${miss?'<button type="button" class="secondary" data-plan-practice="missed">Practice my misses</button>':''}</div>`;
    }else{
      const doms=[...new Set(sec.rows.map(r=>r.domain).filter(Boolean))].sort();
      const inDom=sec.rows.filter(r=>!S.domain||r.domain===S.domain);
      const cnt=k=>inDom.filter(r=>r.st===k).length;
      if(!['todo','review','done'].includes(S.filter))S.filter='todo';
      const rows=inDom.filter(r=>r.st===S.filter);
      body=`<div class="v6-plan-filters"><div class="v6-plan-chips">${['todo','review','done'].map(k=>`<button type="button" class="${S.filter===k?'active':''} f-${k}" data-plan-filter="${k}">${L[k]} <span>${cnt(k)}</span></button>`).join('')}</div>${doms.length>1?`<select data-plan-domain aria-label="Domain"><option value="">All domains</option>${doms.map(d=>`<option ${S.domain===d?'selected':''}>${esc(d)}</option>`).join('')}</select>`:''}</div>
        <div class="v6-plan-rows">${sec.loading?'<p class="v6-task-flag">Loading…</p>':rows.length?rows.map(rowHTML).join(''):`<p class="v6-plan-empty">${S.filter==='todo'?'Nothing left to study here. ✓':S.filter==='review'?'Nothing marked for review.':'Nothing done yet — start with “'+L.todo+'”.'}</p>`}</div>`;
    }
    const total=s=>s.practice||s.loading?'':(()=>{const d=s.rows.filter(r=>r.st==='done').length;return `<span>${d}/${s.rows.length}</span>`})();
    host.innerHTML=`${typeof v6ExamDateBar==='function'?v6ExamDateBar(p):''}<div class="v6-plan-tabs" role="tablist">${secs.map(s=>`<button type="button" role="tab" class="${s.k===S.sec?'active':''}" data-plan-sec="${s.k}">${esc(s.label)} ${total(s)}</button>`).join('')}</div>${body}`;
    if(typeof v6BindDateBar==='function')v6BindDateBar(host);
    if(typeof bindDashboardWorkspaceActions==='function')bindDashboardWorkspaceActions();
    host.querySelectorAll('[data-plan-sec]').forEach(b=>b.onclick=()=>{S.sec=b.dataset.planSec;S.filter='todo';S.domain='';v6RenderFullPlan(p)});
    host.querySelectorAll('[data-plan-filter]').forEach(b=>b.onclick=()=>{S.filter=b.dataset.planFilter;v6RenderFullPlan(p)});
    const ds=host.querySelector('[data-plan-domain]');if(ds)ds.onchange=()=>{S.domain=ds.value;v6RenderFullPlan(p)};
    host.querySelectorAll('[data-m-plan-open]').forEach(b=>b.onclick=()=>v6OpenMatchSet(b.dataset.mPlanOpen));
    host.querySelectorAll('[data-plan-practice]').forEach(b=>b.onclick=()=>{const missed=b.dataset.planPractice==='missed';showView('practice');setTimeout(()=>{const f=document.getElementById('pReviewFocus');if(f)f.value=missed?'incorrect_now':'';const c=document.getElementById('pCount');if(c)c.value=missed?10:15;if(typeof createPracticeSession==='function')createPracticeSession()},60)});
    const needSets=has('match')&&!(state.v6Match||{}).sets;
    if(needSets&&typeof v6LoadMatchSets==='function')v6LoadMatchSets().then(()=>{if(state.dashboardFocus==='plan')v6RenderFullPlan(p)}).catch(()=>{});
  };
  window.renderFullPlan=function(p){return v6RenderFullPlan(p)};
})();


/* ---------- v6.8: Ready-to-book checklist, target hours by background, 80% everywhere ---------- */
const V6_BG={active_pm:{label:'Active PM (3+ years)',min:70,max:90,target:80},some_pm:{label:'Some PM experience',min:100,max:140,target:120},new_pm:{label:'New to project management',min:150,max:200,target:175}};
function v6StudiedHours(p){
  const done=a=>(a||[]).filter(x=>['reviewed','mastered'].includes(x.studyStatus)).length;
  const m=((state.v6Match||{}).sets||[]).reduce((a,x)=>a+(x.attempts||0),0);
  const mins=done(state.notes)*20+done(state.tricky)*10+done(state.diagrams)*12+Number(p.practice_answered||0)*2+m*5+(p.exam_history||[]).length*240;
  return Math.round(mins/60);
}
function v6ReadyChecks(p,conceptCount){
  const tf=(()=>{const t=String(state.tierCode||state.billing?.tier_code||state.billing?.entitlement?.tier_code||'');return t==='full'||t.startsWith('full')})();
  const pend=a=>(a||[]).filter(x=>!['reviewed','mastered'].includes(x.studyStatus)).length;
  const lists=[['topic notes',state.notes],['tricky words',state.tricky]];if(tf)lists.push(['diagrams',state.diagrams]);
  const left=lists.map(([n,a])=>[n,pend(a)]).filter(x=>x[1]);
  const cov=Number(p.practice_coverage||0);
  const counting=(p.exam_history||[]).filter(x=>x.counts_for_target!==false&&x.total&&x.answered>=x.total*0.9).sort((a,b)=>String(b.completed_at).localeCompare(String(a.completed_at)));
  const last3=counting.slice(0,3),last3ok=last3.length===3&&last3.every(x=>x.correct/x.total*100>=80);
  const pass3=last3.filter(x=>x.correct/x.total*100>=80).length;
  let doms={},src='';
  if(last3.length){last3.forEach(x=>Object.entries(x.domains||{}).forEach(([d,v])=>{(doms[d]=doms[d]||[]).push(v)}));doms=Object.fromEntries(Object.entries(doms).map(([d,a])=>[d,Math.round(a.reduce((x,y)=>x+y,0)/a.length)]));src='full mocks'}
  else{Object.entries(p.domains||{}).forEach(([d,v])=>{if(v.answered)doms[d]=Math.round(v.correct/v.answered*100)});src='practice so far'}
  const domNames=['People','Process','Business Environment'];const domVals=domNames.map(d=>[d,doms[d]]);
  const domOk=last3.length>0&&domVals.every(([,v])=>v!=null&&v>=75);
  const weak=domVals.filter(([,v])=>v==null||v<75).map(([d,v])=>`${d} ${v==null?'—':v+'%'}`);
  return [
    {ok:!left.length,title:'Every topic studied',detail:left.length?left.map(([n,c])=>`${c} ${n}`).join(' · ')+' left':'All topics done'},
    {ok:cov>=80,title:'80% of practice questions answered',detail:`${Math.round(cov)}% answered`},
    {ok:last3ok,title:'Last 3 full mocks at 80%+',detail:last3.length?`${pass3} of the last ${last3.length} at 80%+ (first attempts, timed mode)`:'No timed full mock yet'},
    {ok:domOk,title:'Every domain at 75%+',detail:(weak.length?'Below 75%: '+weak.join(' · '):'All domains 75%+')+` · from ${src}`},
    {ok:conceptCount!=null&&conceptCount<15,title:'Fewer than 15 concepts to review',detail:conceptCount==null?'Checking…':`${conceptCount} in Concepts to Review`}
  ];
}
function v6RenderReadyPanel(p){
  p=p||state.lastProgress||{};const host=document.querySelector('#progress [data-progress-panel="overview"]');if(!host)return;
  let box=document.getElementById('v6ReadyPanel');if(!box){box=document.createElement('section');box.id='v6ReadyPanel';box.className='v6-ready';host.appendChild(box)}
  const bg=(p.study_profile||{}).background,B=V6_BG[bg];const studied=v6StudiedHours(p);
  const draw=cc=>{
    const checks=v6ReadyChecks(p,cc),met=checks.filter(c=>c.ok).length;
    const s=typeof v6Pace==='function'?v6Pace(p):{};const weeks=s.days?Math.max(1,s.days/7):null;
    const hoursLine=B?`<div class="v6-ready-hours"><span class="v6-kicker">Total preparation</span><p>People with your background (${B.label}) usually prepare for <b>${B.min}–${B.max} hours in total</b>. That includes your PMP class, this study plan and your mock exams — not extra time on top.</p><small><button type="button" class="v6-datebar-btn" data-bg-change>Change background</button></small></div>`
      :`<div class="v6-ready-hours"><span class="v6-kicker">Prep hours</span><p>What is your project management background? It tells you how much total preparation is typical.</p><div class="v6-bg-pick">${Object.entries(V6_BG).map(([k,v])=>`<button type="button" data-bg="${k}"><b>${v.label}</b><span>${v.min}–${v.max} hours</span></button>`).join('')}</div></div>`;
    box.innerHTML=`<div class="v6-ready-head"><div><span class="v6-kicker">Ready to book your exam?</span><h3>${met===5?'Yes — you meet all 5 checks. ✓':`${met} of 5 checks met`}</h3><p>Book the real exam when all five are green. These are Azielon coaching benchmarks; PMI does not publish a passing score.</p></div></div>${hoursLine}<ul class="v6-ready-list">${checks.map(c=>`<li class="${c.ok?'ok':''}"><span>${c.ok?'✓':''}</span><div><b>${c.title}</b><small>${c.detail}</small></div></li>`).join('')}</ul>`;
    box.querySelectorAll('[data-bg]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('/api/coach/background',{method:'PUT',body:JSON.stringify({background:b.dataset.bg})});await loadProgress();v6RenderReadyPanel(state.lastProgress)}catch(e){b.disabled=false;alert(e.message||'Could not save')}});
    const ch=box.querySelector('[data-bg-change]');if(ch)ch.onclick=()=>{p={...p,study_profile:{...(p.study_profile||{}),background:null}};const hb=box.querySelector('.v6-ready-hours');hb.outerHTML=`<div class="v6-ready-hours"><span class="v6-kicker">Prep hours</span><p>What is your project management background?</p><div class="v6-bg-pick">${Object.entries(V6_BG).map(([k,v])=>`<button type="button" data-bg="${k}" class="${k===bg?'active':''}"><b>${v.label}</b><span>${v.min}–${v.max} hours</span></button>`).join('')}</div></div>`;box.querySelectorAll('[data-bg]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('/api/coach/background',{method:'PUT',body:JSON.stringify({background:b.dataset.bg})});await loadProgress();v6RenderReadyPanel(state.lastProgress)}catch(e){b.disabled=false}})};
  };
  draw(state.v6ConceptCount??null);
  api('/api/review/concepts').then(r=>{state.v6ConceptCount=r.count;if(document.getElementById('v6ReadyPanel')===box)draw(r.count)}).catch(()=>{});
}
(function(){
  if(typeof renderCompactProgressDashboard==='function'){const o=window.renderCompactProgressDashboard;window.renderCompactProgressDashboard=function(p){const r=o.apply(this,arguments);try{v6RenderReadyPanel(p)}catch(e){console.warn(e)}return r}}
  // Exam report: 80% bar, amber "close" band, and whether this attempt counts toward the 5
  if(typeof showExamResults==='function'){const o=window.showExamResults;window.showExamResults=async function(){
    const r=await o.apply(this,arguments);const area=document.getElementById('examResults'),rep=area&&area.querySelector('.exam-report-final');if(!rep)return r;
    const res=state.examReviewResults||{};const h2=rep.querySelector('.final-report-head h2'),badge=rep.querySelector('.result-badge');
    const lab=res.result_label;if(h2)h2.textContent=lab==='PASS'?'80%+ — on target ✓':lab==='CLOSE'?'Close — not yet 80%':'Below 80% — keep building';
    if(badge){badge.classList.remove('pass','below');badge.classList.add(lab==='PASS'?'pass':lab==='CLOSE'?'close':'below')}
    const note=rep.querySelector('.benchmark-note');if(note)note.innerHTML=`Target: 80% on a first, timed attempt. ${res.counts_for_target?'<b>This attempt counts toward your 5 exams at 80%+.</b>':`<b>This attempt does not count toward your 5</b> (${res.count_reason||'a retake, or rules shown first'}) — still useful practice.`} PMI does not publish a passing score.`;
    return r}}
})();

document.addEventListener('click',e=>{const b=e.target.closest('[data-go-ready]');if(!b)return;showView('progress');setTimeout(()=>document.getElementById('v6ReadyPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),400)});

/* ---------- v6.9: Concepts to Review — 10 per page with Prev / Next ---------- */
(function(){
  if(typeof loadConceptReview!=='function')return;const o=window.loadConceptReview;const PER=10;let page=0,lastFilter=null;
  function paint(){
    const list=document.getElementById('reviewList');if(!list)return;const cards=[...list.querySelectorAll('.concept-review-card')];
    let pager=document.getElementById('v6ReviewPager');
    if(cards.length<=PER){cards.forEach(c=>c.hidden=false);if(pager)pager.remove();return}
    const pages=Math.ceil(cards.length/PER);page=Math.max(0,Math.min(page,pages-1));
    cards.forEach((c,i)=>c.hidden=Math.floor(i/PER)!==page);
    if(!pager){pager=document.createElement('div');pager.id='v6ReviewPager';pager.className='v6-pager';list.parentNode.insertBefore(pager,list)}
    const a=page*PER+1,b=Math.min(cards.length,(page+1)*PER);
    pager.innerHTML=`<button type="button" class="secondary" data-pg="-1" ${page===0?'disabled':''}>← Previous</button><span>${a}–${b} of ${cards.length}</span><button type="button" class="secondary" data-pg="1" ${page>=pages-1?'disabled':''}>Next →</button>`;
    pager.querySelectorAll('[data-pg]').forEach(x=>x.onclick=()=>{page+=Number(x.dataset.pg);paint();const v=document.getElementById('review');if(v)v.scrollTop=0});
  }
  window.loadConceptReview=async function(){
    const f=state.conceptReviewFilter||'all';if(f!==lastFilter){page=0;lastFilter=f}
    const r=await o.apply(this,arguments);try{paint()}catch(e){}return r;
  };
})();

/* ================= v7: a calmer plan and a Today page that drives ================= */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const MIN={note:5,tricky:4,diagram:3,question:1.5,match:3,exam:240};
  const EXAM_TARGET=5,EXAM_PASS=80,REVIEW_DAYS=5,Q_MIN=5,Q_MAX=12;
  const has=f=>typeof hasFeature==='function'?hasFeature(f):true;
  const tierFull=()=>{const t=String(state.tierCode||state.billing?.tier_code||state.billing?.entitlement?.tier_code||'');return (t==='full'||t.startsWith('full')||(typeof isStaff==='function'&&isStaff()))&&has('diagrams')};
  const open=rows=>(rows||[]).filter(x=>['not_started','needs_review'].includes(x.studyStatus||'not_started'));
  const half=h=>Math.max(0.5,Math.round(h*2)/2);
  const hrs=m=>{const h=m/60;return h<1?`${Math.max(5,Math.round(m/5)*5)} min`:`${Math.round(h*2)/2} h`};
  window.v7Hrs=hrs;

  /* ---- Pace: a daily study time people can keep (default 2 h), exams counted separately ---- */
  window.v6Pace=function(p){
    p=p||state.lastProgress||{};const plan=p.adaptive_plan||{},prof=p.study_profile||{};
    const days=plan.days_until_exam;const perWeek=Math.max(1,Math.min(7,Number(prof.study_days_per_week||plan.study_days_per_week||5)));
    const capMin=[60,90,120,150,180].includes(Number(prof.session_minutes))?Number(prof.session_minutes):120;
    const left={note:has('notes')?open(state.notes).length:0,tricky:has('tricky')?open(state.tricky).length:0,diagram:tierFull()?open(state.diagrams).length:0,
      question:Math.max(0,Number(p.practice_bank_total||0)-Number(p.practice_unique_attempted||0))};
    const hist=(p.exam_history||[]).filter(x=>x.total&&x.correct/x.total*100>=EXAM_PASS&&x.answered>=x.total*0.9&&(x.counts_for_target===undefined||x.counts_for_target));
    const examsDone=Math.min(EXAM_TARGET,hist.length),examsLeft=EXAM_TARGET-examsDone;
    const matchMin=has('match')?2*MIN.match:0;
    const fixed=(left.note?MIN.note:0)+(left.tricky?MIN.tricky:0)+(left.diagram?MIN.diagram:0)+matchMin;
    const out={capMin,blocksPerDay:1,perBlockQuestions:8,days,left,examsDone,examsLeft,examTarget:EXAM_TARGET,examPass:EXAM_PASS,perDay:{note:1,tricky:1,diagram:tierFull()?1:0,question:8},hoursPerDay:null,studyDays:null,learnDays:null,examEvery:null,status:'no-date',
      mins:{note:left.note*MIN.note,tricky:left.tricky*MIN.tricky,diagram:left.diagram*MIN.diagram},examHours:{min3:Math.round(3*MIN.exam/60),all:Math.round(EXAM_TARGET*MIN.exam/60),each:MIN.exam/60}};
    out.learningDone=!left.note&&!left.tricky&&!left.diagram;
    if(days==null||days<0){out.dailyMin=fixed+8*MIN.question;return out}
    const studyDays=Math.max(1,Math.floor(days*perWeek/7));
    const review=Math.min(REVIEW_DAYS,Math.floor(studyDays/6));
    const examDays=Math.min(examsLeft*2,Math.max(studyDays>1?1:0,Math.floor(studyDays*0.4)));
    const learnDays=Math.min(studyDays,Math.max(1,Math.ceil(studyDays*0.6),studyDays-examDays-review));
    const most=Math.max(left.note,left.tricky,left.diagram);
    const needBlocks=Math.max(1,Math.ceil(most/learnDays));            // blocks a day to cover every topic
    const maxBlocks=Math.max(1,Math.floor(capMin/(fixed+Q_MIN*MIN.question)));   // blocks that fit in the daily time
    const blocks=Math.min(needBlocks,maxBlocks);
    const q=Math.max(Q_MIN,Math.min(Q_MAX,Math.floor((capMin/blocks-fixed)/MIN.question)));
    const dailyMin=blocks*(fixed+q*MIN.question);
    out.blocksPerDay=blocks;out.perBlockQuestions=q;out.dailyMin=dailyMin;out.hoursPerDay=half(dailyMin/60);
    out.studyDays=studyDays;out.learnDays=learnDays;
    out.perDay={note:left.note?blocks:0,tricky:left.tricky?blocks:0,diagram:left.diagram?blocks:0,question:blocks*q};
    out.coversAll=needBlocks<=maxBlocks;out.covered=Math.min(most,blocks*learnDays);out.most=most;
    out.fullHours=half(needBlocks*(fixed+Q_MIN*MIN.question)/60);       // what covering everything would take
    out.questionsPlanned=Math.min(left.question,blocks*q*studyDays);out.mins.question=out.questionsPlanned*MIN.question;
    out.mins.total=out.mins.note+out.mins.tricky+out.mins.diagram+out.mins.question;
    out.examEvery=examsLeft?Math.max(1,Math.floor(Math.max(1,studyDays-learnDays)/examsLeft)):null;
    out.examsFit=Math.min(examsLeft,Math.max(1,studyDays-learnDays+Math.floor(learnDays/3)));
    out.examPhase=out.learningDone||studyDays<=examDays+1;
    out.status=out.coversAll?'comfortable':'partial';
    return out;
  };

  /* ---- Blocks: topic → tricky words → diagram → practice, always in that order ---- */
  const ORDER=['note','tricky','diagram','practice'];
  window.v7Blocks=function(tasks){
    const q={note:[],tricky:[],diagram:[],practice:[]},rest=[];
    (tasks||[]).forEach(t=>{(q[t.type]||rest).push(t)});
    ORDER.forEach(k=>q[k].sort((a,b)=>(taskState(b)==='done')-(taskState(a)==='done')));
    const blocks=[];while(ORDER.some(k=>q[k].length)){const b=ORDER.map(k=>q[k].shift()).filter(Boolean);blocks.push(b)}
    rest.forEach(t=>blocks.push([t]));return blocks;
  };
  window.v7NextTask=function(afterId){return (state.todayPlan||[]).find(t=>t.id!==afterId&&taskState(t)!=='done')||null};

  function makeTask(type,item,n){
    if(type==='note')return {id:`note:${item.id}`,type,itemId:item.id,label:'Read',title:item.title,detail:(item.keyRules||[])[0]||item.summary||'',view:'notes',reason:`Block ${n} · topic`};
    if(type==='tricky')return {id:`tricky:${item.id}`,type,itemId:item.id,label:'Compare',title:`${item.left} vs ${item.right}`,detail:typeof trickyDecisionText==='function'?trickyDecisionText(item):'',view:'tricky',reason:`Block ${n} · tricky words`};
    return {id:`diagram:${item.id}`,type,itemId:item.id,label:'Visualize',title:item.title,detail:item.whyItMatters||item.whatItIs||'',view:'diagrams',reason:`Block ${n} · diagram`};
  }
  function practiceTask(p,n,topics){const q=v6Pace(p).perBlockQuestions;const uid=`${todayDateKey()}:b${n}:${Date.now().toString(36).slice(-4)}`;
    return {id:`practice:${uid}`,type:'practice',label:'Practice',title:`${q} questions${has('match')?' + 2 match sets':''}`,detail:topics.length?`On ${topics.join(' · ')}`:'Mixed questions to build coverage.',view:'practice',count:q,focus:'',domain:'',reason:`Block ${n} · practice`}}
  function pick(rows,exclude,weak){const c=open(rows).filter(x=>!exclude.has(String(x.id)));if(weak){const w=c.find(x=>String(x.domain||'').toLowerCase()===weak.toLowerCase());if(w)return w}return c[0]||null}
  function buildBlock(p,n,exclude){
    const weak=p?.adaptive_plan?.weak_domains?.[0]?.domain||'';exclude=exclude||new Set();const t=[];
    const note=has('notes')?pick(state.notes,exclude,weak):null,tr=has('tricky')?pick(state.tricky,exclude,''):null,dg=tierFull()?pick(state.diagrams,exclude,note?note.domain:weak):null;
    if(note)t.push(makeTask('note',note,n));if(tr)t.push(makeTask('tricky',tr,n));if(dg)t.push(makeTask('diagram',dg,n));
    t.push(practiceTask(p,n,t.map(x=>x.title)));
    const pace=v6Pace(p);
    if(n===1&&pace.examsLeft>0&&pace.examPhase){const ex=(p?.exam_cards||[]).find(x=>!x.completed);
      if(ex)t.push({id:`exam:${ex.exam_code}:${todayDateKey()}`,type:'exam',label:'Exam',title:`${ex.exam_name||'Full mock exam'}`,detail:`Aim for ${pace.examPass}%+. Allow about 4 hours.`,view:'exams',examKind:ex.kind||'mock',reason:'Mock exam'})}
    return t.map((x,i)=>({...x,sortOrder:(n-1)*10+i}));
  }
  async function ensureContent(){
    const jobs=[];
    if(has('notes')&&!(state.notes||[]).length&&typeof loadNotes==='function')jobs.push(loadNotes().catch(()=>{}));
    if(has('tricky')&&!(state.tricky||[]).length)jobs.push(api('/api/tricky-words').then(r=>{state.tricky=r}).catch(()=>{}));
    if(has('diagrams')&&!(state.diagrams||[]).length)jobs.push(api('/api/diagrams').then(r=>{state.diagrams=r}).catch(()=>{}));
    if(jobs.length)await Promise.all(jobs);
  }
  async function importTasks(tasks){
    await api('/api/study/daily-plan/import-local',{method:'POST',body:JSON.stringify({plans:[{plan_date:todayDateKey(),tasks:tasks.map(t=>({...t,status:'not_started'}))}]})});
    const r=await api(`/api/study/daily-plan?plan_date=${encodeURIComponent(todayDateKey())}`);
    state.todayPlan=(r.tasks||[]).map(hydrateDbTask).filter(Boolean);
  }
  // Every block gets its topic, tricky pair, diagram and practice — fill in whatever is missing.
  async function healPlan(p){
    const tasks=state.todayPlan||[];if(!tasks.length)return;
    const cnt=k=>tasks.filter(t=>t.type===k).length;const n=Math.max(cnt('note'),cnt('tricky'),cnt('diagram'),cnt('practice'));
    const used=new Set(tasks.map(t=>String(t.itemId||'')));const add=[];
    const want={note:has('notes')?state.notes:null,tricky:has('tricky')?state.tricky:null,diagram:tierFull()?state.diagrams:null};
    for(const k of ['note','tricky','diagram']){if(!want[k])continue;for(let i=cnt(k);i<n;i++){const it=pick(want[k],used,'');if(!it)break;used.add(String(it.id));add.push(makeTask(k,it,i+1))}}
    for(let i=cnt('practice');i<n;i++)add.push(practiceTask(p,i+1,[]));
    if(add.length){try{await importTasks(add)}catch(e){}}
  }
  if(typeof buildFreshTodayTasks==='function')window.buildFreshTodayTasks=function(p){return buildBlock(p,1)};
  window.v7AddBlock=async function(p,force){
    const blocks=v7Blocks(state.todayPlan||[]).filter(b=>b.some(t=>t.type==='practice'));const pace=v6Pace(p);
    if(!force&&blocks.length>=pace.blocksPerDay)return false;
    const used=new Set((state.todayPlan||[]).map(t=>String(t.itemId||'')));
    const next=buildBlock(p,blocks.length+1,used).filter(t=>t.type!=='exam');
    if(!next.some(t=>t.type!=='practice')&&!force)return false;
    await importTasks(next);state.todayPlan=v7Blocks(state.todayPlan).flat();return true;
  };
  window.appendOneNextTodayTask=async function(p){return v7AddBlock(p,false)};
  if(typeof loadAndRenderTodayPlan==='function'){
    window.loadAndRenderTodayPlan=async function(p){
      const host=document.getElementById('dashboardWorkspace');
      try{
        await ensureContent();
        await syncDatabaseTodayPlan(p);
        await healPlan(p);
        state.todayPlan=v7Blocks(state.todayPlan||[]).flat();
        const tasks=state.todayPlan;
        if(tasks.length&&tasks.every(t=>taskState(t)==='done'))await v7AddBlock(p,false);
        renderTodayPlanFromDb(p,state.todayPlan);
      }catch(err){if(host)host.innerHTML=`<div class="workspace-empty"><b>Unable to load your study plan.</b><p>${esc(err.message||'Please try again.')}</p></div>`}
    };
  }

  /* ---- Today: one step, one button ---- */
  const T={note:{label:'Topic note',verb:'Read',cta:'Start reading'},tricky:{label:'Tricky words',verb:'Compare',cta:'Compare the terms'},diagram:{label:'Diagram',verb:'Study',cta:'Open the diagram'},practice:{label:'Practice',verb:'Practice',cta:'Start practice'},exam:{label:'Mock exam',verb:'Take',cta:'Start the exam'},review:{label:'Fix mistakes',verb:'Review',cta:'Review now'}};
  const baseToday=window.renderTodayPlanFromDb;
  window.renderTodayPlanFromDb=function(p,tasks){
    tasks=tasks||[];baseToday(p,tasks);
    const col=document.querySelector('#dashboardWorkspace .v6-home > .v6-col');if(!col)return;
    const blocks=v7Blocks(tasks);const pace=v6Pace(p);
    let bi=blocks.findIndex(b=>b.some(t=>taskState(t)!=='done'));const allDone=bi<0;if(allDone)bi=blocks.length-1;
    const block=blocks[bi]||[];const next=block.find(t=>taskState(t)!=='done');
    const studyBlocks=blocks.filter(b=>b.some(t=>t.type==='practice')).length;const totalBlocks=Math.max(pace.blocksPerDay||1,studyBlocks);
    const doneBlocks=blocks.filter(b=>b.every(t=>taskState(t)==='done')).length;
    const quiet=pace.hoursPerDay!=null?`<p class="v7-quiet">About <b>${hrs(pace.dailyMin)}</b> of study today · ${pace.days} days to your exam</p>`:'';
    let html='';
    if(!tasks.length){html=`<section class="v7-now"><span class="v6-kicker">Today</span><h2>Your plan is being prepared</h2><p>Open any section in the menu to start.</p></section>`}
    else if(allDone){
      html=`<section class="v7-now is-done"><span class="v6-kicker">Today</span><h2>You are done for today ✓</h2><p>${doneBlocks} study block${doneBlocks===1?'':'s'} finished. Come back tomorrow for the next one.</p><div class="v7-actions"><button type="button" class="secondary" data-v7-more>Do one more block →</button></div></section>${quiet}`;
    }else{
      const i=block.indexOf(next),meta=T[next.type]||{label:next.label||'Study',verb:'',cta:'Start'};const st=taskState(next);
      const detail=next.type==='practice'?(()=>{const names=block.filter(t=>t.type!=='practice').map(t=>t.title);return names.length?`On ${names.join(' · ')}`:(next.detail||'')})():(next.detail||'');
      const steps=block.map((t,k)=>{const d=taskState(t)==='done',cur=t===next;const m=T[t.type]||{label:t.label||'Step'};
        return d?`<button type="button" class="v7-step is-done" data-today-open="${esc(t.id)}" title="Review: ${esc(t.title)}"><i>✓</i>${esc(m.label)}</button>`:`<span class="v7-step ${cur?'is-now':''}"><i>${k+1}</i>${esc(m.label)}</span>`}).join('<span class="v7-step-line" aria-hidden="true"></span>');
      html=`<section class="v7-now"><span class="v6-kicker">Step ${i+1} of ${block.length}${totalBlocks>1?` · Block ${bi+1} of ${Math.max(totalBlocks,bi+1)}`:''}</span>
        <h2>${esc(next.type==='practice'?`Practice: ${next.title}`:`${meta.verb}: ${next.title}`)}</h2>${detail?`<p>${esc(detail)}</p>`:''}
        <div class="v7-actions"><button type="button" class="primary v7-go" data-today-open="${esc(next.id)}">${st==='in_progress'?'Continue':meta.cta} →</button></div>
        <div class="v7-steps">${steps}</div></section>${quiet}`;
    }
    col.innerHTML=html;
    if(typeof bindDashboardWorkspaceActions==='function')bindDashboardWorkspaceActions();
    const more=col.querySelector('[data-v7-more]');if(more)more.onclick=async()=>{more.disabled=true;more.textContent='Adding…';try{const ok=await v7AddBlock(p,true);if(ok)renderTodayPlanFromDb(p,state.todayPlan);else{more.textContent='Nothing left to add ✓'}}catch(e){more.disabled=false;more.textContent='Do one more block →'}};
  };

  /* ---- My Progress: plan in plain hours, mock exams listed separately ---- */
  function panel(p){
    const box=document.getElementById('v6PacePanel');if(!box)return;const s=v6Pace(p);
    const row=(label,left,min,unit)=>left?`<div><b>${hrs(min)}</b><span>${label}</span><small>${left} ${unit} left</small></div>`:`<div class="is-done"><b>✓</b><span>${label}</span><small>complete</small></div>`;
    const bars=Array.from({length:s.examTarget},(_,i)=>`<i class="${i<s.examsDone?'on':''}"></i>`).join('');
    const exams=`<div class="v7-exams"><span class="v6-kicker">Mock exams · planned separately</span><p>Allow about <b>${s.examHours.each} hours for each full mock exam</b>. Take at least 3 before your test (about ${s.examHours.min3} hours) and all ${s.examTarget} if you can (about ${s.examHours.all} hours). Aim for ${s.examPass}%+.</p><div class="v6-exam-bars">${bars}</div><small>${s.examsDone} of ${s.examTarget} at ${s.examPass}%+</small></div>`;
    if(s.hoursPerDay==null){box.innerHTML=`<span class="v6-kicker">Your study plan</span><p>Add your exam date and the plan will pace itself — about ${hrs(s.dailyMin)} a day.</p>${exams}`;return}
    const head=s.learningDone?'Topics complete — keep practicing':`About ${hrs(s.dailyMin)} a day`;
    const sub=s.learningDone?`Practice a little each day and take your mock exams. ${s.days} days to your exam.`:s.coversAll?`That covers every topic before your exam, ${s.studyDays} study days away. One short block at a time.`:`At ${hrs(s.dailyMin)} a day you will cover ${s.covered} of ${s.most} topics before your exam. To cover them all, study about ${s.fullHours} h a day or move your exam date.`;
    box.innerHTML=`<div class="v6-pace-head"><div><span class="v6-kicker">Your study plan</span><h3>${head}</h3><p>${sub}</p></div></div>
      <div class="v6-pace-grid">${has('notes')?row('Topic notes',s.left.note,s.mins.note,'topics'):''}${has('tricky')?row('Tricky words',s.left.tricky,s.mins.tricky,'pairs'):''}${tierFull()?row('Diagrams',s.left.diagram,s.mins.diagram,'diagrams'):''}${row('Practice',s.questionsPlanned,s.mins.question,'questions')}<div class="v7-total"><b>${hrs(s.mins.total)}</b><span>Total study time</span><small>mock exams not included</small></div></div>${exams}`;
  }
  if(typeof renderCompactProgressDashboard==='function'){const o=window.renderCompactProgressDashboard;window.renderCompactProgressDashboard=function(p){const r=o.apply(this,arguments);try{panel(p||state.lastProgress||{})}catch(e){console.warn(e)}return r}}

  /* ---- Concept Mastery: lead with "10 concepts, then 10 questions" ---- */
  if(typeof openExamSetup==='function'){const o=window.openExamSetup;window.openExamSetup=function(code){const r=o.apply(this,arguments);
    const box=document.getElementById('examSetup'),grid=box&&box.querySelector('.mode-grid'),rec=grid&&grid.querySelector('[data-mode="block_rules"]');
    if(rec){rec.classList.add('v7-recommended');rec.innerHTML='<em>Recommended</em><b>Learn, then answer</b><span>Review 10 concepts, then answer the 10 questions on them. Repeats for all 180.</span>';grid.prepend(rec);
      const all=grid.querySelector('[data-mode="review_all"]');if(all)all.innerHTML='<b>All concepts first</b><span>Study all 180 concepts, then take the exam</span>';
      const mock=grid.querySelector('[data-mode="real_mock"]');if(mock)mock.innerHTML='<b>Real mock</b><span>No concepts shown · 180 questions, timed · answers at the end</span>';
      const ro=grid.querySelector('#rulesOnlyBtn');if(ro)ro.innerHTML='<b>Concepts only</b><span>Browse the 180 concepts without starting an exam</span>';
      const h=box.querySelector('h3');if(h)h.textContent='How do you want to take this exam?'}
    return r}}
  if(typeof renderRules==='function'){const o=window.renderRules;window.renderRules=function(rules,title,onContinue){
    title=String(title||'').replace(/Review these 10 rules/,'review these 10 concepts, then answer 10 questions on them').replace(/180 rules/,'180 concepts');
    const r=o.call(this,rules,title,onContinue);const b=document.getElementById('rulesContinue');if(b)b.textContent='I have reviewed these — start the questions →';
    const area=document.getElementById('ruleReviewArea');if(area&&b){const head=area.querySelector('.rule-review-head');if(head){const top=b.cloneNode(true);top.id='rulesContinueTop';top.classList.remove('wide');top.onclick=()=>b.click();head.appendChild(top)}}
    const v=document.getElementById('exams');if(v)v.scrollTop=0;return r}}
})();

/* ---- Full plan: mark done / undo right in the list ---- */
(function(){
  const LIST={note:'notes',tricky:'tricky',diagram:'diagrams'};
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-plan-mark]');if(!b)return;const type=b.dataset.planType,id=b.dataset.planId,to=b.dataset.planMark;b.disabled=true;
    try{await api(`/api/study/items/${type}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({status:to})});const it=(state[LIST[type]]||[]).find(x=>String(x.id)===String(id));if(it)it.studyStatus=to;if(typeof loadStudySummary==='function')loadStudySummary().catch(()=>{});v6RenderFullPlan(state.lastProgress)}catch(err){b.disabled=false;alert(err.message||'Could not save.')}});
  const o=window.v6RenderFullPlan;if(typeof o!=='function')return;
  window.v6RenderFullPlan=function(p){const r=o.apply(this,arguments);
    document.querySelectorAll('#dashboardWorkspace .v6-plan-row').forEach(row=>{const open=row.querySelector('[data-full-plan-open]');if(!open)return;const type=open.dataset.fullPlanOpen,id=open.dataset.fullPlanId;if(!LIST[type])return;
      const done=row.classList.contains('st-done');const btn=document.createElement('button');btn.type='button';btn.className='v7-mark';btn.dataset.planType=type;btn.dataset.planId=id;btn.dataset.planMark=done?'not_started':'reviewed';btn.textContent=done?'Undo':'Mark done';row.insertBefore(btn,open)});
    return r};
})();

/* ---------- v7.1: "Review concept" opens the concept itself ---------- */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  async function openConcept(conceptId){
    const view=document.getElementById('review'),list=document.getElementById('reviewList');if(!view||!list)return;
    let box=document.getElementById('v7Concept');if(!box){box=document.createElement('section');box.id='v7Concept';box.className='v7-concept';list.parentNode.insertBefore(box,list)}
    view.classList.add('v7-concept-open');box.innerHTML='<p class="v6-task-flag">Loading the concept…</p>';view.scrollTop=0;
    const close=()=>{view.classList.remove('v7-concept-open');box.innerHTML=''};
    let d;try{d=await api(`/api/review/concepts/${encodeURIComponent(conceptId)}/detail`)}catch(err){box.innerHTML=`<button type="button" class="v6-session-exit" data-c-back>← All concepts</button><p class="v6-task-flag">${esc(err.message||'Could not load this concept.')}</p>`;box.querySelector('[data-c-back]').onclick=close;return}
    const ids=[...list.querySelectorAll('.concept-review-card')].map(c=>{const m=(c.querySelector('.text-btn')?.getAttribute('onclick')||'').match(/markConceptReviewed\('([^']+)'/);return m?m[1]:null}).filter(Boolean);
    const pos=ids.indexOf(conceptId),nextId=pos>=0?ids[pos+1]:null;
    const rel=d.related||{};
    const item=x=>`<article class="v7-concept-item"><span class="v6-kicker">You missed this in ${esc(x.source)}</span><p class="v7-concept-stem">${esc(x.stem)}</p>${x.pairs?`<table class="v6-match-review"><tbody>${x.pairs.map(p=>`<tr><th>${esc(p.left)}</th><td>${esc(p.right)}</td></tr>`).join('')}</tbody></table>`:`<ul class="v7-concept-opts">${(x.options||[]).filter(o=>o.correct).map(o=>`<li class="ok"><b>✓</b><span>${esc(o.text)}</span></li>`).join('')}</ul>${(x.options||[]).some(o=>!o.correct)?`<details class="v7-concept-more"><summary>Show the other answer choices</summary><ul class="v7-concept-opts">${(x.options||[]).filter(o=>!o.correct).map(o=>`<li><b>✗</b><span>${esc(o.text)}</span></li>`).join('')}</ul></details>`:''}`}${x.lesson?(typeof v6LessonHTML==='function'?v6LessonHTML(x.lesson):`<p>${esc(x.lesson)}</p>`):''}${x.ref_type==='practice'?`<button type="button" class="secondary" data-c-retry="${esc(x.ref_id)}">Try this question again →</button>`:''}</article>`;
    box.innerHTML=`<div class="v7-concept-head"><div class="v7-concept-title"><button type="button" class="v6-session-exit" data-c-back>← All concepts</button><span class="v6-kicker">${esc(d.domain||'PMP concept')}</span><h2>${esc(d.concept)}</h2></div><div class="v7-concept-acts"><button type="button" class="secondary" data-c-done>✓ Done reviewing</button>${nextId?'<button type="button" class="primary" data-c-next>Next concept →</button>':''}</div></div>
      ${(rel.note||rel.tricky)?`<div class="v7-concept-rel"><span>Study it:</span>${rel.note?`<button type="button" data-c-note="${esc(rel.note.id)}">Topic note · ${esc(rel.note.title)} →</button>`:''}${rel.tricky?`<button type="button" data-c-tricky="${esc(rel.tricky.id)}">Tricky words · ${esc(rel.tricky.title)} →</button>`:''}</div>`:''}
      ${d.items&&d.items.length?d.items.map(item).join(''):'<p class="v6-task-flag">Nothing is waiting on this concept any more. Mark it done.</p>'}`;
    // One missed question at a time, so the whole lesson fits on the screen.
    const its=[...box.querySelectorAll('.v7-concept-item')];
    if(its.length>1){let k=0;const pg=document.createElement('div');pg.className='v7-concept-pager';box.insertBefore(pg,its[0]);
      const show=()=>{its.forEach((el,i)=>el.hidden=i!==k);pg.innerHTML=`<span>Missed question ${k+1} of ${its.length}</span><button type="button" class="secondary" ${k===0?'disabled':''} data-k="-1">← Previous</button><button type="button" class="secondary" ${k===its.length-1?'disabled':''} data-k="1">Next question →</button>`;pg.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{k+=Number(b.dataset.k);show();view.scrollTop=0})};show()}
    box.querySelector('[data-c-back]').onclick=close;
    box.querySelector('[data-c-done]').onclick=async e=>{e.target.disabled=true;try{await api(`/api/study/items/concept/${encodeURIComponent(conceptId)}`,{method:'PUT',body:JSON.stringify({status:'reviewed'})})}catch(err){}await loadConceptReview();if(nextId&&document.querySelector(`#reviewList .text-btn[onclick*="'${nextId}'"]`))openConcept(nextId);else close()};
    const nx=box.querySelector('[data-c-next]');if(nx)nx.onclick=()=>openConcept(nextId);
    box.querySelectorAll('[data-c-retry]').forEach(b=>b.onclick=()=>{close();retryQuestion(b.dataset.cRetry)});
    const n=box.querySelector('[data-c-note]');if(n)n.onclick=()=>{close();window.v7OrigConceptSource('note',n.dataset.cNote,'')};
    const t=box.querySelector('[data-c-tricky]');if(t)t.onclick=()=>{close();window.v7OrigConceptSource('tricky',t.dataset.cTricky,'')};
  }
  window.v7OpenConcept=openConcept;
  if(typeof window.openConceptSource==='function'){
    const o=window.openConceptSource;window.v7OrigConceptSource=o;
    // Questions and exam misses open the concept lesson; study items still open the item itself.
    document.addEventListener('click',e=>{const b=e.target.closest('#reviewList .concept-review-actions .secondary');if(!b)return;const card=b.closest('.concept-review-card');const m=(card.querySelector('.text-btn')?.getAttribute('onclick')||'').match(/markConceptReviewed\('([^']+)'/);const src=(b.getAttribute('onclick')||'').match(/openConceptSource\('([^']*)'/);
      if(m&&src&&(src[1]==='practice'||src[1]==='exam'||src[1]==='')){e.preventDefault();e.stopImmediatePropagation();openConcept(m[1])}},true);
  }
  if(typeof showView==='function'){const o=window.showView;window.showView=function(id){if(id!=='review'){const v=document.getElementById('review');if(v&&v.classList.contains('v7-concept-open')){v.classList.remove('v7-concept-open');const b=document.getElementById('v7Concept');if(b)b.innerHTML=''}}return o.apply(this,arguments)}}
})();

/* ---------- v7.1: exams — full-screen, nothing but the exam ---------- */
(function(){
  const area=document.getElementById('examSessionArea'),card=document.getElementById('examQuestionCard'),rules=document.getElementById('ruleReviewArea');if(!area||!card)return;
  const sync=()=>{
    const running=!area.classList.contains('hidden')&&!card.querySelector('.pause-card')&&!card.querySelector('.break-card')&&state.currentView==='exams';
    const concepts=rules&&!rules.classList.contains('hidden')&&rules.querySelector('#rulesContinue')&&state.currentView==='exams';
    document.body.classList.toggle('v7-exam-live',!!(running||concepts));
    document.body.classList.toggle('v7-exam-running',!!running);
  };
  new MutationObserver(sync).observe(area,{attributes:true,attributeFilter:['class']});
  new MutationObserver(sync).observe(card,{childList:true});
  if(rules)new MutationObserver(sync).observe(rules,{attributes:true,attributeFilter:['class'],childList:true});
  if(typeof showView==='function'){const o=window.showView;window.showView=function(){const r=o.apply(this,arguments);sync();return r}}
  sync();
})();

/* ---------- v7.2: Diagrams — finished ones stay reachable ---------- */
(function(){
  if(typeof renderDiagrams!=='function')return;const o=window.renderDiagrams;
  window.renderDiagrams=async function(){
    const r=await o.apply(this,arguments);
    try{
      const grid=document.getElementById('diagramGrid'),empty=grid&&grid.querySelector('.empty-state');
      if(empty&&state.diagramMode!=='all'){
        const dom=document.getElementById('diagramDomainSelect')?.value||'';
        const inDom=(state.diagrams||[]).filter(d=>!dom||d.domain===dom);
        const done=inDom.filter(d=>['reviewed','mastered'].includes(d.studyStatus)).length;
        if(inDom.length){
          empty.innerHTML=state.diagramMode==='study'&&done===inDom.length
            ?`<h3>All ${inDom.length} ${dom?dom+' ':''}diagrams studied ✓</h3><p>Nothing new is waiting here. You can look at them again any time.</p><button type="button" class="primary" data-diagram-all>View these diagrams again →</button>`
            :`<h3>Nothing marked for review.</h3><p>${inDom.length} ${dom?dom+' ':''}diagrams are available.</p><button type="button" class="primary" data-diagram-all>View all ${inDom.length} diagrams →</button>`;
          empty.querySelector('[data-diagram-all]').onclick=()=>document.querySelector('[data-diagram-mode="all"]')?.click();
        }
      }
    }catch(e){}
    return r;
  };
})();

/* ---------- v7.3: every diagram comes with a short walk-through ---------- */
(function(){
  if(typeof renderDiagrams!=='function')return;const o=window.renderDiagrams;
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  window.renderDiagrams=async function(){
    const r=await o.apply(this,arguments);
    try{
      const viewer=document.querySelector('#diagramGrid .diagram-viewer'),stage=viewer&&viewer.querySelector('.diagram-stage');
      if(stage&&!viewer.querySelector('.v7-drow')){
        const rows=diagramRows(),d=rows[Math.min(state.diagramIndex||0,rows.length-1)],L=d&&d.lesson;
        if(L){
          const row=document.createElement('div');row.className='v7-drow';stage.parentNode.insertBefore(row,stage);row.appendChild(stage);
          const side=document.createElement('aside');side.className='v7-dlesson';
          side.innerHTML=`<span class="v6-kicker">What this picture teaches</span><p class="v7-dteach">${esc(L.teaches)}</p>
            <span class="v6-kicker">How to read it</span><ol>${(L.readIt||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
            <span class="v6-kicker">Try it on the picture</span><p>${esc(L.example)}</p>
            <span class="v6-kicker">On the exam</span><p>${esc(L.examUse)}</p>
            <p class="v7-dtrap"><b>Watch out:</b> ${esc(L.trap)}</p>
            <div class="v7-dremember"><span class="v6-kicker">Remember</span><p>${esc(L.remember)}</p></div>`;
          row.appendChild(side);viewer.classList.add('has-lesson');
        }
      }
    }catch(e){console.warn(e)}
    return r;
  };
})();

/* ---------- v7.6: clearer topic notes and tricky words ---------- */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let RW=null,loading=null;
  function load(){if(RW)return Promise.resolve(RW);if(!loading)loading=api('/api/study/rewrites').then(r=>{RW=r||{notes:{},tricky:{}};return RW}).catch(()=>{loading=null;return null});return loading}
  // Apply a rewrite only while the original wording is untouched, so Instructor Studio edits always win.
  function apply(){
    if(!RW)return;
    // Merged duplicates are hidden; split-out notes are added. Instructor-edited items are left alone.
    const hideN=n=>{const r=RW.notes&&RW.notes[n.id];return !!(r&&r.hidden&&String(n.summary||'')===String(r.old||''))};
    if((state.notes||[]).some(hideN))state.notes=state.notes.filter(n=>!hideN(n));
    (RW.newNotes||[]).forEach(x=>{if(!(state.notes||[]).some(n=>n.id===x.id)&&(state.notes||[]).length&&(typeof noteDomain==='undefined'||!noteDomain||noteDomain===x.domain))state.notes.push({...x,_rw:true,studyStatus:(state.v7NoteStates&&state.v7NoteStates[x.id])||'not_started'})});
    (state.notes||[]).forEach(n=>{if(n._rw)return;const r=RW.notes&&RW.notes[n.id];if(!r||r.hidden)return;if(String(n.summary||'')!==String(r.old||''))return;
      Object.assign(n,{summary:r.summary,example:r.example,dos:r.dos,donts:r.donts,rule:r.rule,examCue:r.examCue,_rw:true});if(r.title)n.title=r.title});
    const hideT=t=>{const r=RW.tricky&&RW.tricky[t.id];return !!(r&&r.hidden&&String(t.leftMeaning||'')===String(r.old||''))};
    if((state.tricky||[]).some(hideT))state.tricky=state.tricky.filter(t=>!hideT(t));
    // A plan step that pointed at a merged item now points at the note or pair it was merged into.
    (state.todayPlan||[]).forEach(t=>{const list=t.type==='note'?'notes':t.type==='tricky'?'tricky':null;if(!list)return;const r=RW[list]&&RW[list][t.itemId];
      if(r&&r.hidden&&r.mergedInto&&!(state[list]||[]).some(x=>String(x.id)===String(t.itemId))){const it=(state[list]||[]).find(x=>String(x.id)===String(r.mergedInto));if(it){t.itemId=it.id;t.item=it;t.title=list==='notes'?it.title:`${it.left} vs ${it.right}`}}});
    (state.tricky||[]).forEach(t=>{if(t._rw)return;const r=RW.tricky&&RW.tricky[t.id];if(!r||r.hidden)return;if(String(t.leftMeaning||'')!==String(r.old||''))return;
      Object.assign(t,{hook:r.hook,leftMeaning:r.leftMeaning,rightMeaning:r.rightMeaning,leftScenarioCue:r.leftScenarioCue,rightScenarioCue:r.rightScenarioCue,leftMemory:r.leftMemory,rightMemory:r.rightMemory,trap:r.trap,memory:r.memory,_rw:true})});
  }
  window.v7ApplyRewrites=apply;
  ['renderNotes','renderNotesSingle','renderTricky','renderTodayPlanFromDb','v6RenderFullPlan'].forEach(fn=>{if(typeof window[fn]!=='function')return;const o=window[fn];window[fn]=function(){try{apply()}catch(e){}return o.apply(this,arguments)}});
  ['loadNotes','loadTricky'].forEach(fn=>{if(typeof window[fn]!=='function')return;const o=window[fn];window[fn]=async function(){await load();try{if(RW&&RW.ecoNotes&&typeof supplementalTopicNotes!=='undefined')supplementalTopicNotes.forEach(n=>{const e=RW.ecoNotes[n.id];if(e&&e.domain){n.domain=e.domain;n.ecoTask=e.task;n.ecoTaskTitle=e.title}})}catch(e){}if(fn==='loadNotes'&&RW&&(RW.newNotes||[]).length){try{const st=await api('/api/study/states');state.v7NoteStates=Object.fromEntries((st||[]).filter(x=>x.content_type==='note').map(x=>[x.content_id,x.status]))}catch(e){}}return o.apply(this,arguments)}});
  if(state.token)load().then(()=>{try{apply()}catch(e){}});
  // Note layout: what it is → a real example → do / don't → rule → exam cue
  if(typeof noteDetailHtml==='function'){const o=window.noteDetailHtml;window.noteDetailHtml=function(n){
    if(!n||!n._rw)return o.apply(this,arguments);
    const li=a=>(a||[]).slice(0,5).map(x=>`<li>${esc(x)}</li>`).join('');
    return `<div class="note-study-body fingertip-note v7-note">
      <p class="note-summary fingertip-summary">${esc(n.summary)}</p>
      <section class="v7-note-example"><span class="exam-section-kicker">In real life</span><p>${esc(n.example)}</p></section>
      <div class="fingertip-columns">
        <section class="fingertip-section do-section"><span class="exam-section-kicker">DO</span><ul>${li(n.dos)}</ul></section>
        <section class="fingertip-section dont-section"><span class="exam-section-kicker">DON’T / EXAM TRAPS</span><ul>${li(n.donts)}</ul></section>
      </div>
      <section class="fingertip-rule"><span class="exam-section-kicker">RULE TO REMEMBER</span><strong>${esc(n.rule)}</strong></section>
      <p class="v7-note-cue"><b>On the exam:</b> ${esc(n.examCue)}</p>
    </div>`}}
})();

/* ---------- v7.8: Concept Mastery — clear choices, real buttons, never a blank screen ---------- */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const $id=id=>document.getElementById(id);
  // 1) Setup screen: one recommended button, the other ways clearly labelled.
  if(typeof openExamSetup==='function'){const o=window.openExamSetup;window.openExamSetup=function(code){
    const r=o.apply(this,arguments);
    const box=$id('examSetup'),grid=box&&box.querySelector('.mode-grid');if(!grid)return r;
    const e=(state.examCatalog||[]).find(x=>x.code===code)||{};const mastery=e.kind==='mastery';
    box.classList.add('v8-has-setup');   // hides the old list; learn mode always explains each answer
    box.querySelector('.v8-setup')?.remove();
    const wrap=document.createElement('div');wrap.className='v8-setup';
    const opt=(mode,title,desc,btn,primary,tag)=>`<div class="v8-opt ${primary?'is-main':''}">${tag?`<span class="v8-tag">${tag}</span>`:''}<div class="v8-opt-copy"><b>${title}</b><span>${desc}</span></div><button type="button" class="${primary?'primary':'secondary'}" data-v8-mode="${mode}">${btn}</button></div>`;
    wrap.innerHTML=`<h3 class="v8-h">${mastery?'How do you want to take this exam?':'Ready to start?'}</h3><div id="v8SetupAlert" class="v8-alert" hidden></div>`+(mastery
      ?opt('block_rules','Learn, then answer','Read 10 concepts, then answer the 10 questions on them. You see the explanation after each answer. Repeats for all 180 questions.','Start learning →',true,'Recommended')
       +opt('real_mock','Real mock exam','No concepts shown. 180 questions with a 4-hour timer. Answers at the end. Counts toward your 5 exams at 80%+.','Start real mock',false)
       +opt('review_all','All concepts first','Read all 180 concepts in one go, then take the exam.','Read all concepts',false)
      :opt('real_mock','Full mock exam','180 questions with a 4-hour timer, like the real exam. Answers and explanations at the end. You can pause and come back.','Start the exam →',true));
    const running=(state.examCatalog||[]).filter(x=>x.code!==code&&x.active_session&&!x.active_session.paused);
    if(running.length){const n=document.createElement('p');n.className='v8-note';n.innerHTML=`<b>${esc(running.map(x=>x.name).join(', '))}</b> is still in progress. Starting this exam pauses it and stops its timer. You can resume it later from the exam list.`;wrap.querySelector('.v8-h').after(n)}
    box.appendChild(wrap);
    wrap.querySelectorAll('[data-v8-mode]').forEach(b=>b.onclick=async()=>{
      const mode=b.dataset.v8Mode,label=b.textContent;wrap.querySelectorAll('button').forEach(x=>x.disabled=true);b.textContent='Starting…';
      const alertBox=$id('v8SetupAlert');alertBox.hidden=true;const msg=$id('examSetupMessage');if(msg)msg.textContent='';
      try{
        if(mode==='rules_only'){box.querySelector('#rulesOnlyBtn')?.click()}
        else{const sel=$id('examFeedback');if(sel)sel.value='immediate';await startExam(code,mode)}
      }finally{
        const err=(msg&&msg.textContent||'').trim();
        if(err){alertBox.innerHTML=`<b>That did not start.</b> ${esc(err)}`;alertBox.hidden=false}
        wrap.querySelectorAll('button').forEach(x=>x.disabled=false);b.textContent=label;
      }
    });
    return r}}
  // 2) Starting or resuming always begins from a clean state.
  const reset=()=>{state.v6RulePaused=false;try{clearExamTimer()}catch(e){}};
  ['startExam','resumeExam'].forEach(fn=>{if(typeof window[fn]!=='function')return;const o=window[fn];window[fn]=async function(){reset();return o.apply(this,arguments)}});
  if(typeof showExamResults==='function'){const o=window.showExamResults;window.showExamResults=async function(){try{clearExamTimer()}catch(e){}state.v6RulePaused=false;return o.apply(this,arguments)}}
  // 3) Concepts screen: if it cannot load, say so with a way forward (never an empty page).
  if(typeof showExamRuleBlock==='function'){const o=window.showExamRuleBlock;window.showExamRuleBlock=async function(n){
    const rules=$id('ruleReviewArea'),sess=$id('examSessionArea'),msg=$id('examMessage');if(msg)msg.textContent='';
    if(rules){$id('examSetup')?.classList.add('hidden');sess?.classList.add('hidden');rules.innerHTML='<p class="v8-loading">Loading the next 10 concepts…</p>';rules.classList.remove('hidden')}
    const r=await o.apply(this,arguments);
    if(rules&&!rules.querySelector('.rule-list')){const err=(msg&&msg.textContent||'').trim()||'The concepts could not be loaded.';
      rules.innerHTML=`<div class="v8-alert"><b>We could not load these concepts.</b> ${esc(err)}</div><div class="v8-row"><button type="button" class="primary" id="v8RulesRetry">Try again</button><button type="button" class="secondary" id="v8RulesExit">Back to exams</button></div>`;
      rules.classList.remove('hidden');$id('v8RulesRetry').onclick=()=>showExamRuleBlock(n);$id('v8RulesExit').onclick=()=>typeof v6ExitExam==='function'?v6ExitExam():location.reload()}
    return r}}
  // Concepts screen wording: step 1 of 2, with the start button at the top and bottom.
  if(typeof renderRules==='function'){const o=window.renderRules;window.renderRules=function(rules,title,onContinue){
    const r=o.apply(this,arguments);const area=$id('ruleReviewArea'),head=area&&area.querySelector('.rule-review-head');
    if(head&&onContinue){const m=String(title||'').match(/Block (\d+)/);const k=area.querySelector('.eyebrow');if(k)k.textContent=m?`Step 1 of 2 · Block ${m[1]} of 18`:'Step 1 of 2';
      const h=head.querySelector('h3');if(h&&m)h.textContent='Read these 10 concepts';
      if(!area.querySelector('.v8-sub')){const p=document.createElement('p');p.className='v8-sub';p.textContent='Take your time — the timer is stopped. When you are ready, answer the 10 questions on them.';head.after(p)}
      if(!m){if(h)h.textContent='Read all 180 concepts';const sub=area.querySelector('.v8-sub');if(sub)sub.textContent='The timer has not started. When you are ready, start the 180-question exam.'}
      area.querySelectorAll('#rulesContinue,#rulesContinueTop').forEach(b=>b.textContent=m?'Start the 10 questions →':'Start the exam →')}
    return r}}
  // 4) Question screen: show loading, and show a clear message with Retry if a question cannot load.
  if(typeof loadExamQuestion==='function'){const o=window.loadExamQuestion;window.loadExamQuestion=async function(i){
    const card=$id('examQuestionCard'),msg=$id('examMessage');const before=card?card.innerHTML:'';if(msg)msg.textContent='';
    if(card&&!card.querySelector('.pause-card'))card.innerHTML='<p class="v8-loading">Loading question…</p>';
    const r=await o.apply(this,arguments);
    if(card&&card.querySelector('.v8-loading')){
      const rulesOpen=!$id('ruleReviewArea')?.classList.contains('hidden');
      if(rulesOpen){card.innerHTML=''}
      else{const err=(msg&&msg.textContent||'').trim()||'The question could not be loaded.';
        card.innerHTML=`<div class="v8-alert"><b>We could not load this question.</b> ${esc(err)}</div><div class="v8-row"><button type="button" class="primary" id="v8QRetry">Try again</button><button type="button" class="secondary" id="v8QExit">Save and exit</button></div>`;
        $id('v8QRetry').onclick=async()=>{try{await api(`/api/exam-sessions/${state.examSession.session_id}/resume`,{method:'POST'})}catch(e){}loadExamQuestion(i)};
        $id('v8QExit').onclick=()=>typeof v6ExitExam==='function'?v6ExitExam():location.reload()}
    }
    return r}}
})();

(function(){if(typeof beginExamQuestions!=='function')return;const o=window.beginExamQuestions;window.beginExamQuestions=async function(){const r=await o.apply(this,arguments);const pill=document.getElementById('examModePill');if(pill){const m=state.examSession&&state.examSession.mode;pill.textContent=m==='real_mock'?'Real mock exam':m==='block_rules'?'Learn, then answer':'Concepts read first'}return r}})();


/* ---------- v7.11: My Progress on one screen — done, left, weak areas, ready ---------- */
(function(){
  const esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const has=f=>typeof hasFeature==='function'?hasFeature(f):true;
  const tierFull=()=>{const t=String(state.tierCode||state.billing?.tier_code||state.billing?.entitlement?.tier_code||'');return t==='full'||t.startsWith('full')||(typeof isStaff==='function'&&isStaff())};
  const isDone=x=>['reviewed','mastered'].includes(x.studyStatus);
  function studyRows(p){
    const rows=[];const add=(k,label,arr)=>{arr=arr||[];if(arr.length)rows.push({k,label,done:arr.filter(isDone).length,total:arr.length})};
    if(has('notes'))add('notes','Topic notes',state.notes);
    if(has('tricky'))add('tricky','Tricky words',state.tricky);
    if(tierFull()&&has('diagrams'))add('diagrams','Diagrams',state.diagrams);
    if(has('match'))add('match','Match sets',(state.v6Match||{}).sets);
    const bank=Number(p.practice_bank_total||0);if(bank)rows.push({k:'practice',label:'Practice questions',done:Math.min(bank,Number(p.practice_unique_attempted||0)),total:bank});
    return rows;
  }
  function domainRows(p){
    return ['People','Process','Business Environment'].map(d=>{const v=(p.domains||{})[d]||{};const pct=v.answered?Math.round(v.correct/v.answered*100):null;return {d,pct,n:v.answered||0}});
  }
  function render(p){
    p=p||state.lastProgress||{};const sec=document.getElementById('progress');if(!sec)return;
    sec.classList.add('v9');
    let host=document.getElementById('v9Progress');if(!host){host=document.createElement('div');host.id='v9Progress';sec.insertBefore(host,sec.firstChild)}
    sec.querySelectorAll('#v6DateBar').forEach(n=>{if(!host.contains(n))n.remove()});
    const rows=studyRows(p),doms=domainRows(p);
    const known=doms.filter(x=>x.pct!=null),weakest=known.length?known.reduce((a,b)=>b.pct<a.pct?b:a):null;
    const pat=(p.mistake_patterns||[])[0];
    const cc=state.v6ConceptCount;
    const checks=typeof v6ReadyChecks==='function'?v6ReadyChecks(p,cc??null):[];const met=checks.filter(c=>c.ok).length;
    const allHist=(p.exam_history||[]);const hist=allHist.filter(x=>x.total&&x.answered>=x.total*0.9);const best=hist.length?Math.max(...hist.map(x=>Math.round(x.correct/x.total*100))):null;
    const tasks=state.todayPlan||[],tdone=tasks.filter(t=>typeof taskState==='function'&&taskState(t)==='done').length;
    const todayTxt=tasks.length?(tdone>=tasks.length?'Today is done ✓':`Today: ${tdone} of ${tasks.length} steps done`):'';
    host.innerHTML=`
      <div class="v9-top">${typeof v6ExamDateBar==='function'?v6ExamDateBar(p):''}<span class="v9-today">${esc(todayTxt)}</span><button type="button" class="primary v9-go" data-v9-today>Continue today’s plan →</button></div>
      <div class="v9-grid">
        <section class="v9-col"><h3>Done and left to do</h3>
          ${rows.map(r=>{const left=r.total-r.done,pc=r.total?Math.round(r.done/r.total*100):0;return `<button type="button" class="v9-row ${left?'':'ok'}" data-v9-sec="${r.k}"><span class="v9-name">${esc(r.label)}</span><span class="v9-bar"><i style="width:${pc}%"></i></span><span class="v9-num"><b>${r.done}</b> of ${r.total}</span><span class="v9-left">${left?left+' left':'✓ done'}</span></button>`}).join('')||'<p class="v9-none">Loading…</p>'}
          <p class="v9-hint">Tap a row to see what is left.</p>
        </section>
        <section class="v9-col"><h3>Weak areas</h3>
          ${doms.map(x=>`<div class="v9-row v9-dom ${x.pct==null?'na':x.pct<75?'weak':'ok'}"><span class="v9-name">${esc(x.d)}</span><span class="v9-bar"><i style="width:${x.pct||0}%"></i></span><span class="v9-num"><b>${x.pct==null?'—':x.pct+'%'}</b></span><span class="v9-left">${x.pct==null?'not practised yet':x.pct<75?(weakest&&weakest.d===x.d?'weakest':'below 75%'):'✓ on track'}</span></div>`).join('')}
          <div class="v9-facts">
            <div><span>Most common mistake</span><b>${pat?esc(pat.title)+` <em>· ${pat.count}×</em>`:'None yet'}</b></div>
            <div><span>Concepts to review</span><b>${cc==null?'…':cc}</b></div>
          </div>
          <button type="button" class="v9-link" data-v9-review>${cc?`Review ${cc} concept${cc===1?'':'s'} →`:'Open Concepts to Review →'}</button>
        </section>
        <section class="v9-col"><h3>Ready to book the exam? <em>${met} of ${checks.length}</em></h3>
          <ul class="v9-checks">${checks.map(c=>`<li class="${c.ok?'ok':''}"><span>${c.ok?'✓':''}</span><div><b>${esc(c.title)}</b><small>${esc(c.detail)}</small></div></li>`).join('')}</ul>
          <div class="v9-facts"><div><span>Full exams finished</span><b>${hist.length}${best!=null?` <em>· best ${best}%</em>`:''}</b></div></div>
          <button type="button" class="v9-link" data-v9-exams>${allHist.length?'See exam results →':'Go to mock exams →'}</button>
        </section>
      </div>
      <div class="v9-back" hidden><button type="button" class="v9-link" data-v9-back>← Back to My Progress</button></div>`;
    if(typeof v6BindDateBar==='function')v6BindDateBar(host);
    host.querySelector('[data-v9-today]').onclick=()=>{state.dashboardFocus='today';showView('dashboard')};
    host.querySelector('[data-v9-review]').onclick=()=>showView('review');
    host.querySelectorAll('[data-v9-sec]').forEach(b=>b.onclick=()=>{const k=b.dataset.v9Sec;if(state.v6Plan){state.v6Plan.sec=k;state.v6Plan.filter=b.classList.contains('ok')?'done':'todo';state.v6Plan.domain=''}state.dashboardFocus='plan';showView('dashboard');setTimeout(()=>{state.dashboardFocus='plan';renderFeatureLaunchpad(state.lastProgress||{})},0)});
    host.querySelector('[data-v9-exams]').onclick=()=>{if(!allHist.length){state.examKind='mock';showView('exams');return}sec.classList.add('v9-exams');host.querySelector('.v9-back').hidden=false;if(typeof setProgressTab==='function')setProgressTab('exams')};
    host.querySelector('[data-v9-back]').onclick=()=>{sec.classList.remove('v9-exams');host.querySelector('.v9-back').hidden=true};
    if(sec.classList.contains('v9-exams'))host.querySelector('.v9-back').hidden=false;
  }
  window.v9RenderProgress=render;
  if(typeof renderCompactProgressDashboard==='function'){const o=window.renderCompactProgressDashboard;window.renderCompactProgressDashboard=function(p){const r=o.apply(this,arguments);try{render(p||state.lastProgress||{})}catch(e){console.warn('v9 progress',e)}
    if(state.currentView==='progress'){
      if(state.v6ConceptCount==null)api('/api/review/concepts').then(x=>{state.v6ConceptCount=x.count;render(state.lastProgress)}).catch(()=>{});
      if(has('match')&&!(state.v6Match||{}).sets&&typeof v6LoadMatchSets==='function')Promise.resolve(v6LoadMatchSets()).then(()=>render(state.lastProgress)).catch(()=>{});
    }
    return r}}
  if(typeof showView==='function'){const sv=window.showView;window.showView=function(id){if(id==='progress'){document.getElementById('progress')?.classList.remove('v9-exams');state.v6ConceptCount=null}return sv.apply(this,arguments)}}
})();


/* ---------- v7.13: Formula Drill — short calculation practice with worked answers ---------- */
(function(){
  const esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const R=(a,b)=>a+Math.floor(Math.random()*(b-a+1)),pick=a=>a[R(0,a.length-1)];
  const money=n=>(n<0?'−$':'$')+Math.abs(Math.round(n)).toLocaleString('en-US');
  const r2=n=>Math.round(n*100)/100;
  const TOPICS=[['all','All'],['ev','Earned value'],['fc','Forecasts'],['sch','Schedule'],['est','Estimating'],['risk','Risk and money'],['misc','Team and agile']];
  // Each generator returns {t:topic, q:question, a:number|null, unit:'$'|'%'|'', choices?:[...], ci?:index, steps:[...], means:'...'}
  function evBase(){const bac=pick([100,120,150,200,240,300,400,500])*1000,pc=pick([20,25,30,40,50,60,75]),pvp=pc+pick([-10,-5,5,10,15]),ev=bac*pc/100,pv=bac*Math.max(5,pvp)/100,ac=Math.round(ev*pick([0.8,0.9,1.1,1.2,1.25])/1000)*1000;return {bac,pc,ev,pv,ac}}
  const G=[
    ()=>{const x=evBase();return {t:'ev',q:`The budget at completion (BAC) is ${money(x.bac)}. The work is ${x.pc}% complete. What is the earned value (EV)?`,a:x.ev,unit:'$',steps:[`EV = % complete × BAC`,`EV = ${x.pc}% × ${money(x.bac)} = ${money(x.ev)}`],means:'EV is the budgeted value of the work actually finished.'}},
    ()=>{const x=evBase(),v=x.ev-x.ac;return {t:'ev',q:`EV is ${money(x.ev)} and actual cost (AC) is ${money(x.ac)}. What is the cost variance (CV)?`,a:v,unit:'$',steps:[`CV = EV − AC`,`CV = ${money(x.ev)} − ${money(x.ac)} = ${money(v)}`],means:v<0?'Negative CV: over budget.':'Positive CV: under budget.'}},
    ()=>{const x=evBase(),v=x.ev-x.pv;return {t:'ev',q:`EV is ${money(x.ev)} and planned value (PV) is ${money(x.pv)}. What is the schedule variance (SV)?`,a:v,unit:'$',steps:[`SV = EV − PV`,`SV = ${money(x.ev)} − ${money(x.pv)} = ${money(v)}`],means:v<0?'Negative SV: behind schedule.':v>0?'Positive SV: ahead of schedule.':'Zero SV: on schedule.'}},
    ()=>{const x=evBase(),v=r2(x.ev/x.ac);return {t:'ev',q:`EV is ${money(x.ev)} and AC is ${money(x.ac)}. What is the cost performance index (CPI)? Round to 2 decimals.`,a:v,unit:'',steps:[`CPI = EV ÷ AC`,`CPI = ${money(x.ev)} ÷ ${money(x.ac)} = ${v}`],means:v<1?`Below 1: over budget. You get ${Math.round(v*100)} cents of work for each dollar spent.`:'Above 1: under budget.'}},
    ()=>{const x=evBase(),v=r2(x.ev/x.pv);return {t:'ev',q:`EV is ${money(x.ev)} and PV is ${money(x.pv)}. What is the schedule performance index (SPI)? Round to 2 decimals.`,a:v,unit:'',steps:[`SPI = EV ÷ PV`,`SPI = ${money(x.ev)} ÷ ${money(x.pv)} = ${v}`],means:v<1?'Below 1: behind schedule.':v>1?'Above 1: ahead of schedule.':'Exactly 1: on schedule.'}},
    ()=>{const cpi=pick([0.8,0.9,1.1,1.25]),spi=pick([0.85,0.95,1.05,1.2]);const c=['Over budget and behind schedule','Over budget and ahead of schedule','Under budget and behind schedule','Under budget and ahead of schedule'];const ci=(cpi<1?0:2)+(spi<1?0:1);return {t:'ev',q:`CPI is ${cpi} and SPI is ${spi}. What is the project's status?`,a:null,choices:c,ci,steps:[`CPI ${cpi} is ${cpi<1?'below':'above'} 1, so cost is ${cpi<1?'over':'under'} budget.`,`SPI ${spi} is ${spi<1?'below':'above'} 1, so the schedule is ${spi<1?'behind':'ahead'}.`],means:'For both indexes, below 1 is bad and above 1 is good.'}},
    ()=>{const bac=pick([200,300,400,500,600])*1000,cpi=pick([0.8,1.25,0.5,1.6]),v=bac/cpi;return {t:'fc',q:`BAC is ${money(bac)} and CPI is ${cpi}. Current cost performance is expected to continue. What is the estimate at completion (EAC)?`,a:v,unit:'$',steps:[`When performance will continue: EAC = BAC ÷ CPI`,`EAC = ${money(bac)} ÷ ${cpi} = ${money(v)}`],means:'Use BAC ÷ CPI when the question says the trend will continue.'}},
    ()=>{const x=evBase(),v=x.ac+(x.bac-x.ev);return {t:'fc',q:`BAC is ${money(x.bac)}, EV is ${money(x.ev)} and AC is ${money(x.ac)}. The overrun was a one-time event and the rest of the work will go as planned. What is the EAC?`,a:v,unit:'$',steps:[`When the variance was one-time: EAC = AC + (BAC − EV)`,`EAC = ${money(x.ac)} + (${money(x.bac)} − ${money(x.ev)}) = ${money(v)}`],means:'Use AC + (BAC − EV) when the question says the problem will not repeat.'}},
    ()=>{const bac=pick([200,300,400,500])*1000,eac=bac+pick([-40,-20,30,50,80])*1000,ac=Math.round(eac*pick([0.3,0.4,0.5,0.6])/1000)*1000,v=eac-ac;return {t:'fc',q:`EAC is ${money(eac)} and AC so far is ${money(ac)}. What is the estimate to complete (ETC)?`,a:v,unit:'$',steps:[`ETC = EAC − AC`,`ETC = ${money(eac)} − ${money(ac)} = ${money(v)}`],means:'ETC is the money still needed from today to the end.'}},
    ()=>{const bac=pick([200,300,400,500])*1000,eac=bac+pick([-40,-20,30,50,80])*1000,v=bac-eac;return {t:'fc',q:`BAC is ${money(bac)} and EAC is ${money(eac)}. What is the variance at completion (VAC)?`,a:v,unit:'$',steps:[`VAC = BAC − EAC`,`VAC = ${money(bac)} − ${money(eac)} = ${money(v)}`],means:v<0?'Negative VAC: the project is forecast to finish over budget.':'Positive VAC: forecast to finish under budget.'}},
    ()=>{const bac=pick([200,400,500])*1000,ev=bac*pick([0.4,0.5,0.6]),ac=ev*pick([1.25,1.2,0.8]),v=r2((bac-ev)/(bac-ac));return {t:'fc',q:`BAC is ${money(bac)}, EV is ${money(ev)} and AC is ${money(ac)}. What cost efficiency is needed on the remaining work to finish on budget (TCPI)? Round to 2 decimals.`,a:v,unit:'',steps:[`TCPI = (BAC − EV) ÷ (BAC − AC)`,`TCPI = ${money(bac-ev)} ÷ ${money(bac-ac)} = ${v}`],means:v>1?'Above 1: the team must work more efficiently than planned to hit the budget.':'Below 1: there is room to spare.'}},
    ()=>{const o=R(2,8),m=o+R(2,6),p=m+pick([4,6,8,10,12])*1+((o+4*m)%2?1:0);const pp=p+((o+4*m+p)%6?6-((o+4*m+p)%6):0),v=(o+4*m+pp)/6;return {t:'est',q:`An activity has an optimistic estimate of ${o} days, most likely ${m} days and pessimistic ${pp} days. What is the beta (PERT) estimate, in days?`,a:v,unit:'',steps:[`PERT = (O + 4M + P) ÷ 6`,`PERT = (${o} + 4×${m} + ${pp}) ÷ 6 = ${v}`],means:'PERT weights the most likely estimate four times.'}},
    ()=>{const o=R(2,8)*3,m=o+R(1,4)*3,p=m+R(1,5)*3,v=(o+m+p)/3;return {t:'est',q:`Optimistic ${o} days, most likely ${m} days, pessimistic ${p} days. What is the triangular (simple average) estimate, in days?`,a:v,unit:'',steps:[`Triangular = (O + M + P) ÷ 3`,`(${o} + ${m} + ${p}) ÷ 3 = ${v}`],means:'Triangular treats all three estimates equally.'}},
    ()=>{const o=R(2,10),p=o+pick([6,12,18,24]),v=(p-o)/6;return {t:'est',q:`The optimistic estimate is ${o} days and the pessimistic estimate is ${p} days. What is the standard deviation, in days?`,a:v,unit:'',steps:[`Standard deviation = (P − O) ÷ 6`,`(${p} − ${o}) ÷ 6 = ${v}`],means:'A bigger gap between P and O means more uncertainty.'}},
    ()=>{const es=R(3,15),f=R(0,8),ls=es+f;return {t:'sch',q:`An activity has an early start of day ${es} and a late start of day ${ls}. What is its total float, in days?`,a:f,unit:'',steps:[`Total float = Late start − Early start`,`${ls} − ${es} = ${f}`],means:f===0?'Zero float: the activity is on the critical path.':'It can slip this many days without delaying the project.'}},
    ()=>{const a=[R(8,14),R(15,22),R(10,19)];if(a[0]===a[1])a[1]++;if(a[2]===a[1])a[2]--;if(a[2]===a[0])a[2]--;const v=Math.max(...a);return {t:'sch',q:`A network has three paths with durations of ${a[0]}, ${a[1]} and ${a[2]} days. What is the project duration, in days?`,a:v,unit:'',steps:[`The critical path is the LONGEST path.`,`Longest of ${a.join(', ')} = ${v} days`],means:'The longest path sets the shortest possible project duration.'}},
    ()=>{const a=[R(8,14),R(16,22)],v=a[1]-a[0];return {t:'sch',q:`The critical path is ${a[1]} days. Another path is ${a[0]} days. How much float does the shorter path have, in days?`,a:v,unit:'',steps:[`Path float = Critical path length − This path's length`,`${a[1]} − ${a[0]} = ${v}`],means:'Activities off the critical path can slip by their float.'}},
    ()=>{const p=pick([10,20,25,30,40]),i=pick([20,40,50,80,100])*1000,v=p/100*i;return {t:'risk',q:`A risk has a ${p}% probability and would cost ${money(i)} if it happens. What is its expected monetary value (EMV)?`,a:-v,alt:v,unit:'$',steps:[`EMV = Probability × Impact`,`${p}% × ${money(i)} = ${money(v)} (a threat, so it counts as a cost)`],means:'Threats have negative EMV; opportunities have positive EMV. Either sign is accepted here.'}},
    ()=>{const t=[[pick([20,30,40]),pick([50,60,80])],[pick([10,25,50]),pick([20,40])]],o=[pick([10,20]),pick([10,20])];const th=t.reduce((s,[p,i])=>s+p*i*10,0),op=o[0]*o[1]*10,v=th-op;return {t:'risk',q:`Two threats: ${t[0][0]}% chance of ${money(t[0][1]*1000)}, and ${t[1][0]}% chance of ${money(t[1][1]*1000)}. One opportunity: ${o[0]}% chance of saving ${money(o[1]*1000)}. What contingency reserve does the EMV suggest?`,a:v,unit:'$',steps:[`Add threat EMVs, subtract opportunity EMVs.`,`Threats: ${money(t[0][0]*t[0][1]*10)} + ${money(t[1][0]*t[1][1]*10)} = ${money(th)}`,`Opportunity: ${money(op)}`,`Reserve = ${money(th)} − ${money(op)} = ${money(v)}`],means:'Contingency reserve covers identified risks (known unknowns).'}},
    ()=>{const c=pick([100,150,200,300])*1000,y=pick([25,40,50,60,75])*1000;const v=r2(c/y);return {t:'risk',q:`A project costs ${money(c)} and returns ${money(y)} each year. What is the payback period, in years? Round to 2 decimals.`,a:v,unit:'',steps:[`Payback period = Cost ÷ Yearly return`,`${money(c)} ÷ ${money(y)} = ${v} years`],means:'Shorter payback is better.'}},
    ()=>{const a=pick([40,55,70])*1000,b=a+pick([-15,10,20])*1000;const c=['Project A','Project B'];return {t:'risk',q:`Project A has an NPV of ${money(a)}. Project B has an NPV of ${money(b)} and takes longer. Which should be selected?`,a:null,choices:c,ci:a>b?0:1,steps:[`Choose the HIGHER net present value.`,`NPV already accounts for time, so the longer duration does not matter.`],means:'Higher NPV, IRR, ROI and benefit-cost ratio are better. Shorter payback is better.'}},
    ()=>{const b=pick([180,240,300,450])*1000,c=pick([120,150,200])*1000,v=r2(b/c);return {t:'risk',q:`Expected benefits are ${money(b)} and costs are ${money(c)}. What is the benefit-cost ratio? Round to 2 decimals.`,a:v,unit:'',steps:[`BCR = Benefits ÷ Costs`,`${money(b)} ÷ ${money(c)} = ${v}`],means:v>1?'Above 1: benefits outweigh costs.':'Below 1: costs outweigh benefits.'}},
    ()=>{const n=R(4,12),v=n*(n-1)/2;return {t:'misc',q:`A team has ${n} people including the project manager. How many communication channels are there?`,a:v,unit:'',steps:[`Channels = n × (n − 1) ÷ 2`,`${n} × ${n-1} ÷ 2 = ${v}`],means:'Count everyone, including the project manager.'}},
    ()=>{const n=R(4,8),k=R(1,3),v=(n+k)*(n+k-1)/2-n*(n-1)/2;return {t:'misc',q:`A team of ${n} people adds ${k} more. How many communication channels are ADDED?`,a:v,unit:'',steps:[`Channels = n × (n − 1) ÷ 2`,`Before: ${n} × ${n-1} ÷ 2 = ${n*(n-1)/2}`,`After: ${n+k} × ${n+k-1} ÷ 2 = ${(n+k)*(n+k-1)/2}`,`Added = ${(n+k)*(n+k-1)/2} − ${n*(n-1)/2} = ${v}`],means:'Watch the wording: "added" is the difference, not the new total.'}},
    ()=>{const v=[R(18,26),R(20,30),R(22,32)],avg=Math.round((v[0]+v[1]+v[2])/3),left=avg*R(3,6)+R(1,avg-1),s=Math.ceil(left/avg);return {t:'misc',q:`The last three sprints delivered ${v[0]}, ${v[1]} and ${v[2]} story points. ${left} points remain in the backlog. About how many more sprints are needed? (Use the average velocity, rounded to a whole number.)`,a:s,unit:'',steps:[`Average velocity = (${v.join(' + ')}) ÷ 3 ≈ ${avg} points per sprint`,`Sprints = ${left} ÷ ${avg} = ${r2(left/avg)}, so round UP to ${s}`],means:'Always round up: part of a sprint is still a sprint.'}}
  ];
  const SHEET=[['Earned value',['EV = % complete × BAC','CV = EV − AC','SV = EV − PV','CPI = EV ÷ AC','SPI = EV ÷ PV','Below 1 or negative = bad']],['Forecasts',['EAC = BAC ÷ CPI (trend continues)','EAC = AC + (BAC − EV) (one-time)','ETC = EAC − AC','VAC = BAC − EAC','TCPI = (BAC − EV) ÷ (BAC − AC)']],['Schedule and estimating',['PERT = (O + 4M + P) ÷ 6','Triangular = (O + M + P) ÷ 3','Std deviation = (P − O) ÷ 6','Float = LS − ES','Critical path = longest path']],['Risk, money, team',['EMV = Probability × Impact','Payback = Cost ÷ Yearly return','BCR = Benefits ÷ Costs','Higher NPV wins','Channels = n(n − 1) ÷ 2']]];
  const S={topic:'all',n:0,right:0,cur:null,done:false,sheet:false,last:-1};
  const host=()=>document.getElementById('formulaHost');
  function next(){const pool=G.map((g,i)=>i).filter(i=>{if(S.topic==='all')return true;try{return G[i]().t===S.topic}catch(e){return false}});let i;do{i=pick(pool)}while(pool.length>1&&i===S.last);S.last=i;S.cur=G[i]();S.done=false;S.ok=null;S.given=''}
  function parse(v){const s=String(v).replace(/[,$%\s]/g,'').replace('−','-');if(s===''||isNaN(Number(s)))return null;return Number(s)}
  function best(){try{return JSON.parse(localStorage.getItem('v7formula')||'{}')}catch(e){return {}}}
  function saveBest(){try{const b=best();if(S.n>=10&&(!b.n||S.right/S.n>=b.right/b.n))localStorage.setItem('v7formula',JSON.stringify({n:S.n,right:S.right}))}catch(e){}}
  function render(){
    const h=host();if(!h)return;if(!S.cur)next();const c=S.cur,b=best();
    const body=S.sheet?`<div class="v7-f-sheet">${SHEET.map(([t,l])=>`<div><span class="v6-kicker">${esc(t)}</span><ul>${l.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>`
    :`<div class="v7-f-card"><p class="v7-f-q">${esc(c.q)}</p>
        ${c.choices?`<div class="v7-f-choices">${c.choices.map((x,i)=>`<button type="button" data-f-choice="${i}" ${S.done?'disabled':''} class="${S.done&&i===c.ci?'ok':''} ${S.done&&S.given===i&&i!==c.ci?'bad':''}">${esc(x)}</button>`).join('')}</div>`
        :`<form class="v7-f-answer" data-f-form><label>Your answer ${c.unit==='$'?'($)':''}<input type="text" inputmode="decimal" autocomplete="off" data-f-input value="${esc(S.given)}" ${S.done?'disabled':''}></label>${S.done?'':'<button type="submit" class="primary">Check</button><button type="button" class="v9-link" data-f-show>Show me how</button>'}</form>`}
        ${S.done?`<div class="v7-f-result ${S.ok?'ok':S.ok===false?'bad':''}"><b>${S.ok?'Correct ✓':S.ok===false?'Not quite':'Here is how'}</b><ol>${c.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><p>${esc(c.means)}</p></div>`:''}
      </div>`;
    h.innerHTML=`<div class="v7-f">
      <div class="v7-f-top"><div class="v7-f-chips">${TOPICS.map(([k,t])=>`<button type="button" data-f-topic="${k}" class="${S.topic===k&&!S.sheet?'active':''}">${esc(t)}</button>`).join('')}<button type="button" data-f-sheet class="${S.sheet?'active':''}">Formula sheet</button></div>
        <span class="v7-f-score">${S.n?`${S.right} of ${S.n} correct`:'Short calculations, one at a time'}${b.n?` · best ${Math.round(b.right/b.n*100)}%`:''}</span>
        ${S.done&&!S.sheet?'<button type="button" class="primary" data-f-next>Next question →</button>':''}</div>${body}</div>`;
    h.querySelectorAll('[data-f-topic]').forEach(x=>x.onclick=()=>{S.topic=x.dataset.fTopic;S.sheet=false;next();render()});
    h.querySelector('[data-f-sheet]').onclick=()=>{S.sheet=!S.sheet;render()};
    const finish=ok=>{S.done=true;S.ok=ok;if(ok!==null){S.n++;if(ok)S.right++;saveBest()}render()};
    const f=h.querySelector('[data-f-form]');if(f&&!S.done){f.onsubmit=e=>{e.preventDefault();const inp=h.querySelector('[data-f-input]');S.given=inp.value;const v=parse(inp.value);if(v===null){inp.focus();return}
      const tol=Math.max(0.011,Math.abs(c.a)*0.005);finish(Math.abs(v-c.a)<=tol||(c.alt!=null&&Math.abs(v-c.alt)<=tol))};
      const sh=h.querySelector('[data-f-show]');if(sh)sh.onclick=()=>finish(null);const inp=h.querySelector('[data-f-input]');if(inp)inp.focus()}
    h.querySelectorAll('[data-f-choice]').forEach(x=>x.onclick=()=>{S.given=+x.dataset.fChoice;finish(S.given===c.ci)});
    const nx=h.querySelector('[data-f-next]');if(nx){nx.onclick=()=>{next();render()};nx.focus()}
  }
  window.v7RenderFormulas=render;window.v7FormulaGens=G;
  if(typeof showView==='function'){const sv=window.showView;window.showView=function(id){const r=sv.apply(this,arguments);if(id==='formulas'){try{render()}catch(e){console.warn(e)}}return r}}
  document.addEventListener('click',e=>{const b=e.target.closest('#nav button[data-view="formulas"]');if(b)setTimeout(()=>{if(state.currentView==='formulas')render()},0)});
})();
