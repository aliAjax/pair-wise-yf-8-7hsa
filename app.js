const storageKey = "zfl17-film-strip-desk";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

// 复查状态：pending 待复查（问题源或同批关联），passed 复查合格，failed 复查不合格。
// 复查结论不是固定属性：改批号、颜色或破损后会被清空重新判定。
const defaultState = {
  reelTitle: "春日试映A卷",
  segments: [
    {
      id: "seed-1",
      code: "A-001",
      batch: "洗-2609-01",
      duration: 18,
      shift: "正常",
      damage: "完好",
      note: "开场街景，节奏平稳，适合保留原顺序。",
      thumb: "",
      review: null
    },
    {
      id: "seed-2",
      code: "A-006",
      batch: "洗-2609-01",
      duration: 9,
      shift: "偏红",
      damage: "轻微划痕",
      note: "人物近景左侧有划痕，试映时留意是否明显。",
      thumb: "",
      review: null
    },
    {
      id: "seed-3",
      code: "A-012",
      batch: "洗-2609-02",
      duration: 14,
      shift: "褪色",
      damage: "接片松动",
      note: "接片位置靠近段尾，放映前建议重新压平。",
      thumb: "",
      review: null
    },
    {
      id: "seed-4",
      code: "A-013",
      batch: "洗-2609-01",
      duration: 11,
      shift: "正常",
      damage: "完好",
      note: "与 A-006 同批，需一并复查洗印批次风险。",
      thumb: "",
      review: null
    },
    {
      id: "seed-5",
      code: "A-014",
      batch: "洗-2609-03",
      duration: 16,
      shift: "正常",
      damage: "完好",
      note: "另一洗印批次，暂未发现异常。",
      thumb: "",
      review: null
    }
  ]
};

let state = loadState();
let draggedId = null;
let reviewTargetId = null;
let editTargetId = null;
// 每次渲染前统一计算，保证各视图判定一致
let statusMap = buildStatusMap();

const els = {
  reelTitle: document.querySelector("#reelTitle"),
  colorFilter: document.querySelector("#colorFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  searchInput: document.querySelector("#searchInput"),
  segmentForm: document.querySelector("#segmentForm"),
  codeInput: document.querySelector("#codeInput"),
  batchInput: document.querySelector("#batchInput"),
  durationInput: document.querySelector("#durationInput"),
  shiftInput: document.querySelector("#shiftInput"),
  damageInput: document.querySelector("#damageInput"),
  thumbInput: document.querySelector("#thumbInput"),
  noteInput: document.querySelector("#noteInput"),
  segmentList: document.querySelector("#segmentList"),
  warningList: document.querySelector("#warningList"),
  riskSummary: document.querySelector("#riskSummary"),
  playableDuration: document.querySelector("#playableDuration"),
  fullDuration: document.querySelector("#fullDuration"),
  damageCount: document.querySelector("#damageCount"),
  segmentCount: document.querySelector("#segmentCount"),
  pendingCount: document.querySelector("#pendingCount"),
  exportBtn: document.querySelector("#exportBtn"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  reviewForm: document.querySelector("#reviewForm"),
  reviewTarget: document.querySelector("#reviewTarget"),
  handlerInput: document.querySelector("#handlerInput"),
  handlerNoteInput: document.querySelector("#handlerNoteInput"),
  reviewCancel: document.querySelector("#reviewCancel"),
  editForm: document.querySelector("#editForm"),
  editTarget: document.querySelector("#editTarget"),
  editCode: document.querySelector("#editCode"),
  editBatch: document.querySelector("#editBatch"),
  editDuration: document.querySelector("#editDuration"),
  editShift: document.querySelector("#editShift"),
  editDamage: document.querySelector("#editDamage"),
  editNote: document.querySelector("#editNote"),
  editCancel: document.querySelector("#editCancel")
};

function normalizeSegment(item) {
  return {
    id: item.id || crypto.randomUUID(),
    code: item.code || "",
    batch: item.batch || "",
    duration: Number(item.duration) || 0,
    shift: item.shift || "正常",
    damage: item.damage || "完好",
    note: item.note || "",
    thumb: item.thumb || "",
    review: item.review || null
  };
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      reelTitle: parsed.reelTitle ?? defaultState.reelTitle,
      segments: Array.isArray(parsed.segments) ? parsed.segments.map(normalizeSegment) : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function isDefective(item) {
  return item.shift !== "正常" || item.damage !== "完好";
}

function getBatchGroups() {
  const groups = new Map();
  state.segments.forEach((item) => {
    const key = (item.batch || "").trim();
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

// 判定每个片段当前状态。批号为空时按独立片段处理，不参与同批联动。
function buildStatusMap() {
  const map = new Map();
  const groups = getBatchGroups();

  state.segments.forEach((item) => {
    const own = isDefective(item);
    const key = (item.batch || "").trim();
    const tainted = key && (groups.get(key) || []).some((member) => isDefective(member));
    // 自身合格但同批有问题：待复查；自身有问题：始终为问题源，复查合格也计入可放
    const needReview = own || tainted;
    let status;
    if (!needReview) {
      status = "normal";
    } else if (item.review) {
      status = item.review.verdict === "passed" ? "passed" : "failed";
    } else {
      status = "pending";
    }
    map.set(item.id, {
      status,
      own,
      tainted: Boolean(tainted),
      batch: key
    });
  });
  return map;
}

function infoOf(id) {
  return statusMap.get(id) || { status: "normal", own: false, tainted: false, batch: "" };
}

function isPlayable(item) {
  const { status } = infoOf(item.id);
  return status === "normal" || status === "passed";
}

// 批号、颜色或破损变化后，旧批与新批中的复查结论都失效，需重新判定。
function resetReview(batchA, batchB) {
  const keys = new Set([batchA, batchB].map((key) => (key || "").trim()).filter(Boolean));
  state.segments.forEach((item) => {
    if (keys.has((item.batch || "").trim())) item.review = null;
  });
}

function resetReviewByIds(ids) {
  const idSet = new Set(ids);
  state.segments.forEach((item) => {
    if (idSet.has(item.id)) item.review = null;
  });
}

function getFilteredSegments() {
  const color = els.colorFilter.value;
  const status = els.statusFilter.value;
  const keyword = els.searchInput.value.trim().toLowerCase();
  return state.segments.filter((item) => {
    const matchesColor = color === "all" || item.shift === color;
    const matchesStatus = status === "all" || infoOf(item.id).status === status;
    const haystack = `${item.code}${item.batch}${item.note}${item.damage}${item.shift}${item.review?.handler || ""}`.toLowerCase();
    const matchesKeyword = !keyword || haystack.includes(keyword);
    return matchesColor && matchesStatus && matchesKeyword;
  });
}

function renderStats() {
  const full = state.segments.reduce((sum, item) => sum + Number(item.duration), 0);
  const playable = state.segments
    .filter((item) => isPlayable(item))
    .reduce((sum, item) => sum + Number(item.duration), 0);
  const damaged = state.segments.filter((item) => item.damage !== "完好").length;
  const pending = state.segments.filter((item) => infoOf(item.id).status === "pending").length;
  els.fullDuration.textContent = formatDuration(full);
  els.playableDuration.textContent = formatDuration(playable);
  els.damageCount.textContent = damaged;
  els.segmentCount.textContent = state.segments.length;
  els.pendingCount.textContent = pending;
}

function statusPill(status) {
  if (status === "pending") return `<span class="status-pill pending">待复查·不计时长</span>`;
  if (status === "passed") return `<span class="status-pill passed">复查合格·已计时</span>`;
  if (status === "failed") return `<span class="status-pill failed">复查不合格·不计时长</span>`;
  return `<span class="status-pill normal">正常可放</span>`;
}

function renderList() {
  const segments = getFilteredSegments();
  els.segmentList.innerHTML =
    segments
      .map((item) => {
        const realIndex = state.segments.findIndex((segment) => segment.id === item.id);
        const hasDamage = item.damage !== "完好";
        const { status, own } = infoOf(item.id);
        const durationMuted = status === "pending" || status === "failed";
        const reviewBar =
          status === "pending" || status === "failed" || status === "passed"
            ? `
              <div class="review-bar">
                <button type="button" class="pass-btn" data-pass="${item.id}">✓ 复查合格</button>
                <button type="button" class="fail-btn" data-fail="${item.id}">✕ 复查不合格</button>
                ${
                  status === "failed" && item.review
                    ? `<span class="handler-line">处理人：${escapeHtml(item.review.handler)}｜${escapeHtml(item.review.note || "")}</span>`
                    : ""
                }
                ${
                  status === "passed" && item.review?.handler
                    ? `<span class="pass-line">复查人：${escapeHtml(item.review.handler)}</span>`
                    : ""
                }
              </div>`
            : "";
        return `
          <article class="segment-card status-${status}${own ? " is-source" : ""}" draggable="true" data-id="${item.id}">
            <div class="thumb">
              ${
                item.thumb
                  ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
                  : `<div class="film-placeholder" style="background:${fallbackThumbs[realIndex % fallbackThumbs.length]}">${escapeHtml(item.code)}</div>`
              }
            </div>
            <div class="segment-main">
              <div class="segment-title">
                <strong>${realIndex + 1}. ${escapeHtml(item.code)}</strong>
                <button type="button" class="batch-tag" data-batch-filter="${escapeHtml(item.batch)}" title="只看同批片段">批号 ${escapeHtml(item.batch || "未登记")}</button>
                <span class="duration ${durationMuted ? "duration-off" : ""}">${formatDuration(item.duration)}${durationMuted ? "（不计）" : ""}</span>
                ${statusPill(status)}
                ${own ? `<span class="source-flag">问题源</span>` : ""}
              </div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(item.shift)}</span>
                <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
              </div>
              <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
              ${reviewBar}
            </div>
            <div class="segment-actions">
              <button type="button" title="上移" data-move-up="${item.id}">↑</button>
              <button type="button" title="下移" data-move-down="${item.id}">↓</button>
              <button type="button" title="编辑（改批号或破损后重新判定）" data-edit="${item.id}">改</button>
              <button type="button" title="删除" data-delete="${item.id}">×</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的片段。</p>`;
}

function renderWarnings() {
  const groups = getBatchGroups();
  const taintedBatches = [];
  groups.forEach((members, batch) => {
    if (members.some((item) => isDefective(item))) taintedBatches.push({ batch, members });
  });
  taintedBatches.sort((a, b) => {
    const ai = Math.min(...a.members.map((item) => state.segments.indexOf(item)));
    const bi = Math.min(...b.members.map((item) => state.segments.indexOf(item)));
    return ai - bi;
  });

  const orphans = state.segments.filter((item) => !((item.batch || "").trim()) && isDefective(item));
  const riskBatchCount = taintedBatches.length;
  els.riskSummary.textContent = riskBatchCount ? `${riskBatchCount} 个风险批号` : "按洗印批号分组";

  const batchHtml = taintedBatches
    .map(({ batch, members }) => {
      const sources = members.filter((item) => isDefective(item));
      const links = members.filter((item) => !isDefective(item));
      const pendingCount = members.filter((item) => infoOf(item.id).status === "pending").length;
      const renderMember = (item, isSource) => {
        const index = state.segments.indexOf(item) + 1;
        const { status } = infoOf(item.id);
        const label =
          status === "pending"
            ? "待复查"
            : status === "passed"
              ? `合格${item.review?.handler ? `·${escapeHtml(item.review.handler)}` : ""}`
              : status === "failed"
                ? `不合格${item.review?.handler ? `·${escapeHtml(item.review.handler)}` : ""}`
                : "正常";
        const reasons = [item.shift !== "正常" ? item.shift : "", item.damage !== "完好" ? item.damage : ""].filter(Boolean).join("·");
        return `
          <li>
            <span class="member-pos">#${index} ${escapeHtml(item.code)}</span>
            <span class="member-tag ${status}">${label}</span>
            ${isSource && reasons ? `<span class="member-reason">${escapeHtml(reasons)}</span>` : ""}
          </li>`;
      };
      return `
        <div class="warning-batch">
          <div class="warning-batch-head">
            <strong>批号 ${escapeHtml(batch)}</strong>
            <span>${pendingCount} 段待复查</span>
          </div>
          <ul class="warning-members">
            ${sources.map((item) => renderMember(item, true)).join("")}
            ${links.map((item) => renderMember(item, false)).join("")}
          </ul>
        </div>`;
    })
    .join("");

  const orphanHtml = orphans.length
    ? `
      <div class="warning-batch orphan">
        <div class="warning-batch-head">
          <strong>未登记批号的破损段</strong>
          <span>请补登批号以追踪同批风险</span>
        </div>
        <ul class="warning-members">
          ${orphans
            .map((item) => {
              const index = state.segments.indexOf(item) + 1;
              const reasons = [item.shift !== "正常" ? item.shift : "", item.damage !== "完好" ? item.damage : ""].filter(Boolean).join("·");
              return `<li><span class="member-pos">#${index} ${escapeHtml(item.code)}</span><span class="member-reason">${escapeHtml(reasons)}</span></li>`;
            })
            .join("")}
        </ul>
      </div>`
    : "";

  els.warningList.innerHTML =
    batchHtml + orphanHtml || `<p class="empty">当前没有偏色、破损或同批关联提醒。</p>`;
}

function renderAll() {
  statusMap = buildStatusMap();
  saveState();
  els.reelTitle.value = state.reelTitle;
  renderStats();
  renderList();
  renderWarnings();
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function addSegment(event) {
  event.preventDefault();
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  const batch = els.batchInput.value.trim();
  state.segments.push(
    normalizeSegment({
      id: crypto.randomUUID(),
      code: els.codeInput.value.trim(),
      batch,
      duration: Number(els.durationInput.value),
      shift: els.shiftInput.value,
      damage: els.damageInput.value,
      note: els.noteInput.value.trim(),
      thumb,
      review: null
    })
  );
  // 加入已有风险批号的新段同样要进待复查
  resetReview(batch);
  els.segmentForm.reset();
  els.durationInput.value = 12;
  renderAll();
}

function moveSegment(id, direction) {
  const index = state.segments.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.segments.length) return;
  const [item] = state.segments.splice(index, 1);
  state.segments.splice(target, 0, item);
  renderAll();
}

function passSegment(id) {
  const item = state.segments.find((segment) => segment.id === id);
  if (!item) return;
  item.review = {
    verdict: "passed",
    handler: item.review?.handler || "",
    note: item.review?.note || "",
    at: new Date().toISOString()
  };
  renderAll();
}

function openReviewModal(id) {
  const item = state.segments.find((segment) => segment.id === id);
  if (!item) return;
  reviewTargetId = id;
  els.reviewTarget.textContent = `#${state.segments.indexOf(item) + 1} ${item.code}（批号 ${item.batch || "未登记"}）`;
  els.handlerInput.value = item.review?.handler || "";
  els.handlerNoteInput.value = item.review?.verdict === "failed" ? item.review.note || "" : "";
  els.reviewForm.hidden = false;
  els.modalBackdrop.hidden = false;
  els.handlerInput.focus();
}

function openEditModal(id) {
  const item = state.segments.find((segment) => segment.id === id);
  if (!item) return;
  editTargetId = id;
  els.editTarget.textContent = `#${state.segments.indexOf(item) + 1} ${item.code}`;
  els.editCode.value = item.code;
  els.editBatch.value = item.batch;
  els.editDuration.value = item.duration;
  els.editShift.value = item.shift;
  els.editDamage.value = item.damage;
  els.editNote.value = item.note;
  els.editForm.hidden = false;
  els.modalBackdrop.hidden = false;
  els.editCode.focus();
}

function closeModal() {
  els.modalBackdrop.hidden = true;
  els.reviewForm.hidden = true;
  els.editForm.hidden = true;
  reviewTargetId = null;
  editTargetId = null;
}

function resultLabel(item) {
  const { status } = infoOf(item.id);
  if (status === "normal") return "正常可放";
  if (status === "pending") return "待复查（不计可放时长）";
  if (status === "passed") return `复查合格，已恢复计时（${item.review?.handler || "—"}）`;
  if (status === "failed") return `复查不合格（处理人：${item.review?.handler || "—"}；${item.review?.note || "无说明"}）`;
  return "";
}

function exportList() {
  const full = state.segments.reduce((sum, item) => sum + Number(item.duration), 0);
  const playable = state.segments
    .filter((item) => isPlayable(item))
    .reduce((sum, item) => sum + Number(item.duration), 0);
  const pending = state.segments.filter((item) => infoOf(item.id).status === "pending").length;
  const groups = getBatchGroups();
  const riskBatches = [...groups.entries()]
    .filter(([, members]) => members.some((item) => isDefective(item)))
    .map(([batch]) => batch);

  const lines = [
    `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    `待复查片段：${pending} 段`,
    `可放时长：${formatDuration(playable)}（总时长 ${formatDuration(full)}，待复查/不合格不计入）`,
    `风险批号：${riskBatches.length ? riskBatches.join("、") : "无"}`,
    "",
    ...state.segments.map((item, index) => {
      const reason = isDefective(item)
        ? [item.shift !== "正常" ? item.shift : "", item.damage !== "完好" ? item.damage : ""].filter(Boolean).join("·")
        : "";
      return `${index + 1}. ${item.code}｜批号:${item.batch || "未登记"}｜${formatDuration(item.duration)}｜${item.shift}｜${item.damage}｜${reason || "无异常"}｜${resultLabel(item)}｜备注:${item.note || "无"}`;
    })
  ];
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.reelTitle || "film-reel"}-checklist.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.reelTitle.addEventListener("input", () => {
  state.reelTitle = els.reelTitle.value;
  saveState();
});
els.colorFilter.addEventListener("change", renderList);
els.statusFilter.addEventListener("change", renderList);
els.searchInput.addEventListener("input", renderList);
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);

els.segmentList.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  const edit = event.target.closest("[data-edit]");
  const pass = event.target.closest("[data-pass]");
  const fail = event.target.closest("[data-fail]");
  const batchFilter = event.target.closest("[data-batch-filter]");
  if (up) moveSegment(up.dataset.moveUp, -1);
  if (down) moveSegment(down.dataset.moveDown, 1);
  if (edit) openEditModal(edit.dataset.edit);
  if (pass) passSegment(pass.dataset.pass);
  if (fail) openReviewModal(fail.dataset.fail);
  if (batchFilter) {
    els.searchInput.value = batchFilter.dataset.batchFilter;
    renderList();
  }
  if (remove) {
    const item = state.segments.find((segment) => segment.id === remove.dataset.delete);
    const batch = item?.batch;
    state.segments = state.segments.filter((segment) => segment.id !== remove.dataset.delete);
    // 删段可能解除某批风险，旧批结论一律重新判定
    resetReview(batch);
    renderAll();
  }
});

els.reviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const item = state.segments.find((segment) => segment.id === reviewTargetId);
  if (!item) {
    closeModal();
    return;
  }
  item.review = {
    verdict: "failed",
    handler: els.handlerInput.value.trim(),
    note: els.handlerNoteInput.value.trim(),
    at: new Date().toISOString()
  };
  closeModal();
  renderAll();
});

els.editForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const item = state.segments.find((segment) => segment.id === editTargetId);
  if (!item) {
    closeModal();
    return;
  }
  const oldBatch = (item.batch || "").trim();
  const oldRisk = isDefective(item);
  item.code = els.editCode.value.trim();
  item.batch = els.editBatch.value.trim();
  item.duration = Number(els.editDuration.value) || 0;
  item.shift = els.editShift.value;
  item.damage = els.editDamage.value;
  item.note = els.editNote.value.trim();
  // 改批号：新旧两批复查结论失效；改颜色/破损：本段及所在批重新判定
  resetReview(oldBatch, item.batch);
  if (oldRisk !== isDefective(item)) resetReviewByIds([item.id]);
  closeModal();
  renderAll();
});

els.reviewCancel.addEventListener("click", closeModal);
els.editCancel.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (event) => {
  if (event.target === els.modalBackdrop) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.modalBackdrop.hidden) closeModal();
});

els.segmentList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

els.segmentList.addEventListener("dragend", (event) => {
  event.target.closest("[data-id]")?.classList.remove("dragging");
  draggedId = null;
});

els.segmentList.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  event.preventDefault();
  const fromIndex = state.segments.findIndex((item) => item.id === draggedId);
  const toIndex = state.segments.findIndex((item) => item.id === card.dataset.id);
  if (fromIndex < 0 || toIndex < 0) return;
  const [item] = state.segments.splice(fromIndex, 1);
  state.segments.splice(toIndex, 0, item);
  renderAll();
});

renderAll();
