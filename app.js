/* Lilike • Mítoszok gyakorló – vanilla JS, GitHub Pages ready */
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

const STORAGE_KEY = "lilike_mitoszok_v1";

const state = {
  data: null,
  mode: null,
  setSize: 30,
  topic: "all",
  items: [],
  idx: 0,
  startTs: 0,
  correct: 0,
  wrongIds: new Set(),
  answered: false,
  flashRevealed: false,
  current: null,
  settings: {
    tts: false,
    enterNext: true,
  },
  stats: {
    attempts: 0,
    correct: 0,
    srs: {} // by qid
  }
};

function now(){ return Date.now(); }

function loadLocal(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const obj = JSON.parse(raw);
    if(obj && obj.stats) state.stats = obj.stats;
    if(obj && obj.settings) state.settings = {...state.settings, ...obj.settings};
  }catch(e){}
}

function saveLocal(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    stats: state.stats,
    settings: state.settings
  }));
}

function normalize(str){
  return (str||"")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, " ");
}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function formatMs(ms){
  const s=Math.max(0, Math.floor(ms/1000));
  const m=Math.floor(s/60);
  const ss=(s%60).toString().padStart(2,"0");
  return `${m}:${ss}`;
}

/* ---- SRS (simple SM-2-ish) ---- */
function getSrs(qid){
  return state.stats.srs[qid] || { reps:0, interval:0, ease:2.5, due:0, last:0 };
}
function setSrs(qid, srs){ state.stats.srs[qid]=srs; }

function gradeToUpdate(srs, grade){
  // grade: 0 again, 1 hard, 2 good, 3 easy
  const t = now();
  let ease = srs.ease;
  let reps = srs.reps;
  let interval = srs.interval;

  if(grade === 0){
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  }else{
    reps += 1;
    if(reps === 1) interval = 1;
    else if(reps === 2) interval = 3;
    else {
      const mult = (grade === 1) ? 1.2 : (grade === 2 ? ease : ease*1.25);
      interval = Math.round(interval * mult);
    }
    // adjust ease
    if(grade === 1) ease = Math.max(1.3, ease - 0.15);
    if(grade === 2) ease = Math.min(3.2, ease + 0.05);
    if(grade === 3) ease = Math.min(3.2, ease + 0.12);
  }

  const due = t + interval*24*60*60*1000;
  return { reps, interval, ease, due, last:t };
}

function dueCount(){
  const t=now();
  const all = state.data?.qa || [];
  let due=0;
  for(const q of all){
    const srs=getSrs(q.id);
    if(srs.due && srs.due <= t) due++;
  }
  return due;
}

/* ---- TTS ---- */
function speak(text){
  if(!state.settings.tts) return;
  if(!("speechSynthesis" in window)) return;
  try{
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hu-HU";
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  }catch(e){}
}

/* ---- Session building ---- */
function byTopic(item){
  if(state.topic === "all") return true;
  const tags = item.tags || [];
  return tags.includes(state.topic);
}

function pickSessionItems(){
  const setSize = state.setSize;
  if(state.mode === "flashcards"){
    const pool = state.data.cards.filter(byTopic);
    return shuffle(pool).slice(0, setSize);
  }

  const pool = state.data.qa.filter(byTopic);
  if(state.mode === "srs"){
    const t=now();
    const due = pool.filter(q => {
      const srs=getSrs(q.id);
      return !srs.due || srs.due <= t;
    });
    const pick = shuffle(due.length ? due : pool).slice(0, setSize);
    return pick;
  }

  // quiz modes
  // Weight: lower accuracy first + mix in new
  const scored = pool.map(q=>{
    const srs=getSrs(q.id);
    const seen = srs.last ? 1 : 0;
    // prioritize unseen and due-ish
    const score = (seen?0:2) + ((srs.due && srs.due <= now()) ? 1 : 0) + Math.random()*0.25;
    return {q, score};
  }).sort((a,b)=>b.score-a.score).map(x=>x.q);

  return scored.slice(0, setSize);
}

/* ---- UI helpers ---- */
function show(id){
  $$("#home,#session,#settings,#results").forEach(el=>el.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function updateHomeStats(){
  $("#statDone").textContent = String(state.stats.attempts || 0);
  const acc = state.stats.attempts ? Math.round((state.stats.correct/state.stats.attempts)*100) : null;
  $("#statAcc").textContent = acc===null ? "–" : `${acc}%`;
  if(state.data) $("#statDue").textContent = String(dueCount());
}

function setProgress(){
  $("#qIndex").textContent = String(state.idx+1);
  $("#qTotal").textContent = String(state.items.length);
  const pct = ((state.idx)/Math.max(1, state.items.length))*100;
  $("#progress").style.width = `${pct}%`;
}

function renderCurrent(){
  state.answered = false;
  state.flashRevealed = false;
  $("#feedback").classList.add("hidden");
  $("#flashGrade").classList.add("hidden");
  $("#btnNext").textContent = "Következő ⏎";
  $("#btnNext").disabled = true;

  const item = state.items[state.idx];
  state.current = item;

  // mode label
  const modeLabel = {
    "flashcards":"Gyorskártyák",
    "quiz-mcq":"Kvíz (választós)",
    "quiz-typed":"Kvíz (beírás)",
    "srs":"SRS"
  }[state.mode] || "Gyakorlás";
  $("#modeLabel").textContent = modeLabel;

  setProgress();

  // prompt
  let promptText = "";
  if(state.mode === "flashcards"){
    promptText = item.front;
    $("#prompt").innerHTML = `<b>Kártya</b><div style="margin-top:8px">${escapeHtml(promptText)}</div>`;
  }else{
    promptText = item.prompt;
    $("#prompt").innerHTML = `<b>Kérdés</b><div style="margin-top:8px">${escapeHtml(promptText)}</div>`;
  }
  speak(stripTags(promptText));

  // toggle blocks
  $("#mcq").classList.add("hidden");
  $("#typed").classList.add("hidden");
  $("#srsBtns").classList.add("hidden");

  if(state.mode === "flashcards"){
    // reveal -> self-grade (tudtam / nem tudtam)
    $("#btnShowAnswer").textContent = "Válasz";
    $("#btnShowAnswer").disabled = false;
    $("#btnNext").textContent = "Következő";
    $("#btnNext").disabled = true;
  }else if(item.type === "mcq" || state.mode === "quiz-mcq"){
    $("#mcq").classList.remove("hidden");
    renderMcq(item);
  }else{
    $("#typed").classList.remove("hidden");
    $("#typedInput").value = "";
    $("#typedInput").focus();
    $("#btnSubmit").disabled = false;
  }

  if(state.mode === "srs"){
    $("#srsBtns").classList.remove("hidden");
  }

  // Show Answer button
  $("#btnShowAnswer").textContent = "Válasz";
}

function showFlashAnswer(){
  const item = state.current;
  if(!item) return;
  const ans = item.back;
  const src = item.source?.book_page ? `Tankönyv: ${item.source.book_page}. o.` : "";
  $("#feedback").innerHTML =
    `<div><b>Válasz:</b> ${escapeHtml(String(ans))}</div>` +
    (src ? `<div class="muted small" style="margin-top:6px">${escapeHtml(src)}</div>` : "");
  $("#feedback").classList.remove("hidden");
  $("#flashGrade").classList.remove("hidden");
  state.flashRevealed = true;
}

function gradeFlash(ok){
  if(state.answered) return;
  const item = state.current;
  if(!item) return;
  registerAttempt(item.id, ok);
  if(!ok) state.wrongIds.add(item.id);

  // lock grading for this card
  $("#flashGrade").classList.add("hidden");
  $("#btnShowAnswer").disabled = true;
  showFeedback(ok, null, {
    okTitle: "✅ <b>Tudtad</b>",
    badTitle: "❌ <b>Nem tudtad</b>",
    hideUserAnswer: true
  });
}

function renderMcq(item){
  const el = $("#mcq");
  el.innerHTML = "";
  const choices = buildChoices(item);
  const shuffled = shuffle(choices);
  shuffled.forEach(ch=>{
    const b=document.createElement("button");
    b.textContent=ch;
    b.addEventListener("click", ()=>onAnswerMcq(ch, b));
    el.appendChild(b);
  });
}

function buildChoices(item){
  // Make MCQ harder (and a bit playful) by generating plausible + tricky distractors.
  const correct = String(item.answer || "").trim();
  const tags = item.tags || [];
  const distractors = new Set();

  const add = (s)=>{
    const v = String(s||"").trim();
    if(!v) return;
    if(v.toLowerCase() === correct.toLowerCase()) return;
    if(distractors.has(v)) return;
    distractors.add(v);
  };

  // 1) Curated, tag-based distractor pools (short but high-quality)
  const pools = {
    "daidalosz": [
      "A Minótaurosz lehelete",
      "Héphaisztosz kohójának hője",
      "Egy sirálycsapat csipkedése",
      "A labirintus „szellőzőrácsa”"
    ],
    "ikarosz": [
      "A tengeri pára (amitől a viasz „megduzzadt”)",
      "A túl sok szárnycsapás miatti „túlmelegedés”",
      "Egy napernyő hiánya (pedig kellett volna)",
      "Apja mérnöki jegyzeteinek súlya"
    ],
    "prometheus": [
      "Gördülő sziklát kellett fel-le tolnia (Sziszüphosz büntetése)",
      "Örök éhség–szomjúság gyötörte (Tantalosz büntetése)",
      "Egyetlen pillantástól kővé változott",
      "Minden nap újra kezdődő „büntető feladatot” kapott"
    ],
    "parisz": [
      "Athéné (mert „okosabbnak tűnt”)",
      "Héra (mert „királynői”)",
      "Artemisz (mert szerette a rendet)",
      "Démétér (mert jó termést ígért)"
    ],
    "biblia": [
      "„Mert eltévedtek a csillagkövetésben”",
      "„Mert Heródes hirtelen meggondolta magát”",
      "„Mert elfogyott az úti elemózsia”",
      "„Mert rossz irányba mentek a térképen”"
    ],
    "mese": [
      "Sok változata van és névtelen szerzőtől származik",
      "Csak szóban terjed és mindig ugyanúgy kezdődik",
      "Mindig állatok a szereplői, tanulság nélkül",
      "Minden mondat végén rímel"
    ],
    "fogalom": [
      "Szerzőjük mindig ismert, mint egy tankönyvfejezetnek",
      "Mindig varázsigékkel kezdődnek, mint egy bűvésztrükk",
      "Csak állatok szerepelnek bennük, mint egy állatmese",
      "Mindig ugyanaz a befejezésük, mint egy reklámnak"
    ]
  };

  tags.forEach(t=>{
    (pools[t]||[]).forEach(add);
  });

  // 2) Near-miss generators (the "trick")
  const lcPrompt = String(item.prompt||"").toLowerCase();

  // Pair-type answers (e.g., "Máté és Lukács")
  if(/\s+és\s+/.test(correct) && (lcPrompt.includes("melyik két") || lcPrompt.includes("melyik ket"))){
    const parts = correct.split(/\s+és\s+/).map(s=>s.trim());
    const candidates = ["Máté", "Márk", "Lukács", "János"];
    if(parts.length === 2){
      candidates.forEach(a=>{
        candidates.forEach(b=>{
          if(a===b) return;
          const pair = `${a} és ${b}`;
          if(pair.toLowerCase() !== correct.toLowerCase()) add(pair);
        });
      });
    }
  }

  // Punishment / consequence questions: swap in other famous punishments
  if(lcPrompt.includes("büntet") || lcPrompt.includes("buntet") || lcPrompt.includes("következ") || lcPrompt.includes("kovetkez")){
    add("Örökké vizet látott, de nem ihatott belőle.");
    add("Egy sziklát görgetett fel, ami mindig visszagurult.");
    add("A hangja visszhanggá vált, és eltűnt a teste.");
  }

  // Proverb completion: use other proverb endings as traps
  if(lcPrompt.includes("fejezd be")){
    add("… megnyílik a nyelve.");
    add("… te se tedd felebarátodnak.");
    add("… a szegénynek egy sincs.");
    add("… annak Isten is megsegít.");
  }

  // Creature definitions: change one detail (plausible but wrong)
  if(correct.toLowerCase().includes("félig") || correct.toLowerCase().includes("felig")){
    add("Félig ember, félig ló testű lény (kentaur)");
    add("Félig ember, félig oroszlán testű szörny (szfinx)");
    add("Félig ember, félig kígyó testű lény");
  }

  // 3) Data-driven distractors from same-tag answers (curriculum-aligned)
  const pool = state.data.qa
    .filter(q=>q && q.answer && q.id !== item.id)
    .filter(q=> (q.tags||[]).some(t => tags.includes(t)))
    .map(q=>String(q.answer).trim())
    .filter(a=>a && a.toLowerCase() !== correct.toLowerCase());

  const targetLen = correct.length;
  pool.sort((a,b)=>Math.abs(a.length-targetLen)-Math.abs(b.length-targetLen));
  shuffle(pool).forEach(add);

  // 4) Ensure we have 3 distractors (fallbacks stay school-friendly)
  const fallbacks = [
    "Egy hirtelen jött „isteni félreértés”",
    "A Tanárnő szigorú pillantása (de ez nem mítosz 🙂)",
    "A „Görög istenek” családi vitája",
    "Egy túl jól sikerült csavar a történetben"
  ];
  fallbacks.forEach(add);

  const finalWrongs = Array.from(distractors).slice(0,3);
  return [correct, ...finalWrongs];
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}
function stripTags(s){
  return (s||"").replace(/<[^>]+>/g,"");
}

function showFeedback(ok, userAnswer=null, opts={}){
  const item = state.current;
  const ans = (state.mode === "flashcards") ? item.back : item.answer;
  const src = item.source?.book_page ? ` • Tankönyv: ${item.source.book_page}. o.` : "";
  const expl = item.explanation ? `<div class="muted small" style="margin-top:8px">${escapeHtml(item.explanation)}${escapeHtml(src)}</div>` : `<div class="muted small" style="margin-top:8px">${escapeHtml(src)}</div>`;
  const ua = (!opts.hideUserAnswer && userAnswer!==null) ? `<div class="muted small" style="margin-top:6px">Válaszod: <b>${escapeHtml(String(userAnswer))}</b></div>` : "";
  const okTitle = opts.okTitle || "✅ <b>Helyes</b>";
  const badTitle = opts.badTitle || "❌ <b>Nem egészen</b>";
  $("#feedback").innerHTML = (ok ? okTitle : badTitle) +
    ua +
    `<div style="margin-top:8px"><b>Helyes válasz:</b> ${escapeHtml(String(ans))}</div>` +
    expl;
  $("#feedback").classList.remove("hidden");
  $("#btnNext").disabled = false;
  state.answered = true;
}

function typedIsCorrect(userText, item){
  const u = normalize(userText);
  const answers = [item.answer, ...(item.accepted||[])].filter(Boolean);

  // Special: "Példák:" freeform, accept if contains any listed example
  const a0 = answers[0] || "";
  if(/^példák:/i.test(a0.trim())){
    const list = a0.split(":")[1] || "";
    const examples = list.split(",").map(x=>normalize(x));
    return examples.some(ex=> ex && u.includes(ex));
  }

  return answers.some(a=>{
    const na = normalize(a);
    return na === u;
  });
}

/* ---- Answer handlers ---- */
function onAnswerMcq(chosen, btn){
  if(state.answered) return;
  const item = state.current;
  const correct = item.answer;
  const ok = normalize(chosen) === normalize(correct);

  // paint
  $$("#mcq button").forEach(b=>{
    const isC = normalize(b.textContent) === normalize(correct);
    if(isC) b.classList.add("correct");
    if(b===btn && !ok) b.classList.add("wrong");
    b.disabled = true;
  });

  registerAttempt(item.id, ok);
  if(!ok) state.wrongIds.add(item.id);

  showFeedback(ok, chosen);

  if(state.mode === "srs"){
    // wait for grade buttons
  }else{
    // allow next
  }
}

function onSubmitTyped(){
  if(state.answered) return;
  const item = state.current;
  const txt = $("#typedInput").value;
  const ok = typedIsCorrect(txt, item);

  registerAttempt(item.id, ok);
  if(!ok) state.wrongIds.add(item.id);

  showFeedback(ok, txt);

  $("#btnSubmit").disabled = true;
  if(state.mode !== "srs"){
    // allow next
  }
}

function registerAttempt(qid, ok){
  state.stats.attempts = (state.stats.attempts||0) + 1;
  if(ok) state.stats.correct = (state.stats.correct||0) + 1;
  if(ok) state.correct += 1;
  saveLocal();
  updateHomeStats();
}

function applySrsGrade(grade){
  const item = state.current;
  if(!item || !item.id) return;
  const srs = getSrs(item.id);
  const updated = gradeToUpdate(srs, grade);
  setSrs(item.id, updated);
  saveLocal();
  updateHomeStats();
}

/* ---- Navigation ---- */
function startMode(mode){
  state.mode = mode;
  state.setSize = parseInt($("#setSize").value, 10);
  state.topic = $("#topicFilter").value;
  state.idx = 0;
  state.correct = 0;
  state.wrongIds = new Set();
  state.startTs = now();

  // build items
  state.items = pickSessionItems();

  // For MCQ/typed modes, force type if needed
  if(mode === "quiz-mcq"){
    // allow mcq even for typed items
  }
  if(mode === "quiz-typed"){
    // allow typed even for mcq items by reading answer; but keep typed input
  }

  show("#session");
  renderCurrent();
}

function next(){
  if(!state.items.length) return;
  if(state.idx >= state.items.length-1){
    finishSet();
    return;
  }
  state.idx += 1;
  renderCurrent();
}

function finishSet(){
  const total = state.items.length;
  const correct = state.correct;
  const acc = total ? Math.round((correct/total)*100) : 0;
  $("#resScore").textContent = `${correct}/${total}`;
  $("#resAcc").textContent = `${acc}%`;
  $("#resTime").textContent = formatMs(now()-state.startTs);
  show("#results");
}

function retryWeak(){
  const ids = Array.from(state.wrongIds);
  if(!ids.length){
    // if none, just restart same mode
    startMode(state.mode);
    return;
  }
  // Build a new session from those ids
  const pool = (state.mode === "flashcards") ? state.data.cards : state.data.qa;
  const map = new Map(pool.map(x=>[x.id,x]));
  state.items = ids.map(id=>map.get(id)).filter(Boolean);
  state.idx = 0;
  state.correct = 0;
  state.wrongIds = new Set();
  state.startTs = now();
  show("#session");
  renderCurrent();
}

/* ---- Events ---- */
function wire(){
  // load settings into UI
  $("#ttsToggle").checked = !!state.settings.tts;
  $("#enterToggle").checked = !!state.settings.enterNext;

  // start buttons
  $$(".bigBtn").forEach(b=>{
    b.addEventListener("click", ()=> startMode(b.dataset.mode));
  });

  $("#btnBack").addEventListener("click", ()=> show("#home"));
  $("#btnHome").addEventListener("click", ()=> show("#home"));

  $("#btnNext").addEventListener("click", ()=> next());

  $("#btnShowAnswer").addEventListener("click", ()=>{
    const item = state.current;
    if(!item) return;
    if(state.mode === "flashcards"){
      if(state.answered) return;
      // Reveal (no scoring). Scoring happens via "Tudtam / Nem tudtam".
      if(!state.flashRevealed){
        showFlashAnswer();
      }else{
        // hide answer to peek again
        $("#feedback").classList.add("hidden");
        $("#flashGrade").classList.add("hidden");
        state.flashRevealed = false;
      }
      return;
    }
    // show without counting attempt
    $("#feedback").innerHTML = `<div><b>Helyes válasz:</b> ${escapeHtml(String(item.answer))}</div>` +
      (item.explanation ? `<div class="muted small" style="margin-top:8px">${escapeHtml(item.explanation)}</div>` : "") +
      (item.source?.book_page ? `<div class="muted small" style="margin-top:6px">Tankönyv: ${item.source.book_page}. o.</div>` : "");
    $("#feedback").classList.remove("hidden");
    $("#btnNext").disabled = false;
  });

  // Flashcards self-grade buttons
  $("#btnKnew").addEventListener("click", ()=> gradeFlash(true));
  $("#btnDidnt").addEventListener("click", ()=> gradeFlash(false));

  $("#btnSubmit").addEventListener("click", onSubmitTyped);
  $("#typedInput").addEventListener("keydown", (e)=>{
    if(e.key === "Enter"){
      if(!state.answered) onSubmitTyped();
      else if(state.settings.enterNext) next();
    }
  });
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Enter" && state.settings.enterNext && !$("#session").classList.contains("hidden")){
      // avoid double firing while typing
      const active = document.activeElement;
      if(active && active.id === "typedInput") return;
      if(!state.answered) return;
      next();
    }
  });

  // SRS grade buttons
  $$("#srsBtns button").forEach(b=>{
    b.addEventListener("click", ()=>{
      if(!state.answered){
        // require feedback first: show answer
        $("#btnShowAnswer").click();
        return;
      }
      const grade = parseInt(b.dataset.grade, 10);
      applySrsGrade(grade);
      next();
    });
  });

  // Settings modal
  $("#btnSettings").addEventListener("click", ()=>{
    show("#settings");
  });
  $("#btnCloseSettings").addEventListener("click", ()=> show("#home"));
  $("#btnCloseResults").addEventListener("click", ()=> show("#home"));

  $("#ttsToggle").addEventListener("change", (e)=>{
    state.settings.tts = !!e.target.checked;
    saveLocal();
  });
  $("#enterToggle").addEventListener("change", (e)=>{
    state.settings.enterNext = !!e.target.checked;
    saveLocal();
  });

  $("#btnReset").addEventListener("click", ()=>{
    if(confirm("Biztosan törlöd az összes statisztikát erről az eszközről?")){
      localStorage.removeItem(STORAGE_KEY);
      state.stats = {attempts:0, correct:0, srs:{}};
      saveLocal();
      updateHomeStats();
      alert("Kész ✅");
    }
  });

  $("#btnRetryWeak").addEventListener("click", retryWeak);
}

async function init(){
  loadLocal();
  updateHomeStats();

  // fetch data
  const res = await fetch("data/content.json", {cache:"no-store"});
  state.data = await res.json();

  updateHomeStats();
  wire();
  show("#home");
}

init().catch(err=>{
  console.error(err);
  alert("Hiba a betöltésnél. Ellenőrizd, hogy a repo-ban a data/content.json elérhető-e.");
});
