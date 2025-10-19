
const DATA_URLS = {
  subjects: 'data/edlight_subjects.csv',
  videos:   'data/edlight_videos.csv',
  quizzes:  'data/edlight_quizzes.csv',
};
function parseCSV(text) {
  const rows = []; let i=0, field='', row=[], inQuotes=false;
  while (i <= text.length) {
    const c = text[i] || '\n';
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field+='"'; i++; } else inQuotes=false; }
      else field += c;
    } else {
      if (c === '"') inQuotes=true;
      else if (c === ',') { row.push(field); field=''; }
      else if (c === '\n' || c === '\r') {
        if (field.length || row.length) { row.push(field); rows.push(row.map(s=>s.trim())); }
        field=''; row=[]; if (c==='\r' && text[i+1]==='\n') i++;
      } else field += c;
    } i++;
  }
  const [header, ...data] = rows;
  return data.map(r => Object.fromEntries(header.map((h,idx)=>[h, r[idx] ?? ''])));
}
async function loadCSV(url){ const res = await fetch(url); if(!res.ok) throw new Error('fetch '+url); return parseCSV(await res.text()); }
const groupBy = (arr,key)=>arr.reduce((a,x)=>( (a[x[key]]??=[]).push(x), a ),{});

function renderCatalog({ subjects, videos }){
  const el = document.querySelector('#course-catalog'); if(!el) return;
  const bySubject = groupBy(videos,'subject_code');
  el.innerHTML = subjects.map(sub => {
    const list = (bySubject[sub.code]||[]).sort((a,b)=>Number(a.unit_no)-Number(b.unit_no)||Number(a.lesson_no)-Number(b.lesson_no));
    if(!list.length) return '';
    const byUnit = groupBy(list,'unit_no');
    const unitsHTML = Object.keys(byUnit).sort((a,b)=>Number(a)-Number(b)).map(unitNo=>{
      const unit = byUnit[unitNo];
      const unitTitle = unit[0].unit_title || `Unit ${unitNo}`;
      const lessons = unit.map(v=>`
        <div class="card p-4">
          <div class="flex items-center gap-3">
            <div style="width:72px;height:48px;border-radius:.5rem;background:var(--info-bg)"></div>
            <div class="flex-1">
              <h4 class="text-lg font-semibold">${v.lesson_no?`Lesson ${v.lesson_no}: `:''}${v.video_title}</h4>
              <p class="text-sm opacity-80">${v.learning_objectives||''}</p>
              <div class="mt-2 text-sm opacity-70">${v.language||''} · ${v.duration_min?`${v.duration_min} min`:''}</div>
            </div>
            <div class="flex gap-2">
              <a class="btn btn-sm" href="${v.video_url}" target="_blank" rel="noopener">Watch</a>
              <button class="btn-outline btn-sm" data-quiz-for="${v.id}">Quiz</button>
            </div>
          </div>
        </div>`).join('');
      return `<section class="section">
        <h3 class="text-2xl font-bold mb-3">${unitTitle}</h3>
        <div class="grid grid-2">${lessons}</div>
      </section>`;
    }).join('');
    return `<article class="section" id="${sub.code}">
      <header class="mb-4">
        <h2 class="text-2xl font-extrabold">${sub.name} — ${sub.level}</h2>
        <div class="badge" style="background: color-mix(in oklab, ${sub.color} 12%, white); color:${sub.color}">${sub.code}</div>
      </header>
      ${unitsHTML}
    </article>`;
  }).join('');
}
function renderQuizAPI({ quizzes }){
  const byVideo = groupBy(quizzes,'video_id');
  window.EdLightQuizzes = { forVideo: id => (byVideo[id] || []) };
}
function openQuizModal(questions){
  const overlay = document.createElement('div');
  overlay.className='modal-overlay';
  overlay.innerHTML=`
    <div class="modal p-6">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-2xl font-bold">Quick Quiz</h3>
        <button class="btn-outline btn-sm" id="close-quiz">Close</button>
      </div>
      <div id="quiz-body"></div>
    </div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector('#quiz-body');
  if(!questions.length){ body.innerHTML = `<div class="card p-4">No quiz available for this lesson yet.</div>`; }
  else{
    body.innerHTML = questions.map((q,i)=>`
      <div class="card p-4 mb-3">
        <div class="font-semibold mb-2">${i+1}. ${q.question}</div>
        ${['a','b','c','d'].map(k=> q['option_'+k]?`
          <label class="flex items-center gap-2 mb-1"><input type="radio" name="${q.quiz_id}" value="${k.toUpperCase()}"><span>${q['option_'+k]}</span></label>`:'').join('')}
        <div class="explanation mt-2 hidden text-sm opacity-80">Ans: <strong>${q.correct_option}</strong> — ${q.explanation||''}</div>
        <button class="btn btn-sm mt-2" data-reveal="${q.quiz_id}">Check</button>
      </div>`).join('');
    body.addEventListener('click', e=>{
      const btn = e.target.closest('[data-reveal]'); if(!btn) return;
      const exp = btn.parentElement.querySelector('.explanation'); if(exp) exp.classList.remove('hidden');
    });
  }
  overlay.querySelector('#close-quiz').onclick = ()=> overlay.remove();
}
(async function init(){
  const [subjects, videos, quizzes] = await Promise.all([
    loadCSV(DATA_URLS.subjects),
    loadCSV(DATA_URLS.videos),
    loadCSV(DATA_URLS.quizzes),
  ]);
  renderCatalog({subjects, videos});
  renderQuizAPI({quizzes});
  document.body.addEventListener('click', e=>{
    const el = e.target.closest('[data-quiz-for]'); if(!el) return;
    openQuizModal(window.EdLightQuizzes.forVideo(el.getAttribute('data-quiz-for')));
  });
})().catch(err=>{
  console.error(err);
  const el = document.querySelector('#course-catalog');
  if (el) el.innerHTML = `<div class="card p-4">Couldn't load curriculum data. Check CSV paths.</div>`;
});
