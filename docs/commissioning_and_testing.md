# Commissioning, Verification & Field Testing Procedures

**Project:** 360-Degree Vehicle Obstacle Detection Shield  
**Document:** System Commissioning Manual & Verification Protocol  

---

## 1. Bench Commissioning Sequence (Pre-Vehicle Installation)

Before routing wires through bumpers, validate all electronic components on a laboratory bench:

### Step 1: Power Stage Verification
1. Connect a bench power supply ($12.0\text{V} - 14.4\text{V}$, current limit set to $1.0\text{A}$) to the automotive step-down regulator input through the $2\text{A}$ inline fuse.
2. Measure the regulator output using a digital multimeter. Verify the output is strictly within $5.00\text{V} \pm 0.15\text{V}$.
3. Verify reverse polarity protection: temporarily reverse the input leads at $12\text{V}$. Verify current draw is zero and the fuse does not blow (Schottky or MOSFET blocks current).

### Step 2: Level-Shifter Verification
1. Connect one JSN-SR04T module to the $5.0\text{V}$ rail.
2. Connect the Echo output pin to the $2.0\text{k}\Omega / 3.3\text{k}\Omega$ voltage divider.
3. Pulse the Trigger input and observe the divider output with an oscilloscope or peak-hold multimeter. Verify the peak voltage does not exceed $3.3\text{V}$.

### Step 3: Firmware Flash and Serial Boot Test
1. Connect the ESP32-WROOM-32 to your PC via Micro-USB.
2. Open a terminal and flash the firmware using ESP-IDF:
   ```bash
   idf.py set-target esp32
   idf.py build
   idf.py -p COMx flash monitor
   ```
3. Verify clean boot output in the console:
   ```
   I (240) OBSTACLE_SHIELD: Initializing 360 Obstacle Detection Shield v1.0.0...
   I (250) SENSOR_MGR: Configuring 8 ultrasonic channels...
   I (410) WIFI_AP: SoftAP started. SSID: ESP32_OBSTACLE_SHIELD, IP: 192.168.4.1
   I (420) WS_SERVER: HTTP and WebSocket server listening on port 80
   ```

### Step 4: Wi-Fi and Web Interface Verification
1. On a mobile phone or laptop, scan for Wi-Fi networks and connect to `ESP32_OBSTACLE_SHIELD` (Password: `obstacle1234`).
2. Open a browser (Chrome, Safari, Firefox) and navigate to `http://192.168.4.1/`.
3. Verify that the 3D vehicle canvas loads smoothly, the WebSocket indicator turns green (`CONNECTED`), and telemetry frames are incrementing at $\approx 6 - 8\text{ Hz}$.

---

## 2. Sensor-by-Sensor Acoustic Validation Procedure

Perform this test for each of the 8 sensors individually using a flat, hard acoustic target ($30\text{ cm} \times 30\text{ cm}$ cardboard or plywood sheet):

| Test Step | Target Distance | Expected Firmware Measurement | Verification Criteria |
|---|---|---|---|
| **A. Blind Zone Limit** | $15\text{ cm}$ (Inside deadband) | Classified as `below_blindzone` | Dashboard shows critical warning or out-of-spec status. Does NOT report false clear space. |
| **B. Near Target** | $50\text{ cm}$ | $50.0\text{ cm} \pm 2\text{ cm}$ | Classified as `critical_red` zone. Visual sector lights up red. |
| **C. Mid Target** | $100\text{ cm}$ | $100.0\text{ cm} \pm 3\text{ cm}$ | Classified as `warning_yellow` zone. |
| **D. Far Target** | $250\text{ cm}$ | $250.0\text{ cm} \pm 5\text{ cm}$ | Classified as `safe_green` zone. |
| **E. Max Cutoff** | $>400\text{ cm}$ / Empty sky | Classified as `timeout` / `null` | Must NOT latch onto old distance readings. Must expire within $500\text{ ms}$. |

---

## 3. Vehicle Installation & Road Testing

### 3.1 Transducer Installation Check
- [ ] Front bumper sensors mounted at $50\text{ cm} \pm 10\text{ cm}$ height.
- [ ] Rear bumper sensors mounted clear of exhaust pipe heat.
- [ ] Probes angled $3^\circ - 5^\circ$ upward to eliminate asphalt ground clutter.
- [ ] Silicone isolation rings installed around each bumper drill hole to prevent bumper vibration resonance from falsely triggering the acoustic receiver.

### 3.2 Dynamic Vehicle Test Cases
1. **Parallel Parking Simulation:** Approach a curb and adjacent vehicle at $<10\text{ km/h}$. Confirm that side and rear sensors accurately indicate decreasing distance.
2. **Pedestrian Crossing:** Move a person across the front bumper from left to right. Confirm continuous sector transition (Sensor 0 $\to$ Sensor 1 $\to$ Sensor 2).
3. **Rough Road / Gravel Surface:** Drive over cobblestone or gravel at $15\text{ km/h}$. Confirm that road bounce does not generate continuous false proximity warnings.

---

## 4. Manual Test Report Template

Copy and fill out this test verification log for your prototype commissioning record:

```
================================================================================
                    VEHICLE OBSTACLE SHIELD TEST REPORT
================================================================================
Date: _______________      Inspector: ____________________
ESP32 Board Revision: ___________________
Sensor Batch / Model: ___________________
Firmware Git Hash:    ___________________

1. ELECTRICAL BENCH CHECKS:
   - Regulated 5V Rail Voltage:   [   .   ] V  (Pass: 4.85V - 5.15V)
   - Max Echo Voltage at ESP32:   [   .   ] V  (Pass: < 3.35V)
   - Quiescent Current Draw:      [       ] mA (Pass: < 250mA)
   - Reverse Polarity Block:      [ PASS / FAIL ]

2. WIRELESS & TELEMETRY CHECKS:
   - Wi-Fi SSID Visible:          [ PASS / FAIL ]
   - DHCP IP Assigned to Phone:   192.168.4.____
   - WebSocket Connection Latency: [     ] ms
   - Measured Full Sweep Rate:    [   .   ] Hz (Target: 5.0 - 8.0 Hz)
   - Packet Drop Rate (<1%):      [   .   ] %

3. SENSOR CALIBRATION MATRIX (Recorded at 20°C):
   Ch | Name | Position (X,Y) | 50cm Test | 100cm Test | 200cm Test | Timeout Status
   ---+------+----------------+-----------+------------+------------+---------------
    0 | FL   | (+230, +70)    |   ___ cm  |   ___ cm   |   ___ cm   | [ PASS / FAIL ]
    1 | FC   | (+230,   0)    |   ___ cm  |   ___ cm   |   ___ cm   | [ PASS / FAIL ]
    2 | FR   | (+230, -70)    |   ___ cm  |   ___ cm   |   ___ cm   | [ PASS / FAIL ]
    3 | RFS  | (+100, -92.5)  |   ___ cm  |   ___ cm   |   ___ cm   | [ PASS / FAIL ]
    4 | RRS  | (-100, -92.5)  |   ___ cm  |   ___ cm   |   ___ cm   | [ PASS / FAIL ]
    5 | RR   | (-230, -70)    |   ___ cm  |   ___ cm   |   ___ cm   | [ PASS / FAIL ]
    6 | RL   | (-230, +70)    |   ___ cm  |   ___ cm   |   ___ cm   | [ PASS / FAIL ]
    7 | LS   | (   0, +92.5)  |   ___ cm  |   ___ cm   |   ___ cm   | [ PASS / FAIL ]

4. SIGN-OFF:
   Commissioning Status: [ ACCEPTED / REWORK REQUIRED ]
   Notes: ____________________________________________________________________
================================================================================
```
