/**
 * Synthetic Telemetry Generator for Standalone Client-Side Simulation
 * Generates realistic 8-channel ultrasonic sweep frames when disconnected from ESP32.
 */

export class MockTelemetryGenerator {
  constructor() {
    this.seq = 1000;
    this.timePhase = 0.0;
    this.intervalId = null;
    this.onTelemetryCallback = null;
  }

  start(rateHz = 7.0, callback) {
    this.onTelemetryCallback = callback;
    const intervalMs = Math.round(1000 / rateHz);
    this.stop();
    this.intervalId = setInterval(() => this.step(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isRunning() {
    return this.intervalId !== null;
  }

  step() {
    this.timePhase += 0.08;
    this.seq++;

    const now = Date.now();
    const frontWave = 160.0 + 120.0 * Math.sin(this.timePhase);
    const sideWave = 135.0 + 85.0 * Math.cos(this.timePhase * 0.7);
    const rearWave = 110.0 + 60.0 * Math.sin(this.timePhase * 1.4);

    const sensors = [];
    for (let i = 0; i < 8; i++) {
      let dist = -1.0;
      let status = "ok";
      let valid = true;

      switch (i) {
        case 0: /* Front-Left */
          dist = frontWave + 15.0;
          break;
        case 1: /* Front-Center */
          dist = frontWave;
          break;
        case 2: /* Front-Right */
          dist = frontWave + 20.0;
          break;
        case 3: /* Right-Front Side */
          dist = sideWave;
          break;
        case 4: /* Right-Rear Side */
          dist = sideWave + 12.0;
          break;
        case 5: /* Rear-Right */
          dist = rearWave + 10.0;
          break;
        case 6: /* Rear-Left */
          dist = rearWave;
          break;
        case 7: /* Left-Side: occasional clear space / timeout */
          if (Math.sin(this.timePhase * 0.6) > 0.3) {
            dist = 240.0 + 35.0 * Math.sin(this.timePhase);
          } else {
            dist = null;
            status = "timeout";
            valid = false;
          }
          break;
      }

      if (dist !== null) {
        if (dist < 22.0) {
          status = "below_blindzone";
          valid = false;
        } else if (dist > 350.0) {
          status = "out_of_range";
          valid = false;
          dist = null;
        }
      }

      let proximity = "unknown";
      if (valid && dist !== null) {
        if (dist <= 60.0) proximity = "critical_red";
        else if (dist <= 150.0) proximity = "warning_yellow";
        else proximity = "safe_green";
      } else if (status === "below_blindzone") {
        proximity = "critical_red";
      }

      sensors.push({
        id: i,
        distance_cm: (dist !== null) ? Number(dist.toFixed(1)) : null,
        raw_cm: (dist !== null) ? Number(dist.toFixed(1)) : -1.0,
        pulse_us: (dist !== null) ? Math.round(dist * 58.24) : 0,
        valid: valid,
        status: status,
        proximity: proximity,
        consecutive_timeouts: (status === "timeout") ? 1 : 0
      });
    }

    const payload = {
      type: "telemetry",
      seq: this.seq,
      timestamp_ms: now,
      sweep_time_ms: 145.0,
      rate_hz: 6.9,
      temperature_c: 20.0,
      simulation: true,
      sensors: sensors
    };

    if (this.onTelemetryCallback) {
      this.onTelemetryCallback(payload);
    }
  }
}
