import { buildChartData } from "../state.js";
import { formatEUR } from "../format.js";

let chart = null;
let modeSelect = null;
let resizeHandlerAttached = false;

export function initChart({ chartEl, modeSelectEl, onModeChange }){
  if(!chartEl || typeof echarts === "undefined") return;

  if(!chart){
    chart = echarts.init(chartEl, null, { renderer: "canvas" });
  }

  if(!resizeHandlerAttached){
    window.addEventListener("resize", () => chart && chart.resize());
    resizeHandlerAttached = true;
  }

  if(modeSelectEl && !modeSelect){
    modeSelect = modeSelectEl;
    modeSelect.addEventListener("change", () => {
      if(onModeChange) onModeChange(modeSelect.value);
    });
  }
}

export function renderChart(rows, mode){
  if(!chart) return;
  const currentMode = mode || modeSelect?.value || "asset";
  const data = buildChartData(currentMode, rows);
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const totalLabel = total > 0 ? formatEUR(total) : "—";

  chart.setOption({
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
