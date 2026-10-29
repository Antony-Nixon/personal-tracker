const KEY = "my-tracker-v3";
const cfg = window.APP_CONFIG || {};
const DEFAULT_STATE = { version: 2, tasks: [], history: [], settings: { morning: "06:00", night: "22:00" } };
let state = loadState();
const initialParams = new URLSearchParams(location.search);
const initialDate = initialParams.get("date");
let reviewOpenedFromNotification = initialParams.get("review") === "1";

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function today() { return localDate(new Date()); }
let selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(initialDate || "") ? initialDate : today();
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
    const next = { ...structuredClone(DEFAULT_STATE), ...parsed, tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [], history: Array.isArray(parsed.history) ? parsed.history : [], settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) } };
    const migrated = next.tasks.map(DaymarkRecurrence.migrateTask);
    if (next.version !== 2 || migrated.some((task, i) => task !== next.tasks[i])) {
      next.version = 2;
      next.tasks = migrated;
      localStorage.setItem(KEY, JSON.stringify(next));
    }
    return next;
  } catch { return structuredClone(DEFAULT_STATE); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function repeatLabel(x) { return x && typeof x === "object" ? DaymarkRecurrence.label(x) : ({ daily: "every day", weekly: "weekly", monthly: "monthly" })[x] || ""; }
function scheduleType(t) { return t.schedule?.type || (t.repeat === "daily" && Number(t.weeklyTarget) > 0 ? "weekly_quota" : t.repeat === "weekly" ? "weekdays" : t.repeat); }
function occurs(t, date) {
  return DaymarkRecurrence.occurs(t, date);
}
function historyFor(taskId, date, type) { return state.history.find(h => h.taskId === taskId && h.date === date && h.type === type); }
function isDone(t, date) { return !!historyFor(t.id, date, "complete") || (t.repeat === "none" && t.date === date && t.completed); }
function isSkipped(t, date) { return !!historyFor(t.id, date, "skip"); }
function tasksFor(date) {
  return state.tasks.filter(t => occurs(t, date)).map(t => ({ ...t, done: isDone(t, date), skipped: isSkipped(t, date) }));
}
function addDays(date, amount) { const d = parseDate(date); d.setDate(d.getDate() + amount); return localDate(d); }
function weekStart(date) { const d = parseDate(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDate(d); }
function weekDates(start) { return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }
function monthStart(date) { return `${date.slice(0, 7)}-01`; }
function monthBefore(date) { const d = parseDate(monthStart(date)); d.setMonth(d.getMonth() - 1); return localDate(d); }
function doneCount(task, dates) { return dates.filter(date => date <= today() && occurs(task, date) && isDone(task, date)).length; }
function occurrenceCount(task, dates) { return dates.filter(date => occurs(task, date)).length; }
function weekGoalStreak(task, goal) {
  const currentWeek = weekStart(today());
  let cursor = doneCount(task, weekDates(currentWeek)) >= goal ? currentWeek : addDays(currentWeek, -7);
  let streak = 0;
  while (cursor >= weekStart(task.date) && doneCount(task, weekDates(cursor)) >= goal) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}
function dailyStreak(task) {
  let cursor = isDone(task, today()) ? today() : addDays(today(), -1);
  let streak = 0;
  while (cursor >= task.date && occurs(task, cursor) && isDone(task, cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
function weeklyStreak(task) {
  const currentWeek = weekStart(today());
  let cursor = doneCount(task, weekDates(currentWeek)) ? currentWeek : addDays(currentWeek, -7);
  let streak = 0;
  while (cursor >= weekStart(task.date) && doneCount(task, weekDates(cursor)) > 0) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}
function monthHasCompletion(task, start) {
  const d = parseDate(start), lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return doneCount(task, Array.from({ length: lastDay }, (_, i) => addDays(start, i))) > 0;
}
function monthlyStreak(task) {
  const currentMonth = monthStart(today());
  let cursor = monthHasCompletion(task, currentMonth) ? currentMonth : monthBefore(currentMonth);
  let streak = 0;
  while (cursor >= monthStart(task.date) && monthHasCompletion(task, cursor)) {
    streak++;
    cursor = monthBefore(cursor);
  }
  return streak;
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
  const type = t ? scheduleType(t) : "none";
  $("repeat").value = type;
  $("intervalDays").value = t?.schedule?.intervalDays || 2;
  $("weeklyTarget").value = t?.schedule?.targetPerWeek || t?.weeklyTarget || "";
  $("monthDay").value = t?.schedule?.dayOfMonth || (t?.date ? parseDate(t.date).getDate() : "");
  document.querySelectorAll("#weekdayPicker input").forEach(input => input.checked = !!t?.schedule?.weekdays?.includes(Number(input.value)));
  updateScheduleFields();
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
  const recurringLabel = scheduleType(t) !== "none" ? ` · ${repeatLabel(t)}` : "";
  el.innerHTML = `<button class="check ${status}" aria-label="Mark task complete"></button><div class="task-main"><div class="task-title ${t.done?"done-text":""}">${esc(t.title)}</div><div class="meta">${formatTime(t.time)}${recurringLabel}${t.skipped?" · skipped today":""}</div></div><div class="actions"><button class="icon postpone" title="Postpone" aria-label="Postpone task">→</button><button class="icon edit" title="Edit task" aria-label="Edit task">⋮</button><button class="icon delete-task" title="Delete task permanently" aria-label="Delete ${esc(t.title)} permanently"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"></path></svg></button></div>`;
  el.querySelector(".check").onclick=()=>setDone(t,date,!t.done);
  el.querySelector(".postpone").onclick=()=>openPostpone(t,date);
  el.querySelector(".edit").onclick=()=>openEdit(t);
  el.querySelector(".delete-task").onclick=()=>deleteTask(t);
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
function renderDashboard() {
  const recurring = state.tasks.filter(t => scheduleType(t) !== "none").sort((a, b) => a.title.localeCompare(b.title));
  const dates = weekDates(weekStart(today()));
  const sessions = recurring.reduce((sum, task) => sum + DaymarkRecurrence.stats(task, dates[0], dates[6], isDone, today()).completed, 0);
  const activeStreaks = recurring.filter(task => DaymarkRecurrence.streaks(task, isDone, today()).current > 0).length;

  $("dashboardSummary").innerHTML = `<div class="dash-stat"><strong>${recurring.length}</strong><span>recurring habits</span></div><div class="dash-stat"><strong>${sessions}</strong><span>sessions this week</span></div><div class="dash-stat"><strong>${activeStreaks}</strong><span>active streaks</span></div>`;
  const list = $("taskProgress");
  list.innerHTML = "";
  if (!recurring.length) {
    list.innerHTML = '<div class="empty dashboard-empty">Your recurring habits will appear here. One-time tasks stay out of progress tracking.</div>';
    return;
  }

  for (const task of recurring) {
    const start = addDays(today(), -29);
    const result = DaymarkRecurrence.stats(task, start, today(), isDone, today());
    const streakInfo = DaymarkRecurrence.streaks(task, isDone, today());
    const streakText = `${streakInfo.current}${streakInfo.unit === "week" ? "w" : "x"} streak`;
    const periodText = `Last 30 days · ${result.completed}/${result.expected} · ${result.percentage}% success`;
    const ratio = result.expected ? result.completed / result.expected : 0;

    const card = document.createElement("article");
    card.className = "progress-card clickable-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `View analytics for ${task.title}`);
    const top = document.createElement("div");
    top.className = "progress-card-top";
    const name = document.createElement("strong");
    name.className = "progress-task-name";
    name.textContent = task.title;
    const streak = document.createElement("span");
    streak.className = "streak-pill";
    streak.textContent = streakText;
    const remove = document.createElement("button");
    remove.className = "icon progress-delete";
    remove.type = "button";
    remove.title = "Delete this recurring task and its history";
    remove.setAttribute("aria-label", `Delete ${task.title} and its history`);
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"></path></svg>';
    remove.onclick = () => deleteTask(task);
    top.append(name, streak, remove);
    const meta = document.createElement("div");
    meta.className = "progress-meta";
    meta.textContent = periodText;
    const bar = document.createElement("div");
    bar.className = "progress-track";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
    bar.append(fill);
    card.append(top, meta, bar);
    card.onclick = event => { if (!event.target.closest("button")) openAnalytics(task); };
    card.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openAnalytics(task); } };
    list.append(card);
  }
}
function analyticsRange() {
  const preset = $("analyticsPreset").value;
  const end = today();
  if (preset === "custom") return { start: $("analyticsStart").value || addDays(end, -29), end: $("analyticsEnd").value || end };
  if (preset === "month") return { start: monthStart(end), end };
  return { start: addDays(end, -(Number(preset || 30) - 1)), end };
}
function renderAnalytics(task) {
  const range = analyticsRange();
  const result = DaymarkRecurrence.stats(task, range.start, range.end, isDone, today());
  const streak = DaymarkRecurrence.streaks(task, isDone, today());
  $("analyticsTitle").textContent = task.title;
  $("analyticsSchedule").textContent = DaymarkRecurrence.label(task);
  $("analyticsStats").innerHTML = `<div><strong>${result.completed}</strong><span>completed</span></div><div><strong>${result.expected}</strong><span>expected</span></div><div><strong>${result.missed}</strong><span>missed</span></div><div><strong>${result.percentage}%</strong><span>success</span></div><div><strong>${streak.current}${streak.unit === "week" ? "w" : "x"}</strong><span>current streak</span></div><div><strong>${streak.best}${streak.unit === "week" ? "w" : "x"}</strong><span>best streak</span></div>`;
  $("analyticsFill").style.width = `${Math.max(0, Math.min(100, result.percentage))}%`;
  $("analyticsNote").textContent = `${formatLong(range.start)} – ${formatLong(range.end)} · Future dates are not counted yet.`;
  const dates = DaymarkRecurrence.dueDates(task, range.start, range.end, today());
  $("analyticsOccurrences").innerHTML = dates.length ? dates.map(date => `<span class="occurrence ${isDone(task, date) ? "complete" : "missed"}">${date.slice(8, 10)} ${new Intl.DateTimeFormat(undefined, { month: "short" }).format(parseDate(date))}</span>`).join("") : '<div class="empty">No scheduled occurrences in this period.</div>';
}
function openAnalytics(task) {
  window.analyticsTask = task;
  $("analyticsPreset").value = "30";
  $("analyticsCustomRange").hidden = true;
  renderAnalytics(task);
  $("analyticsDialog").showModal();
}
function renderPastTasks() {
  const list = $("pastTasksList");
  const past = state.tasks
    .filter(task => task.repeat === "none" && task.date < today())
    .sort((a, b) => b.date.localeCompare(a.date) || sortTasks(a, b));
  list.innerHTML = "";
  if (!past.length) {
    list.innerHTML = '<div class="empty">No past one-time tasks.</div>';
    return;
  }
  for (const task of past) {
    const row = document.createElement("article");
    row.className = "past-task";
    const detail = document.createElement("div");
    detail.className = "past-task-detail";
    const title = document.createElement("strong");
    title.textContent = task.title;
    const date = document.createElement("span");
    date.textContent = `${formatLong(task.date)} · ${isDone(task, task.date) ? "Completed" : "Not completed"}`;
    detail.append(title, date);
    const remove = document.createElement("button");
    remove.className = "icon delete-task";
    remove.type = "button";
    remove.title = "Delete past task permanently";
    remove.setAttribute("aria-label", `Delete ${task.title} permanently`);
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"></path></svg>';
    remove.onclick = () => { deleteTask(task); renderPastTasks(); };
    row.append(detail, remove);
    list.append(row);
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
  const calendarPanel = $("calendarPanel");
  if (!calendarPanel || !calendarPanel.hidden) renderCalendar();
  renderDashboard();
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
    row.innerHTML=`<div><strong>${esc(t.title)}</strong><small>${formatTime(t.time)}${scheduleType(t)!=="none"?" · "+repeatLabel(t):""}</small></div><div class="review-actions"><button class="btn small complete">Done</button><button class="btn small postpone">Tomorrow</button><button class="btn small choose">Choose date</button><button class="btn small danger delete">Delete</button></div>`;
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
$("pastTasksBtn").onclick=()=>{renderPastTasks();$("pastTasksDialog").showModal();};
$("closePastTasks").onclick=()=>$("pastTasksDialog").close();
const calendarToggle=$("calendarToggle");
if(calendarToggle) calendarToggle.onclick=()=>{const panel=$("calendarPanel");if(!panel)return;const open=panel.hidden;panel.hidden=!open;calendarToggle.setAttribute("aria-expanded",String(open));if(open)renderCalendar();};
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
$("closeAnalytics").onclick=()=>$("analyticsDialog").close();
$("cancelBtn").onclick=()=>$("taskDialog").close();
$("postponeCancel").onclick=()=>$("postponeDialog").close();
function updateScheduleFields() {
  const type = $("repeat").value;
  $("intervalField").hidden = type !== "interval";
  $("weekdayField").hidden = type !== "weekdays";
  $("weeklyGoalField").hidden = type !== "weekly_quota";
  $("monthlyField").hidden = type !== "monthly";
  const start = $("date").value || today();
  const preview = { none: "One-time task", daily: "Runs every day", interval: `Runs every ${Math.max(1, Number($("intervalDays").value) || 2)} days starting ${start}`, weekdays: "Runs on the selected weekdays", weekly_quota: `${Math.max(1, Number($("weeklyTarget").value) || 1)} sessions per week`, monthly: `Runs monthly on day ${$("monthDay").value || parseDate(start).getDate()}` }[type];
  $("schedulePreview").textContent = preview || "";
}
$("repeat").onchange=updateScheduleFields;
["intervalDays", "weeklyTarget", "monthDay", "date"].forEach(id => $(id).addEventListener("input", updateScheduleFields));
$("taskForm").onsubmit=e=>{
  e.preventDefault();
  const id=$("editId").value, type=$("repeat").value, date=$("date").value;
  const schedule = type === "none" ? null : type === "interval" ? {type, intervalDays:Math.max(1, Math.min(365, Number($("intervalDays").value)||2))} : type === "weekdays" ? {type, weekdays:[...document.querySelectorAll("#weekdayPicker input:checked")].map(x=>Number(x.value))} : type === "weekly_quota" ? {type, targetPerWeek:Math.max(1, Math.min(7, Number($("weeklyTarget").value)||1))} : type === "monthly" ? {type, dayOfMonth:Math.max(1, Math.min(31, Number($("monthDay").value)||parseDate(date).getDate()))} : {type};
  if(type === "weekdays" && !schedule.weekdays.length) return toast("Choose at least one weekday");
  const d={title:$("title").value.trim(),date,time:$("time").value,repeat:type === "none" ? "none" : type,schedule};
  if(!d.title || !date)return;
  if(id)Object.assign(state.tasks.find(t=>t.id===id),d);else state.tasks.push({id:uid(),...d,completed:false,createdAt:new Date().toISOString()});
  save();$("taskDialog").close();selectedDate=d.date;render();syncServer();toast(id?"Task updated":"Task added");
};
$("postponeForm").onsubmit=e=>{e.preventDefault();const id=$("postponeId").value,old=$("postponeOldDate").value,t=state.tasks.find(x=>x.id===id);if(!t)return;postponeTask(t,old,$("postponeDate").value,$("postponeTime").value);$("postponeDialog").close();if(new URLSearchParams(location.search).get("review")==="1")showReview(old);};
$("analyticsPreset").onchange=()=>{ $("analyticsCustomRange").hidden=$("analyticsPreset").value!=="custom"; if(window.analyticsTask) renderAnalytics(window.analyticsTask); };
["analyticsStart", "analyticsEnd"].forEach(id => $(id).addEventListener("change", () => { if(window.analyticsTask) renderAnalytics(window.analyticsTask); }));
if("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(console.error);

// If the browser has already granted permission, never ask again; quietly restore the subscription state.
if(hasNotificationSetup() && localStorage.getItem("tracker-notifications-enabled") === "1") syncServer();
render();
