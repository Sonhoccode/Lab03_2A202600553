// ===== DATA =====
const FLIGHTS = [
  { id:"VN101", carrier:"VietnamAirlines", origin:"HAN", destination:"SGN", depart:"2026-06-12T07:30", arrive:"2026-06-12T09:40", cabin:"economy", base_price:2100000 },
  { id:"VJ201", carrier:"VietJet",         origin:"HAN", destination:"SGN", depart:"2026-06-12T06:20", arrive:"2026-06-12T08:30", cabin:"economy", base_price:1650000 },
  { id:"QH301", carrier:"BambooAirways",   origin:"HAN", destination:"SGN", depart:"2026-06-12T10:10", arrive:"2026-06-12T12:25", cabin:"economy", base_price:1850000 },
  { id:"VN111", carrier:"VietnamAirlines", origin:"HAN", destination:"DAD", depart:"2026-06-12T08:05", arrive:"2026-06-12T09:25", cabin:"economy", base_price:1250000 },
  { id:"VN401", carrier:"VietnamAirlines", origin:"SGN", destination:"HAN", depart:"2026-06-13T19:30", arrive:"2026-06-13T21:40", cabin:"economy", base_price:2150000 },
  { id:"QH501", carrier:"BambooAirways",   origin:"SGN", destination:"HAN", depart:"2026-06-13T14:00", arrive:"2026-06-13T16:10", cabin:"economy", base_price:1750000 },
  { id:"VN701", carrier:"VietnamAirlines", origin:"HAN", destination:"SGN", depart:"2026-06-12T18:15", arrive:"2026-06-12T20:25", cabin:"business",base_price:5200000 },
  { id:"VJ801", carrier:"VietJet",         origin:"HAN", destination:"SGN", depart:"2026-06-12T20:30", arrive:"2026-06-12T22:40", cabin:"economy", base_price:1500000 },
];

const FARE_RULES = {
  VN101:{ refundable:"yes",     change_fee:300000, baggage_kg:20 },
  VJ201:{ refundable:"no",      change_fee:450000, baggage_kg:7  },
  QH301:{ refundable:"partial", change_fee:350000, baggage_kg:20 },
  VN111:{ refundable:"yes",     change_fee:250000, baggage_kg:20 },
  VN401:{ refundable:"yes",     change_fee:300000, baggage_kg:20 },
  QH501:{ refundable:"partial", change_fee:350000, baggage_kg:20 },
  VN701:{ refundable:"yes",     change_fee:0,      baggage_kg:30 },
  VJ801:{ refundable:"no",      change_fee:450000, baggage_kg:7  },
};

const SEAT_INVENTORY = {
  VN101:{ economy:6,  business:0 }, VJ201:{ economy:12, business:0 },
  QH301:{ economy:4,  business:0 }, VN111:{ economy:8,  business:0 },
  VN401:{ economy:7,  business:0 }, QH501:{ economy:5,  business:0 },
  VN701:{ economy:0,  business:3 }, VJ801:{ economy:9,  business:0 },
};

const ADD_ONS = { baggage_20kg:300000, baggage_30kg:450000, priority_boarding:120000 };
const TAX_RATE = 0.1;

// ===== PRESET CASES =====
const CASES = [
  "Bay HAN to SGN ngày 2026-06-12. Giá rẻ nhất là bao nhiêu và tổng chi phí với 10% thuế?",
  "Tôi cần vé HAN → SGN ngày 2026-06-12, hành lý 20kg, ngân sách 2.3 triệu.",
  "Chỉ chọn Vietnam Airlines. Vé bay HAN → DAD sáng sớm 2026-06-12.",
  "Tôi muốn 2 vé HAN → SGN, ưu tiên vé có hoàn/đổi, tính tổng giá.",
  "Bay SGN → HAN ngày 2026-06-13, tôi muốn vé sớm nhất có thể.",
];

// ===== TOOL SIMULATION =====
function fmt(n) { return n.toLocaleString("vi-VN") + "đ"; }

function searchFlights({ origin, destination, date, cabin="economy", budget=0, carrier="" }) {
  return FLIGHTS.filter(f =>
    f.origin === origin &&
    f.destination === destination &&
    f.depart.startsWith(date) &&
    f.cabin === cabin &&
    (!carrier || f.carrier === carrier) &&
    (!budget || f.base_price <= budget)
  );
}

function getFareRules(flight_id) { return FARE_RULES[flight_id] || null; }

function checkSeats(flight_id, count) {
  const inv = SEAT_INVENTORY[flight_id];
  if (!inv) return null;
  const avail = (inv.economy || 0) + (inv.business || 0);
  return { available: avail, requested: count, ok: avail >= count };
}

function calcPrice(flight_id, pax=1, addons=[]) {
  const f = FLIGHTS.find(fl => fl.id === flight_id);
  if (!f) return null;
  const base = f.base_price;
  const addTotal = addons.reduce((s, a) => s + (ADD_ONS[a] || 0), 0);
  const sub = (base + addTotal) * pax;
  const tax = Math.round(sub * TAX_RATE);
  return { base, addTotal, tax, total: sub + tax, pax };
}

// ===== AGENT SCENARIOS =====
const AGENT_SCENARIOS = [
  // Case 0: cheapest HAN->SGN
  async function(update) {
    await update("thought", "Cần tìm tất cả chuyến bay HAN→SGN ngày 2026-06-12 hạng economy.");
    await update("action", 'search_flights("HAN","SGN","2026-06-12","economy")');
    activateTool("search");
    const results = searchFlights({ origin:"HAN", destination:"SGN", date:"2026-06-12" });
    deactivateTool("search");
    const sorted = [...results].sort((a,b) => a.base_price - b.base_price);
    await update("obs", `Tìm thấy ${results.length} chuyến: ${sorted.map(f=>`${f.id}(${fmt(f.base_price)})`).join(", ")}`);
    await update("thought", `Rẻ nhất là ${sorted[0].id}. Tính tổng với 10% thuế.`);
    await update("action", `calculate_total_price("${sorted[0].id}", 1, [])`);
    activateTool("price");
    const price = calcPrice(sorted[0].id, 1, []);
    deactivateTool("price");
    await update("obs", `Base: ${fmt(price.base)}, Thuế: ${fmt(price.tax)}, Tổng: ${fmt(price.total)}`);
    return `✈ Vé rẻ nhất: **${sorted[0].id}** (${sorted[0].carrier}) — ${sorted[0].depart.split("T")[1]}\n💰 Giá cơ bản: ${fmt(sorted[0].base_price)}\n🧾 + 10% thuế: ${fmt(price.tax)}\n✅ Tổng cộng: ${fmt(price.total)}`;
  },
  // Case 1: HAN->SGN budget 2.3M, baggage 20kg
  async function(update) {
    await update("thought", "Cần vé HAN→SGN, ngân sách 2.3 triệu, hành lý 20kg.");
    await update("action", 'search_flights("HAN","SGN","2026-06-12","economy",2300000)');
    activateTool("search");
    const results = searchFlights({ origin:"HAN", destination:"SGN", date:"2026-06-12", budget:2300000 });
    deactivateTool("search");
    await update("obs", `${results.length} chuyến trong ngân sách: ${results.map(f=>f.id).join(", ")}`);
    const suitable = [];
    for (const f of results) {
      await update("thought", `Kiểm tra hành lý của ${f.id}`);
      await update("action", `get_fare_rules("${f.id}")`);
      activateTool("fare");
      const rules = getFareRules(f.id);
      deactivateTool("fare");
      await update("obs", `${f.id}: hành lý ${rules.baggage_kg}kg`);
      if (rules.baggage_kg >= 20) suitable.push(f);
    }
    if (!suitable.length) return "Không tìm thấy vé phù hợp trong ngân sách với hành lý 20kg.";
    const best = suitable.sort((a,b) => a.base_price - b.base_price)[0];
    return `✅ Phù hợp nhất: **${best.id}** (${best.carrier})\n💰 Giá: ${fmt(best.base_price)}\n🧳 Hành lý: ${getFareRules(best.id).baggage_kg}kg miễn cước`;
  },
  // Case 2: Vietnam Airlines only, HAN->DAD
  async function(update) {
    await update("thought", "Chỉ Vietnam Airlines, HAN→DAD, sáng sớm 2026-06-12.");
    await update("action", 'search_flights("HAN","DAD","2026-06-12","economy",0,"VietnamAirlines")');
    activateTool("search");
    const results = searchFlights({ origin:"HAN", destination:"DAD", date:"2026-06-12", carrier:"VietnamAirlines" });
    deactivateTool("search");
    await update("obs", `${results.length} chuyến Vietnam Airlines HAN→DAD: ${results.map(f=>`${f.id} lúc ${f.depart.split("T")[1]}`).join(", ")}`);
    const earliest = results.sort((a,b) => a.depart.localeCompare(b.depart))[0];
    if (!earliest) return "Không tìm thấy chuyến bay phù hợp.";
    return `✈ Sớm nhất: **${earliest.id}** — ${earliest.depart.split("T")[1]}\n🏢 Hãng: ${earliest.carrier}\n💰 Giá: ${fmt(earliest.base_price)}`;
  },
  // Case 3: 2 tickets with refund
  async function(update) {
    await update("thought", "Cần 2 vé HAN→SGN, ưu tiên có hoàn/đổi.");
    await update("action", 'search_flights("HAN","SGN","2026-06-12","economy")');
    activateTool("search");
    const results = searchFlights({ origin:"HAN", destination:"SGN", date:"2026-06-12" });
    deactivateTool("search");
    await update("obs", `${results.length} chuyến HAN→SGN.`);
    const refundable = [];
    for (const f of results) {
      const rules = getFareRules(f.id);
      if (rules && rules.refundable !== "no") refundable.push(f);
    }
    await update("thought", `${refundable.length} chuyến có hoàn/đổi. Kiểm tra ghế và tính giá.`);
    const best = refundable.sort((a,b) => a.base_price - b.base_price)[0];
    await update("action", `check_seat_availability("${best.id}", 2)`);
    activateTool("seat");
    const seats = checkSeats(best.id, 2);
    deactivateTool("seat");
    await update("obs", `${best.id}: ${seats.available} ghế còn, ${seats.ok ? "đủ" : "không đủ"} cho 2 người.`);
    await update("action", `calculate_total_price("${best.id}", 2, [])`);
    activateTool("price");
    const price = calcPrice(best.id, 2, []);
    deactivateTool("price");
    await update("obs", `Tổng 2 vé: ${fmt(price.total)}`);
    const rules = getFareRules(best.id);
    return `✅ Chuyến phù hợp: **${best.id}** (${best.carrier})\n♻ Hoàn vé: ${rules.refundable} | Phí đổi: ${fmt(rules.change_fee)}\n💺 Ghế còn: ${seats.available}\n💰 Tổng 2 vé (+ 10% thuế): ${fmt(price.total)}`;
  },
  // Case 4: earliest SGN->HAN
  async function(update) {
    await update("thought", "Tìm vé sớm nhất SGN→HAN ngày 2026-06-13.");
    await update("action", 'search_flights("SGN","HAN","2026-06-13","economy")');
    activateTool("search");
    const results = searchFlights({ origin:"SGN", destination:"HAN", date:"2026-06-13" });
    deactivateTool("search");
    await update("obs", `${results.length} chuyến SGN→HAN: ${results.map(f=>`${f.id}(${f.depart.split("T")[1]})`).join(", ")}`);
    const earliest = results.sort((a,b) => a.depart.localeCompare(b.depart))[0];
    if (!earliest) return "Không tìm thấy chuyến bay phù hợp.";
    await update("thought", `Sớm nhất là ${earliest.id} lúc ${earliest.depart.split("T")[1]}.`);
    return `⏰ Sớm nhất: **${earliest.id}** (${earliest.carrier})\n🛫 Khởi hành: ${earliest.depart.split("T")[1]}\n🛬 Đến: ${earliest.arrive.split("T")[1]}\n💰 Giá: ${fmt(earliest.base_price)}`;
  },
];

const CHATBOT_RESPONSES = [
  "Dựa trên thông tin chuyến bay thông thường, vé máy bay HAN → SGN ngày 12/06 thường dao động từ khoảng **800.000đ đến 2.500.000đ** tùy hãng và thời điểm đặt. Với 10% thuế, tổng chi phí ước tính khoảng **880.000đ – 2.750.000đ**. Tuy nhiên, tôi khuyên bạn nên kiểm tra trực tiếp trên website hãng bay để có giá chính xác nhất.",
  "Đối với vé HAN → SGN ngày 12/06 với hành lý 20kg và ngân sách 2.3 triệu, các hãng như VietJet thường có vé cơ bản khoảng 1.5-1.8 triệu, nhưng thường không bao gồm hành lý ký gửi. Bạn cần mua thêm gói hành lý 20kg khoảng 200-400 nghìn. Tổng ước tính: khoảng 1.7-2.2 triệu đồng.",
  "Vietnam Airlines thường có nhiều chuyến từ HAN đến DAD vào buổi sáng. Chuyến sớm nhất thường xuất phát lúc khoảng **6:00-7:30 sáng**. Giá vé hạng phổ thông dao động từ **1.2-1.8 triệu đồng**. Tôi khuyên bạn đặt vé sớm để được giá tốt nhất.",
  "Để đặt 2 vé HAN → SGN với điều kiện hoàn/đổi, bạn nên chọn các hạng vé linh hoạt. Vietnam Airlines thường có chính sách hoàn/đổi tốt nhất. Giá ước tính: khoảng **2.5-4.5 triệu đồng/2 vé** tùy thời điểm. Phí đổi vé thường 200-500 nghìn/vé.",
  "Từ SGN đến HAN ngày 13/06, chuyến bay sớm nhất thường xuất phát lúc **5:30-6:30 sáng**. Các hãng như VietJet và Bamboo Airways thường có chuyến sáng sớm. Giá khoảng **1.5-2.5 triệu đồng** cho hạng phổ thông.",
];

// ===== TOOL HELPERS =====
function activateTool(name) {
  const card = document.getElementById(`tool-${name}`);
  const status = document.getElementById(`status-${name}`);
  if (card) card.classList.add("tool-active");
  if (status) { status.textContent = "RUNNING"; status.className = "tool-status tool-running"; }
}

function deactivateTool(name) {
  const card = document.getElementById(`tool-${name}`);
  const status = document.getElementById(`status-${name}`);
  if (card) card.classList.remove("tool-active");
  if (status) { status.textContent = "DONE"; status.className = "tool-status tool-done"; }
  setTimeout(() => {
    if (status) { status.textContent = "IDLE"; status.className = "tool-status tool-idle"; }
    if (card) card.classList.remove("tool-active");
  }, 2000);
}

// ===== API CONFIG =====
const API_BASE = "http://localhost:5000";
let useRealAPI = false;

async function detectBackend() {
  try {
    const r = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const data = await r.json();
      useRealAPI = true;
      setModeIndicator(true, data.model);
      return true;
    }
  } catch {}
  useRealAPI = false;
  setModeIndicator(false);
  return false;
}

function setModeIndicator(live, model = "") {
  const el = document.getElementById("modeIndicator");
  if (!el) return;
  if (live) {
    el.textContent = `⚡ LIVE — ${model}`;
    el.className = "mode-indicator mode-live";
  } else {
    el.textContent = "🎭 SIMULATION (backend offline)";
    el.className = "mode-indicator mode-sim";
  }
}

// ===== UI HELPERS =====
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function addTrace(type, content) {
  const area = document.getElementById("agentTrace");
  const div = document.createElement("div");
  div.className = `trace-step trace-${type}`;
  const labels = { thought:"THOUGHT", action:"ACTION", obs:"OBSERVATION", final:"FINAL ANSWER" };
  div.innerHTML = `<span class="trace-tag tag-${type}">${labels[type]}</span><div class="trace-content">${content}</div>`;
  area.appendChild(div);
  div.scrollIntoView({ behavior:"smooth", block:"nearest" });
}

let runCount = 0;

// ===== RESET UI =====
function resetUI() {
  document.getElementById("chatbotResponse").innerHTML = "";
  document.getElementById("agentTrace").innerHTML = "";
  document.getElementById("agentResponse").innerHTML = "";
  document.getElementById("chatbotThinking").style.display = "flex";
  document.getElementById("agentThinking").style.display = "flex";
  document.getElementById("chatbotMeta").textContent = "Đang xử lý...";
  document.getElementById("agentMeta").textContent = "Khởi động vòng lặp ReAct...";
  ["chatbotSteps","agentSteps"].forEach(id => document.getElementById(id).textContent = "—");
  ["chatbotAccuracy","agentAccuracy"].forEach(id => document.getElementById(id).textContent = "?");
}

// ===== REAL API: CHATBOT =====
async function runChatbotReal(query) {
  const t0 = Date.now();
  const r = await fetch(`${API_BASE}/api/chatbot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await r.json();
  const elapsed = Date.now() - t0;
  document.getElementById("chatbotThinking").style.display = "none";
  document.getElementById("chatbotResponse").innerHTML =
    `<div style="white-space:pre-wrap;font-family:var(--mono);font-size:15px;line-height:1.8;color:var(--text-dim)">${data.content || data.error}</div>`;
  document.getElementById("chatbotSteps").textContent = "1";
  document.getElementById("chatbotTools").textContent = "Không có";
  document.getElementById("chatbotAccuracy").textContent = "Ước tính";
  document.getElementById("chatbotMeta").textContent = `Hoàn thành — ${elapsed}ms`;
}

// ===== REAL API: AGENT (SSE STREAM) =====
// Maps actual Python tool names → UI card IDs
const TOOL_UI_MAP = {
  search_flights: "search",
  get_fare_rules: "fare",
  check_seat_availability: "seat",
  calculate_total_price: "price",
  create_booking: "book",
};

async function runAgentReal(query) {
  const toolsUsed = new Set();
  let stepCount = 0;
  const t0 = Date.now();

  const response = await fetch(`${API_BASE}/api/agent/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let evt;
      try { evt = JSON.parse(line.slice(6)); } catch { continue; }

      document.getElementById("agentThinking").style.display = "none";

      if (evt.type === "thought") {
        addTrace("thought", evt.content + (evt.latency_ms ? ` <span style="color:var(--text-muted);font-size:10px">[${evt.latency_ms}ms]</span>` : ""));
      } else if (evt.type === "action") {
        const uiTool = TOOL_UI_MAP[evt.tool] || evt.tool;
        toolsUsed.add(evt.tool);
        activateTool(uiTool);
        addTrace("action", evt.content);
        stepCount++;
        document.getElementById("agentSteps").textContent = stepCount;
        document.getElementById("agentMeta").textContent = `Bước ${stepCount} — ${evt.tool}`;
      } else if (evt.type === "observation") {
        let obs = evt.content;
        try { obs = JSON.stringify(JSON.parse(obs), null, 2); } catch {}
        addTrace("obs", `<pre style="margin:0;overflow:auto;max-height:120px">${obs}</pre>`);
        // Deactivate the tool that just finished
        const lastTool = [...toolsUsed].at(-1);
        if (lastTool) deactivateTool(TOOL_UI_MAP[lastTool] || lastTool);
      } else if (evt.type === "final") {
        const elapsed = Date.now() - t0;
        document.getElementById("agentResponse").innerHTML = `
          <div class="final-answer-block">
            <span class="final-answer-label">FINAL ANSWER — ${elapsed}ms tổng thời gian</span>
            <div style="white-space:pre-wrap;color:var(--text)">${evt.content}</div>
          </div>`;
        document.getElementById("agentTools").textContent = [...toolsUsed].join(", ") || "—";
        document.getElementById("agentAccuracy").textContent = "Chính xác";
        document.getElementById("agentMeta").textContent = `Hoàn thành — ${stepCount} bước — ${elapsed}ms`;
      } else if (evt.type === "error") {
        addTrace("thought", `⚠ LỖI: ${evt.content}`);
      }
    }
  }
}

// ===== MAIN RUN =====
async function runComparison() {
  const btn = document.getElementById("runBtn");
  const query = document.getElementById("userQuery").value.trim();
  if (!query) return;

  btn.classList.add("loading");
  btn.textContent = "⏳ ĐANG CHẠY...";
  runCount++;
  document.getElementById("statRuns").textContent = runCount;
  resetUI();

  const idx = getCurrentCaseIdx();

  if (useRealAPI) {
    // ── LIVE MODE: call real backend ────────────────────────────────────
    await Promise.all([
      runChatbotReal(query),
      runAgentReal(query),
    ]);
  } else {
    // ── SIMULATION MODE: local JS ────────────────────────────────────────
    await delay(800 + Math.random() * 600);
    document.getElementById("chatbotThinking").style.display = "none";
    const chatbotText = CHATBOT_RESPONSES[idx] || CHATBOT_RESPONSES[0];
    document.getElementById("chatbotResponse").innerHTML =
      `<div style="white-space:pre-wrap;font-family:var(--mono);font-size:15px;line-height:1.8;color:var(--text-dim)">${chatbotText}</div>`;
    document.getElementById("chatbotSteps").textContent = "1";
    document.getElementById("chatbotTools").textContent = "Không có";
    document.getElementById("chatbotAccuracy").textContent = "Ước tính";
    document.getElementById("chatbotMeta").textContent = "Hoàn thành (mô phỏng)";

    const scenarioFn = AGENT_SCENARIOS[idx] || AGENT_SCENARIOS[0];
    let stepCount = 0;
    const toolsUsed = new Set();
    const origActivate = activateTool;
    window.activateTool = (n) => { toolsUsed.add(n); origActivate(n); };
    const update = async (type, content) => {
      await delay(500 + Math.random() * 400);
      document.getElementById("agentThinking").style.display = "none";
      addTrace(type, content);
      if (type !== "thought") stepCount++;
      document.getElementById("agentSteps").textContent = stepCount;
      document.getElementById("agentMeta").textContent = `Bước ${stepCount}...`;
    };
    try {
      const finalAns = await scenarioFn(update);
      document.getElementById("agentResponse").innerHTML = `
        <div class="final-answer-block">
          <span class="final-answer-label">FINAL ANSWER (mô phỏng)</span>
          <div style="white-space:pre-wrap;color:var(--text)">${finalAns.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>
        </div>`;
      document.getElementById("agentTools").textContent = [...toolsUsed].join(", ") || "—";
      document.getElementById("agentAccuracy").textContent = "Chính xác";
      document.getElementById("agentMeta").textContent = `Hoàn thành (${stepCount} bước)`;
    } catch(e) {
      document.getElementById("agentResponse").textContent = "Lỗi: " + e.message;
    }
    window.activateTool = origActivate;
  }

  btn.classList.remove("loading");
  btn.innerHTML = '<span class="run-icon">▶</span> CHẠY SO SÁNH';
  highlightFlights(idx);
}

function getCurrentCaseIdx() {
  const active = document.querySelector(".preset-btn.active");
  return active ? parseInt(active.dataset.idx) : 0;
}

// ===== PRESETS =====
document.getElementById("presetList").addEventListener("click", (e) => {
  const btn = e.target.closest(".preset-btn");
  if (!btn) return;
  document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("userQuery").value = CASES[parseInt(btn.dataset.idx)];
});

// Set initial value
document.getElementById("userQuery").value = CASES[0];

// Enter key support
document.getElementById("userQuery").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runComparison();
});

// ===== FLIGHT TABLE =====
function buildTable() {
  const tbody = document.getElementById("flightTableBody");
  const carrierClass = { VietnamAirlines:"carrier-vn", VietJet:"carrier-vj", BambooAirways:"carrier-qh" };
  const refClass = { yes:"badge-yes", no:"badge-no", partial:"badge-partial" };

  FLIGHTS.forEach(f => {
    const rules = FARE_RULES[f.id] || {};
    const tr = document.createElement("tr");
    tr.id = `row-${f.id}`;
    tr.innerHTML = `
      <td><span style="font-weight:700;color:var(--text)">${f.id}</span></td>
      <td class="${carrierClass[f.carrier] || ""}">${f.carrier}</td>
      <td style="color:var(--text-dim)">${f.origin} → ${f.destination}</td>
      <td>${f.depart.split("T")[1]}</td>
      <td>${f.arrive.split("T")[1]}</td>
      <td style="color:var(--text-muted);text-transform:capitalize">${f.cabin}</td>
      <td class="price-val">${fmt(f.base_price)}</td>
      <td class="${refClass[rules.refundable] || ""}">${rules.refundable || "—"}</td>
      <td style="color:var(--text-dim)">${rules.baggage_kg ? rules.baggage_kg+"kg" : "—"}</td>`;
    tbody.appendChild(tr);
  });
}

function highlightFlights(idx) {
  document.querySelectorAll(".flight-table tr").forEach(r => r.classList.remove("row-highlight"));
  const highlightMap = {
    0: ["VJ801"], 1: ["VN101", "QH301"], 2: ["VN111"],
    3: ["VN101", "QH301"], 4: ["QH501"],
  };
  (highlightMap[idx] || []).forEach(id => {
    const row = document.getElementById(`row-${id}`);
    if (row) row.classList.add("row-highlight");
  });
}

// ===== INIT =====
buildTable();
detectBackend(); // auto-detect if backend is running

// ===================================================================
// ===== CHAT WITH MEMORY ============================================
// ===================================================================

// Session ID persisted across page reloads
const CHAT_SESSION_ID = (() => {
  let id = localStorage.getItem("chatSessionId");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("chatSessionId", id); }
  return id;
})();

let chatMode = "chatbot"; // "chatbot" | "agent"
let chatBusy = false;

// ── Mode toggle ──────────────────────────────────────────────────────

function setChatMode(mode) {
  chatMode = mode;
  document.getElementById("chatModeChatbot").classList.toggle("mode-btn-active", mode === "chatbot");
  document.getElementById("chatModeAgent").classList.toggle("mode-btn-active", mode === "agent");
  document.getElementById("chatInput").placeholder =
    mode === "agent"
      ? "Hỏi agent (có công cụ + bộ nhớ)... (Enter để gửi)"
      : "Hỏi chatbot (không có công cụ)... (Enter để gửi)";
}

// ── Message rendering ────────────────────────────────────────────────

function removeWelcome() {
  const w = document.querySelector(".chat-welcome");
  if (w) w.remove();
}

function appendUserMsg(text) {
  removeWelcome();
  const win = document.getElementById("chatWindow");
  const div = document.createElement("div");
  div.className = "chat-msg chat-msg-user";
  const now = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  div.innerHTML = `
    <div class="chat-bubble bubble-user">${escHtml(text)}</div>
    <div class="chat-meta">${now}</div>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

function appendTypingIndicator() {
  const win = document.getElementById("chatWindow");
  const div = document.createElement("div");
  div.id = "chatTyping";
  div.className = "chat-typing";
  div.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>
    <span style="font-family:var(--mono);font-size:12px;color:var(--text-muted);margin-left:4px">
      ${chatMode === "agent" ? "Agent đang suy nghĩ..." : "Đang trả lời..."}
    </span>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
  return div;
}

function removeTyping() {
  document.getElementById("chatTyping")?.remove();
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Append a bot message with optional trace steps above it
function appendBotMsg(text, traceSteps = [], isAgent = false, meta = "") {
  removeTyping();
  const win = document.getElementById("chatWindow");
  const div = document.createElement("div");
  div.className = "chat-msg chat-msg-bot";
  const now = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  let tracesHtml = "";
  for (const s of traceSteps) {
    const tagColors = { THOUGHT: "#d97706", ACTION: "#3b82f6", OBSERVATION: "#059669" };
    const color = tagColors[s.tag] || "#888";
    tracesHtml += `
      <div class="chat-trace">
        <span class="chat-trace-tag" style="color:${color}">${s.tag}</span>
        <span>${escHtml(s.content.substring(0, 160))}${s.content.length > 160 ? "…" : ""}</span>
      </div>`;
  }

  div.innerHTML = `
    ${tracesHtml}
    <div class="chat-bubble bubble-bot ${isAgent ? "bubble-agent" : ""}">
      ${text.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}
    </div>
    <div class="chat-meta">${now}${meta ? " · " + meta : ""}</div>`;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

// Live-streaming bot bubble (for agent mode)
function createStreamingBubble() {
  removeTyping();
  const win = document.getElementById("chatWindow");
  const wrapper = document.createElement("div");
  wrapper.className = "chat-msg chat-msg-bot";
  wrapper.id = "streamingMsg";

  const tracesContainer = document.createElement("div");
  tracesContainer.id = "streamTraces";
  wrapper.appendChild(tracesContainer);

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble bubble-bot bubble-agent";
  bubble.id = "streamBubble";
  bubble.innerHTML = `<span style="color:var(--text-muted);font-family:var(--mono);font-size:12px">…</span>`;
  wrapper.appendChild(bubble);

  const meta = document.createElement("div");
  meta.className = "chat-meta";
  meta.id = "streamMeta";
  wrapper.appendChild(meta);

  win.appendChild(wrapper);
  win.scrollTop = win.scrollHeight;
  return { tracesContainer, bubble, meta };
}

function addStreamTrace(container, tag, content, win) {
  const tagColors = { THOUGHT: "#d97706", ACTION: "#3b82f6", OBSERVATION: "#059669" };
  const color = tagColors[tag] || "#888";
  const el = document.createElement("div");
  el.className = "chat-trace";
  el.innerHTML = `<span class="chat-trace-tag" style="color:${color}">${tag}</span>
    <span>${escHtml(content.substring(0, 160))}${content.length > 160 ? "…" : ""}</span>`;
  container.appendChild(el);
  win.scrollTop = win.scrollHeight;
}

// ── Chat send logic ──────────────────────────────────────────────────

async function sendChat() {
  if (chatBusy) return;
  const input = document.getElementById("chatInput");
  const query = input.value.trim();
  if (!query) return;

  if (!useRealAPI) {
    appendUserMsg(query);
    input.value = "";
    appendTypingIndicator();
    await delay(1200);
    appendBotMsg(
      "⚠️ Backend chưa bật. Khởi động `python ui/server.py` để dùng chat thật.",
      [], false
    );
    return;
  }

  chatBusy = true;
  input.value = "";
  document.getElementById("chatSendBtn").disabled = true;
  appendUserMsg(query);

  if (chatMode === "chatbot") {
    await sendChatChatbot(query);
  } else {
    await sendChatAgent(query);
  }

  chatBusy = false;
  document.getElementById("chatSendBtn").disabled = false;
  input.focus();
}

async function sendChatChatbot(query) {
  appendTypingIndicator();
  const t0 = Date.now();
  try {
    const r = await fetch(`${API_BASE}/api/chat/chatbot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, session_id: CHAT_SESSION_ID }),
    });
    const data = await r.json();
    const elapsed = Date.now() - t0;
    appendBotMsg(data.content || data.error, [], false,
      `Chatbot · ${elapsed}ms · lượt ${data.turn || "?"}`);
    document.getElementById("chatTurnCount").textContent = `${data.turn || "?"} lượt`;
    document.getElementById("chatModelBadge").textContent = data.model || "—";
  } catch (e) {
    removeTyping();
    appendBotMsg(`Lỗi: ${e.message}`, [], false);
  }
}

async function sendChatAgent(query) {
  const win = document.getElementById("chatWindow");
  const chatToolsUsed = new Set();
  appendTypingIndicator();
  const t0 = Date.now();

  try {
    const response = await fetch(`${API_BASE}/api/chat/agent/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, session_id: CHAT_SESSION_ID }),
    });

    removeTyping();
    const { tracesContainer, bubble, meta } = createStreamingBubble();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let evt;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }

        if (evt.type === "thought") {
          addStreamTrace(tracesContainer, "THOUGHT", evt.content, win);
        } else if (evt.type === "action") {
          addStreamTrace(tracesContainer, "ACTION", evt.content, win);
          // Activate tool card in Tools section
          const uiTool = TOOL_UI_MAP[evt.tool] || evt.tool;
          chatToolsUsed.add(evt.tool);
          activateTool(uiTool);
        } else if (evt.type === "observation") {
          let obs = evt.content;
          try { obs = JSON.stringify(JSON.parse(obs), null, 2); } catch {}
          addStreamTrace(tracesContainer, "OBSERVATION", obs, win);
          // Deactivate the tool that just returned
          const lastTool = [...chatToolsUsed].at(-1);
          if (lastTool) deactivateTool(TOOL_UI_MAP[lastTool] || lastTool);
        } else if (evt.type === "final") {
          const elapsed = Date.now() - t0;
          bubble.innerHTML = evt.content.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
          meta.textContent = `Agent · ${elapsed}ms`;
        } else if (evt.type === "done") {
          document.getElementById("chatTurnCount").textContent = `${evt.turn || "?"} lượt`;
          document.getElementById("chatModelBadge").textContent = evt.model || "—";
        } else if (evt.type === "error") {
          addStreamTrace(tracesContainer, "⚠ LỖI", evt.content, win);
        }
        win.scrollTop = win.scrollHeight;
      }
    }
  } catch (e) {
    removeTyping();
    appendBotMsg(`Lỗi: ${e.message}`, [], true);
  }
}

// ── Clear chat ───────────────────────────────────────────────────────

async function clearChat() {
  document.getElementById("chatWindow").innerHTML = `
    <div class="chat-welcome">
      <div class="welcome-icon">💬</div>
      <div class="welcome-title">Bắt đầu cuộc trò chuyện</div>
      <div class="welcome-sub">Chọn <strong>Chatbot</strong> hoặc <strong>ReAct Agent</strong> rồi nhập câu hỏi bất kỳ</div>
    </div>`;
  document.getElementById("chatTurnCount").textContent = "0 lượt";

  if (useRealAPI) {
    try {
      await fetch(`${API_BASE}/api/chat/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: CHAT_SESSION_ID, mode: "both" }),
      });
    } catch {}
  }
}

// Enter key for chat
document.getElementById("chatInput").addEventListener("keydown", e => {
  if (e.key === "Enter") sendChat();
});
