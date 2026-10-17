/**
 * WebSocket Telemetry & Transport Manager
 * Handles bi-directional communication, auto-reconnection, stale detection, and rate calculation.
 */

export class TelemetryClient {
  constructor(options = {}) {
    this.url = options.url || this.getDefaultUrl();
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 8000;
    
    this.isConnected = false;
    this.isManualClosed = false;
    
    /* Callbacks */
    this.onTelemetry = options.onTelemetry || (() => {});
    this.onHeartbeat = options.onHeartbeat || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onStale = options.onStale || (() => {});
    
    /* Metrics */
    this.lastPacketTime = 0;
    this.lastSeq = 0;
    this.droppedPackets = 0;
    this.packetsReceived = 0;
    this.measuredRateHz = 0.0;
    
    this.packetTimes = [];
    this.staleCheckInterval = null;
    this.staleThresholdMs = 1500; /* Stale if no data for 1.5 seconds */
  }

  getDefaultUrl() {
    if ((window.location.protocol === "http:" || window.location.protocol === "https:") &&
        window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      const host = window.location.host;
      const wsProto = (window.location.protocol === "https:") ? "wss:" : "ws:";
      return `${wsProto}//${host}/ws`;
    }
    return "ws://192.168.4.1/ws";
  }

  connect(customUrl) {
    if (customUrl) this.url = customUrl;
    this.isManualClosed = false;
    this.cleanupSocket();

    try {
      this.socket = new WebSocket(this.url);
      this.socket.onopen = (e) => {
        this.handleOpen(e);
        try { this.socket.send(JSON.stringify({ action: "subscribe" })); } catch (err) {}
      };
      this.socket.onmessage = (e) => this.handleMessage(e);
      this.socket.onclose = (e) => this.handleClose(e);
      this.socket.onerror = (e) => this.handleError(e);
    } catch (err) {
      console.warn("[Telemetry] WebSocket connection failed to initiate:", err);
      this.scheduleReconnect();
    }

    this.startStaleWatchdog();
    this.startHttpPollingFallback();
  }

  startHttpPollingFallback() {
    if (this.httpPollInterval) return;
    this.httpPollInterval = setInterval(async () => {
      if (!this.isManualClosed && (Date.now() - this.lastPacketTime > 900)) {
        try {
          const baseUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:")
            ? "http://192.168.4.1" : "";
          const resp = await fetch(baseUrl + "/api/telemetry", { cache: "no-store" });
          if (resp.ok) {
            const data = await resp.json();
            this.handleTelemetryData(data);
            this.onStatusChange({ connected: true, statusText: "Connected (HTTP)" });
          }
        } catch (e) {}
      }
    }, 250);
  }

  disconnect() {
    this.isManualClosed = true;
    this.stopStaleWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
    this.isConnected = false;
    this.onStatusChange({ connected: false, statusText: "Disconnected" });
  }

  cleanupSocket() {
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      this.socket = null;
    }
  }

  handleOpen(event) {
    this.isConnected = true;
    this.reconnectDelay = 1000;
    console.log(`[Telemetry] Connected to ${this.url}`);
    this.onStatusChange({ connected: true, statusText: "Connected" });
  }

  handleTelemetryData(msg) {
    const now = Date.now();
    this.lastPacketTime = now;
    this.packetTimes.push(now);
    while (this.packetTimes.length > 0 && this.packetTimes[0] < now - 1000) {
      this.packetTimes.shift();
    }
    this.measuredRateHz = this.packetTimes.length;
    this.packetsReceived++;
    if (this.lastSeq > 0 && msg.seq > this.lastSeq + 1) {
      this.droppedPackets += (msg.seq - this.lastSeq - 1);
    }
    this.lastSeq = msg.seq;
    this.onTelemetry(msg, this.measuredRateHz);
  }

  handleMessage(event) {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "telemetry") {
        this.handleTelemetryData(msg);
      } else if (msg.type === "heartbeat") {
        this.onHeartbeat(msg);
      }
    } catch (err) {
      console.error("[Telemetry] Failed to parse message:", err, event.data);
    }
  }

  handleClose(event) {
    this.isConnected = false;
    this.onStatusChange({ connected: false, statusText: "Closed. Reconnecting..." });
    if (!this.isManualClosed) {
      this.scheduleReconnect();
    }
  }

  handleError(event) {
    this.isConnected = false;
    this.onStatusChange({ connected: false, statusText: "Connection Error" });
    if (!this.isManualClosed) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[Telemetry] Attempting reconnect to ${this.url}...`);
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  startStaleWatchdog() {
    this.stopStaleWatchdog();
    this.staleCheckInterval = setInterval(() => {
      if (this.isConnected && this.lastPacketTime > 0) {
        const delta = Date.now() - this.lastPacketTime;
        if (delta > this.staleThresholdMs) {
          this.onStale({ isStale: true, deltaMs: delta });
        }
      }
    }, 500);
  }

  stopStaleWatchdog() {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
  }

  sendCommand(cmdObj) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(cmdObj));
      return true;
    }
    return false;
  }
}
