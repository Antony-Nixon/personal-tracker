/* Daymark recurrence and progress rules. Kept independent of the UI so every
   calendar, dashboard, report, and migration path uses the same definitions. */
(function (root) {
  const DAY = 86400000;
  const pad = n => String(n).padStart(2, "0");
  const parseDate = s => new Date(`${s}T00:00:00`);
  const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return localDate(d); };
  const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY);
  const weekStart = s => addDays(s, -((parseDate(s).getDay() + 6) % 7));
  const quotaWeekStart = (task, date) => addDays(task.date, Math.floor(Math.max(0, diffDays(task.date, date)) / 7) * 7);
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

  function migrateTask(task) {
    if (task.schedule || task.repeat === "none") return task;
    const startDay = parseDate(task.date).getDay();
    let schedule;
    if (task.repeat === "daily") {
      schedule = Number(task.weeklyTarget) > 0
        ? { type: "weekly_quota", targetPerWeek: Math.max(1, Math.min(7, Number(task.weeklyTarget))) }
        : { type: "daily" };
    } else if (task.repeat === "weekly") {
      schedule = { type: "weekdays", weekdays: [startDay] };
    } else if (task.repeat === "monthly") {
      schedule = { type: "monthly", dayOfMonth: parseDate(task.date).getDate() };
    }
    return schedule ? { ...task, schedule } : task;
  }

  function normalize(task) {
    const t = migrateTask(task);
    if (!t.schedule) return t;
    const s = { ...t.schedule };
    if (s.type === "interval") s.intervalDays = Math.max(1, Math.floor(Number(s.intervalDays) || 1));
    if (s.type === "weekdays") s.weekdays = [...new Set((s.weekdays || []).map(Number).filter(n => n >= 0 && n <= 6))];
    if (s.type === "weekly_quota") s.targetPerWeek = Math.max(1, Math.min(7, Math.floor(Number(s.targetPerWeek) || 1)));
    if (s.type === "monthly") s.dayOfMonth = Math.max(1, Math.min(31, Math.floor(Number(s.dayOfMonth) || parseDate(t.date).getDate())));
    return { ...t, schedule: s };
  }

  function occurs(task, date) {
    if (!validDate(date) || !validDate(task.date) || date < task.date) return false;
    if (task.repeat === "none" && !task.schedule) return task.date === date;
    const s = normalize(task).schedule;
    if (!s) return false;
    if (s.type === "daily" || s.type === "weekly_quota") return true;
    if (s.type === "interval") return diffDays(task.date, date) % s.intervalDays === 0;
    if (s.type === "weekdays") return s.weekdays.includes(parseDate(date).getDay());
    if (s.type === "monthly") {
      const d = parseDate(date), lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(s.dayOfMonth, lastDay);
    }
    return false;
  }

  function datesBetween(start, end) {
    if (!validDate(start) || !validDate(end) || end < start) return [];
    const out = [];
    for (let date = start; date <= end; date = addDays(date, 1)) out.push(date);
    return out;
  }

  function dueDates(task, start, end, todayDate) {
    const effectiveEnd = todayDate && todayDate < end ? todayDate : end;
    return datesBetween(start, effectiveEnd).filter(date => occurs(task, date));
  }

  function expectedCount(task, start, end, todayDate) {
    const t = normalize(task);
    const due = dueDates(t, start, end, todayDate);
    if (t.schedule?.type !== "weekly_quota") return due.length;
    const first = quotaWeekStart(t, start), last = quotaWeekStart(t, due.length ? due[due.length - 1] : end);
    let weeks = 0;
    for (let cursor = first; cursor <= last; cursor = addDays(cursor, 7)) weeks++;
    return weeks * t.schedule.targetPerWeek;
  }

  function completedDates(task, start, end, isDone, todayDate) {
    return dueDates(task, start, end, todayDate).filter(date => isDone(task, date));
  }

  function stats(task, start, end, isDone, todayDate) {
    const t = normalize(task);
    const completedDatesList = completedDates(t, start, end, isDone, todayDate);
    const rawCompleted = completedDatesList.length;
    let completed = rawCompleted;
    const expected = expectedCount(t, start, end, todayDate);
    if (t.schedule?.type === "weekly_quota") {
      completed = 0;
      const endDate = todayDate && todayDate < end ? todayDate : end;
      for (let cursor = quotaWeekStart(t, start); cursor <= quotaWeekStart(t, endDate); cursor = addDays(cursor, 7)) {
        const weekEnd = addDays(cursor, 6);
        const count = completedDatesList.filter(date => date >= cursor && date <= weekEnd).length;
        completed += Math.min(count, t.schedule.targetPerWeek);
      }
    }
    const percentage = expected ? Math.round((completed / expected) * 1000) / 10 : 0;
    return { completed, rawCompleted, expected, missed: Math.max(0, expected - completed), percentage, completedDates: completedDatesList };
  }

  function streaks(task, isDone, todayDate) {
    const t = normalize(task);
    const end = todayDate;
    const start = t.date;
    if (t.schedule?.type === "weekly_quota") {
      const weeks = [];
      for (let cursor = quotaWeekStart(t, start); cursor <= quotaWeekStart(t, end); cursor = addDays(cursor, 7)) {
        const count = dueDates(t, cursor, addDays(cursor, 6), end).filter(date => isDone(t, date)).length;
        weeks.push(count >= t.schedule.targetPerWeek);
      }
      let current = 0, best = 0, run = 0;
      weeks.forEach(ok => { run = ok ? run + 1 : 0; best = Math.max(best, run); });
      let last = weeks.length - 1;
      if (last >= 0 && !weeks[last] && todayDate < addDays(quotaWeekStart(t, todayDate), 7)) last--;
      for (let i = last; i >= 0 && weeks[i]; i--) current++;
      return { current, best, unit: "week" };
    }
    const due = dueDates(t, start, end, end);
    let best = 0, run = 0;
    due.forEach(date => { run = isDone(t, date) ? run + 1 : 0; best = Math.max(best, run); });
    let current = 0;
    for (let i = due.length - 1; i >= 0 && isDone(t, due[i]); i--) current++;
    return { current, best, unit: "occurrence" };
  }

  function label(task) {
    const t = normalize(task), s = t.schedule;
    if (!s) return "";
    if (s.type === "daily") return "every day";
    if (s.type === "interval") return `every ${s.intervalDays} days`;
    if (s.type === "weekdays") return s.weekdays.map(d => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ");
    if (s.type === "monthly") return `monthly on day ${s.dayOfMonth}`;
    if (s.type === "weekly_quota") return `${s.targetPerWeek} times per week`;
    return "";
  }

  root.DaymarkRecurrence = { normalize, migrateTask, occurs, datesBetween, dueDates, expectedCount, completedDates, stats, streaks, label, addDays, weekStart };
})(window);
