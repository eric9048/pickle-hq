/* ─────────────────────────────────────────────────────────────
   합동 비서실 · app.js
   Firebase Realtime Database 실시간 대시보드
   ───────────────────────────────────────────────────────────── */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, push, set, update, remove, off
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ── 1. 설정 ─────────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: "AIzaSyAfAAPLfFfI7s_1J-UnLTqUiIMH1ynyZ-Q",
  authDomain: "pickle-hq.firebaseapp.com",
  databaseURL: "https://pickle-hq-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pickle-hq",
  storageBucket: "pickle-hq.firebasestorage.app",
  messagingSenderId: "430667099797",
  appId: "1:430667099797:web:814e36b14ee997e354359c"
};

/* 접속 PIN — 바꾸려면 아래 문자열만 수정하면 됩니다. */
const PIN = "1247";
const AUTH_KEY = "hq.auth.v1";
const THEME_KEY = "hq.theme.v1";

const ROOT = "hq";

const OWNER = {
  robin: "로빈",
  jessi: "제시",
  jerry: "제리",
  boss: "사장님"
};
const STATUS = { doing: "진행 중", waiting: "대기 중", done: "완료" };
const EXEC_STATUS = {
  requested: "실행 요청됨",
  running: "실행 중",
  reported: "결과 보고됨",
  completed: "완료 보고됨"
};
const EXEC_TAG = {
  requested: "▶ 실행 요청",
  running: "▶ 실행 중",
  reported: "📢 결과 보고",
  completed: "📢 완료 보고"
};
const BLOG_STATUS = { published: "발행 완료", draft: "임시저장", hidden: "비공개" };
const THREAD_STATUS = { posted: "게시 완료", drafting: "작성 중", hold: "보류" };
const CAMP_STATUS = { pending: "미제출", doing: "진행 중", submitted: "제출 완료" };

/* 합동 회의실 참여자 */
const PEOPLE = {
  boss: { name: "사장님", emoji: "👑", role: "사장님" },
  robin: { name: "로빈", emoji: "🦉", role: "비서" },
  jessi: { name: "제시", emoji: "✨", role: "비서" },
  jerry: { name: "제리", emoji: "🍀", role: "비서" },
  gemini: { name: "제미나이", emoji: "💎", role: "전략 파트너" },
  chatgpt: { name: "ChatGPT", emoji: "🤖", role: "전략 파트너" }
};
const PEOPLE_ORDER = ["boss", "robin", "jessi", "jerry", "gemini", "chatgpt"];

/* 회의실 "누구에게 말하기" — 사장님 발언(from:"boss")에 붙는 대상입니다. */
const TO_KEY = "hq.meet.to.v1";
const ALL_TO = "all";
const AUDIENCE_ORDER = [ALL_TO, "robin", "jessi", "jerry", "gemini", "chatgpt"];

function savedAudience() {
  try {
    const raw = JSON.parse(localStorage.getItem(TO_KEY) || "null");
    if (Array.isArray(raw)) {
      const keys = raw.filter(k => AUDIENCE_ORDER.includes(k));
      if (keys.includes(ALL_TO)) return new Set([ALL_TO]);
      if (keys.length) return new Set(keys);
    }
  } catch (err) { /* 저장값이 깨졌으면 기본값 */ }
  return new Set([ALL_TO]);
}

/* 제미나이 — API 키는 이 브라우저의 localStorage에만 보관합니다.
   GitHub(공개 저장소)·Firebase RTDB 어디에도 키를 쓰지 않습니다.
   2026-09-18부터 2.5 모델은 기존 사용 프로젝트에만 열려 있어 새 키는 404가 납니다.
   (Google AI Studio Models 페이지 · 신규 프로젝트 권장: 3.8 Flash / 3.5 Flash-Lite) */
const GKEY_KEY = "pickle_hq_gemini_key";
const GMODEL_KEY = "pickle_hq_gemini_model";
const GEMINI_MODELS = [
  { id: "gemini-3.8-flash", label: "gemini-3.8-flash (기본 · 균형)" },
  { id: "gemini-3.5-flash-lite", label: "gemini-3.5-flash-lite (빠름 · 저렴)" },
  { id: "gemini-3.6-flash", label: "gemini-3.6-flash (이전 세대 · 안정)" },
  { id: "gemini-4-hydrogen", label: "gemini-4-hydrogen (최신 Gemini 4 · 고성능)" },
  { id: "gemini-2.5-flash", label: "gemini-2.5-flash (기존 프로젝트만 · 새 키는 404)" }
];
const GEMINI_DEFAULT_MODEL = GEMINI_MODELS[0].id;
const GEMINI_STUDIO_URL = "https://aistudio.google.com/apikey";

/* ChatGPT — OpenAI 키도 제미나이와 똑같이 이 브라우저의 localStorage에만 보관합니다.
   GitHub(공개 저장소)·Firebase RTDB 어디에도 키를 쓰지 않습니다. */
const OKEY_KEY = "pickle_hq_openai_key";
const OMODEL_KEY = "pickle_hq_openai_model";
const OPENAI_MODELS = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini (기본 · 빠름 · 저렴)" },
  { id: "gpt-4o", label: "gpt-4o (고성능 · 느림 · 비쌈)" },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini (신형 경량)" },
  { id: "gpt-4.1", label: "gpt-4.1 (신형 고성능)" }
];
const OPENAI_DEFAULT_MODEL = OPENAI_MODELS[0].id;
const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";

/* ── 2. 상태 ─────────────────────────────────────────────── */

const state = {
  data: null,
  ownerFilter: "all",
  blogFilter: "all",
  say: "boss",
  audience: savedAudience(),
  replyTo: null,
  selectMode: false,
  picked: new Set(),
  ready: false
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function won(n) {
  const v = Number(n) || 0;
  return "₩" + v.toLocaleString("ko-KR");
}

/* ── 캐릭터 아바타 ──────────────────────────────────────────
   assets/avatars/{key}.png 를 원형으로 보여 주고, 이미지가 없거나
   로드에 실패하면 기존 이모지로 자연스럽게 되돌아갑니다. */
const AVATAR_VER = "20261127p";
/* 한글 이름으로 남은 메시지·메모도 같은 캐릭터로 보이게 맞춥니다. */
const PERSON_ALIAS = {
  "사장님": "boss", "박이만": "boss",
  "로빈": "robin", "제시": "jessi", "제리": "jerry", "제미나이": "gemini",
  "ChatGPT": "chatgpt", "chatgpt": "chatgpt", "챗gpt": "chatgpt", "챗GPT": "chatgpt",
  "챗지피티": "chatgpt", "오픈AI": "chatgpt", "OpenAI": "chatgpt"
};
function personKey(k) {
  const s = String(k ?? "");
  return PERSON_ALIAS[s] || s;
}
function avatarHtml(key, cls = "") {
  const k = personKey(key);
  const p = PEOPLE[k] || {};
  const emoji = p.emoji || "👤";
  return `<span class="avatar${cls ? " " + cls : ""}" data-avatar="${esc(k)}" aria-hidden="true">`
    + `<img src="assets/avatars/${esc(k)}.png?v=${AVATAR_VER}" alt="" decoding="async" onerror="this.remove()">`
    + `<span class="av-fb">${emoji}</span></span>`;
}

/* 말하는 사람 칩과 담당자 필터 칩에도 같은 아바타를 붙입니다.
   (이미지가 없으면 위 avatarHtml 의 이모지 폴백이 그대로 보입니다.) */
function paintChipAvatars() {
  $$("#meetAudience .chip[data-to]").forEach(c => {
    const k = c.dataset.to;
    if (k === ALL_TO || !PEOPLE[k] || c.querySelector(".avatar")) return;
    c.innerHTML = avatarHtml(k, "xs") + `<span>${esc(PEOPLE[k].name)}</span>`;
  });
  $$("#ownerFilters .chip[data-owner]").forEach(c => {
    const k = c.dataset.owner;
    if (k === "all" || !OWNER[k] || c.querySelector(".avatar")) return;
    c.innerHTML = avatarHtml(k, "xs") + `<span>${esc(OWNER[k])}</span>`;
  });
}
paintChipAvatars();

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - Number(ts)) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const d = new Date(Number(ts));
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayDiff(due) {
  if (!due) return null;
  const [y, m, d] = String(due).split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

/* ── 3. 잠금 화면 ───────────────────────────────────────── */

const gate = $("#gate");
const appEl = $("#app");

function unlock() {
  gate.hidden = true;
  appEl.hidden = false;
  startBoard();
}

function lock() {
  localStorage.removeItem(AUTH_KEY);
  location.reload();
}

$("#gateForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("#pinInput").value.trim();
  if (v === PIN) {
    localStorage.setItem(AUTH_KEY, "1");
    unlock();
  } else {
    $("#gateError").hidden = false;
    $("#pinInput").value = "";
    $("#pinInput").focus();
  }
});

$("#logoutBtn").addEventListener("click", lock);

/* 테마 */
const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

function paintThemeBtn() {
  $("#themeBtn").textContent = document.documentElement.dataset.theme === "light" ? "☀️" : "🌙";
}
paintThemeBtn();

$("#themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  paintThemeBtn();
});

/* ── 4. Firebase ─────────────────────────────────────────── */

let db = null;

function startBoard() {
  if (state.ready) return;
  state.ready = true;

  try {
    const fb = initializeApp(firebaseConfig);
    db = getDatabase(fb);
  } catch (err) {
    $("#syncState").textContent = "Firebase 초기화 실패";
    console.error(err);
    return;
  }

  onValue(ref(db, ROOT), snap => {
    state.data = snap.val() || {};
    $("#syncState").textContent = "실시간 연결됨 · " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    renderAll();
  }, err => {
    $("#syncState").textContent = "연결 오류: " + err.code;
    console.error(err);
  });
}

/* ── 5. 렌더 ─────────────────────────────────────────────── */

function renderAll() {
  renderHome();
  renderMeeting();
  renderLounge();
  renderTasks();
  renderBlog();
  renderThreads();
  renderCampaigns();
  renderMoney();
  renderFeed();

  const meta = state.data?.meta || {};
  $("#footStamp").textContent = meta.updatedAt
    ? "최근 갱신 " + new Date(Number(meta.updatedAt)).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "초기 데이터 없음";
}

/* 5-1. 업무 보드 */
function tasksArr() {
  const t = state.data?.tasks || {};
  return Object.entries(t)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (Number(b.updatedAt || b.createdAt || 0)) - (Number(a.updatedAt || a.createdAt || 0)));
}

function renderTasks() {
  const all = tasksArr();
  const list = state.ownerFilter === "all" ? all : all.filter(t => t.owner === state.ownerFilter);

  const counts = { doing: 0, waiting: 0, done: 0 };
  all.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const fcounts = { doing: 0, waiting: 0, done: 0 };
  list.forEach(t => { fcounts[t.status] = (fcounts[t.status] || 0) + 1; });

  $$("[data-count]").forEach(el => { el.textContent = fcounts[el.dataset.count] || 0; });
  $$("[data-tabcount]").forEach(el => {
    const k = el.dataset.tabcount;
    el.textContent = k === "all" ? all.length : (counts[k] || 0);
  });

  $("#taskSummary").textContent =
    `${list.length}건` + (state.ownerFilter === "all" ? "" : ` · ${OWNER[state.ownerFilter]}`);

  ["doing", "waiting", "done"].forEach(st => {
    const items = list.filter(t => t.status === st);
    const html = items.length
      ? items.map(t => taskCard(t)).join("")
      : `<div class="empty">비어 있음</div>`;
    const box = $(`[data-list="${st}"]`);
    if (box) box.innerHTML = html;
    const pane = $(`[data-status-list="${st}"]`);
    if (pane) pane.innerHTML = html;
  });
}

function taskDetail(t) {
  return String(t.detail ?? t.description ?? t.notes ?? "");
}

/* 실행 상태 배지 */
function execOf(t) {
  const k = t && t.executionStatus ? String(t.executionStatus) : "";
  return EXEC_STATUS[k] ? k : "";
}

function execTagHtml(t) {
  const k = execOf(t);
  if (!k) return "";
  return `<span class="exec-tag" data-exec="${k}">${EXEC_TAG[k]}</span>`;
}

/* 상세 내용을 회의실용 1~3줄 요약으로 */
function briefLines(text, max = 2, per = 70) {
  return String(text || "")
    .split("\n")
    .map(s => s.replace(/^[\s·•\-–—*]+/, "").trim())
    .filter(s => s && !/^\[[^\]]{1,24}\]$/.test(s))
    .map(s => (s.length > per ? s.slice(0, per).trim() + "…" : s))
    .slice(0, max);
}

function execRequestText(title, owner, detail) {
  return [`▶ [업무 실행 요청] ${title}`, `담당: ${OWNER[owner] || owner}`, ...briefLines(detail, 2)].join("\n");
}

function execReportText(title, owner, detail) {
  return [`📢 [업무 결과 보고] ${title}`, `담당: ${OWNER[owner] || owner}`, ...briefLines(detail, 3)].join("\n");
}
function taskCard(t) {
  const opts = Object.entries(OWNER).map(([k, v]) =>
    `<option value="${k}"${t.owner === k ? " selected" : ""}>${v}</option>`).join("");
  const move = ["doing", "waiting", "done"].map(s =>
    s === t.status ? "" :
      `<button class="mini-btn" data-act="status" data-id="${t.id}" data-status="${s}" type="button">→ ${STATUS[s]}</button>`
  ).join("");
  const detail = taskDetail(t).trim();
  const desc = detail
    ? `<div class="task-desc">${esc(trunc(detail, 110))}</div>`
    : `<div class="task-desc is-empty">상세 내용을 적어 두세요</div>`;

  return `
    <div class="task" data-owner="${esc(t.owner)}" data-status="${esc(t.status)}" data-id="${t.id}" title="눌러서 상세 내용 보기">
      <div class="task-title">${esc(t.title)}</div>
      ${desc}
      <div class="task-meta">
        <span class="owner-pick" title="담당자 · ${esc(OWNER[t.owner] || t.owner)}">
          ${avatarHtml(t.owner, "xs")}
          <select data-act="owner" data-id="${t.id}" aria-label="담당자 변경">${opts}</select>
        </span>
        ${execTagHtml(t)}
        <span class="hint">${timeAgo(t.updatedAt || t.createdAt)}</span>
        <div class="task-actions">
          ${move}
          <button class="mini-btn danger" data-act="del" data-id="${t.id}" type="button">삭제</button>
        </div>
      </div>
    </div>`;
}

$("#ownerFilters").addEventListener("click", e => {
  const btn = e.target.closest("[data-owner]");
  if (!btn) return;
  state.ownerFilter = btn.dataset.owner;
  $$("#ownerFilters .chip").forEach(c => c.classList.toggle("is-on", c === btn));
  renderTasks();
});

$("#taskForm").addEventListener("submit", e => {
  e.preventDefault();
  const title = $("#taskTitle").value.trim();
  if (!title || !db) return;
  const now = Date.now();
  push(ref(db, `${ROOT}/tasks`), {
    title,
    detail: $("#taskDetail").value.replace(/[ \t]+$/gm, "").trim(),
    owner: $("#taskOwner").value,
    status: $("#taskStatus").value,
    createdAt: now,
    updatedAt: now
  });
  $("#taskTitle").value = "";
  $("#taskDetail").value = "";
  $("#taskTitle").focus();
});

$("#tasksView").addEventListener("click", e => {
  if (e.target.closest("select, input, textarea, label")) return;
  const actEl = e.target.closest("[data-act]");
  const act = actEl ? actEl.dataset.act : null;

  if (act === "status" || act === "del") {
    if (!db) return;
    const id = actEl.dataset.id;
    const item = ref(db, `${ROOT}/tasks/${id}`);
    if (act === "status") update(item, { status: actEl.dataset.status, updatedAt: Date.now() });
    else if (confirm("이 업무를 삭제할까요?\n삭제하면 목록과 DB에서 바로 사라지며 되돌릴 수 없습니다.")) {
      if (state.data?.tasks?.[id]) delete state.data.tasks[id];
      remove(item);
      renderTasks();
    }
    return;
  }

  const card = e.target.closest(".task");
  if (card) openTaskSheet(card.dataset.id);
});

$("#tasksView").addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="owner"]');
  if (!sel || !db) return;
  update(ref(db, `${ROOT}/tasks/${sel.dataset.id}`), { owner: sel.value, updatedAt: Date.now() });
});

/* 5-2. 블로그 */
function blogArr() {
  const b = state.data?.content?.blog || {};
  return Object.entries(b)
    .map(([k, v]) => ({ key: k, ...v, no: Number(v.no ?? k.replace(/\D/g, "")) }))
    .sort((a, b2) => a.no - b2.no);
}

function renderBlog() {
  const all = blogArr();
  const pub = all.filter(b => b.status === "published").length;
  const draft = all.filter(b => b.status === "draft").length;
  $("#blogSummary").textContent = `${all.length}편 · 발행 ${pub} · 임시저장 ${draft}`;
  const cnt = $("#blogCount");
  if (cnt) cnt.textContent = all.length;

  const list = state.blogFilter === "all" ? all : all.filter(b => b.status === state.blogFilter);
  const box = $("#blogList");

  if (!list.length) {
    box.innerHTML = `<div class="empty">표시할 글이 없습니다</div>`;
    return;
  }

  box.innerHTML = list.map(b => {
    const cls = b.status === "draft" ? "is-draft" : (b.status === "hidden" ? "is-hidden" : "");
    const opts = Object.entries(BLOG_STATUS).map(([k, v]) =>
      `<option value="${k}"${b.status === k ? " selected" : ""}>${v}</option>`).join("");
    const date = b.date ? String(b.date).slice(5).replace("-", "/") : "";
    return `
      <div class="blog-row ${cls}" data-key="${esc(b.key)}">
        <span class="blog-no">${b.no}</span>
        <span class="blog-title" data-act="edit-title" data-key="${esc(b.key)}" title="클릭해서 제목 수정">${esc(b.title)}</span>
        <span class="blog-date">${esc(date)}</span>
        <select data-act="blog-status" data-key="${esc(b.key)}" aria-label="${b.no}호 상태">${opts}</select>
      </div>`;
  }).join("");
}

$("#blogFilters").addEventListener("click", e => {
  const btn = e.target.closest("[data-blog]");
  if (!btn) return;
  state.blogFilter = btn.dataset.blog;
  $$("#blogFilters .chip").forEach(c => c.classList.toggle("is-on", c === btn));
  renderBlog();
});

$("#blogList").addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="blog-status"]');
  if (!sel || !db) return;
  update(ref(db, `${ROOT}/content/blog/${sel.dataset.key}`), { status: sel.value, updatedAt: Date.now() });
});

$("#blogList").addEventListener("click", e => {
  if (e.target.closest("select, input") || e.target.closest('[data-act="edit-title"]')) return;
  const row = e.target.closest(".blog-row");
  if (row) openBlogSheet(row.dataset.key);
});

$("#blogList").addEventListener("click", e => {
  const span = e.target.closest('[data-act="edit-title"]');
  if (!span || !db) return;
  if (span.dataset.editing) return;
  const key = span.dataset.key;
  const original = span.textContent;
  span.dataset.editing = "1";
  span.innerHTML = `<input type="text" value="${esc(original)}" style="width:100%" aria-label="제목 수정">`;
  const input = span.querySelector("input");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const finish = (save) => {
    const v = input.value.trim();
    span.dataset.editing = "";
    if (save && v && v !== original) {
      update(ref(db, `${ROOT}/content/blog/${key}`), { title: v, updatedAt: Date.now() });
    } else {
      renderBlog();
    }
  };

  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
    if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
});

/* 5-3. 스레드 */
function renderThreads() {
  const t = state.data?.content?.threads || {};
  const arr = Object.entries(t).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.order || 0) - (a.order || 0));

  const box = $("#threadList");
  const cnt = $("#threadCount");
  if (cnt) cnt.textContent = arr.length;
  if (!arr.length) { box.innerHTML = `<div class="empty">등록된 스레드가 없습니다</div>`; return; }

  box.innerHTML = arr.map(s => {
    const opts = Object.entries(THREAD_STATUS).map(([k, v]) =>
      `<option value="${k}"${s.status === k ? " selected" : ""}>${v}</option>`).join("");
    const link = s.url ? `<a class="mini-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">게시물 열기 ↗</a>` : "";
    return `
      <div class="mini-item" data-id="${s.id}">
        <div class="mini-top">
          <span class="mini-title">${esc(s.title)}</span>
          <select data-act="thread-status" data-id="${s.id}" aria-label="스레드 상태">${opts}</select>
        </div>
        <div class="mini-sub">
          <span>${esc(s.date || "")}</span>
          ${s.chars ? `<span>${esc(s.chars)}자</span>` : ""}
          ${link}
        </div>
      </div>`;
  }).join("");
}

$("#threadList").addEventListener("click", e => {
  if (e.target.closest("select, a")) return;
  const item = e.target.closest(".mini-item");
  if (item) openThreadSheet(item.dataset.id);
});

$("#threadList").addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="thread-status"]');
  if (!sel || !db) return;
  update(ref(db, `${ROOT}/content/threads/${sel.dataset.id}`), { status: sel.value, updatedAt: Date.now() });
});

/* 5-4. 캠페인 */
function renderCampaigns() {
  const c = state.data?.content?.campaigns || {};
  const arr = Object.entries(c).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => String(a.due || "").localeCompare(String(b.due || "")));

  const box = $("#campaignList");
  const cnt = $("#campaignCount");
  if (cnt) cnt.textContent = arr.length;
  if (!arr.length) { box.innerHTML = `<div class="empty">등록된 캠페인이 없습니다</div>`; return; }

  box.innerHTML = arr.map(k => {
    const opts = Object.entries(CAMP_STATUS).map(([v, label]) =>
      `<option value="${v}"${k.status === v ? " selected" : ""}>${label}</option>`).join("");
    const d = dayDiff(k.due);
    const cls = d === null ? "" : (d < 0 ? "past" : (d <= 2 ? "urgent" : ""));
    const label = d === null ? "" : (d === 0 ? "D-DAY" : (d > 0 ? `D-${d}` : `마감 ${Math.abs(d)}일 지남`));
    const due = k.due ? String(k.due).slice(5).replace("-", "/") : "";
    return `
      <div class="mini-item" data-id="${k.id}">
        <div class="mini-top">
          <span class="mini-title">${esc(k.name)}</span>
          ${label ? `<span class="dday ${cls}">${label}</span>` : ""}
        </div>
        <div class="mini-sub">
          <span>${esc(k.channel || "")}</span>
          <span>마감 ${esc(due)}</span>
          <select data-act="camp-status" data-id="${k.id}" aria-label="캠페인 상태">${opts}</select>
        </div>
      </div>`;
  }).join("");
}

$("#campaignList").addEventListener("click", e => {
  if (e.target.closest("select")) return;
  const item = e.target.closest(".mini-item");
  if (item) openCampaignSheet(item.dataset.id);
});

$("#campaignList").addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="camp-status"]');
  if (!sel || !db) return;
  update(ref(db, `${ROOT}/content/campaigns/${sel.dataset.id}`), { status: sel.value, updatedAt: Date.now() });
});

/* 5-5. 수익 · 장부 */
function renderMoney() {
  const f = state.data?.finance || {};
  const aff = f.affiliate || {};
  const det = f.detailing || {};
  const box = $("#moneyGrid");

  const cards = [];

  if (aff.total) {
    cards.push(`
      <div class="money accent">
        <h4>11월 제휴 매출 합계</h4>
        <div class="big">${won(aff.total.revenue)} <small>${aff.total.orders || 0}건</small></div>
        <div class="lines">
          <span>순이익 <b>${won(aff.total.profit)}</b></span>
          <span>${esc(aff.note || "조회 시점 기준")}</span>
        </div>
      </div>`);
  }

  if (aff.coupang) {
    cards.push(`
      <div class="money clickable" data-go="coupang">
        <h4>쿠팡 파트너스</h4>
        <div class="big">${won(aff.coupang.revenue)} <small>${aff.coupang.orders || 0}건</small></div>
        <div class="lines">
          <span>순이익 <b>${won(aff.coupang.profit)}</b></span>
          <span>${esc(aff.coupang.note || "")}</span>
        </div>
      </div>`);
  }

  if (aff.shopconnect) {
    cards.push(`
      <div class="money clickable" data-go="shopconnect">
        <h4>네이버 쇼핑커넥트</h4>
        <div class="big">${won(aff.shopconnect.revenue)} <small>${aff.shopconnect.orders || 0}건</small></div>
        <div class="lines">
          <span>세전 수수료 <b>${won(aff.shopconnect.profit)}</b></span>
          <span>${esc(aff.shopconnect.note || "")}</span>
        </div>
      </div>`);
  }

  if (det.jobs !== undefined) {
    cards.push(`
      <div class="money green clickable" data-go="detailing">
        <h4>세차 · 디테일링 부업 (11월 누계)</h4>
        <div class="big">${Number(det.jobs).toLocaleString("ko-KR")}회 <small>예상 급여 ${won(det.netPay)}</small></div>
        <div class="lines">
          <span>예상 청구합 <b>${won(det.billed)}</b> · 외부 지급 60% ${won(det.partnerShare)}</span>
          <span>${esc(det.note || "")}</span>
        </div>
      </div>`);
  }

  box.innerHTML = cards.join("") + (f.updatedLabel
    ? `<div class="money"><h4>갱신 기준</h4><div class="lines"><span>${esc(f.updatedLabel)}</span></div></div>`
    : "");

  renderRevenueDetail();
}

/* 5-6. 피드 */
function renderFeed() {
  const f = state.data?.feed || {};
  const arr = Object.entries(f).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
    .slice(0, 60);

  const box = $("#feedList");
  if (!arr.length) { box.innerHTML = `<div class="empty">아직 메모가 없습니다. 첫 메모를 남겨 보세요.</div>`; return; }

  box.innerHTML = arr.map(m => `
    <div class="msg">
      <div class="msg-top">
        <span class="who ${esc(personKey(m.from))}">${avatarHtml(m.from, "xs")}<span>${esc(OWNER[m.from] || m.from)}</span></span>
        <span class="msg-time">${timeAgo(m.ts)}</span>
        <button class="mini-btn danger" data-act="del-feed" data-id="${m.id}" type="button" title="삭제">✕</button>
      </div>
      <div class="msg-text">${esc(m.text)}</div>
    </div>`).join("");
}

$("#feedForm").addEventListener("submit", e => {
  e.preventDefault();
  sendFeed();
});

$("#feedText").addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    sendFeed();
  }
});

function sendFeed() {
  const ta = $("#feedText");
  const text = ta.value.trim();
  if (!text || !db) return;
  push(ref(db, `${ROOT}/feed`), {
    from: $("#feedFrom").value,
    text,
    ts: Date.now()
  });
  ta.value = "";
  ta.focus();
}

$("#feedList").addEventListener("click", e => {
  const btn = e.target.closest('[data-act="del-feed"]');
  if (!btn || !db) return;
  if (confirm("이 메모를 삭제할까요?")) remove(ref(db, `${ROOT}/feed/${btn.dataset.id}`));
});

/* 5-7. 합동 회의실 */
let meetSig = "";
let meetLastId = null;
let meetForceScroll = false;

function clock(ts) {
  if (!ts) return "";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function meetMessages() {
  const m = state.data?.meeting?.messages || {};
  return Object.entries(m)
    .map(([id, v]) => ({
      id,
      from: v && v.from ? String(v.from) : "robin",
      text: v && v.text != null ? String(v.text) : "",
      ts: Number(v && v.ts) || 0,
      to: v && Array.isArray(v.to) ? v.to.map(String) : [],
      replyTo: v && v.replyTo && typeof v.replyTo === "object"
        ? {
            id: v.replyTo.id != null ? String(v.replyTo.id) : "",
            from: v.replyTo.from != null ? String(v.replyTo.from) : "",
            text: v.replyTo.text != null ? String(v.replyTo.text) : ""
          }
        : null
    }))
    .filter(v => v.text.trim())
    .sort((a, b) => a.ts - b.ts || String(a.id).localeCompare(String(b.id)));
}

function renderMeeting(force) {
  const arr = meetMessages();
  renderMeetingPeople(arr);
  renderMeetingTopic();
  $("#meetSummary").textContent = arr.length
    ? `${arr.length}개 메시지 · 참여자 ${PEOPLE_ORDER.length}명`
    : `참여자 ${PEOPLE_ORDER.length}명`;
  const mc = $("#meetMsgCount");
  if (mc) mc.textContent = arr.length;

  const room = $("#meetRoom");
  room.classList.toggle("is-selecting", state.selectMode);
  paintSelBar();

  const sig = arr.map(m => `${m.id}:${m.ts}:${m.from}:${m.text}`).join("\u0001");
  if (!force && sig === meetSig) return;

  const nearBottom = room.scrollHeight - room.scrollTop - room.clientHeight < 90;
  const prevLast = meetLastId;
  const keepTop = force ? room.scrollTop : 0;
  meetSig = sig;
  meetLastId = arr.length ? arr[arr.length - 1].id : null;

  if (!arr.length) {
    room.innerHTML = `<div class="empty">아직 대화가 없습니다. 첫 메시지를 남겨 보세요.</div>`;
    paintAiNotes();
    return;
  }

  room.innerHTML = arr.map(m => {
    const pk = personKey(m.from);
    const p = PEOPLE[pk] || { name: m.from, emoji: "👤" };
    const mine = m.from === "boss";
    const rt = m.replyTo;
    const quote = rt && (rt.text || rt.from)
      ? `<button class="reply-quote" type="button" data-act="jump" data-target="${esc(rt.id || "")}"
                 title="원본 말풍선으로 이동">
           <b>${esc(PEOPLE[rt.from]?.name || rt.from || "메시지")}에게 답장</b>
           <span>${esc(trunc(rt.text || rt.raw || "", 70))}</span>
         </button>`
      : "";
    const picked = state.picked.has(m.id);
    const toLabel = m.to.length ? audienceLabel(m.to) : "";
    const toTag = toLabel && toLabel !== "모두"
      ? `<span class="to-tag">→ ${esc(toLabel)}</span>`
      : "";
    return `
      <div class="bubble ${esc(pk)}${mine ? " is-mine" : ""}${picked ? " is-picked" : ""}" data-id="${esc(m.id)}">
        <button class="pick" type="button" data-act="pick" data-id="${esc(m.id)}"
                aria-pressed="${picked ? "true" : "false"}"
                aria-label="이 말풍선 선택">${picked ? "✓" : ""}</button>
        ${avatarHtml(m.from)}
        <div class="bubble-body">
          <div class="bubble-top">
            <b>${esc(p.name)}</b>${toTag}
            <span>${clock(m.ts)}</span>
            <div class="bubble-acts">
              <button class="bubble-act" data-act="reply" data-id="${esc(m.id)}" type="button" title="답장" aria-label="이 메시지에 답장">↩<span class="ba-txt"> 답장</span></button>
              <button class="bubble-act" data-act="copy" data-id="${esc(m.id)}" type="button" title="복사" aria-label="이 메시지 복사">📋<span class="ba-txt"> 복사</span></button>
              <button class="bubble-del" data-act="del-meet" data-id="${esc(m.id)}" type="button" title="메시지 삭제" aria-label="메시지 삭제">✕</button>
            </div>
          </div>
          <div class="bubble-text">${quote}${esc(m.text)}</div>
        </div>
      </div>`;
  }).join("");

  if (meetForceScroll || prevLast === null || nearBottom) {
    meetForceScroll = false;
    room.scrollTop = room.scrollHeight;
  } else if (keepTop) {
    room.scrollTop = keepTop;
  }
  paintAiNotes();
}

/* 비서별 사용량 (hq/usage/{robin|jessi|jerry}) */
function usageToneOf(pct) {
  if (pct == null) return "none";
  if (pct >= 85) return "danger";
  if (pct >= 60) return "warn";
  return "ok";
}

function usageLabelOf(pct) {
  if (pct == null) return "미입력";
  if (pct >= 85) return "한도 경고";
  if (pct >= 60) return "한도 주의";
  return "여유";
}

function usageData(k) {
  const u = state.data?.usage?.[k];
  const raw = u && u.usedPct;
  const num = raw == null || raw === "" ? NaN : Number(raw);
  const pct = Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : null;
  let label = u && u.label != null && String(u.label).trim()
    ? String(u.label).trim()
    : "";
  if (!label) label = usageLabelOf(pct);
  /* 숫자가 있는데 라벨이 "미입력"으로 남아 있으면 단계 라벨로 보여 줍니다. */
  if (pct != null && label === "미입력") label = usageLabelOf(pct);
  return {
    pct,
    tone: usageToneOf(pct),
    label,
    note: u && u.note != null ? String(u.note) : "",
    updatedAt: Number(u && u.updatedAt) || 0
  };
}

function donutSvg(pct, tone) {
  const C = 2 * Math.PI * 18;
  const off = pct == null ? C : C * (1 - pct / 100);
  return `
    <span class="donut${pct == null ? " is-empty" : ""}" aria-hidden="true">
      <svg viewBox="0 0 44 44">
        <circle class="donut-track" cx="22" cy="22" r="18"></circle>
        <circle class="donut-bar" cx="22" cy="22" r="18" transform="rotate(-90 22 22)"
                stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
      </svg>
      <span class="donut-pct">${pct == null ? "--" : pct + "%"}</span>
    </span>`;
}

/* 제미나이·ChatGPT — API 키 연결 상태 카드. 누르면 키 설정 시트가 열립니다. */
function aiPersonCard(k, on, model, attr, where) {
  const p = PEOPLE[k];
  const label = on ? "키 연결됨" : "키 미설정";
  const sub2 = on ? model : "눌러서 입력";
  const title = on
    ? `${p.name} · ${label} · ${model} — 눌러서 키·모델 변경`
    : `${p.name} · ${label} (눌러서 입력) — ${where} 키를 넣으면 회의실에서 답합니다`;
  return `
      <button class="person ${k}" type="button" ${attr} data-on="${on ? "true" : "false"}"
              title="${esc(title)}"
              aria-label="${esc(title)}">
        ${avatarHtml(k)}
        <span class="person-text">
          <b>${esc(p.name)} <span class="live" aria-hidden="true"></span></b>
          <small class="u-label">${esc(label)}</small>
          <small class="u-time">${esc(sub2)}</small>
        </span>
        <span class="key-mark" aria-hidden="true">${on ? "🔑" : "＋"}</span>
      </button>`;
}

function renderMeetingPeople(arr) {
  const lastBy = {};
  arr.forEach(m => { lastBy[m.from] = m.ts; });

  $("#meetPeople").innerHTML = PEOPLE_ORDER.map(k => {
    const p = PEOPLE[k];
    const ts = lastBy[k];
    const status = k === "boss" ? "접속 중" : "참여 중";

    if (k === "boss") {
      const sub = status + (ts ? ` · ${clock(ts)}` : "");
      return `
      <div class="person boss" title="${esc(p.name)} · ${esc(sub)}">
        ${avatarHtml(k)}
        <span class="person-text">
          <b>${esc(p.name)} <span class="live" aria-hidden="true"></span></b>
          <small>${esc(sub)}</small>
        </span>
      </div>`;
    }

    /* 제미나이 — API 키 연결 상태 카드 */
    if (k === "gemini") {
      return aiPersonCard(k, !!geminiKey(), geminiModel(), 'data-gemini="settings"', "Google AI Studio");
    }

    /* ChatGPT — 같은 방식의 API 키 카드 */
    if (k === "chatgpt") {
      return aiPersonCard(k, !!chatgptKey(), chatgptModel(), 'data-chatgpt="settings"', "OpenAI Platform");
    }

    const u = usageData(k);
    const when = u.updatedAt ? timeAgo(u.updatedAt) : "갱신 전";
    const title = u.pct == null
      ? `${p.name} · 사용량 미입력 · ${when} — 눌러서 입력`
      : `${p.name} · 사용 ${u.pct}% · ${u.label} · ${when} 갱신 — 눌러서 수정`;
    const aria = u.pct == null
      ? `${p.name} 사용량 미입력, ${when}. 눌러서 입력`
      : `${p.name} 사용량 ${u.pct}%, ${u.label}, ${when} 갱신. 눌러서 수정`;
    return `
      <button class="person ${k} has-usage" type="button" data-usage="${k}" data-tone="${u.tone}"
              title="${esc(title)}"
              aria-label="${esc(aria)}">
        ${avatarHtml(k)}
        <span class="person-text">
          <b>${esc(p.name)} <span class="live" aria-hidden="true"></span></b>
          <small class="u-label"><span class="u-use">${u.pct == null ? "" : `사용 ${u.pct}% · `}</span>${esc(u.label)}</small>
          <small class="u-time"><span class="u-ago">${esc(when)}</span> <span class="u-suffix">갱신</span></small>
        </span>
        ${donutSvg(u.pct, u.tone)}
      </button>`;
  }).join("");
}

$("#meetPeople").addEventListener("click", e => {
  const g = e.target.closest("[data-gemini]");
  if (g) { openGeminiSheet(); return; }
  const c = e.target.closest("[data-chatgpt]");
  if (c) { openChatgptSheet(); return; }
  const btn = e.target.closest("[data-usage]");
  if (!btn) return;
  openUsageSheet(btn.dataset.usage);
});

function meetTopic() {
  const t = state.data?.meeting?.topic;
  if (typeof t === "string") return { text: t, by: "" };
  return { text: t && t.text != null ? String(t.text) : "", by: t && t.by ? String(t.by) : "" };
}

function renderMeetingTopic() {
  const el = $("#meetTopicText");
  if (el.dataset.editing) return;
  const { text, by } = meetTopic();
  el.textContent = text || "안건을 정해 주세요";
  el.classList.toggle("is-empty", !text);
  $("#meetTopicWho").textContent = by && PEOPLE[by] ? `· ${PEOPLE[by].name}` : "";
}

$("#meetTopicEdit").addEventListener("click", () => {
  const el = $("#meetTopicText");
  if (el.dataset.editing || !db) return;
  const { text } = meetTopic();
  el.dataset.editing = "1";
  el.innerHTML = `<input type="text" maxlength="140" value="${esc(text)}" placeholder="오늘 회의 안건" aria-label="안건 수정">`;
  const input = el.querySelector("input");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let done = false;
  const finish = save => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    delete el.dataset.editing;
    if (save) {
      const topic = { text: v, by: state.say, updatedAt: Date.now() };
      if (state.data) {
        state.data.meeting = state.data.meeting || {};
        state.data.meeting.topic = topic;
      }
      set(ref(db, `${ROOT}/meeting/topic`), topic);
    }
    renderMeetingTopic();
  };

  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
    if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
});

function paintAudience() {
  const cur = audienceList();
  $$("#meetAudience .chip[data-to]").forEach(c =>
    c.classList.toggle("is-on", cur.includes(c.dataset.to)));
  const ta = $("#meetText");
  if (ta) ta.placeholder = `${audienceLabel(cur)}에게 말하기 · Enter 전송 · Shift+Enter 줄바꿈`;
}

/* "누구에게 말하기" 칩 — 1명·여러 명 고르거나 모두 */
function audienceList() {
  const a = state.audience;
  if (!a || !a.size || a.has(ALL_TO)) return [ALL_TO];
  return AUDIENCE_ORDER.filter(k => k !== ALL_TO && a.has(k));
}

function audienceLabel(list) {
  const arr = Array.isArray(list) ? list : audienceList();
  if (!arr.length || arr.includes(ALL_TO)) return "모두";
  return arr.map(k => PEOPLE[k]?.name || k).join(" · ");
}

$("#meetAudience").addEventListener("click", e => {
  const btn = e.target.closest("[data-to]");
  if (!btn) return;
  const k = btn.dataset.to;
  if (k === ALL_TO) {
    state.audience = new Set([ALL_TO]);
  } else {
    const next = new Set([...state.audience].filter(x => x !== ALL_TO));
    if (next.has(k)) next.delete(k);
    else next.add(k);
    if (!next.size) next.add(ALL_TO);
    state.audience = next;
  }
  try { localStorage.setItem(TO_KEY, JSON.stringify([...state.audience])); } catch (err) { console.error(err); }
  paintAudience();
  $("#meetText").focus();
});

function autoGrow(ta) {
  ta.style.height = "auto";
  const need = ta.scrollHeight + 2; // border 1px × 2
  ta.style.height = Math.min(need, 140) + "px";
  ta.style.overflowY = need > 140 ? "auto" : "hidden";
}

/* 발화자는 항상 사장님(boss). "누구에게 말하기" 대상에게 전달하고,
   대상에 포함된 AI(제미나이·ChatGPT)는 자동으로 답합니다. */
function botKey(b) {
  return b === "gemini" ? geminiKey() : chatgptKey();
}

function openBotSheet(b) {
  if (b === "gemini") openGeminiSheet();
  else openChatgptSheet();
}

/* 이 메시지에 답할 AI 목록 — 선택한 대상 중 AI + @로 직접 부른 AI */
function botsToCall(text, targets) {
  let list = targets.includes(ALL_TO)
    ? ["gemini", "chatgpt"]
    : targets.filter(k => k === "gemini" || k === "chatgpt");
  list = [...list];
  if (/@\s*(제미나이|gemini)/i.test(text) && !list.includes("gemini")) list.push("gemini");
  if (/@\s*(chatgpt|챗gpt|챗지피티|openai)/i.test(text) && !list.includes("chatgpt")) list.push("chatgpt");
  return list;
}

function sendMeet() {
  const ta = $("#meetText");
  if (!db) return;
  const text = ta.value.trim();
  if (!text) return;
  const reply = state.replyTo;
  const targets = audienceList();
  const bots = botsToCall(text, targets);
  const onlyBot = !targets.includes(ALL_TO) && targets.length === 1
    && (targets[0] === "gemini" || targets[0] === "chatgpt");

  /* 방금 보낼 메시지는 따로 전달하므로, 시스템 프롬프트는 보내기 전 대화로 만듭니다. */
  const prompts = {};
  bots.forEach(b => { prompts[b] = b === "gemini" ? geminiSystemPrompt() : chatgptSystemPrompt(); });

  geminiErr = "";
  geminiInfo = "";
  chatgptErr = "";
  chatgptInfo = "";
  meetForceScroll = true;
  const payload = { from: "boss", text, ts: Date.now(), to: targets };
  if (reply) payload.replyTo = { id: reply.id, from: reply.from, text: trunc(reply.text, 200) };
  push(ref(db, `${ROOT}/meeting/messages`), payload);

  const ask = reply
    ? `(답장 대상 — ${PEOPLE[reply.from]?.name || reply.from}: ${trunc(reply.text, 200)})\n${text}`
    : text;
  clearReply();
  ta.value = "";
  autoGrow(ta);
  ta.focus();

  const called = [];
  const skipped = [];
  bots.forEach(b => {
    if (botKey(b)) called.push(b);
    else skipped.push(b);
  });

  /* 특정 AI만 골랐는데 키가 없으면 그 AI의 설정 시트를 엽니다. */
  if (onlyBot && skipped.includes(targets[0])) {
    openBotSheet(targets[0]);
    return;
  }
  if (!called.length) {
    if (skipped.length) toast(`${skipped.map(b => PEOPLE[b].name).join(" · ")} 키가 없어 AI 응답은 건너뛰었습니다`);
    return;
  }
  if (skipped.length) {
    toast(`${skipped.map(b => PEOPLE[b].name).join(" · ")} 키가 없어 건너뛰었습니다`);
  }

  called.forEach(b => {
    if (b === "gemini") askGemini(ask, prompts[b]);
    else askChatGPT(ask, prompts[b]);
  });
}

$("#meetForm").addEventListener("submit", e => {
  e.preventDefault();
  sendMeet();
});

$("#meetText").addEventListener("input", e => autoGrow(e.target));

$("#meetText").addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.shiftKey) return;
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  sendMeet();
});

$("#meetRoom").addEventListener("click", e => {
  const actEl = e.target.closest("[data-act]");
  const act = actEl ? actEl.dataset.act : "";

  if (act === "del-meet") {
    if (!db) return;
    if (confirm("이 메시지를 삭제할까요?\n삭제하면 목록과 DB에서 바로 사라지며 되돌릴 수 없습니다.")) {
      remove(ref(db, `${ROOT}/meeting/messages/${actEl.dataset.id}`));
    }
    return;
  }
  if (act === "copy") {
    const m = meetMessages().find(x => x.id === actEl.dataset.id);
    if (m) doCopy(m.text);
    return;
  }
  if (act === "reply") {
    const m = meetMessages().find(x => x.id === actEl.dataset.id);
    if (m) setReply(m);
    return;
  }
  if (act === "jump") {
    jumpToBubble(actEl.dataset.target);
    return;
  }
  if (act === "pick") {
    togglePick(actEl.dataset.id);
    return;
  }
  if (state.selectMode) {
    const b = e.target.closest(".bubble[data-id]");
    if (b) togglePick(b.dataset.id);
  }
});

/* ── 답장 · 복사 · 선택 ───────────────────────────────────── */
let toastTimer = 0;

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1700);
}

async function copyText(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (err) { /* 아래 폴백으로 */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    return false;
  }
}

function doCopy(text) {
  copyText(text).then(ok => {
    toast(ok ? "복사했습니다" : "복사하지 못했습니다 — 본문을 길게 눌러 선택해 주세요");
  });
}

/* 답장 */
function setReply(m) {
  state.replyTo = { id: m.id, from: m.from, text: m.text };
  paintReply();
  const ta = $("#meetText");
  if (ta) ta.focus();
}

function clearReply() {
  state.replyTo = null;
  paintReply();
}

function paintReply() {
  const bar = $("#meetReply");
  if (!bar) return;
  const r = state.replyTo;
  bar.hidden = !r;
  if (!r) return;
  const who = $("#meetReplyWho");
  const snip = $("#meetReplySnip");
  if (who) who.textContent = PEOPLE[r.from]?.name || r.from || "메시지";
  if (snip) snip.textContent = trunc(r.text, 60);
}

$("#meetReplyCancel").addEventListener("click", () => { clearReply(); $("#meetText").focus(); });

function jumpToBubble(id) {
  if (!id) { toast("원본 메시지를 찾을 수 없습니다"); return; }
  const room = $("#meetRoom");
  const el = [...room.querySelectorAll(".bubble[data-id]")].find(b => b.dataset.id === id);
  if (!el) { toast("원본 메시지가 삭제되어 찾을 수 없습니다"); return; }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("is-flash");
  setTimeout(() => el.classList.remove("is-flash"), 1600);
}

/* 선택 모드 */
function paintSelBar() {
  const bar = $("#meetSelBar");
  const btn = $("#meetSelectBtn");
  if (btn) {
    btn.classList.toggle("is-on", state.selectMode);
    btn.setAttribute("aria-pressed", state.selectMode ? "true" : "false");
    btn.textContent = state.selectMode ? "☑ 선택 중" : "☑ 선택";
  }
  if (bar) bar.hidden = !state.selectMode;
  const c = $("#meetSelCount");
  if (c) c.textContent = `${state.picked.size}개 선택`;
}

function toggleSelectMode(on) {
  state.selectMode = typeof on === "boolean" ? on : !state.selectMode;
  if (!state.selectMode) state.picked.clear();
  renderMeeting(true);
}

function togglePick(id) {
  if (!state.selectMode || !id) return;
  if (state.picked.has(id)) state.picked.delete(id);
  else state.picked.add(id);
  const el = [...$("#meetRoom").querySelectorAll(".bubble[data-id]")].find(b => b.dataset.id === id);
  if (el) {
    const on = state.picked.has(id);
    el.classList.toggle("is-picked", on);
    const p = el.querySelector(".pick");
    if (p) { p.setAttribute("aria-pressed", on ? "true" : "false"); p.textContent = on ? "✓" : ""; }
  }
  paintSelBar();
}

$("#meetSelectBtn").addEventListener("click", () => toggleSelectMode());
$("#meetSelDone").addEventListener("click", () => toggleSelectMode(false));

$("#meetSelAll").addEventListener("click", () => {
  const arr = meetMessages();
  if (!arr.length) return;
  if (state.picked.size >= arr.length) state.picked.clear();
  else arr.forEach(m => state.picked.add(m.id));
  renderMeeting(true);
});

$("#meetSelCopy").addEventListener("click", () => {
  const arr = meetMessages().filter(m => state.picked.has(m.id));
  if (!arr.length) { toast("먼저 말풍선을 골라 주세요"); return; }
  const body = arr.map(m => {
    const who = PEOPLE[m.from]?.name || m.from;
    return `[${who} ${clock(m.ts)}] ${m.text}`;
  }).join("\n");
  copyText(body).then(ok => {
    toast(ok ? `${arr.length}개 메시지를 복사했습니다` : "복사하지 못했습니다 — 본문을 길게 눌러 선택해 주세요");
  });
});

$("#meetSelDel").addEventListener("click", () => {
  if (!db) return;
  const ids = [...state.picked];
  if (!ids.length) { toast("먼저 말풍선을 골라 주세요"); return; }
  if (!confirm(`선택한 ${ids.length}개 메시지를 삭제할까요?\n삭제하면 목록과 DB에서 바로 사라지며 되돌릴 수 없습니다.`)) return;
  ids.forEach(id => remove(ref(db, `${ROOT}/meeting/messages/${id}`)));
  state.picked.clear();
  renderMeeting(true);
  toast(`${ids.length}개 메시지를 삭제했습니다`);
});

paintAudience();

/* ── 5-8. 제미나이 (Gemini API) ────────────────────────────────
   · API 키는 localStorage(pickle_hq_gemini_key)에만 저장
   · 호출은 브라우저에서 Google Generative Language API로 직접
   · 결과는 hq/meeting/messages 에 from:"gemini" 로 등록            */

let geminiBusy = false;
let geminiErr = "";
let geminiInfo = "";

function geminiKey() {
  try { return String(localStorage.getItem(GKEY_KEY) || "").trim(); }
  catch (err) { return ""; }
}

function geminiModel() {
  let m = "";
  try { m = String(localStorage.getItem(GMODEL_KEY) || ""); } catch (err) { m = ""; }
  return GEMINI_MODELS.some(x => x.id === m) ? m : GEMINI_DEFAULT_MODEL;
}

function wantsGemini(text) {
  return /제미나이|gemini/i.test(String(text || ""));
}

/* 방금 대화 맥락 — 시스템 프롬프트에 넣을 최근 12건 */
function geminiHistory(n = 12) {
  return meetMessages().slice(-n)
    .map(m => `[${PEOPLE[m.from]?.name || m.from}] ${trunc(m.text, 300)}`)
    .join("\n");
}

function geminiDoingTasks() {
  const doing = tasksArr().filter(t => t.status === "doing").slice(0, 12);
  if (!doing.length) return "(진행 중 업무 없음)";
  return doing.map(t => `- ${t.title} (담당: ${OWNER[t.owner] || t.owner})`).join("\n");
}

function geminiSystemPrompt() {
  const topic = meetTopic().text || "아직 정해지지 않음";
  return [
    "당신은 '제미나이'입니다. 박이만 사장님과 피클 비서 3명(로빈·제시·제리)이 함께 쓰는 '합동 비서실'의 다섯 번째 참여자이자 전략 파트너입니다.",
    "역할: 아이디어 브레인스토밍, 사업·콘텐츠 전략 검증, 의사결정에 필요한 근거와 대안 제시. 로빈·제시·제리와 같은 편에서 사장님의 일을 돕습니다.",
    "답변 규칙:",
    "1) 한국어로 쓰고, 사장님을 '사장님'이라고 부릅니다.",
    "2) 이 답변은 회의실 대화창에 그대로 올라갑니다. 인사말·자기소개 없이 본론부터, 3~6문장 또는 짧은 목록으로 간결하게 씁니다.",
    "3) 확인되지 않은 수치나 사실은 단정하지 말고 '추정'이라고 밝힙니다. 모르면 모른다고 말합니다.",
    "4) 가족·금융 같은 민감한 사적 사정은 먼저 꺼내지 않습니다.",
    "5) 마지막에 사장님이 바로 할 수 있는 다음 한 걸음을 한 줄로 제안합니다.",
    "",
    `현재 안건: ${topic}`,
    "",
    "최근 회의실 대화(오래된 것부터):",
    geminiHistory(12) || "(대화 없음)",
    "",
    "업무 보드 진행 중:",
    geminiDoingTasks()
  ].join("\n");
}

function geminiErrorText(status, data) {
  const err = data && data.error ? data.error : {};
  const msg = err && err.message ? String(err.message) : "";
  const reason = Array.isArray(err && err.details)
    ? String((err.details.find(d => d && d.reason) || {}).reason || "")
    : "";
  if (/API_KEY_INVALID|API key not valid/i.test(reason + " " + msg)) {
    return `API 키가 올바르지 않습니다 (HTTP ${status}). Google AI Studio에서 키를 다시 확인해 주세요.`;
  }
  if (status === 400) return `요청이 거부되었습니다 (HTTP 400). 키와 모델을 확인해 주세요.` + (msg ? ` — ${trunc(msg, 90)}` : "");
  if (status === 403) return "이 키로는 호출이 허용되지 않습니다 (HTTP 403). 키 제한(리퍼러·IP)·API 사용 설정·결제 상태를 확인해 주세요.";
  if (status === 404) return "이 키로는 어떤 Gemini 모델도 응답하지 않았습니다 (HTTP 404). 💎 설정에서 모델을 gemini-3.8-flash로 바꾸거나, AI Studio에서 새 키를 발급해 주세요.";
  if (status === 429) return "무료 할당량을 넘었습니다 (HTTP 429). 잠시 뒤 다시 시도하거나 다른 모델을 골라 주세요.";
  if (status >= 500) return `Gemini 서버가 잠시 응답하지 않습니다 (HTTP ${status}). 잠시 뒤 다시 시도해 주세요.`;
  return `Gemini 호출에 실패했습니다 (HTTP ${status}).` + (msg ? ` ${trunc(msg, 90)}` : "");
}

function geminiNoteHtml(kind, text) {
  const body = kind === "loading"
    ? `<span class="typing" aria-hidden="true"><i></i><i></i><i></i></span> ${esc(text)}`
    : esc(text);
  return `
    <div class="bubble gemini is-${kind}" data-gemini-note="1" role="status">
      ${avatarHtml("gemini")}
      <div class="bubble-body">
        <div class="bubble-top"><b>제미나이</b><span>${kind === "loading" ? "작성 중" : "안내"}</span></div>
        <div class="bubble-text">${body}</div>
      </div>
    </div>`;
}

/* 회의실 안의 임시 안내(로딩·오류) — DB에는 남기지 않습니다. */
function paintGeminiNote() {
  const room = $("#meetRoom");
  if (!room) return;
  $$('[data-gemini-note="1"]', room).forEach(el => el.remove());
  if (geminiBusy) {
    room.insertAdjacentHTML("beforeend", geminiNoteHtml("loading", "제미나이가 답변 작성 중..."));
    room.scrollTop = room.scrollHeight;
  } else if (geminiErr) {
    room.insertAdjacentHTML("beforeend", geminiNoteHtml("error", geminiErr));
    room.scrollTop = room.scrollHeight;
  } else if (geminiInfo) {
    room.insertAdjacentHTML("beforeend", geminiNoteHtml("info", geminiInfo));
    room.scrollTop = room.scrollHeight;
  }
}

async function askGemini(userText, systemText) {
  const key = geminiKey();
  if (!key) { openGeminiSheet(); return false; }
  if (geminiBusy) return false;

  const model = geminiModel();
  const sys = systemText || geminiSystemPrompt();
  const ask = String(userText || "").trim()
    || "지금까지의 대화와 현재 안건을 바탕으로 사장님이 바로 쓸 수 있는 핵심 의견 2~3가지와 다음 한 걸음을 제안해 주세요.";

  geminiBusy = true;
  geminiErr = "";
  geminiInfo = "";
  paintGeminiNote();

  try {
    /* 404(이 키로 쓸 수 없는 모델)면 다음 모델로 넘어갑니다. 성공한 모델은 localStorage에 저장. */
    const chain = [model, ...GEMINI_MODELS.map(m => m.id).filter(id => id !== model)];
    let res = null;
    let data = null;
    let usedModel = model;
    let switched = false;

    for (const id of chain) {
      const generationConfig = { temperature: 0.7, maxOutputTokens: 4096 };
      /* 2.5 모델은 thinking을 꺼야 답변이 잘리지 않습니다. */
      if (/^gemini-2\.5/.test(id)) {
        generationConfig.maxOutputTokens = 1400;
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent?key=${encodeURIComponent(key)}`;
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts: [{ text: ask }] }],
          generationConfig
        })
      });
      data = await res.json().catch(() => null);
      if (res.ok) { usedModel = id; switched = id !== model; break; }
      if (res.status === 404) continue;
      break;
    }
    if (!res || !res.ok) {
      geminiErr = geminiErrorText(res ? res.status : 0, data);
      return false;
    }
    if (switched) {
      try { localStorage.setItem(GMODEL_KEY, usedModel); } catch (e) { console.error(e); }
      geminiInfo = `${model} 모델을 이 키로는 쓸 수 없어 ${usedModel}로 답했습니다. 모델은 💎 설정에서 바꿀 수 있습니다.`;
    }

    const cand = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
    const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
    const text = parts.map(p => (p && p.text ? p.text : "")).join("").trim();

    if (!text) {
      if (data && data.promptFeedback && data.promptFeedback.blockReason) {
        geminiErr = "요청이 안전 정책으로 차단되어 답변을 받지 못했습니다. 표현을 바꿔 다시 시도해 주세요.";
      } else if (cand && cand.finishReason === "MAX_TOKENS") {
        geminiErr = "답변이 길어 잘렸습니다. 다시 시도하거나 더 짧게 물어봐 주세요.";
      } else {
        geminiErr = "Gemini가 빈 답변을 돌려줬습니다. 다시 시도해 주세요.";
      }
      return false;
    }
    if (!db) {
      geminiErr = "DB에 연결되어 있지 않아 회의실에 등록하지 못했습니다.";
      return false;
    }

    meetForceScroll = true;
    push(ref(db, `${ROOT}/meeting/messages`), {
      from: "gemini",
      text: text.length > 4000 ? text.slice(0, 4000) : text,
      ts: Date.now()
    });
    return true;
  } catch (err) {
    geminiErr = (err && err.name === "TypeError")
      ? "네트워크에서 Gemini에 연결하지 못했습니다. 연결 상태나 광고 차단 확장을 확인해 주세요."
      : "Gemini 호출 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.";
    console.error(err);
    return false;
  } finally {
    geminiBusy = false;
    paintGeminiNote();
    renderMeeting();
  }
}

/* ── 제미나이 설정 시트 ── */
function openGeminiSheet(flash) {
  const key = geminiKey();
  const model = geminiModel();
  const opts = GEMINI_MODELS.map(m =>
    `<option value="${m.id}"${m.id === model ? " selected" : ""}>${esc(m.label)}</option>`).join("");

  openSheet("💎 제미나이 설정", `
    <div class="gemini-guide">
      <b>🔒 이 기기 브라우저에만 저장됩니다</b>
      <span>Gemini API 키는 이 브라우저의 <b>localStorage</b>에만 보관되며 GitHub 저장소·Firebase DB로 전송되지 않습니다. 다른 기기나 브라우저에서는 다시 입력해야 합니다.</span>
    </div>
    <div class="sheet-field">
      <span class="sheet-label">Gemini API 키</span>
      <input id="geminiKeyInput" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"
             placeholder="${key ? "저장된 키 사용 중 — 바꾸려면 새 키를 붙여넣으세요" : "AIza… 로 시작하는 API 키"}"
             aria-label="Gemini API 키">
      <span class="sheet-hint">${key
        ? "키가 연결되어 있습니다. 입력창을 비우고 저장하면 기존 키가 그대로 유지됩니다."
        : "키가 아직 없습니다. 아래 Google AI Studio에서 무료로 발급받아 붙여넣으세요."}</span>
    </div>
    <div class="sheet-field">
      <span class="sheet-label">모델</span>
      <select id="geminiModel" aria-label="Gemini 모델">${opts}</select>
      <span class="sheet-hint">기본은 gemini-3.8-flash · 응답이 느리면 gemini-3.5-flash-lite로 바꿔 보세요. 2.5 모델은 새로 만든 키에서 404가 나므로 아래쪽 "기존 프로젝트"용만 쓰세요.</span>
    </div>
    <div class="sheet-row">
      <span class="k">키 발급</span>
      <span class="v"><a class="mini-link" href="${GEMINI_STUDIO_URL}" target="_blank" rel="noopener noreferrer">Google AI Studio 열기 ↗</a></span>
    </div>
    <div class="sheet-sep"></div>
    <div class="sheet-save">
      <span class="saved-flag" id="geminiSaved"${flash ? "" : " hidden"}>${esc(flash || "")}</span>
      <button class="mini-btn danger" type="button" data-gemini-act="clear">키 삭제</button>
      <button class="btn primary" type="button" data-gemini-act="save">저장</button>
    </div>
    <p class="sheet-hint">키가 있으면 회의실에서 <b>누구에게 말하기</b>에 <b>제미나이</b>(또는 모두)를 고르고 <b>보내기</b>를 누를 때, 또는 본문에 <b>@제미나이</b>를 넣었을 때 Gemini가 맥락을 읽고 답합니다. 키가 없으면 이 시트가 열립니다.</p>
  `);
}

function saveGeminiSettings() {
  const kEl = $("#geminiKeyInput");
  const mEl = $("#geminiModel");
  const entered = kEl ? kEl.value.trim() : "";
  const model = mEl && GEMINI_MODELS.some(m => m.id === mEl.value) ? mEl.value : geminiModel();

  try {
    localStorage.setItem(GMODEL_KEY, model);
    if (entered) localStorage.setItem(GKEY_KEY, entered);
  } catch (err) {
    console.error(err);
  }

  geminiErr = "";
  geminiInfo = "";
  renderMeeting();

  let flash = entered ? "키를 저장했습니다 — 이 브라우저에만 보관됩니다" : "모델을 저장했습니다";
  if (entered && !/^AIza/.test(entered)) {
    flash = "저장했습니다. 다만 AIza… 형식이 아니어서 호출이 실패할 수 있습니다";
  }
  openGeminiSheet(flash);
}

function clearGeminiSettings() {
  try { localStorage.removeItem(GKEY_KEY); } catch (err) { console.error(err); }
  geminiErr = "";
  geminiInfo = "";
  renderMeeting();
  openGeminiSheet("키를 삭제했습니다");
}

/* 상세 시트와 같은 DOM을 씁니다(sheetEl 상수는 아래 6-3에서 선언되므로 여기서는 직접 조회). */
$("#sheet").addEventListener("click", e => {
  const btn = e.target.closest("[data-gemini-act]");
  if (!btn) return;
  if (btn.dataset.geminiAct === "save") saveGeminiSettings();
  else if (btn.dataset.geminiAct === "clear") clearGeminiSettings();
});

/* ── 5-9. ChatGPT (OpenAI API) ──────────────────────────────
   · API 키는 localStorage(pickle_hq_openai_key)에만 저장
   · 호출은 브라우저에서 api.openai.com 으로 직접
   · 결과는 hq/meeting/messages 에 from:"chatgpt" 로 등록            */

let chatgptBusy = false;
let chatgptErr = "";
let chatgptInfo = "";

function chatgptKey() {
  try { return String(localStorage.getItem(OKEY_KEY) || "").trim(); }
  catch (err) { return ""; }
}

function chatgptModel() {
  let m = "";
  try { m = String(localStorage.getItem(OMODEL_KEY) || ""); } catch (err) { m = ""; }
  return OPENAI_MODELS.some(x => x.id === m) ? m : OPENAI_DEFAULT_MODEL;
}

function wantsChatGpt(text) {
  return /chatgpt|챗gpt|챗지피티|openai/i.test(String(text || ""));
}

/* 방금 대화 맴락 — 시스템 프롬프트에 넣을 최근 12건 */
function chatgptHistory(n = 12) {
  return meetMessages().slice(-n)
    .map(m => `[${PEOPLE[m.from]?.name || m.from}] ${trunc(m.text, 300)}`)
    .join("\n");
}

function chatgptDoingTasks() {
  const doing = tasksArr().filter(t => t.status === "doing").slice(0, 12);
  if (!doing.length) return "(진행 중 업무 없음)";
  return doing.map(t => `- ${t.title} (담당: ${OWNER[t.owner] || t.owner})`).join("\n");
}

function chatgptSystemPrompt() {
  const topic = meetTopic().text || "아직 정해지지 않음";
  return [
    "당신은 'ChatGPT'라는 이름으로 합동 비서실 회의실에 초대된 AI입니다. 박이만 사장님과 피클 비서 3명(로빈·제시·제리), 그리고 전략 파트너 제미나이가 함께 쓰는 회의실의 여섯 번째 참여자입니다.",
    "우리는 한 팀입니다. 로빈·제시·제리·제미나이와 같은 편에서 사장님의 일을 돕습니다. 이들은 각자 블로그 취재·글쓰기, 쇼핑커넥트·쿠팡 파트너스 제휴, 스레드 운영을 맡고 있습니다.",
    "사장님의 사업: 네이버 블로그(eric_pm)로 자동차 전장·차량용품 정보 글을 쓰고 쇼핑커넥트·쿠팡 파트너스 제휴로 수익을 내며, 스레드(@eric_yiman)와 네이버 클립으로 유입을 만듭니다. 목표는 하루 10만원 부수입입니다.",
    "답변 규칙:",
    "1) 한국어로 쓰고, 사장님을 '사장님'이라고 부릅니다.",
    "2) 이 답변은 회의실 대화창에 그대로 올라갑니다. 인사말·자기소개 없이 본론부터, 3~6문장 또는 짧은 목록으로 간결하게 씁니다.",
    "3) 확인되지 않은 수치나 사실은 단정하지 말고 '추정'이라고 밝힙니다. 모르면 모른다고 말합니다.",
    "4) 가족·금융 같은 민감한 사적 사정은 먼저 꺼내지 않습니다.",
    "5) 마지막에 사장님이 바로 할 수 있는 다음 한 걸음을 한 줄로 제안합니다.",
    "",
    `현재 안건: ${topic}`,
    "",
    "최근 회의실 대화(오래된 것부터):",
    chatgptHistory(12) || "(대화 없음)",
    "",
    "업무 보드 진행 중:",
    chatgptDoingTasks()
  ].join("\n");
}

function chatgptErrorText(status, data) {
  const err = data && data.error ? data.error : {};
  const code = err && err.code ? String(err.code) : "";
  const msg = err && err.message ? String(err.message) : "";
  if (status === 401) return "OpenAI API 키가 올바르지 않거나 취소된 키입니다 (HTTP 401). 🤖 설정에서 키를 다시 확인해 주세요.";
  if (status === 403) return "이 키로는 호출이 허용되지 않습니다 (HTTP 403). 키 권한·결제 상태·지역 제한을 확인해 주세요.";
  if (code === "insufficient_quota") return "이 키의 사용 한도·크레딧이 바닥났습니다 (quota). OpenAI 결제·사용량 페이지에서 크레딧을 확인해 주세요.";
  if (status === 429) return "요청이 너무 많거나 사용 한도를 넘었습니다 (HTTP 429). OpenAI 결제·크레딧(Billing) 잔액과 요금제 한도를 확인해 주세요 — 크레딧이 0이면 이 429가 납니다.";
  if (status === 404 || code === "model_not_found") return "이 키로는 어떤 GPT 모델도 응답하지 않았습니다 (HTTP 404). 🤖 설정에서 gpt-4o-mini로 바꾸거나 새 키를 발급해 주세요.";
  if (status === 400) return "요청이 거부되었습니다 (HTTP 400). 키와 모델을 확인해 주세요." + (msg ? ` — ${trunc(msg, 90)}` : "");
  if (status >= 500) return `OpenAI 서버가 잠시 응답하지 않습니다 (HTTP ${status}). 잠시 뒤 다시 시도해 주세요.`;
  return `ChatGPT 호출에 실패했습니다 (HTTP ${status}).` + (msg ? ` ${trunc(msg, 90)}` : "");
}

function chatgptNoteHtml(kind, text) {
  const body = kind === "loading"
    ? `<span class="typing" aria-hidden="true"><i></i><i></i><i></i></span> ${esc(text)}`
    : esc(text);
  return `
    <div class="bubble chatgpt is-${kind}" data-chatgpt-note="1" role="status">
      ${avatarHtml("chatgpt")}
      <div class="bubble-body">
        <div class="bubble-top"><b>ChatGPT</b><span>${kind === "loading" ? "작성 중" : "안내"}</span></div>
        <div class="bubble-text">${body}</div>
      </div>
    </div>`;
}

/* 회의실 안의 임시 안내(로딩·오류) — DB에는 남기지 않습니다. */
function paintChatgptNote() {
  const room = $("#meetRoom");
  if (!room) return;
  $$('[data-chatgpt-note="1"]', room).forEach(el => el.remove());
  if (chatgptBusy) {
    room.insertAdjacentHTML("beforeend", chatgptNoteHtml("loading", "ChatGPT가 답변 작성 중..."));
    room.scrollTop = room.scrollHeight;
  } else if (chatgptErr) {
    room.insertAdjacentHTML("beforeend", chatgptNoteHtml("error", chatgptErr));
    room.scrollTop = room.scrollHeight;
  } else if (chatgptInfo) {
    room.insertAdjacentHTML("beforeend", chatgptNoteHtml("info", chatgptInfo));
    room.scrollTop = room.scrollHeight;
  }
}

function paintAiNotes() {
  paintGeminiNote();
  paintChatgptNote();
}

async function askChatGPT(userText, systemText) {
  const key = chatgptKey();
  if (!key) { openChatgptSheet(); return false; }
  if (chatgptBusy) return false;

  const model = chatgptModel();
  const sys = systemText || chatgptSystemPrompt();
  const ask = String(userText || "").trim()
    || "지금까지의 대화와 현재 안건을 바탕으로 사장님이 바로 쓸 수 있는 핵심 의견 2~3가지와 다음 한 걸음을 제안해 주세요.";

  chatgptBusy = true;
  chatgptErr = "";
  chatgptInfo = "";
  paintChatgptNote();

  try {
    /* 404(이 키로 쓸 수 없는 모델)면 다음 모델로 넘어갑니다. 성공한 모델은 localStorage에 저장. */
    const chain = [model, ...OPENAI_MODELS.map(m => m.id).filter(id => id !== model)];
    let res = null;
    let data = null;
    let usedModel = model;
    let switched = false;

    for (const id of chain) {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`
        },
        body: JSON.stringify({
          model: id,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: ask }
          ],
          temperature: 0.7,
          max_tokens: 1200
        })
      });
      data = await res.json().catch(() => null);
      if (res.ok) { usedModel = id; switched = id !== model; break; }
      const code = data && data.error && data.error.code ? String(data.error.code) : "";
      if (res.status === 404 || code === "model_not_found") continue;
      break;
    }
    if (!res || !res.ok) {
      chatgptErr = chatgptErrorText(res ? res.status : 0, data);
      return false;
    }
    if (switched) {
      try { localStorage.setItem(OMODEL_KEY, usedModel); } catch (e) { console.error(e); }
      chatgptInfo = `${model} 모델을 이 키로는 쓸 수 없어 ${usedModel}로 답했습니다. 모델은 🤖 설정에서 바꿀 수 있습니다.`;
    }

    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const msg = choice && choice.message ? choice.message : null;
    const raw = msg && msg.content != null ? String(msg.content) : "";
    const text = raw.trim();

    if (!text) {
      if (msg && msg.refusal) {
        chatgptErr = "요청이 안전 정책으로 거절되어 답변을 받지 못했습니다. 표현을 바꿔 다시 시도해 주세요.";
      } else if (choice && choice.finish_reason === "length") {
        chatgptErr = "답변이 길어 잘렸습니다. 다시 시도하거나 더 짧게 물어봐 주세요.";
      } else {
        chatgptErr = "ChatGPT가 빈 답변을 돌려췄습니다. 다시 시도해 주세요.";
      }
      return false;
    }
    if (!db) {
      chatgptErr = "DB에 연결되어 있지 않아 회의실에 등록하지 못했습니다.";
      return false;
    }

    meetForceScroll = true;
    push(ref(db, `${ROOT}/meeting/messages`), {
      from: "chatgpt",
      text: text.length > 4000 ? text.slice(0, 4000) : text,
      ts: Date.now()
    });
    return true;
  } catch (err) {
    chatgptErr = (err && err.name === "TypeError")
      ? "OpenAI에 연결하지 못했습니다 — 키가 취소·오류였거나 이 브라우저의 직접 호출이 막힌 경우입니다(OpenAI는 오류 응답에 CORS 헤더를 주지 않아 브라우저에서는 원인이 가려집니다). 🤖 설정에서 키를 다시 확인하고, 계속 안 되면 휴대폰·PC 브라우저에서 한 번 시도해 주세요."
      : "ChatGPT 호출 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.";
    console.error(err);
    return false;
  } finally {
    chatgptBusy = false;
    paintChatgptNote();
    renderMeeting();
  }
}

/* ── ChatGPT 설정 시트 ── */
function openChatgptSheet(flash) {
  const key = chatgptKey();
  const model = chatgptModel();
  const opts = OPENAI_MODELS.map(m =>
    `<option value="${m.id}"${m.id === model ? " selected" : ""}>${esc(m.label)}</option>`).join("");

  openSheet("🤖 ChatGPT 설정", `
    <div class="chatgpt-guide">
      <b>🔒 이 기기 브라우저에만 저장됩니다</b>
      <span>OpenAI API 키는 이 브라우저의 <b>localStorage</b>에만 보관되며 GitHub 저장소·Firebase DB로 전송되지 않습니다. 다른 기기나 브라우저에서는 다시 입력해야 합니다.</span>
    </div>
    <div class="sheet-field">
      <span class="sheet-label">OpenAI API 키</span>
      <input id="chatgptKeyInput" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"
             placeholder="${key ? "저장된 키 사용 중 — 바꾸려면 새 키를 붙여넣으세요" : "sk-… 로 시작하는 API 키"}"
             aria-label="OpenAI API 키">
      <span class="sheet-hint">${key
        ? "키가 연결되어 있습니다. 입력창을 비우고 저장하면 기존 키가 그대로 유지됩니다."
        : "키가 아직 없습니다. 아래 OpenAI Platform에서 발급받아 붙여넣으세요."}</span>
    </div>
    <div class="sheet-field">
      <span class="sheet-label">모델</span>
      <select id="chatgptModel" aria-label="ChatGPT 모델">${opts}</select>
      <span class="sheet-hint">기본은 gpt-4o-mini(빠르고 저렴) · 더 깊은 답이 필요하면 gpt-4o로 바꿔 보세요.</span>
    </div>
    <div class="sheet-row">
      <span class="k">키 발급</span>
      <span class="v"><a class="mini-link" href="${OPENAI_KEYS_URL}" target="_blank" rel="noopener noreferrer">OpenAI Platform 열기 ↗</a></span>
    </div>
    <div class="sheet-sep"></div>
    <div class="sheet-save">
      <span class="saved-flag" id="chatgptSaved"${flash ? "" : " hidden"}>${esc(flash || "")}</span>
      <button class="mini-btn danger" type="button" data-chatgpt-act="clear">키 삭제</button>
      <button class="btn primary" type="button" data-chatgpt-act="save">저장</button>
    </div>
    <p class="sheet-hint">키가 있으면 회의실에서 <b>누구에게 말하기</b>에 <b>ChatGPT</b>(또는 모두)를 고르고 <b>보내기</b>를 누를 때, 또는 본문에 <b>@ChatGPT</b>를 넣었을 때 맥락을 읽고 답합니다. 키가 없으면 이 시트가 열립니다.</p>
  `);
}

function saveChatgptSettings() {
  const kEl = $("#chatgptKeyInput");
  const mEl = $("#chatgptModel");
  const entered = kEl ? kEl.value.trim() : "";
  const model = mEl && OPENAI_MODELS.some(m => m.id === mEl.value) ? mEl.value : chatgptModel();

  try {
    localStorage.setItem(OMODEL_KEY, model);
    if (entered) localStorage.setItem(OKEY_KEY, entered);
  } catch (err) {
    console.error(err);
  }

  chatgptErr = "";
  chatgptInfo = "";
  renderMeeting();

  let flash = entered ? "키를 저장했습니다 — 이 브라우저에만 보관됩니다" : "모델을 저장했습니다";
  if (entered && !/^sk-/.test(entered)) {
    flash = "저장했습니다. 다만 sk-… 형식이 아니어서 호출이 실패할 수 있습니다";
  }
  openChatgptSheet(flash);
}

function clearChatgptSettings() {
  try { localStorage.removeItem(OKEY_KEY); } catch (err) { console.error(err); }
  chatgptErr = "";
  chatgptInfo = "";
  renderMeeting();
  openChatgptSheet("키를 삭제했습니다");
}

$("#sheet").addEventListener("click", e => {
  const btn = e.target.closest("[data-chatgpt-act]");
  if (!btn) return;
  if (btn.dataset.chatgptAct === "save") saveChatgptSettings();
  else if (btn.dataset.chatgptAct === "clear") clearChatgptSettings();
});

/* ── 5-10. AI 수다방 (hq/lounge/messages) ─────────────────────
   로빈·제시·제리·제미나이·ChatGPT가 서로 이름을 부르며 수다를 떠는 공간.
   설정된 AI(제미나이·ChatGPT)가 실시간 릴레이로 한마디씩 이어 갑니다.
   키는 여기서도 localStorage 밖으로 나가지 않습니다. */

let loungeSig = "";
let loungeBusy = false;
let loungeErr = "";
let loungeInfo = "";

function loungeMessages() {
  const m = state.data?.lounge?.messages || {};
  return Object.entries(m)
    .map(([id, v]) => ({
      id,
      from: v && v.from ? String(v.from) : "robin",
      text: v && v.text != null ? String(v.text) : "",
      ts: Number(v && v.ts) || 0
    }))
    .filter(v => v.text.trim())
    .sort((a, b) => a.ts - b.ts || String(a.id).localeCompare(String(b.id)));
}

function loungeNoteHtml(kind, text) {
  const body = kind === "loading"
    ? `<span class="typing" aria-hidden="true"><i></i><i></i><i></i></span> ${esc(text)}`
    : esc(text);
  return `
    <div class="bubble robin is-${kind}" data-lounge-note="1" role="status">
      ${avatarHtml("robin")}
      <div class="bubble-body">
        <div class="bubble-top"><b>수다방</b><span>${kind === "loading" ? "진행 중" : "안내"}</span></div>
        <div class="bubble-text">${body}</div>
      </div>
    </div>`;
}

function paintLoungeNote() {
  const room = $("#loungeRoom");
  if (!room) return;
  $$('[data-lounge-note="1"]', room).forEach(el => el.remove());
  if (loungeBusy) {
    room.insertAdjacentHTML("beforeend", loungeNoteHtml("loading", "AI들이 수다 이어가는 중..."));
    room.scrollTop = room.scrollHeight;
  } else if (loungeErr) {
    room.insertAdjacentHTML("beforeend", loungeNoteHtml("error", loungeErr));
    room.scrollTop = room.scrollHeight;
  } else if (loungeInfo) {
    room.insertAdjacentHTML("beforeend", loungeNoteHtml("info", loungeInfo));
    room.scrollTop = room.scrollHeight;
  }
}

function renderLounge(force) {
  const room = $("#loungeRoom");
  if (!room) return;
  const arr = loungeMessages();
  const sum = $("#loungeSummary");
  if (sum) sum.textContent = arr.length ? `${arr.length}마디 · 다섯 AI` : "아직 조용함";

  const sig = arr.map(m => `${m.id}:${m.ts}:${m.from}:${m.text}`).join("\u0001");
  if (!force && sig === loungeSig) return;
  loungeSig = sig;

  const nearBottom = room.scrollHeight - room.scrollTop - room.clientHeight < 90;
  if (!arr.length) {
    room.innerHTML = `<div class="empty">아직 수다가 없습니다. 🎲 AI 수다 한 판을 눌러 시작해 보세요.</div>`;
    paintLoungeNote();
    return;
  }

  room.innerHTML = arr.map(m => {
    const pk = personKey(m.from);
    const p = PEOPLE[pk] || { name: m.from };
    return `
      <div class="bubble ${esc(pk)}${pk === "boss" ? " is-mine" : ""}" data-id="${esc(m.id)}">
        ${avatarHtml(m.from)}
        <div class="bubble-body">
          <div class="bubble-top"><b>${esc(p.name)}</b><span>${clock(m.ts)}</span></div>
          <div class="bubble-text">${esc(m.text)}</div>
        </div>
      </div>`;
  }).join("");

  if (nearBottom || loungeBusy || force) room.scrollTop = room.scrollHeight;
  paintLoungeNote();
}

function loungeContext(n = 10) {
  return loungeMessages().slice(-n)
    .map(m => `${PEOPLE[m.from]?.name || m.from}: ${trunc(m.text, 240)}`)
    .join("\n") || "(수다 없음)";
}

function loungeSystemPrompt(kind) {
  const me = PEOPLE[kind]?.name || kind;
  return [
    `당신은 합동 비서실의 '${me}'입니다. 지금은 일이 아니라 쉬는 시간, 로빈·제시·제리·제미나이·ChatGPT와 사장님이 모인 'AI 수다방'입니다.`,
    "사무적인 보고가 아니라 서로 이름을 부르며 가볍게 티키타카하는 잡담을 합니다.",
    "규칙:",
    "1) 한국어, 반말 섞은 편한 말투로 1~3문장. 인사말·자기소개·목록·보고체 금지.",
    "2) 바로 앞 사람의 말을 받아서 반응·반박·농담·아이디어 중 하나로만 이어 갑니다. 다른 AI 이름을 한 번은 불러 줍니다.",
    "3) 가족·금융 같은 민감한 사적 사정은 꺼내지 않습니다. 확인되지 않은 수치는 단정하지 않습니다.",
    "4) 이모지는 0~2개까지만.",
    "",
    "최근 수다(오래된 것부터):",
    loungeContext(10)
  ].join("\n");
}

/* 수다방 전용 가벼운 호출 — 회의실 기록은 건드리지 않습니다. */
async function loungeGemini(sys, ask) {
  const key = geminiKey();
  const model = geminiModel();
  const generationConfig = { temperature: 0.95, maxOutputTokens: 700 };
  if (/^gemini-2\.5/.test(model)) {
    generationConfig.maxOutputTokens = 600;
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: ask }] }],
      generationConfig
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: geminiErrorText(res.status, data) };
  const cand = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
  const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
  const text = parts.map(p => (p && p.text ? p.text : "")).join("").trim();
  if (!text) return { error: "제미나이가 빈 답변을 돌려줬습니다. 다시 시도해 주세요." };
  return { text };
}

async function loungeChatgpt(sys, ask) {
  const key = chatgptKey();
  const model = chatgptModel();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: ask }
      ],
      temperature: 0.95,
      max_tokens: 500
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: chatgptErrorText(res.status, data) };
  const msg = data && data.choices && data.choices[0] ? data.choices[0].message : null;
  const text = msg && msg.content != null ? String(msg.content).trim() : "";
  if (!text) return { error: "ChatGPT가 빈 답변을 돌려줬습니다. 다시 시도해 주세요." };
  return { text };
}

async function loungeTurn(kind) {
  const sys = loungeSystemPrompt(kind);
  const ask = `${PEOPLE[kind].name}로서, 방금까지의 수다를 이어서 다음 한마디만 해 주세요. 1~3문장, 반말 섞은 편한 말투로.`;
  try {
    const r = kind === "gemini" ? await loungeGemini(sys, ask) : await loungeChatgpt(sys, ask);
    if (r.error) { loungeErr = r.error; return false; }
    if (!db) { loungeErr = "DB에 연결되어 있지 않아 수다방에 올리지 못했습니다."; return false; }
    push(ref(db, `${ROOT}/lounge/messages`), {
      from: kind,
      text: r.text.length > 1200 ? r.text.slice(0, 1200) : r.text,
      ts: Date.now()
    });
    return true;
  } catch (err) {
    loungeErr = (err && err.name === "TypeError")
      ? "AI에 연결하지 못했습니다. 키가 올바른지, 광고 차단 확장이 막고 있지 않은지 확인해 주세요."
      : "AI 호출 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.";
    console.error(err);
    return false;
  }
}

function loungeSleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* 제미나이 → ChatGPT 순서로 한마디씩 주고받게 합니다. */
async function loungeRelay(turns = 4) {
  if (loungeBusy) return;
  const order = ["gemini", "chatgpt"].filter(b => botKey(b));
  if (!order.length) {
    toast("제미나이 또는 ChatGPT 키가 필요합니다");
    openGeminiSheet();
    return;
  }
  const n = order.length === 1 ? 2 : turns;
  loungeBusy = true;
  loungeErr = "";
  loungeInfo = "";
  paintLoungeNote();
  try {
    for (let i = 0; i < n; i++) {
      const b = order[i % order.length];
      const ok = await loungeTurn(b);
      if (!ok) break;
      await loungeSleep(400);
    }
  } finally {
    loungeBusy = false;
    paintLoungeNote();
    renderLounge(true);
  }
}

$("#loungePlayBtn").addEventListener("click", () => loungeRelay(4));


/* ── 6. 홈 · 상세 시트 · 라우팅 ─────────────────────────────── */

const ROUTE_KEY = "hq.route.v1";
const VIEW_IDS = ["home", "meeting", "tasks", "content", "revenue"];
const DEFAULT_PANE = { home: "", meeting: "room", tasks: "all", content: "blog", revenue: "all" };

function trunc(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function tsFull(ts) {
  if (!ts) return "-";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* 6-1. 홈 요약 */
function renderHome() {
  const msgs = meetMessages();
  const last = msgs[msgs.length - 1];
  const topic = meetTopic().text;
  const tasks = tasksArr();
  const doing = tasks.filter(t => t.status === "doing").length;
  const waiting = tasks.filter(t => t.status === "waiting").length;
  const done = tasks.filter(t => t.status === "done").length;
  const blog = blogArr();
  const pub = blog.filter(b => b.status === "published").length;
  const draft = blog.filter(b => b.status === "draft").length;
  const threads = Object.values(state.data?.content?.threads || {});
  const camps = Object.values(state.data?.content?.campaigns || {});
  const campsOpen = camps.filter(c => c.status !== "submitted").length;
  const f = state.data?.finance || {};
  const aff = f.affiliate || {};
  const det = f.detailing || {};

  $("#homeGrid").innerHTML = `
    <button class="home-card meet" data-go="meeting" type="button">
      <span class="hc-top">💬 합동 회의실</span>
      <span class="hc-avs">${PEOPLE_ORDER.map(k => avatarHtml(k, "sm")).join("")}</span>
      <span class="hc-big">${msgs.length}개 메시지</span>
      <span class="hc-sub">${last
        ? `${esc(PEOPLE[last.from]?.name || last.from)} · ${clock(last.ts)} — ${esc(trunc(last.text, 34))}`
        : "아직 대화가 없습니다. 첫 메시지를 남겨 보세요."}</span>
      <span class="hc-sub">${topic ? `안건 · ${esc(trunc(topic, 30))}` : "안건 미정"}</span>
      <span class="hc-go">회의실 들어가기 →</span>
    </button>

    <button class="home-card tasks" data-go="tasks" type="button">
      <span class="hc-top">📋 업무 보드</span>
      <span class="hc-big">${doing + waiting}건 남음</span>
      <span class="hc-sub">진행 중 ${doing} · 대기 중 ${waiting} · 완료 ${done} · 전체 ${tasks.length}건</span>
      <span class="hc-sub">카드를 누르면 상세 내용을 바로 보고 고칠 수 있습니다</span>
      <span class="hc-go">업무 보드 열기 →</span>
    </button>

    <button class="home-card content" data-go="content" type="button">
      <span class="hc-top">📝 콘텐츠 현황</span>
      <span class="hc-big">${blog.length}편</span>
      <span class="hc-sub">발행 ${pub} · 임시저장 ${draft}</span>
      <span class="hc-sub">스레드 ${threads.length}건 · 캠페인 미제출 ${campsOpen}</span>
      <span class="hc-go">콘텐츠 보기 →</span>
    </button>

    <button class="home-card revenue" data-go="revenue" type="button">
      <span class="hc-top">💰 수익 · 장부</span>
      <span class="hc-big">${won(aff.total?.revenue || 0)}</span>
      <span class="hc-sub">제휴 순이익 ${won(aff.total?.profit || 0)}</span>
      <span class="hc-sub">세차·디테일링 예상 급여 ${won(det.netPay || 0)}</span>
      <span class="hc-go">수익·장부 열기 →</span>
    </button>
  `;

  $("#homeStamp").textContent = new Date().toLocaleDateString("ko-KR", {
    month: "long", day: "numeric", weekday: "short"
  });
}

/* 6-2. 수익 상세 */
function kvRow(k, v) {
  return `<div class="kv-row"><span class="k">${k}</span><b>${v}</b></div>`;
}

function avgWon(total, count) {
  const c = Number(count) || 0;
  return c ? won(Math.round((Number(total) || 0) / c)) : "-";
}

function renderRevenueDetail() {
  const f = state.data?.finance || {};
  const aff = f.affiliate || {};
  const c = aff.coupang || {};
  const s = aff.shopconnect || {};
  const det = f.detailing || {};

  $("#revCoupang").innerHTML = Object.keys(c).length ? `
    <div class="sheet-row"><span class="k">수익원</span><span class="v"><b>쿠팡 파트너스</b></span></div>
    <div class="detail-num">${won(c.revenue)} <small>${c.orders || 0}건</small></div>
    <div class="kv">
      ${kvRow("순이익", won(c.profit))}
      ${kvRow("건당 평균 매출", avgWon(c.revenue, c.orders))}
      ${kvRow("비고", esc(c.note || "-"))}
      ${kvRow("데이터 경로", "hq/finance/affiliate/coupang")}
    </div>
    <div class="kv-note">값은 DB의 finance 노드에서 갱신됩니다. 12:00 제시 보고 → 13:00 로빈 취합.</div>`
    : `<div class="empty">쿠팡 파트너스 데이터가 없습니다</div>`;

  $("#revShopconnect").innerHTML = Object.keys(s).length ? `
    <div class="sheet-row"><span class="k">수익원</span><span class="v"><b>네이버 쇼핑커넥트</b></span></div>
    <div class="detail-num">${won(s.revenue)} <small>${s.orders || 0}건</small></div>
    <div class="kv">
      ${kvRow("세전 수수료", won(s.profit))}
      ${kvRow("건당 평균 매출", avgWon(s.revenue, s.orders))}
      ${kvRow("비고", esc(s.note || "-"))}
      ${kvRow("데이터 경로", "hq/finance/affiliate/shopconnect")}
    </div>
    <div class="kv-note">값은 DB의 finance 노드에서 갱신됩니다. 12:00 제리 보고 → 13:00 로빈 취합.</div>`
    : `<div class="empty">쇼핑커넥트 데이터가 없습니다</div>`;

  const billed = Number(det.billed) || 0;
  const share = Number(det.partnerShare) || 0;
  $("#revDetailing").innerHTML = det.jobs !== undefined ? `
    <div class="sheet-row"><span class="k">수익원</span><span class="v"><b>세차 · 디테일링 부업</b> <span class="hint">11월 누계</span></span></div>
    <div class="detail-num">${Number(det.jobs).toLocaleString("ko-KR")}회 <small>예상 급여 ${won(det.netPay)}</small></div>
    <div class="kv">
      ${kvRow("예상 청구합", won(billed))}
      ${kvRow("외부 지급 60%", won(share))}
      ${kvRow("내 몫 40%", won(billed - share))}
      ${kvRow("건당 평균 청구", avgWon(billed, det.jobs))}
      ${kvRow("정산 구조", "60/40 정산 · 급여에서 3.3% 공제 추정")}
      ${kvRow("비고", esc(det.note || "-"))}
      ${kvRow("데이터 경로", "hq/finance/detailing")}
    </div>`
    : `<div class="empty">세차·디테일링 장부가 아직 없습니다</div>`;
}

/* 6-3. 상세 시트 */
const sheetEl = $("#sheet");
let sheetOpen = false;

function openSheet(title, html) {
  $("#sheetTitle").textContent = title;
  $("#sheetBody").innerHTML = html;
  sheetEl.hidden = false;
  sheetOpen = true;
  document.documentElement.style.overflow = "hidden";
}

function closeSheet() {
  if (!sheetOpen) return;
  sheetEl.hidden = true;
  $("#sheetBody").innerHTML = "";
  sheetOpen = false;
  document.documentElement.style.overflow = "";
}

function statusChips(list, cur, act, extra) {
  return list.map(([k, label]) =>
    `<button class="chip${k === cur ? " is-on" : ""}" data-act="${act}" ${extra} data-status="${k}" type="button">${label}</button>`
  ).join("");
}

/* 상세 내용 자동 높이 */
function autosize(ta, min = 150, max = 2400) {
  ta.style.height = "auto";
  const need = ta.scrollHeight + 2;
  ta.style.height = Math.max(min, Math.min(need, max)) + "px";
  ta.style.overflowY = need > max ? "auto" : "hidden";
}

/* 상세 시트에 편집 중인 제목·내용 읽기 */
function taskEditValues() {
  const titleEl = sheetEl.querySelector("#taskEditTitle");
  const detailEl = sheetEl.querySelector("#taskEditDetail");
  if (!titleEl && !detailEl) return null;
  return {
    title: titleEl ? titleEl.value.trim() : "",
    detail: detailEl
      ? detailEl.value.replace(/[ \t]+$/gm, "").replace(/\n{4,}/g, "\n\n\n").trim()
      : ""
  };
}

/* 공통 메모 블록 (블로그 · 스레드 · 캠페인) */
function memoBlock(path, value, label) {
  return `
    <div class="sheet-sep"></div>
    <div class="sheet-field">
      <span class="sheet-label">${esc(label || "메모")}</span>
      <textarea class="sheet-memo" data-memo-path="${esc(path)}" rows="3" placeholder="진행 상황·다음 할 일을 적어 두세요" aria-label="${esc(label || "메모")}">${esc(value || "")}</textarea>
      <div class="sheet-save">
        <button class="mini-btn" data-act="save-memo" data-path="${esc(path)}" type="button">메모 저장</button>
      </div>
    </div>`;
}

function openTaskSheet(id, savedAt, flash) {
  const t = tasksArr().find(x => x.id === id);
  if (!t) return;
  const ownerOpts = Object.entries(OWNER).map(([k, v]) =>
    `<option value="${k}"${t.owner === k ? " selected" : ""}>${v}</option>`).join("");
  const detail = taskDetail(t);
  const stamp = tsFull(t.updatedAt || t.createdAt);
  const ex = execOf(t);
  const exBadge = ex
    ? `<span class="exec-badge" data-exec="${ex}">${EXEC_STATUS[ex]}${ex === "requested" ? " · 회의실에 공유됨" : ""}</span>`
    : `<span class="exec-badge" data-exec="none">아직 실행 전</span>`;
  const exTimes = [
    t.requestedAt ? `실행 요청 ${tsFull(t.requestedAt)}` : "",
    t.reportedAt ? `결과 보고 ${tsFull(t.reportedAt)}` : ""
  ].filter(Boolean).join("  ·  ");

  openSheet("업무 상세", `
    <div class="sheet-field">
      <span class="sheet-label">업무 제목</span>
      <input id="taskEditTitle" type="text" maxlength="200" value="${esc(t.title)}" aria-label="업무 제목 수정">
    </div>
    <div class="sheet-row">
      <span class="k">담당자</span>
      <span class="owner-pick">
        ${avatarHtml(t.owner, "sm")}
        <select data-act="task-owner" data-id="${t.id}" aria-label="담당자 변경">${ownerOpts}</select>
      </span>
    </div>
    <div class="sheet-row"><span class="k">현재 상태</span><span class="v">${STATUS[t.status] || t.status}</span></div>
    <div class="sheet-row"><span class="k">최근 갱신</span><span class="v">${stamp}</span></div>
    <div class="sheet-row"><span class="k">등록</span><span class="v">${tsFull(t.createdAt)}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-label">상태 바꾸기</div>
    <div class="sheet-actions">
      ${statusChips(Object.entries(STATUS), t.status, "task-status", `data-id="${t.id}"`)}
    </div>
    <div class="sheet-sep"></div>
    <div class="exec-panel" data-exec="${ex || "none"}">
      <div class="exec-top">
        ${exBadge}
        ${flash ? `<span class="saved-flag" data-flash>${esc(flash)}</span>` : ""}
      </div>
      ${exTimes ? `<div class="exec-time">${esc(exTimes)}</div>` : ""}
      <p class="exec-note">▶ 업무 실행을 누르면 편집 중인 제목·내용을 저장하면서 상태를 '진행 중'으로 바꾸고, 회의실에 실행 요청을 올립니다. 📢 결과 회의실 공유는 이 업무의 제목·담당·상세 메모를 회의실에 결과 보고로 남깁니다.</p>
      <div class="exec-btns">
        <button class="btn primary" data-act="task-run" data-id="${t.id}" type="button">▶ 업무 실행</button>
        <button class="btn" data-act="task-report" data-id="${t.id}" type="button">📢 결과 회의실 공유</button>
      </div>
    </div>
    <div class="sheet-sep"></div>
    <div class="sheet-field">
      <span class="sheet-label">상세 내용 · 메모</span>
      <textarea id="taskEditDetail" rows="8" placeholder="진행 상황, 다음 할 일, 체크리스트, 관련 링크를 적어 두세요." aria-label="업무 상세 내용">${esc(detail)}</textarea>
      <span class="sheet-hint">줄바꿈·목록이 그대로 저장됩니다. Ctrl(⌘)+Enter로 저장.</span>
    </div>
    <div class="sheet-save">
      ${savedAt ? `<span class="saved-flag">저장했습니다 · ${clock(savedAt)}</span>` : ""}
      <button class="btn primary" data-act="task-save" data-id="${t.id}" type="button">저장</button>
    </div>
    <div class="sheet-sep"></div>
    <div class="sheet-danger">
      <button class="btn danger block" data-act="task-del" data-id="${t.id}" type="button">🗑 업무 삭제</button>
      <span class="sheet-hint">삭제하면 업무 목록과 DB에서 바로 사라지며 되돌릴 수 없습니다.</span>
    </div>
  `);

  const ta = $("#taskEditDetail");
  if (ta) {
    autosize(ta);
    ta.addEventListener("input", () => autosize(ta));
    ta.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const save = sheetEl.querySelector('[data-act="task-save"]');
        if (save) save.click();
      }
    });
  }
}

function openBlogSheet(key) {
  const b = blogArr().find(x => x.key === key);
  if (!b) return;
  openSheet(`${b.no}호 상세`, `
    <div class="sheet-row"><span class="k">제목</span><span class="v"><b>${esc(b.title)}</b></span></div>
    <div class="sheet-row"><span class="k">발행일</span><span class="v">${esc(b.date || "-")}</span></div>
    <div class="sheet-row"><span class="k">현재 상태</span><span class="v">${BLOG_STATUS[b.status] || b.status}</span></div>
    <div class="sheet-row"><span class="k">최근 갱신</span><span class="v">${tsFull(b.updatedAt)}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-label">상태 바꾸기</div>
    <div class="sheet-actions">
      ${statusChips(Object.entries(BLOG_STATUS), b.status, "blog-status", `data-key="${esc(b.key)}"`)}
    </div>
    ${memoBlock(`${ROOT}/content/blog/${b.key}`, b.note, "메모 · 집필 내역")}
    <div class="kv-note">발행은 사장님이 직접 결정합니다. 카드의 제목을 누르면 바로 수정할 수 있습니다.</div>
  `);
}

function openThreadSheet(id) {
  const arr = Object.entries(state.data?.content?.threads || {}).map(([k, v]) => ({ id: k, ...v }));
  const s = arr.find(x => x.id === id);
  if (!s) return;
  const link = s.url
    ? `<div class="sheet-row"><span class="k">게시물</span><span class="v"><a class="mini-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">열어 보기 ↗</a></span></div>`
    : `<div class="sheet-row"><span class="k">게시물</span><span class="v">링크 없음</span></div>`;
  openSheet("스레드 상세", `
    <div class="sheet-row"><span class="k">제목</span><span class="v"><b>${esc(s.title)}</b></span></div>
    ${link}
    <div class="sheet-row"><span class="k">작성일</span><span class="v">${esc(s.date || "-")}</span></div>
    <div class="sheet-row"><span class="k">분량</span><span class="v">${s.chars ? esc(s.chars) + "자" : "-"}</span></div>
    <div class="sheet-row"><span class="k">현재 상태</span><span class="v">${THREAD_STATUS[s.status] || s.status || "-"}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-label">상태 바꾸기</div>
    <div class="sheet-actions">
      ${statusChips(Object.entries(THREAD_STATUS), s.status, "thread-status", `data-id="${s.id}"`)}
    </div>
    ${memoBlock(`${ROOT}/content/threads/${s.id}`, s.note, "메모 · 진행 상황")}
  `);
}

function openCampaignSheet(id) {
  const arr = Object.entries(state.data?.content?.campaigns || {}).map(([k, v]) => ({ id: k, ...v }));
  const c = arr.find(x => x.id === id);
  if (!c) return;
  const d = dayDiff(c.due);
  const dLabel = d === null ? "-" : (d === 0 ? "D-DAY" : (d > 0 ? `D-${d}` : `마감 ${Math.abs(d)}일 지남`));
  openSheet("캠페인 상세", `
    <div class="sheet-row"><span class="k">캠페인</span><span class="v"><b>${esc(c.name)}</b></span></div>
    <div class="sheet-row"><span class="k">채널</span><span class="v">${esc(c.channel || "-")}</span></div>
    <div class="sheet-row"><span class="k">마감</span><span class="v">${esc(c.due || "-")} · <b>${dLabel}</b></span></div>
    <div class="sheet-row"><span class="k">현재 상태</span><span class="v">${CAMP_STATUS[c.status] || c.status || "-"}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-label">상태 바꾸기</div>
    <div class="sheet-actions">
      ${statusChips(Object.entries(CAMP_STATUS), c.status, "camp-status", `data-id="${c.id}"`)}
    </div>
    ${memoBlock(`${ROOT}/content/campaigns/${c.id}`, c.note, "메모 · 제출 준비")}
  `);
}

/* 6-2b. 비서별 사용량 수정 시트 */
function usagePreviewHtml(pct) {
  const tone = usageToneOf(pct);
  const label = pct == null ? "미입력" : esc(usageLabelOf(pct));
  return `<b>${pct == null ? "--" : pct + "%"}</b> · ${label}`;
}

function openUsageSheet(k) {
  const p = PEOPLE[k];
  if (!p) return;
  const u = usageData(k);
  openSheet(`${p.emoji} ${p.name} 사용량`, `
    <div class="usage-guide">
      <b>📌 입력 방법</b>
      <span>각 비서 앱 → <b>'내 피클'</b> 탭에서 확인한 사용량을 직접 입력해 주세요. 비서는 자기 사용량을 조회할 수 없어 자동으로 채워지지 않습니다.</span>
    </div>
    <div class="sheet-row"><span class="k">현재</span><span class="v">${u.pct == null ? "미입력" : `<b>${u.pct}%</b> · ${esc(u.label)}`}</span></div>
    <div class="sheet-row"><span class="k">마지막 갱신</span><span class="v">${u.updatedAt ? tsFull(u.updatedAt) : "-"}</span></div>
    <div class="sheet-row"><span class="k">메모</span><span class="v">${u.note ? esc(u.note) : "-"}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-field">
      <span class="sheet-label">사용률 (%) — 비우면 미입력</span>
      <div class="usage-edit">
        <input id="usagePct" type="number" min="0" max="100" step="1" inputmode="numeric"
               value="${u.pct == null ? "" : u.pct}" placeholder="--" aria-label="사용률 퍼센트">
        <input id="usageRange" type="range" min="0" max="100" step="1" value="${u.pct == null ? 0 : u.pct}" aria-label="사용률 슬라이더">
      </div>
      <div class="usage-preview" id="usagePreview" data-tone="${u.tone}">${usagePreviewHtml(u.pct)}</div>
      <div class="sheet-hint">0~59% 여유 · 60~84% 한도 주의 · 85% 이상 한도 경고. 원형 그래프 색이 단계에 맞춰 바뀝니다.</div>
    </div>
    <div class="sheet-field">
      <span class="sheet-label">상태 라벨</span>
      <input id="usageLabel" type="text" maxlength="16" value="${esc(u.label)}" placeholder="여유 / 한도 주의 / 미입력" aria-label="상태 라벨">
    </div>
    <div class="sheet-field">
      <span class="sheet-label">메모 · 한도 현황</span>
      <textarea id="usageNote" class="sheet-memo" rows="3" placeholder="예: 주간 한도 40% 사용 · 오늘 글 3건 남음" aria-label="한도 메모">${esc(u.note)}</textarea>
    </div>
    <div class="sheet-save">
      <button class="mini-btn" data-act="usage-clear" data-key="${k}" type="button">미입력으로 지우기</button>
      <button class="btn primary" data-act="usage-save" data-key="${k}" type="button">저장</button>
    </div>
    <p class="saved-flag" id="usageSaved" hidden>저장했습니다 ✓ 모든 기기에 즉시 반영됩니다</p>
  `);
}

function readUsageForm() {
  const pctEl = $("#usagePct");
  const raw = pctEl ? String(pctEl.value).trim() : "";
  let pct = raw === "" ? null : Math.round(Number(raw));
  if (pct != null && !Number.isFinite(pct)) pct = null;
  if (pct != null) pct = Math.max(0, Math.min(100, pct));
  const labelEl = $("#usageLabel");
  const noteEl = $("#usageNote");
  return {
    pct,
    label: labelEl ? labelEl.value.trim() : "",
    note: noteEl ? noteEl.value.replace(/[ \t]+$/gm, "").trim() : ""
  };
}

function saveUsage(k, clear) {
  if (!db || !PEOPLE[k]) return;
  const v = readUsageForm();
  const pct = clear ? null : v.pct;
  const label = clear
    ? "미입력"
    : (pct == null
      ? (v.label && !["여유", "한도 주의", "한도 경고"].includes(v.label) ? v.label : "미입력")
      : (!v.label || v.label === "미입력" ? usageLabelOf(pct) : v.label));
  const payload = { usedPct: pct, label, note: v.note, updatedAt: Date.now() };
  if (state.data) {
    state.data.usage = state.data.usage || {};
    state.data.usage[k] = payload;
  }
  set(ref(db, `${ROOT}/usage/${k}`), payload);
  renderMeeting();
  openUsageSheet(k);
  const flag = $("#usageSaved");
  if (flag) flag.hidden = false;
}

sheetEl.addEventListener("input", e => {
  const el = e.target;
  if (!el || (el.id !== "usagePct" && el.id !== "usageRange")) return;
  const pctEl = $("#usagePct");
  const rangeEl = $("#usageRange");
  if (!pctEl || !rangeEl) return;

  if (el.id === "usageRange") {
    pctEl.value = el.value;
  } else if (String(pctEl.value).trim() === "") {
    rangeEl.value = "0";
  } else {
    const n = Math.max(0, Math.min(100, Math.round(Number(pctEl.value) || 0)));
    rangeEl.value = String(n);
  }

  const raw = String(pctEl.value).trim();
  const pct = raw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
  const prev = $("#usagePreview");
  if (prev) {
    prev.dataset.tone = usageToneOf(pct);
    prev.innerHTML = usagePreviewHtml(pct);
  }
});

sheetEl.addEventListener("click", e => {
  if (e.target.closest("[data-sheet-close]")) { closeSheet(); return; }
  const btn = e.target.closest("button[data-act]");
  if (!btn || !db) return;
  const id = btn.dataset.id;
  const st = btn.dataset.status;

  if (btn.dataset.act === "usage-save") {
    saveUsage(btn.dataset.key, false);
    return;
  }
  if (btn.dataset.act === "usage-clear") {
    saveUsage(btn.dataset.key, true);
    return;
  }

  if (btn.dataset.act === "task-save") {
    const v = taskEditValues();
    if (!v) return;
    if (!v.title) {
      const titleEl = sheetEl.querySelector("#taskEditTitle");
      if (titleEl) { titleEl.focus(); titleEl.select(); }
      return;
    }
    const now = Date.now();
    if (state.data?.tasks?.[id]) Object.assign(state.data.tasks[id], { ...v, updatedAt: now });
    update(ref(db, `${ROOT}/tasks/${id}`), { ...v, updatedAt: now });
    renderTasks();
    openTaskSheet(id, now);
  } else if (btn.dataset.act === "save-memo") {
    const path = btn.dataset.path;
    const field = [...sheetEl.querySelectorAll("textarea[data-memo-path]")]
      .find(el => el.dataset.memoPath === path);
    if (!field) return;
    const note = field.value.replace(/[ \t]+$/gm, "").trim();
    update(ref(db, path), { note, updatedAt: Date.now() });
    btn.textContent = "저장했습니다 ✓";
    setTimeout(() => { btn.textContent = "메모 저장"; }, 1800);
  } else if (btn.dataset.act === "task-status") {
    const v = taskEditValues();
    const cur = tasksArr().find(x => x.id === id);
    const patch = { status: st, updatedAt: Date.now() };
    if (v && v.title) { patch.title = v.title; patch.detail = v.detail; }
    if (st === "done" && cur && ["reported", "completed"].includes(String(cur.executionStatus || ""))) {
      patch.executionStatus = "completed";
    }
    if (state.data?.tasks?.[id]) Object.assign(state.data.tasks[id], patch);
    update(ref(db, `${ROOT}/tasks/${id}`), patch);
    renderTasks();
    let flash = "";
    if (st === "done") {
      flash = patch.executionStatus === "completed"
        ? "완료 · 회의실에 결과 보고됨"
        : "완료로 바꿨습니다. 📢 결과 회의실 공유를 누르면 회의실에 보고됩니다.";
    }
    openTaskSheet(id, undefined, flash);
  } else if (btn.dataset.act === "task-run") {
    const v = taskEditValues();
    const cur = tasksArr().find(x => x.id === id);
    if (!cur) return;
    if (v && !v.title) {
      const titleEl = sheetEl.querySelector("#taskEditTitle");
      if (titleEl) { titleEl.focus(); titleEl.select(); }
      return;
    }
    const now = Date.now();
    const title = v && v.title ? v.title : cur.title;
    const detail = v ? v.detail : taskDetail(cur);
    const patch = {
      status: "doing",
      executionStatus: "requested",
      requestedAt: now,
      updatedAt: now
    };
    if (v && v.title) { patch.title = title; patch.detail = detail; }
    if (state.data?.tasks?.[id]) Object.assign(state.data.tasks[id], patch);
    update(ref(db, `${ROOT}/tasks/${id}`), patch);
    push(ref(db, `${ROOT}/meeting/messages`), {
      from: "boss",
      text: execRequestText(title, cur.owner, detail),
      ts: now
    });
    meetForceScroll = true;
    renderTasks();
    openTaskSheet(id, now, "실행 요청됨 · 회의실에 공유됨");
  } else if (btn.dataset.act === "task-report") {
    const v = taskEditValues();
    const cur = tasksArr().find(x => x.id === id);
    if (!cur) return;
    if (v && !v.title) {
      const titleEl = sheetEl.querySelector("#taskEditTitle");
      if (titleEl) { titleEl.focus(); titleEl.select(); }
      return;
    }
    const now = Date.now();
    const title = v && v.title ? v.title : cur.title;
    const detail = v ? v.detail : taskDetail(cur);
    const done = cur.status === "done";
    const patch = {
      executionStatus: done ? "completed" : "reported",
      reportedAt: now,
      updatedAt: now
    };
    if (v && v.title) { patch.title = title; patch.detail = detail; }
    if (state.data?.tasks?.[id]) Object.assign(state.data.tasks[id], patch);
    update(ref(db, `${ROOT}/tasks/${id}`), patch);
    push(ref(db, `${ROOT}/meeting/messages`), {
      from: "boss",
      text: execReportText(title, cur.owner, detail),
      ts: now
    });
    meetForceScroll = true;
    renderTasks();
    openTaskSheet(id, now, done ? "결과 보고 · 완료로 정리됨 · 회의실에 공유됨" : "결과 보고 · 회의실에 공유됨");
  } else if (btn.dataset.act === "task-del") {
    if (confirm("이 업무를 삭제할까요?\n삭제하면 목록과 DB에서 바로 사라지며 되돌릴 수 없습니다.")) {
      if (state.data?.tasks?.[id]) delete state.data.tasks[id];
      remove(ref(db, `${ROOT}/tasks/${id}`));
      renderTasks();
      closeSheet();
    }
  } else if (btn.dataset.act === "thread-status") {
    if (state.data?.content?.threads?.[id]) Object.assign(state.data.content.threads[id], { status: st, updatedAt: Date.now() });
    update(ref(db, `${ROOT}/content/threads/${id}`), { status: st, updatedAt: Date.now() });
    openThreadSheet(id);
  } else if (btn.dataset.act === "camp-status") {
    if (state.data?.content?.campaigns?.[id]) Object.assign(state.data.content.campaigns[id], { status: st, updatedAt: Date.now() });
    update(ref(db, `${ROOT}/content/campaigns/${id}`), { status: st, updatedAt: Date.now() });
    openCampaignSheet(id);
  } else if (btn.dataset.act === "blog-status") {
    const key = btn.dataset.key;
    if (state.data?.content?.blog?.[key]) Object.assign(state.data.content.blog[key], { status: st, updatedAt: Date.now() });
    update(ref(db, `${ROOT}/content/blog/${key}`), { status: st, updatedAt: Date.now() });
    openBlogSheet(key);
  }
});

sheetEl.addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="task-owner"]');
  if (!sel || !db) return;
  const id = sel.dataset.id;
  if (state.data?.tasks?.[id]) Object.assign(state.data.tasks[id], { owner: sel.value, updatedAt: Date.now() });
  update(ref(db, `${ROOT}/tasks/${id}`), { owner: sel.value, updatedAt: Date.now() });
});

/* 6-4. 라우팅 */
function normalizeRoute(raw) {
  const s = String(raw || "").replace(/^#\/?/, "").trim();
  const [v0, p0] = s.split("/");
  const view = VIEW_IDS.includes(v0) ? v0 : "home";
  const panes = $$(`.view[data-view="${view}"] .subnav .sub-btn`).map(b => b.dataset.pane);
  const pane = panes.includes(p0) ? p0 : (DEFAULT_PANE[view] || "");
  return { view, pane };
}

function applyRoute() {
  const { view, pane } = normalizeRoute(location.hash);

  $$(".view").forEach(sec => { sec.hidden = sec.dataset.view !== view; });
  $$("#mainNav .nav-btn").forEach(b => {
    const on = b.dataset.view === view;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  const sec = $(`.view[data-view="${view}"]`);
  if (sec) {
    $$(".pane", sec).forEach(p => { p.hidden = p.dataset.pane !== pane; });
    $$(".subnav .sub-btn", sec).forEach(b => b.classList.toggle("is-on", b.dataset.pane === pane));
  if (view === "meeting" && pane === "lounge") renderLounge(true);
  }

  localStorage.setItem(ROUTE_KEY, `#${view}${pane ? "/" + pane : ""}`);
  window.scrollTo(0, 0);

  if (view === "meeting") {
    const room = $("#meetRoom");
    if (room && pane === "room") room.scrollTop = room.scrollHeight;
  }
}

function go(view, pane) {
  const target = `#${view}${pane ? "/" + pane : ""}`;
  if (location.hash === target) applyRoute();
  else location.hash = target;
}

$("#mainNav").addEventListener("click", e => {
  const b = e.target.closest(".nav-btn");
  if (!b) return;
  go(b.dataset.view, DEFAULT_PANE[b.dataset.view]);
});

document.addEventListener("click", e => {
  const b = e.target.closest(".subnav .sub-btn");
  if (!b) return;
  const sec = b.closest(".view");
  if (sec) go(sec.dataset.view, b.dataset.pane);
});

$("#homeGrid").addEventListener("click", e => {
  const c = e.target.closest("[data-go]");
  if (c) go(c.dataset.go, DEFAULT_PANE[c.dataset.go]);
});

$("#moneyGrid").addEventListener("click", e => {
  const c = e.target.closest("[data-go]");
  if (c) go("revenue", c.dataset.go);
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && sheetOpen) closeSheet();
});

window.addEventListener("hashchange", applyRoute);

/* ── 7. 시작 ─────────────────────────────────────────────── */

if (!location.hash && localStorage.getItem(ROUTE_KEY)) {
  location.hash = localStorage.getItem(ROUTE_KEY);
}
applyRoute();

if (localStorage.getItem(AUTH_KEY) === "1") {
  unlock();
} else {
  $("#pinInput").focus();
}
