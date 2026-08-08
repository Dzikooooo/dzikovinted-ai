/* ===========================================================
   ASCENSEUR — app.js
   Suivi d'habitudes sur 90 jours. 100% local (localStorage),
   aucun compte, aucun serveur. JavaScript pur, sans dépendance.
   =========================================================== */

const STORAGE_KEY = "ascenseur_data";
const TOTAL_DAYS = 90;
const VALID_THRESHOLD = 4; // habitudes cochées minimum pour valider la journée

// Les 5 habitudes suivies chaque jour (la vape n'en fait pas partie : tolérée)
const HABITS = [
  { key: "sport", label: "Sport" },
  { key: "food", label: "Alimentation ~3000 kcal" },
  { key: "sleep", label: "Sommeil 8h" },
  { key: "noCannabis", label: "Sans cannabis" },
  { key: "noCigarette", label: "Sans cigarette classique" },
];

const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // rayon=52 (voir index.html)

/* ---------- Utilitaires de date (fuseau local, pas UTC) ---------- */

// Clé stable au format YYYY-MM-DD, basée sur l'heure locale du téléphone
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayKey() {
  return dateKey(new Date());
}

function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatLongDate(key) {
  return keyToDate(key).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatShortDate(key) {
  return keyToDate(key).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Liste ordonnée de toutes les clés de date entre le jour 1 et aujourd'hui
function allDatesFromStart(startKey, endKey) {
  const dates = [];
  let cursor = keyToDate(startKey);
  const end = keyToDate(endKey);
  while (cursor <= end) {
    dates.push(dateKey(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return dates;
}

/* ---------- Stockage local ---------- */

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh = { startDate: todayKey(), days: {} };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.startDate) parsed.startDate = todayKey();
    if (!parsed.days) parsed.days = {};
    return parsed;
  } catch {
    const fresh = { startDate: todayKey(), days: {} };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

// Une journée absente de l'historique = toutes les cases décochées.
// C'est ce qui permet la "création automatique à minuit" sans rien faire :
// la nouvelle date n'existe simplement pas encore dans `days`.
function getDay(key) {
  return (
    state.data.days[key] || {
      sport: false,
      food: false,
      sleep: false,
      noCannabis: false,
      noCigarette: false,
    }
  );
}

function setHabit(key, habitKey, value) {
  const day = { ...getDay(key), [habitKey]: value };
  state.data.days[key] = day;
  saveData();
}

/* ---------- Calculs (score, validation, séries) ---------- */

function scoreOf(day) {
  return HABITS.reduce((n, h) => n + (day[h.key] ? 1 : 0), 0);
}

function isValidated(day) {
  return scoreOf(day) >= VALID_THRESHOLD;
}

function dayNumberOf(key) {
  const start = keyToDate(state.data.startDate);
  const target = keyToDate(key);
  const diff = Math.round((target - start) / 86400000) + 1;
  return Math.min(Math.max(diff, 1), TOTAL_DAYS);
}

function computeStreaks() {
  const today = todayKey();
  const dates = allDatesFromStart(state.data.startDate, today);
  const validated = dates.map((k) => isValidated(getDay(k)));

  let best = 0;
  let run = 0;
  for (const v of validated) {
    run = v ? run + 1 : 0;
    if (run > best) best = run;
  }

  // Série actuelle : on part d'aujourd'hui. Si le jour n'est pas encore
  // validé, on ne casse pas la série pour autant (la journée n'est pas
  // terminée) — on commence simplement le décompte à hier.
  let i = validated.length - 1;
  if (i >= 0 && !validated[i]) i--;
  let current = 0;
  while (i >= 0 && validated[i]) {
    current++;
    i--;
  }

  return { current, best };
}

/* ---------- État & navigation ---------- */

const state = {
  data: loadData(),
  activeTab: "today",
  editingKey: null, // clé de date en cours d'édition dans la modale
};

const el = {
  dayNumber: document.getElementById("day-number"),
  dayDate: document.getElementById("day-date"),
  ringProgress: document.getElementById("ring-progress"),
  ringScore: document.getElementById("ring-score"),
  ringPercent: document.getElementById("ring-percent"),
  streakCurrent: document.getElementById("streak-current"),
  streakBest: document.getElementById("streak-best"),
  habitList: document.getElementById("habit-list"),
  historyList: document.getElementById("history-list"),
  viewToday: document.getElementById("view-today"),
  viewHistory: document.getElementById("view-history"),
  tabToday: document.getElementById("tab-today"),
  tabHistory: document.getElementById("tab-history"),
  tabReset: document.getElementById("tab-reset"),
  editModal: document.getElementById("edit-modal"),
  editModalDate: document.getElementById("edit-modal-date"),
  editHabitList: document.getElementById("edit-habit-list"),
  editClose: document.getElementById("edit-close"),
  confirmModal: document.getElementById("confirm-modal"),
  confirmYes: document.getElementById("confirm-yes"),
  confirmNo: document.getElementById("confirm-no"),
};

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#101012" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Construit la liste de boutons habitudes pour une date donnée, dans un
// conteneur donné. `onToggle` est appelé après chaque bascule pour
// rafraîchir l'écran concerné.
function renderHabitButtons(container, key, onToggle) {
  const day = getDay(key);
  container.innerHTML = "";
  for (const habit of HABITS) {
    const done = !!day[habit.key];
    const btn = document.createElement("button");
    btn.className = "habit-btn" + (done ? " done" : "");
    btn.innerHTML = `<span class="check">${done ? CHECK_ICON : ""}</span><span>${habit.label}</span>`;
    btn.addEventListener("click", () => {
      setHabit(key, habit.key, !day[habit.key]);
      onToggle();
    });
    container.appendChild(btn);
  }
}

/* ---------- Rendu : vue "Aujourd'hui" ---------- */

function renderToday() {
  const key = todayKey();
  const day = getDay(key);
  const score = scoreOf(day);
  const percent = Math.round((score / HABITS.length) * 100);

  el.dayNumber.textContent = `Jour ${dayNumberOf(key)}/${TOTAL_DAYS}`;
  el.dayDate.textContent = formatLongDate(key);

  el.ringScore.textContent = `${score}/${HABITS.length}`;
  el.ringPercent.textContent = `${percent}%`;
  const offset = RING_CIRCUMFERENCE * (1 - score / HABITS.length);
  el.ringProgress.style.strokeDasharray = RING_CIRCUMFERENCE;
  el.ringProgress.style.strokeDashoffset = offset;

  const { current, best } = computeStreaks();
  el.streakCurrent.textContent = current;
  el.streakBest.textContent = best;

  renderHabitButtons(el.habitList, key, renderToday);
}

/* ---------- Rendu : vue "Historique" ---------- */

function renderHistory() {
  const today = todayKey();
  const dates = allDatesFromStart(state.data.startDate, today).reverse();
  el.historyList.innerHTML = "";

  if (dates.length === 0) {
    el.historyList.innerHTML = '<p class="history-empty">Aucune journée pour l\'instant.</p>';
    return;
  }

  for (const key of dates) {
    const day = getDay(key);
    const score = scoreOf(day);
    const valid = isValidated(day);

    const row = document.createElement("button");
    row.className = "history-row";
    row.innerHTML = `
      <span class="history-left">
        <span class="history-date">${formatShortDate(key)}</span>
        <span class="history-score">Jour ${dayNumberOf(key)} · ${score}/${HABITS.length} habitudes</span>
      </span>
      <span class="history-badge ${valid ? "valid" : ""}">${valid ? "Validée" : "Non validée"}</span>
    `;
    row.addEventListener("click", () => openEditModal(key));
    el.historyList.appendChild(row);
  }
}

/* ---------- Modale d'édition d'une journée passée ---------- */

function openEditModal(key) {
  state.editingKey = key;
  el.editModalDate.textContent = formatLongDate(key);
  const refresh = () => renderHabitButtons(el.editHabitList, key, refresh);
  refresh();
  el.editModal.classList.remove("hidden");
}

function closeEditModal() {
  el.editModal.classList.add("hidden");
  state.editingKey = null;
  renderToday();
  renderHistory();
}

/* ---------- Navigation par onglets ---------- */

function setTab(tab) {
  state.activeTab = tab;
  el.viewToday.classList.toggle("hidden", tab !== "today");
  el.viewHistory.classList.toggle("hidden", tab !== "history");
  el.tabToday.classList.toggle("active", tab === "today");
  el.tabHistory.classList.toggle("active", tab === "history");
  if (tab === "today") renderToday();
  if (tab === "history") renderHistory();
}

/* ---------- Réinitialisation ---------- */

function resetAll() {
  localStorage.removeItem(STORAGE_KEY);
  state.data = loadData();
  el.confirmModal.classList.add("hidden");
  setTab("today");
}

/* ---------- Bascule automatique à minuit ---------- */

// L'app peut rester ouverte en arrière-plan sur iOS puis revenir au
// premier plan le lendemain. On vérifie régulièrement si la date a
// changé pour rafraîchir l'écran sans action de l'utilisateur.
let renderedDate = todayKey();
function checkMidnightRollover() {
  const now = todayKey();
  if (now !== renderedDate) {
    renderedDate = now;
    setTab(state.activeTab);
  }
}
setInterval(checkMidnightRollover, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkMidnightRollover();
});

/* ---------- Écouteurs d'événements ---------- */

el.tabToday.addEventListener("click", () => setTab("today"));
el.tabHistory.addEventListener("click", () => setTab("history"));
el.tabReset.addEventListener("click", () => el.confirmModal.classList.remove("hidden"));

el.editClose.addEventListener("click", closeEditModal);
el.confirmYes.addEventListener("click", resetAll);
el.confirmNo.addEventListener("click", () => el.confirmModal.classList.add("hidden"));

/* ---------- Démarrage ---------- */

setTab("today");

/* ---------- Enregistrement du service worker (mode hors ligne) ---------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // Échec silencieux : l'app reste fonctionnable en ligne
    });
  });
}
