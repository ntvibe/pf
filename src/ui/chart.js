import { buildChartData, buildTimelineSeries } from "../state.js";
import { formatEUR } from "../format.js";

let pieChart = null;
let timelineChart = null;
let modeSelect = null;
let pagesEl = null;
let dotsEl = null;
let toggleButtonEl = null;
let totalToggleEl = null;
let currentPage = 0;
let lastRows = [];
let showTimelineTotal = true;
let resizeHandlerAttached = false;
let transitionHandlerAttached = false;

export function initChart({
  pieEl,
  timelineEl,
  modeSelectEl,
  pagesElement,
  dotsElement,
  toggleButtonEl: toggleButtonElement,
  timelineTotalToggleEl,
  onModeChange
}){
  if(!pieEl || !timelineEl || typeof echarts === "undefined") return;

  if(!pieChart){
    pieChart = echarts.init(pieEl, null, { renderer: "canvas" });
  }
  if(!timelineChart){
    timelineChart = echarts.init(timelineEl, null, { renderer: "canvas" });
  }

  if(!resizeHandlerAttached){
    window.addEventListener("resize", () => {
      pieChart && pieChart.resize();
      timelineChart && timelineChart.resize();
    });
    resizeHandlerAttached = true;
  }

  if(modeSelectEl && !modeSelect){
    modeSelect = modeSelectEl;
    modeSelect.addEventListener("change", () => {
      if(onModeChange) onModeChange(modeSelect.value);
    });
  }

  pagesEl = pagesElement || pagesEl;
  dotsEl = dotsElement || dotsEl;

  if(pagesEl){
    if(!transitionHandlerAttached){
      pagesEl.addEventListener("transitionend", (event) => {
        if(event.propertyName !== "transform") return;
        pieChart && pieChart.resize();
        timelineChart && timelineChart.resize();
      });
      transitionHandlerAttached = true;
    }
  }

  if(dotsEl){
    dotsEl.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-index]");
      if(!btn) return;
      const idx = Number(btn.dataset.index);
      if(Number.isFinite(idx)) setPage(idx);
    });
  }

  if(toggleButtonElement && !toggleButtonEl){
    toggleButtonEl = toggleButtonElement;
    toggleButtonEl.addEventListener("click", () => {
      setPage(currentPage === 0 ? 1 : 0);
    });
  }

  if(timelineTotalToggleEl && !totalToggleEl){
    totalToggleEl = timelineTotalToggleEl;
    totalToggleEl.addEventListener("click", () => {
      setTimelineTotalVisible(!showTimelineTotal);
    });
    updateTotalToggle();
  }

  updateToggleButton();
}

function setPage(index){
  const clamped = Math.max(0, Math.min(1, index));
  if(clamped === currentPage) return;
  currentPage = clamped;
  if(pagesEl){
    pagesEl.style.transform = `translateX(-${clamped * 100}%)`;
  }
  updateDots();
  updateToggleButton();
  if(pieChart && timelineChart){
    setTimeout(() => {
      pieChart.resize();
      timelineChart.resize();
    }, 240);
  }
}

function updateDots(){
  if(!dotsEl) return;
  dotsEl.innerHTML = [0, 1].map((idx) => (
    `<button class="pager-dot ${idx === currentPage ? "active" : ""}" type="button" data-index="${idx}" aria-label="Chart page ${idx + 1}"></button>`
  )).join("");
}

function updateToggleButton(){
  if(!toggleButtonEl) return;
  const isTimeline = currentPage === 1;
  toggleButtonEl.textContent = isTimeline ? "Pie chart" : "Timeline";
  toggleButtonEl.setAttribute("aria-label", isTimeline ? "Show pie chart" : "Show timeline");
}

function updateTotalToggle(){
  if(!totalToggleEl) return;
  totalToggleEl.classList.toggle("active", showTimelineTotal);
  totalToggleEl.setAttribute("aria-pressed", String(showTimelineTotal));
}

function setTimelineTotalVisible(nextValue){
  showTimelineTotal = Boolean(nextValue);
  updateTotalToggle();
  if(lastRows.length){
    renderTimeline(lastRows, modeSelect?.value);
  }
}

function renderPie(rows, mode){
  if(!pieChart) return;
  const currentMode = mode || modeSelect?.value || "category";
  const data = buildChartData(currentMode, rows);
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
  const totalLabel = total > 0 ? formatEUR(total) : "—";

  pieChart.setOption({
    animation: true,
    animationDuration: 900,
    animationEasing: "cubicOut",
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      valueFormatter: (v) => formatEUR(v)
    },
    legend: {
      type: "scroll",
      bottom: 0,
      left: 10,
      right: 10
    },
    graphic: [
      {
        type: "text",
        left: "center",
        top: "44%",
        style: {
          text: totalLabel,
          fontSize: 18,
          fontWeight: 800,
          fill: "#111",
          textAlign: "center"
        }
      },
      {
        type: "text",
        left: "center",
        top: "52%",
        style: {
          text: "Total",
          fontSize: 12,
          fill: "#666",
          textAlign: "center"
        }
      }
    ],
    series: [
      {
        name: "Allocation",
        type: "pie",
        radius: ["50%", "72%"],
        center: ["50%", "48%"],
        padAngle: 2,
        avoidLabelOverlap: true,
        labelLayout: { hideOverlap: true },
        itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          formatter: (p) => {
            const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
            return `${p.name}\n${pct}%`;
          }
        },
        labelLine: { length: 10, length2: 6 },
        emphasis: {
          scale: true,
          scaleSize: 10,
          label: { fontWeight: "bold" }
        },
        data
      }
    ]
  }, true);
}

function renderTimeline(rows, mode){
  if(!timelineChart) return;
  const currentMode = mode || modeSelect?.value || "category";
  const timelineData = buildTimelineSeries(currentMode, rows, { includeTotal: showTimelineTotal });
  const dates = timelineData.dates;
  const seriesData = timelineData.series;

  timelineChart.setOption({
    animation: true,
    animationDuration: 800,
    animationEasing: "cubicOut",
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => formatEUR(v)
    },
    legend: {
      show: seriesData.length > 1,
      type: "scroll",
      top: 0,
      left: 0,
      right: 0
    },
    grid: { top: 56, left: 20, right: 20, bottom: 34, containLabel: true },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: false,
      axisLabel: { color: "#64748b" },
      axisLine: { lineStyle: { color: "#cbd5f5" } }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#64748b" },
      splitLine: { lineStyle: { color: "#e2e8f0" } }
    },
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: 0,
        filterMode: "none",
        zoomOnMouseWheel: true,
        moveOnMouseWheel: true,
        moveOnMouseMove: true,
        preventDefaultMouseMove: true
      }
    ],
    series: seriesData.map((entry) => ({
      name: entry.name,
      type: "line",
      smooth: true,
      data: entry.data,
      showSymbol: false,
      lineStyle: entry.isTotal ? { width: 3, color: "#2563eb" } : { width: 2 },
      areaStyle: entry.isTotal ? { color: "rgba(37, 99, 235, 0.15)" } : undefined
    }))
  }, true);
}

export function renderChart(rows, mode){
  if(!pieChart || !timelineChart) return;
  lastRows = rows;
  renderPie(rows, mode);
  renderTimeline(rows, mode);
  updateDots();
}
