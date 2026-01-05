import { buildChartData, buildTimelineSeries } from "../state.js";
import { formatEUR } from "../format.js";

let pieChart = null;
let timelineChart = null;
let modeSelect = null;
let pagesEl = null;
let dotsEl = null;
let currentPage = 0;
let lastRows = [];
let resizeHandlerAttached = false;

export function initChart({
  pieEl,
  timelineEl,
  modeSelectEl,
  pagesElement,
  dotsElement,
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
    setupPager(pagesEl);
  }

  if(dotsEl){
    dotsEl.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-index]");
      if(!btn) return;
      const idx = Number(btn.dataset.index);
      if(Number.isFinite(idx)) setPage(idx);
    });
  }
}

function setupPager(container){
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let pointerId = null;
  const supportsPointer = "PointerEvent" in window;

  const handleSwipe = (dx, dy) => {
    if(Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    if(dx < 0){
      setPage(Math.min(1, currentPage + 1));
    }else{
      setPage(Math.max(0, currentPage - 1));
    }
  };

  if(supportsPointer){
    container.addEventListener("pointerdown", (event) => {
      if(event.pointerType === "mouse" && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      pointerId = event.pointerId;
      dragging = true;
      container.setPointerCapture(pointerId);
    });

    container.addEventListener("pointermove", (event) => {
      if(!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if(Math.abs(dx) > Math.abs(dy)){
        event.preventDefault();
      }
    }, { passive: false });

    container.addEventListener("pointerup", (event) => {
      if(!dragging || event.pointerId !== pointerId) return;
      dragging = false;
      container.releasePointerCapture(pointerId);
      handleSwipe(event.clientX - startX, event.clientY - startY);
    });

    container.addEventListener("pointercancel", () => {
      dragging = false;
      pointerId = null;
    });
  }else{
    container.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];
      if(!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      dragging = true;
    }, { passive: true });

    container.addEventListener("touchmove", (event) => {
      if(!dragging) return;
      const touch = event.touches[0];
      if(!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if(Math.abs(dx) > Math.abs(dy)){
        event.preventDefault();
      }
    }, { passive: false });

    container.addEventListener("touchend", (event) => {
      if(!dragging) return;
      dragging = false;
      const touch = event.changedTouches[0];
      if(!touch) return;
      handleSwipe(touch.clientX - startX, touch.clientY - startY);
    });
  }
}

function setPage(index){
  const clamped = Math.max(0, Math.min(1, index));
  if(clamped === currentPage) return;
  currentPage = clamped;
  if(pagesEl){
    pagesEl.style.transform = `translateX(-${index * 100}%)`;
  }
  updateDots();
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
        radius: ["55%", "78%"],
        center: ["50%", "45%"],
        padAngle: 2,
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: "#fff", borderWidth: 2 },
        label: {
          show: true,
          formatter: (p) => {
            const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
            return `${p.name}\n${pct}%`;
          }
        },
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

function renderTimeline(rows){
  if(!timelineChart) return;
  const seriesData = buildTimelineSeries(rows);
  const dates = seriesData.map((d) => d.date);
  const values = seriesData.map((d) => d.value);

  timelineChart.setOption({
    animation: true,
    animationDuration: 800,
    animationEasing: "cubicOut",
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      valueFormatter: (v) => formatEUR(v)
    },
    grid: { top: 24, left: 12, right: 18, bottom: 30, containLabel: true },
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
    series: [
      {
        name: "Portfolio value",
        type: "line",
        smooth: true,
        data: values,
        showSymbol: false,
        lineStyle: { width: 3, color: "#2563eb" },
        areaStyle: { color: "rgba(37, 99, 235, 0.15)" }
      }
    ]
  }, true);
}

export function renderChart(rows, mode){
  if(!pieChart || !timelineChart) return;
  lastRows = rows;
  renderPie(rows, mode);
  renderTimeline(rows);
  updateDots();
}
