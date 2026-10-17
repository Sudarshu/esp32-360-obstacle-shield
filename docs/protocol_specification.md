# WebSocket Protocol & Telemetry Specification

**Protocol Version:** 1.0.0  
**Transport:** WebSocket (RFC 6455) over 802.11b/g/n Wi-Fi SoftAP  
**Default Access Point SSID:** `ESP32_OBSTACLE_SHIELD`  
**Default AP Password:** `obstacle1234`  
**ESP32 Gateway IP:** `192.168.4.1`  
**WebSocket Endpoint:** `ws://192.168.4.1/ws`  
**HTTP Dashboard:** `http://192.168.4.1/`  

---

## 1. Network Topology and Connection Lifecycle

```
[ ESP32 SoftAP (192.168.4.1) ]
  ├── Embedded Web Server (Port 80) -> Serves static HTML/JS/CSS dashboard
  └── WebSocket Server (Port 80 /ws) -> Full-duplex JSON telemetry & control
           ▲
           │ 802.11 Wi-Fi (No Internet Required)
           ▼
[ Mobile Browser / Laptop (192.168.4.x via DHCP) ]
  └── Three.js 3D Obstacle Rendering Engine & Diagnostics UI
```

### 1.1 Connection Sequence
1. The client phone/tablet joins Wi-Fi SSID `ESP32_OBSTACLE_SHIELD`.
2. The client browser navigates to `http://192.168.4.1/`.
3. The web application loads the lightweight Three.js bundle cached in browser memory.
4. The client opens a WebSocket connection to `ws://192.168.4.1/ws`.
5. The ESP32 registers the client socket handle and begins streaming telemetry frames at the completion of each 8-sensor sweep.
6. The client replies with periodic `ping` packets if no traffic is seen, while tracking timestamp deltas.
7. If the connection drops (e.g. vehicle power-cycle, range boundary), the client initiates exponential back-off reconnection attempts ($1\text{s}, 2\text{s}, 4\text{s}$ up to $10\text{s}$).

---

## 2. Telemetry Packet Schema (`telemetry`)

Broadcast by the ESP32 upon completion of each full sequential measurement cycle:

```json
{
  "type": "telemetry",
  "seq": 1420,
  "timestamp_ms": 328450,
  "sweep_time_ms": 164.2,
  "rate_hz": 6.1,
  "temperature_c": 20.0,
  "simulation": false,
  "sensors": [
    {
      "id": 0,
      "distance_cm": 84.6,
      "raw_cm": 85.1,
      "pulse_us": 4950,
      "valid": true,
      "status": "ok",
      "proximity": "warning_yellow",
      "consecutive_timeouts": 0
    },
    {
      "id": 1,
      "distance_cm": null,
      "raw_cm": -1.0,
      "pulse_us": 0,
      "valid": false,
      "status": "timeout",
      "proximity": "unknown",
      "consecutive_timeouts": 3
    }
  ]
}
```

### 2.1 Field Definitions
- `seq` *(uint32)*: Monotonic sequence counter. Used by the client to compute packet loss and transmission jitter.
- `timestamp_ms` *(uint32)*: ESP32 hardware timer uptime in milliseconds (`esp_timer_get_time() / 1000`).
- `sweep_time_ms` *(float)*: Duration spent executing the active sequential sensor cycle.
- `rate_hz` *(float)*: Realized full-array sweep frequency ($1000 / \Delta t_{\text{sweep}}$).
- `temperature_c` *(float)*: Current temperature value used for acoustic velocity calibration.
- `simulation` *(bool)*: True if ESP32 firmware is running the synthetic trajectory generator.
- `sensors` *(array of 8 objects)*:
  - `id` *(0-7)*: Fixed sensor index corresponding to vehicle mounting configuration.
  - `distance_cm` *(float | null)*: Filtered obstacle distance. Set to `null` if the measurement is invalid or timed out. **Never report 0.0 cm for a timeout.**
  - `raw_cm` *(float)*: Instantaneous unfiltered measurement from current pulse. Negative value ($-1.0$) indicates failure.
  - `pulse_us` *(uint32)*: Duration of echo pin HIGH logic level in microseconds.
  - `valid` *(bool)*: Strict boolean flag indicating if reading meets all validity tests.
  - `status` *(string)*:
    - `"ok"`: Valid obstacle detected within calibrated boundaries ($22\text{ cm} \le d \le 350\text{ cm}$).
    - `"timeout"`: Echo pin never returned HIGH or exceeded $25\text{ ms}$ timeout (no reflecting target within range).
    - `"below_blindzone"`: Echo returned faster than the physical transducer damping time ($<22\text{ cm}$). Target is dangerously close or transducer is ring-down ringing.
    - `"out_of_range"`: Echo exceeded maximum calibrated cutoff distance ($>350\text{ cm}$).
    - `"hardware_error"`: Pin failed to toggle or stuck HIGH (wiring disconnection or short circuit).
  - `proximity` *(string)*: Proximity classification (`"critical_red"`, `"warning_yellow"`, `"safe_green"`, `"unknown"`).
  - `consecutive_timeouts` *(uint16)*: Number of successive sweeps without a valid echo.

---

## 3. Heartbeat & Diagnostics Packet Schema (`heartbeat`)

Broadcast by the ESP32 every 2000 ms to monitor embedded system health:

```json
{
  "type": "heartbeat",
  "uptime_s": 328,
  "free_heap_bytes": 184520,
  "min_free_heap_bytes": 162100,
  "wifi_rssi_dbm": -42,
  "clients_connected": 1,
  "firmware_version": "1.0.0",
  "system_status": "normal"
}
```

---

## 4. Client Command Schema (`client_command`)

Sent from the mobile browser client to ESP32:

```json
{
  "action": "set_simulation",
  "simulation_enabled": true
}
```

Supported actions:
- `set_simulation`: Toggle synthetic distance generation on firmware.
- `set_temperature`: Update temperature setting for speed-of-sound recalculation ($T_{^\circ C}$).
- `set_thresholds`: Update proximity thresholds (`red_cm`, `yellow_cm`, `green_cm`).
- `ping`: Keep-alive request from browser.
