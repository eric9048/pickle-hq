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
const PIN = "1028";
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
const BLOG_STATUS = { published: "발행 완료", draft: "임시저장", hidden: "비공개" };
const THREAD_STATUS = { posted: "게시 완료", drafting: "작성 중", hold: "보류" };
const CAMP_STATUS = { pending: "미제출", doing: "진행 중", submitted: "제출 완료" };

/* ── 2. 상태 ─────────────────────────────────────────────── */

const state = {
  data: null,
  ownerFilter: "all",
  blogFilter: "all",
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
  list.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
  $$("[data-count]").forEach(el => { el.textContent = counts[el.dataset.count] || 0; });

  $("#taskSummary").textContent =
    `${list.length}건` + (state.ownerFilter === "all" ? "" : ` · ${OWNER[state.ownerFilter]}`);

  ["doing", "waiting", "done"].forEach(st => {
    const box = $(`[data-list="${st}"]`);
    const items = list.filter(t => t.status === st);
    box.innerHTML = items.length
      ? items.map(t => taskCard(t)).join("")
      : `<div class="empty">비어 있음</div>`;
  });
}

function taskCard(t) {
  const opts = Object.entries(OWNER).map(([k, v]) =>
    `<option value="${k}"${t.owner === k ? " selected" : ""}>${v}</option>`).join("");
  const move = ["doing", "waiting", "done"].map(s =>
    s === t.status ? "" :
      `<button class="mini-btn" data-act="status" data-id="${t.id}" data-status="${s}" type="button">→ ${STATUS[s]}</button>`
  ).join("");

  return `
    <div class="task" data-owner="${esc(t.owner)}" data-status="${esc(t.status)}" data-id="${t.id}">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">
        <select data-act="owner" data-id="${t.id}" aria-label="담당자 변경">${opts}</select>
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
    owner: $("#taskOwner").value,
    status: $("#taskStatus").value,
    createdAt: now,
    updatedAt: now
  });
  $("#taskTitle").value = "";
  $("#taskTitle").focus();
});

$("#kanban").addEventListener("click", e => {
  const btn = e.target.closest("[data-act]");
  if (!btn || !db) return;
  const id = btn.dataset.id;
  const item = ref(db, `${ROOT}/tasks/${id}`);
  if (btn.dataset.act === "status") {
    update(item, { status: btn.dataset.status, updatedAt: Date.now() });
  } else if (btn.dataset.act === "del") {
    if (confirm("이 업무를 삭제할까요?")) remove(item);
  }
});

$("#kanban").addEventListener("change", e => {
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
  if (!arr.length) { box.innerHTML = `<div class="empty">등록된 스레드가 없습니다</div>`; return; }

  box.innerHTML = arr.map(s => {
    const opts = Object.entries(THREAD_STATUS).map(([k, v]) =>
      `<option value="${k}"${s.status === k ? " selected" : ""}>${v}</option>`).join("");
    const link = s.url ? `<a class="mini-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">게시물 열기 ↗</a>` : "";
    return `
      <div class="mini-item">
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
  if (!arr.length) { box.innerHTML = `<div class="empty">등록된 캠페인이 없습니다</div>`; return; }

  box.innerHTML = arr.map(k => {
    const opts = Object.entries(CAMP_STATUS).map(([v, label]) =>
      `<option value="${v}"${k.status === v ? " selected" : ""}>${label}</option>`).join("");
    const d = dayDiff(k.due);
    const cls = d === null ? "" : (d < 0 ? "past" : (d <= 2 ? "urgent" : ""));
    const label = d === null ? "" : (d === 0 ? "D-DAY" : (d > 0 ? `D-${d}` : `마감 ${Math.abs(d)}일 지남`));
    const due = k.due ? String(k.due).slice(5).replace("-", "/") : "";
    return `
      <div class="mini-item">
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
      <div class="money">
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
      <div class="money">
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
      <div class="money green">
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
        <span class="who ${esc(m.from)}">${esc(OWNER[m.from] || m.from)}</span>
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

/* ── 6. 시작 ─────────────────────────────────────────────── */

if (localStorage.getItem(AUTH_KEY) === "1") {
  unlock();
} else {
  $("#pinInput").focus();
}
