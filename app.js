const KEY = "my-tracker-v3";
const cfg = window.APP_CONFIG || {};
const DEFAULT_STATE = { tasks: [], history: [], settings: { morning: "06:00", night: "22:00" } };
let state = loadState();
const initialParams = new URLSearchParams(location.search);
const initialDate = initialParams.get("date");
let selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(initialDate || "") ? initialDate : today();
let reviewOpenedFromNotification = initialParams.get("review") === "1";

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function today() { return localDate(new Date()); }
function parseDate(s) { return new Date(`${s}T00:00:00`); }
function formatLong(s) { return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseDate(s)); }
function formatMonth(s) { return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(parseDate(`${s.slice(0,7)}-01`)); }
function formatTime(x) { if (!x) return "No time"; let [h,m] = x.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${pad(m)} ${ap}`; }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function loadState() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem("my-tracker-v2");
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed, tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [], history: Array.isArray(parsed.history) ? parsed.history : [], settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) } };
  } catch { return structuredClone(DEFAULT_STATE); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function repeatLabel(x) { return ({ daily: "daily", weekly: "weekly", monthly: "monthly" })[x] || ""; }
function occurs(t, date) {
  const start = parseDate(t.date), target = parseDate(date);
  if (target < start) return false;
  if (t.repeat === "none") return t.date === date;
  const diff = Math.round((target - start) / 86400000);
  if (t.repeat === "daily") return true;
  if (t.repeat === "weekly") return diff % 7 === 0;
  if (t.repeat === "monthly") return start.getDate() === target.getDate();
  return false;
}
function historyFor(taskId, date, type) { return state.history.find(h => h.taskId === taskId && h.date === date && h.type === type); }
function isDone(t, date) { return !!historyFor(t.id, date, "complete") || (t.repeat === "none" && t.date === date && t.completed); }
function isSkipped(t, date) { return !!historyFor(t.id, date, "skip"); }
function tasksFor(date) {
  return state.tasks.filter(t => occurs(t, date)).map(t => ({ ...t, done: isDone(t, date), skipped: isSkipped(t, date) }));
}
function sortTasks(a,b) { return (a.time || "99:99").localeCompare(b.time || "99:99") || a.title.localeCompare(b.title); }
function toast(s) { const el = $("toast"); el.textContent = s; el.style.display = "block"; clearTimeout(window.__toast); window.__toast = setTimeout(() => el.style.display = "none", 1900); }
function hasNotificationSetup() { return "Notification" in window && Notification.permission === "granted"; }
function getDeviceId() { let x = localStorage.getItem("tracker-device-id"); if (!x) { x = uid(); localStorage.setItem("tracker-device-id", x); } return x; }
function b64ToUint8Array(s) { const p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), o = new Uint8Array(r.length); for (let i=0;i<r.length;i++) o[i]=r.charCodeAt(i); return o; }

function setDone(t, date, done=true) {
  state.history = state.history.filter(h => !(h.taskId === t.id && h.date === date && ["complete","skip"].includes(h.type)));
  if (done) state.history.push({ taskId:t.id, date, type:"complete", at:new Date().toISOString() });
  if (t.repeat === "none" && t.date === date) t.completed = done;
  save(); render(); syncServer();
}
function skipTask(t, date) {
  state.history = state.history.filter(h => !(h.taskId === t.id && h.date === date && ["complete","skip"].includes(h.type)));
  state.history.push({ taskId:t.id, date, type:"skip", at:new Date().toISOString() });
  if (t.repeat === "none" && t.date === date) t.completed = false;
  save(); render(); syncServer();
}
function deleteTask(t) {
  if (!confirm(`Delete “${t.title}” permanently?`)) return;
  state.tasks = state.tasks.filter(x => x.id !== t.id);
  state.history = state.history.filter(h => h.taskId !== t.id);
  save(); render(); syncServer(); toast("Task deleted");
}
function openEdit(t=null) {
  $("modalTitle").textContent = t ? "Edit task" : "Add task";
  $("editId").value = t?.id || "";
  $("title").value = t?.title || "";
  $("date").value = t?.date || selectedDate;
  $("time").value = t?.time || "";
  $("repeat").value = t?.repeat || "none";
  $("taskDialog").showModal();
}
function openPostpone(t, date) {
  $("postponeId").value=t.id; $("postponeOldDate").value=date;
  const d=parseDate(date); d.setDate(d.getDate()+1);
  $("postponeDate").value=localDate(d); $("postponeTime").value=t.time||"";
  $("postponeDialog").showModal();
}
function postponeTask(t, oldDate, newDate, newTime) {
  if (t.repeat === "none") {
    t.date = newDate; t.time = newTime; t.completed = false;
  } else {
    skipTask(t, oldDate);
    const duplicateDate = tasksFor(newDate).some(x => x.id === t.id);
    if (!duplicateDate) state.tasks.push({ id:uid(), title:t.title, date:newDate, time:newTime, repeat:"none", completed:false, createdAt:new Date().toISOString(), postponedFrom:t.id });
  }
  save(); render(); syncServer(); toast("Task postponed");
}

function renderTask(t, date, container, review=false) {
  const el=document.createElement("div"); el.className="task";
  const status = t.skipped ? "skipped" : t.done ? "done" : "";
  el.innerHTML = `<button class="check ${status}" aria-label="Mark task complete"></button><div class="task-main"><div class="task-title ${t.done?"done-text":""}">${esc(t.title)}</div><div class="meta">${formatTime(t.time)}${t.repeat!=="none"?" · "+repeatLabel(t.repeat):""}${t.skipped?" · skipped today":""}</div></div><div class="actions"><button class="icon postpone" title="Postpone">→</button><button class="icon edit" title="Edit">⋮</button></div>`;
  el.querySelector(".check").onclick=()=>setDone(t,date,!t.done);
  el.querySelector(".postpone").onclick=()=>openPostpone(t,date);
  el.querySelector(".edit").onclick=()=>openEdit(t);
  container.appendChild(el);
}
function renderCalendar() {
  const d=parseDate(selectedDate); const first=new Date(d.getFullYear(),d.getMonth(),1); const start=(first.getDay()+6)%7; const days=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
  $("calendarTitle").textContent=new Intl.DateTimeFormat(undefined,{month:"long",year:"numeric"}).format(first);
  const grid=$("calendarGrid"); grid.innerHTML="";
  ["M","T","W","T","F","S","S"].forEach(x=>{const e=document.createElement("div");e.className="cal-head";e.textContent=x;grid.appendChild(e);});
  for(let i=0;i<start;i++){const e=document.createElement("div");e.className="cal-empty";grid.appendChild(e);}
  for(let n=1;n<=days;n++){
    const ds=localDate(new Date(d.getFullYear(),d.getMonth(),n)); const tasks=tasksFor(ds); const e=document.createElement("button"); e.className="cal-day"+(ds===selectedDate?" selected":"")+(ds===today()?" today":""); e.innerHTML=`<span>${n}</span>${tasks.length?`<i></i>`:""}`; e.onclick=()=>{selectedDate=ds;render();}; grid.appendChild(e);
  }
}
function render() {
  const list=tasksFor(selectedDate).sort(sortTasks); const done=list.filter(t=>t.done).length;
  $("today").textContent=selectedDate===today()?formatLong(selectedDate):formatLong(selectedDate);
  $("viewTitle").textContent=selectedDate===today()?"Today's tasks":"Tasks for this day";
  $("progressText").textContent=`${done} / ${list.length} completed`;
  $("progress").style.width=list.length?`${done/list.length*100}%`:"0%";
  $("tasks").innerHTML="";
  if(!list.length) $("tasks").innerHTML='<div class="empty">No tasks for this day.</div>';
  list.forEach(t=>renderTask(t,selectedDate,$("tasks")));
  $("syncStatus").textContent=hasNotificationSetup()?"Notifications on":"Local only";
  $("notifyBtn").textContent=hasNotificationSetup()?"Notifications enabled":"Enable notifications";
  renderCalendar();
  renderReviewIfNeeded();
}
function renderReviewIfNeeded() {
  const date = new URLSearchParams(location.search).get("review")==="1" ? (new URLSearchParams(location.search).get("date")||today()) : null;
  if(date) showReview(date);
}
function showReview(date=today()) {
  const all=tasksFor(date), unfinished=all.filter(t=>!t.done&&!t.skipped);
  $("reviewDate").textContent=formatLong(date); $("reviewSummary").textContent=`${all.filter(t=>t.done).length} completed · ${unfinished.length} need a decision`;
  const box=$("reviewTasks"); box.innerHTML="";
  if(!unfinished.length){box.innerHTML='<div class="empty">Everything is cleared for today. Nice work.</div>';if(!$("reviewDialog").open) $("reviewDialog").showModal();return;}
  unfinished.sort(sortTasks).forEach(t=>{
    const row=document.createElement("div"); row.className="review-item";
    row.innerHTML=`<div><strong>${esc(t.title)}</strong><small>${formatTime(t.time)}${t.repeat!=="none"?" · "+repeatLabel(t.repeat):""}</small></div><div class="review-actions"><button class="btn small complete">Done</button><button class="btn small postpone">Tomorrow</button><button class="btn small choose">Choose date</button><button class="btn small danger delete">Delete</button></div>`;
    row.querySelector(".complete").onclick=()=>{setDone(t,date,true);showReview(date);};
    row.querySelector(".postpone").onclick=()=>{const nd=parseDate(date);nd.setDate(nd.getDate()+1);postponeTask(t,date,localDate(nd),t.time||"");showReview(date);};
    row.querySelector(".choose").onclick=()=>{openPostpone(t,date);};
    row.querySelector(".delete").onclick=()=>{deleteTask(t);showReview(date);};
    box.appendChild(row);
  });
  if(!$("reviewDialog").open) $("reviewDialog").showModal();
}

async function ensurePushSubscription() {
  if(!cfg.API_URL || !cfg.VAPID_PUBLIC_KEY) throw Error("Notifications are not configured on this build.");
  if(!("serviceWorker" in navigator) || !("PushManager" in window)) throw Error("Push notifications are not supported here.");
  if(!("Notification" in window)) throw Error("Notifications are not supported here.");
  if(Notification.permission === "denied") throw Error("Notifications are blocked in browser settings.");
  if(Notification.permission !== "granted") {
    const permission=await Notification.requestPermission();
    if(permission!=="granted") throw Error("Notification permission was not granted.");
  }
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToUint8Array(cfg.VAPID_PUBLIC_KEY)});
  const payload={deviceId:getDeviceId(),subscription:sub.toJSON(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"Asia/Kolkata",settings:state.settings,tasks:state.tasks,history:state.history};
  const r=await fetch(cfg.API_URL.replace(/\/$/,"")+"/subscribe",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  if(!r.ok) throw Error(await r.text());
  localStorage.setItem("tracker-notifications-enabled","1");
  return true;
}
async function enableNotifications() {
  try { await ensurePushSubscription(); render(); toast("Notifications enabled"); }
  catch(e){ toast(e.message || "Notification setup failed"); }
}
async function syncServer() {
  if(!cfg.API_URL || localStorage.getItem("tracker-notifications-enabled")!=="1") return;
  try {
    const r=await fetch(cfg.API_URL.replace(/\/$/,"")+"/sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:getDeviceId(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"Asia/Kolkata",settings:state.settings,tasks:state.tasks,history:state.history})});
    if(!r.ok) throw Error();
    $("syncStatus").textContent="Synced";
  } catch { $("syncStatus").textContent="Offline · local copy"; }
}

$("addBtn").onclick=()=>openEdit();
$("notifyBtn").onclick=()=>enableNotifications();
$("todayBtn").onclick=()=>{selectedDate=today();render();};
$("prevMonth").onclick=()=>{const d=parseDate(selectedDate);d.setMonth(d.getMonth()-1);selectedDate=localDate(new Date(d.getFullYear(),d.getMonth(),1));render();};
$("nextMonth").onclick=()=>{const d=parseDate(selectedDate);d.setMonth(d.getMonth()+1);selectedDate=localDate(new Date(d.getFullYear(),d.getMonth(),1));render();};
function clearReviewUrl() {
  if (reviewOpenedFromNotification || new URLSearchParams(location.search).get("review") === "1") {
    const u = new URL(location.href);
    u.searchParams.delete("review");
    u.searchParams.delete("date");
    history.replaceState({}, "", u.href);
    reviewOpenedFromNotification = false;
  }
}
$("closeReview").onclick=()=>$("reviewDialog").close();
$("reviewDialog").addEventListener("close", clearReviewUrl);
$("cancelBtn").onclick=()=>$("taskDialog").close();
$("postponeCancel").onclick=()=>$("postponeDialog").close();
$("taskForm").onsubmit=e=>{e.preventDefault();const id=$("editId").value,d={title:$("title").value.trim(),date:$("date").value,time:$("time").value,repeat:$("repeat").value};if(!d.title)return;if(id)Object.assign(state.tasks.find(t=>t.id===id),d);else state.tasks.push({id:uid(),...d,completed:false,createdAt:new Date().toISOString()});save();$("taskDialog").close();selectedDate=d.date;render();syncServer();toast(id?"Task updated":"Task added");};
$("postponeForm").onsubmit=e=>{e.preventDefault();const id=$("postponeId").value,old=$("postponeOldDate").value,t=state.tasks.find(x=>x.id===id);if(!t)return;postponeTask(t,old,$("postponeDate").value,$("postponeTime").value);$("postponeDialog").close();if(new URLSearchParams(location.search).get("review")==="1")showReview(old);};
if("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(console.error);

// If the browser has already granted permission, never ask again; quietly restore the subscription state.
if(hasNotificationSetup() && localStorage.getItem("tracker-notifications-enabled") === "1") syncServer();
render();
