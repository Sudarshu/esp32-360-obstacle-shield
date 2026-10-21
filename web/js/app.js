import { VehicleView } from "./vehicle_view.js?v=1.2.0";
import { TelemetryClient } from "./telemetry.js";
import { MockTelemetryGenerator } from "./mock_generator.js";

class App {
  constructor() {
    this.config = null;
    this.view = null;
    this.telemetryClient = null;
    this.mockGen = null;
    this.isSimulationMode = false;

    this.init();
  }

  async init() {
    /* Load configuration */
    try {
      let resp;
      try {
        resp = await fetch("./sensor_config.json");
      } catch (err) {}
      if (!resp || !resp.ok) {
        resp = await fetch("../shared/sensor_config.json");
      }
      if (resp.ok) {
        this.config = await resp.json();
      }
    } catch (e) {
      console.warn("Using embedded default sensor config");
    }

    /* Initialize 3D View */
    const canvas = document.getElementById("canvas-3d");
    this.view = new VehicleView(canvas, this.config);

    /* Initialize Simulation Generator */
    this.mockGen = new MockTelemetryGenerator();

    /* Initialize Telemetry Client */
    this.telemetryClient = new TelemetryClient({
      onTelemetry: (data, rateHz) => this.handleTelemetry(data, rateHz),
      onHeartbeat: (hb) => this.handleHeartbeat(hb),
      onStatusChange: (status) => this.handleStatusChange(status),
      onStale: (stale) => this.handleStale(stale)
    });

    this.setupUI();
    this.renderSensorCards();

    /* Attempt connecting to ESP32 WebSocket */
    this.telemetryClient.connect();

    /* If disconnected after 2.5 seconds and user hasn't connected, offer fallback simulation */
    setTimeout(() => {
      if (!this.telemetryClient.isConnected && !this.isSimulationMode) {
        console.log("[App] ESP32 not detected. Starting browser simulation mode...");
        this.setSimulationMode(true);
      }
    }, 2500);
  }

  setupUI() {
    /* Camera Preset Buttons */
    document.querySelectorAll(".cam-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".cam-btn").forEach((b) => b.classList.remove("active"));
        const targetBtn = e.currentTarget;
        targetBtn.classList.add("active");
        const view = targetBtn.dataset.view;
        if (view === "rotate") {
          this.view.autoRotate = !this.view.autoRotate;
          targetBtn.classList.toggle("active", this.view.autoRotate);
        } else {
          this.view.setCameraView(view);
        }
      });
    });

    /* Vehicle Color Selector */
    document.querySelectorAll(".color-dot").forEach((dot) => {
      dot.addEventListener("click", (e) => {
        document.querySelectorAll(".color-dot").forEach((d) => d.classList.remove("active"));
        const target = e.currentTarget;
        target.classList.add("active");
        const hex = target.dataset.color;
        if (this.view && hex) {
          this.view.setVehicleColor(hex);
        }
      });
    });

    /* Simulation Toggle */
    const simToggleBtn = document.getElementById("btn-toggle-sim");
    if (simToggleBtn) {
      simToggleBtn.addEventListener("click", () => {
        this.setSimulationMode(!this.isSimulationMode);
      });
    }

    /* Modals */
    this.setupModal("btn-settings", "modal-settings", "btn-close-settings");
    this.setupModal("btn-diagnostics", "modal-diagnostics", "btn-close-diagnostics");

    /* Settings Form Save */
    const formSettings = document.getElementById("form-settings");
    if (formSettings) {
      formSettings.addEventListener("submit", (e) => {
        e.preventDefault();
        this.saveSettings();
      });
    }
  }

  setupModal(btnId, modalId, closeBtnId) {
    const btn = document.getElementById(btnId);
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeBtnId);
    if (!btn || !modal) return;

    btn.addEventListener("click", () => modal.classList.add("open"));
    if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("open");
    });
  }

  setSimulationMode(enabled) {
    this.isSimulationMode = enabled;
    const simBtn = document.getElementById("btn-toggle-sim");
    const badge = document.getElementById("status-badge");

    if (enabled) {
      this.mockGen.start(7.0, (data) => this.handleTelemetry(data, 7.0));
      if (simBtn) simBtn.classList.add("active");
      if (badge) {
        badge.className = "badge simulating";
        badge.querySelector(".badge-text").textContent = "SIMULATING";
      }
    } else {
      this.mockGen.stop();
      if (simBtn) simBtn.classList.remove("active");
      this.telemetryClient.connect();
    }
  }

  renderSensorCards() {
    const grid = document.getElementById("sensors-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const names = [
      "FL (Front-Left)", "FC (Front-Center)", "FR (Front-Right)",
      "RFS (Right-Front)", "RRS (Right-Rear)", "RR (Rear-Right)",
      "RL (Rear-Left)", "LS (Left-Side)"
    ];

    for (let i = 0; i < 8; i++) {
      const card = document.createElement("div");
      card.className = "sensor-card";
      card.id = `sensor-card-${i}`;
      card.innerHTML = `
        <div class="card-header">
          <span class="card-title">#${i} ${names[i]}</span>
          <span class="card-badge" id="card-status-${i}">WAITING</span>
        </div>
        <div class="card-body">
          <span class="card-dist" id="card-dist-${i}">---<span class="card-unit">cm</span></span>
          <span class="card-meta" id="card-meta-${i}">-- &mu;s</span>
        </div>
      `;
      grid.appendChild(card);
    }
  }

  handleTelemetry(data, measuredRateHz) {
    if (!data || !data.sensors) return;

    /* Update 3D Canvas */
    this.view.updateTelemetry(data);

    /* Update HUD Metrics */
    const seqEl = document.getElementById("stat-seq");
    if (seqEl) seqEl.textContent = data.seq;

    const rateEl = document.getElementById("stat-rate");
    if (rateEl) rateEl.textContent = (measuredRateHz || data.rate_hz || 0).toFixed(1);

    /* Update Sensor Cards */
    let minDistance = 9999.0;
    let closestSensor = null;

    data.sensors.forEach((s) => {
      const card = document.getElementById(`sensor-card-${s.id}`);
      const distEl = document.getElementById(`card-dist-${s.id}`);
      const statusEl = document.getElementById(`card-status-${s.id}`);
      const metaEl = document.getElementById(`card-meta-${s.id}`);
      if (!card) return;

      /* Reset Classes */
      card.className = "sensor-card";

      if (s.distance_cm !== null && s.distance_cm > 0) {
        distEl.innerHTML = `${s.distance_cm.toFixed(1)}<span class="card-unit">cm</span>`;
        if (s.status === "below_blindzone") {
          statusEl.textContent = "BLINDZONE";
          metaEl.textContent = "HAZARD";
          card.classList.add("status-blindzone", "prox-red");
        } else {
          statusEl.textContent = "OK";
          metaEl.textContent = `${s.pulse_us} ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âµs`;
          if (s.distance_cm <= this.view.threshRed) {
            card.classList.add("prox-red");
          } else if (s.distance_cm <= this.view.threshYellow) {
            card.classList.add("prox-yellow");
          } else {
            card.classList.add("prox-green");
          }
        }

        if (s.distance_cm < minDistance) {
          minDistance = s.distance_cm;
          closestSensor = s.id;
        }
      } else if (s.status === "below_blindzone") {
        distEl.innerHTML = `&lt;22<span class="card-unit">cm</span>`;
        statusEl.textContent = "BLINDZONE";
        metaEl.textContent = "HAZARD";
        card.classList.add("status-blindzone", "prox-red");
        minDistance = 20.0;
        closestSensor = s.id;
      } else {
        distEl.innerHTML = `---<span class="card-unit">cm</span>`;
        statusEl.textContent = s.status ? s.status.toUpperCase() : "TIMEOUT";
        metaEl.textContent = `${s.consecutive_timeouts || 0} to`;
        card.classList.add("status-timeout");
      }
    });

    /* Update Mini 2D Radar */
    this.drawMiniRadar(data.sensors, minDistance, closestSensor);
  }

  drawMiniRadar(sensors, minDistance, closestSensor) {
    const canvas = document.getElementById("radar-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = w * 0.45;

    ctx.clearRect(0, 0, w, h);

    /* Draw Range Circles */
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    [0.33, 0.66, 1.0].forEach((ratio) => {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * ratio, 0, Math.PI * 2);
      ctx.stroke();
    });

    /* Draw Car Silhouette in Center */
    ctx.fillStyle = "#334155";
    ctx.fillRect(cx - 9, cy - 18, 18, 36);
    ctx.fillStyle = "#00e676";
    ctx.fillRect(cx - 7, cy - 18, 14, 4); /* Front bumper marker */

    /* Draw 8 Sensor Rays */
    const angles = [45, 0, -45, -90, -90, -135, 135, 90];
    sensors.forEach((s) => {
      const angRad = (angles[s.id] * Math.PI) / 180.0;
      /* Rotate so 0 deg points UP */
      const rx = Math.sin(angRad);
      const ry = -Math.cos(angRad);

      const hasDist = (s.distance_cm !== null && s.distance_cm > 0);
      const isBlind = (s.status === "below_blindzone");

      if (hasDist || isBlind) {
        const d_cm = hasDist ? s.distance_cm : 20.0;
        const dRatio = Math.min(1.0, d_cm / 350.0);
        const distR = maxR * dRatio;

        let strokeColor = "#00e676";
        if (d_cm <= this.view.threshRed || isBlind) strokeColor = "#ff1744";
        else if (d_cm <= this.view.threshYellow) strokeColor = "#ffd600";

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + rx * distR, cy + ry * distR);
        ctx.stroke();

        /* Dot at obstacle */
        ctx.fillStyle = strokeColor;
        ctx.beginPath();
        ctx.arc(cx + rx * distR, cy + ry * distR, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    /* Update Closest Indicator */
    const closestEl = document.getElementById("closest-val");
    if (closestEl) {
      if (closestSensor !== null && minDistance < 9000) {
        closestEl.textContent = `${minDistance.toFixed(1)} cm (#${closestSensor})`;
        closestEl.style.color = (minDistance <= this.view.threshRed) ? "#ff1744" : (minDistance <= this.view.threshYellow) ? "#ffd600" : "#00e676";
      } else {
        closestEl.textContent = "CLEAR";
        closestEl.style.color = "#00e676";
      }
    }
  }

  handleHeartbeat(hb) {
    const heapEl = document.getElementById("diag-free-heap");
    if (heapEl) heapEl.textContent = `${(hb.free_heap_bytes / 1024).toFixed(1)} KB`;

    const uptimeEl = document.getElementById("diag-uptime");
    if (uptimeEl) uptimeEl.textContent = `${hb.uptime_s} s`;
  }

  handleStatusChange(status) {
    const badge = document.getElementById("status-badge");
    if (!badge) return;

    if (this.isSimulationMode) return;

    if (status.connected) {
      badge.className = "badge connected";
      badge.querySelector(".badge-text").textContent = "CONNECTED";
    } else {
      badge.className = "badge disconnected";
      badge.querySelector(".badge-text").textContent = "OFFLINE";
    }
  }

  handleStale(stale) {
    if (stale.isStale && !this.isSimulationMode) {
      const badge = document.getElementById("status-badge");
      if (badge) {
        badge.className = "badge disconnected";
        badge.querySelector(".badge-text").textContent = "STALE DATA";
      }
    }
  }

  saveSettings() {
    const red = parseFloat(document.getElementById("input-thresh-red").value);
    const yellow = parseFloat(document.getElementById("input-thresh-yellow").value);
    const green = parseFloat(document.getElementById("input-thresh-green").value);
    const temp = parseFloat(document.getElementById("input-temp").value);
    const wsUrl = document.getElementById("input-ws-url")?.value?.trim();

    this.view.threshRed = red;
    this.view.threshYellow = yellow;
    this.view.threshGreen = green;

    if (wsUrl) {
      localStorage.setItem("ws_url", wsUrl);
      if (wsUrl !== this.telemetryClient.url) {
        this.setSimulationMode(false);
        this.telemetryClient.connect(wsUrl);
      }
    }

    /* Send command to ESP32 firmware if connected */
    this.telemetryClient.sendCommand({
      action: "set_thresholds",
      thresholds: { red_cm: red, yellow_cm: yellow, green_cm: green }
    });
    this.telemetryClient.sendCommand({
      action: "set_temperature",
      temperature_c: temp
    });

    document.getElementById("modal-settings").classList.remove("open");
    console.log("[App] Settings updated successfully.");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new App();
});
