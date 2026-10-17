# Electrical Architecture and GPIO Assignment Guide

**System:** 360-Degree Vehicle Obstacle Detection Shield  
**Target Microcontroller:** ESP32-WROOM-32 (Xtensa Dual-Core 32-bit LX6)  
**Sensors:** 8 × JSN-SR04T Waterproof Ultrasonic Transceiver Modules (Mode 0: GPIO Pulse)  
**Primary Power:** Automotive +12V/14.4V Vehicle Electrical System (Fused and Conditioned)  

---

## 1. ESP32-WROOM-32 Pin Analysis and Hardware Constraints

The ESP32 microcontroller features 34 GPIO pins, but many have strict silicon-level multiplexing constraints that must be observed to guarantee reliable system boot, flashing, and Wi-Fi operation:

### 1.1 Silicon Restrictions and Reserved Pins
1. **SPI Flash Dedicated Pins (GPIO 6, 7, 8, 9, 10, 11):**
   * *Status:* **STRICTLY RESERVED**. Connected internally to the 4 MB SPI flash memory chip.
   * *Rule:* Never connect external peripherals to these pins. Doing so causes immediate boot crash.
2. **Bootstrapping Pins (GPIO 0, 2, 12, 15):**
   * **GPIO 0:** Strapping pin for UART download mode. Must be pulled HIGH (via onboard pull-up) for normal boot.
   * **GPIO 2:** Strapping pin for SPI boot. Connected to onboard blue LED on most DevKit boards. Must be LOW/floating at flashing time.
   * **GPIO 12 (MTDI):** Critical strapping pin for flash voltage (VDD_SDIO). Must be LOW at reset for standard 3.3V flash memory. If an external sensor pulls this pin HIGH during power-up, flash voltage defaults to 1.8V, bricking boot.
   * **GPIO 15 (MTDO):** Strapping pin for ROM boot message silencing.
   * *Rule:* Keep all 8 sensors off GPIO 0, 2, 12, and 15 to ensure fail-safe cold boots under all power conditions.
3. **UART0 Console Pins (GPIO 1 TX, GPIO 3 RX):**
   * *Status:* **RESERVED FOR DEBUG / PROGRAMMING**.
   * *Rule:* Keep GPIO 1 and 3 dedicated to USB-UART for diagnostic logging and live firmware flashing.
4. **Input-Only Pins (GPIO 34, 35, 36/VP, 39/VN):**
   * *Status:* **DIGITAL INPUT ONLY** (no internal pull-up or pull-down silicon resistors, no output driver).
   * *Rule:* Ideal for sensor Echo signals! They will be driven by the level-shifted sensor output.

---

## 2. Definitive 8-Sensor GPIO Assignment Table

To allocate 16 dedicated GPIOs (8 Trigger outputs + 8 Echo inputs) on an ESP32-WROOM-32 DevKit while avoiding all strapping, flash, and console pins, use the following verified pinout:

| Sensor ID | Mounting Location | Channel Label | Trigger GPIO (Output, 3.3V) | Echo GPIO (Input, 3.3V via Divider) | Echo Pin Characteristics |
|---|---|---|---|---|---|
| **0** | Front-Left (Corner) | `FL` | **GPIO 4** | **GPIO 34** | Input-only (ADC1_CH6) |
| **1** | Front-Center (Grille) | `FC` | **GPIO 16** | **GPIO 35** | Input-only (ADC1_CH7) |
| **2** | Front-Right (Corner)| `FR` | **GPIO 17** | **GPIO 36 (VP)** | Input-only (ADC1_CH0) |
| **3** | Right-Front Side | `RFS` | **GPIO 18** | **GPIO 39 (VN)** | Input-only (ADC1_CH3) |
| **4** | Right-Rear Side | `RRS` | **GPIO 19** | **GPIO 32** | General GPIO / ADC1_CH4 |
| **5** | Rear-Right (Corner) | `RR` | **GPIO 21** | **GPIO 33** | General GPIO / ADC1_CH5 |
| **6** | Rear-Left (Corner) | `RL` | **GPIO 22** | **GPIO 25** | General GPIO / DAC1 |
| **7** | Left-Side (Mid) | `LS` | **GPIO 23** | **GPIO 26** | General GPIO / DAC2 |

*Auxiliary Pins:*
- **GPIO 27:** Optional status LED (Heartbeat / Wi-Fi status indicator).
- **GPIO 13 / 14:** Optional external piezo buzzer or I2C expansion (e.g. BME280 temperature sensor for automatic acoustic compensation).

---

## 3. Voltage Level Shifting for Sensor Echo Outputs

### 3.1 The Voltage Mismatch Problem
- **JSN-SR04T Sensor VCC:** 5.0 V DC.
- **Sensor Echo Output High Level:** $\approx 5.0\text{ V}$.
- **ESP32 Maximum Pin Voltage:** $3.6\text{ V}$ absolute maximum ($3.3\text{ V}$ nominal).
- **Hazard:** Feeding a 5V Echo pulse directly into an ESP32 GPIO will damage the input ESD protection diodes and permanently destroy the GPIO pin.

### 3.2 Passive Voltage Divider Circuit
Each Echo pin must pass through an individual voltage divider before entering the ESP32:

```
JSN-SR04T (5V)                             ESP32 (3.3V)
Echo Output Pin ────────[ R1: 2.0 kΩ ]──┬──> GPIO Input Pin (e.g. GPIO 34)
                                        │
                                   [ R2: 3.3 kΩ ]
                                        │
GND ────────────────────────────────────┴──> System GND
```

**Calculation:**
$$V_{\text{ESP32}} = V_{\text{ECHO}} \times \frac{R_2}{R_1 + R_2} = 5.0\text{ V} \times \frac{3300\,\Omega}{2000\,\Omega + 3300\,\Omega} = 5.0 \times 0.6226 = 3.11\text{ V}$$

- $3.11\text{ V}$ is comfortably above the ESP32 CMOS input logic high threshold ($V_{IH} = 0.75 \times 3.3\text{ V} = 2.475\text{ V}$) and safely below the $3.6\text{ V}$ absolute maximum rating.
- Alternate resistor pair: $R_1 = 1.0\text{ k}\Omega$, $R_2 = 2.0\text{ k}\Omega$ yielding $3.33\text{ V}$.
- Use $1\%$ metal film resistors to minimize temperature drift.

### 3.3 Sensor Trigger Input (3.3V to 5.0V)
- The ESP32 outputs $3.3\text{ V}$ CMOS high pulses on the Trigger pins.
- JSN-SR04T V2.0 / V3.0 trigger inputs detect logic high at $>2.5\text{ V}$.
- The $3.3\text{ V}$ output from the ESP32 directly drives the JSN-SR04T Trigger pin without requiring an up-shifter. However, adding a series current-limiting resistor ($330\,\Omega$) protects against accidental short-circuits during vehicle routing.

---

## 4. Automotive Power Supply & Protection Architecture

> [!CAUTION]
> Never connect the ESP32 or sensor modules directly to a vehicle's 12V battery or cigarette lighter without industrial-grade conditioning. A running vehicle's electrical network experiences extreme transients:
> - Normal alternator charging: $13.8\text{ V}$ to $14.7\text{ V}$
> - Engine cold cranking: drops to $5.5\text{ V} - 7.0\text{ V}$
> - Inductive spikes & alternator load dump (ISO 7637-2 / ISO 16750-2): up to $+80\text{ V}$ to $+100\text{ V}$ for $400\text{ ms}$
> - Reverse battery polarity during jump-starts: down to $-14\text{ V}$

### 4.1 Automotive Power Conditioning Circuit Diagram

```
+12V Switched ACC Tap 
       │
   [ FUSE 2A ] (Fast-blow inline fuse)
       │
   [ D1: P-Channel MOSFET or Schottky Diode (e.g. 1N5822 / SS34) ]  <-- Reverse Polarity Protection
       │
   [ TVS1: 600W 24V Bidirectional TVS Diode (e.g. SMBJ24CA) ]       <-- Load-dump Spike Clamping
       │
   ┌───┴─────────────┐
   │  π-Filter Stage │
   │  L1: 47 µH      │                                              +5.0V Regulated Bus (2.5A)
   │  C1: 470 µF     │                                                      │
   │  C2: 100 nF     │                                                      ├──> ESP32 5V (VIN) Pin
   └───┬─────────────┘                                                      └──> All 8x JSN-SR04T VCC Pins
       │
   ┌───▼────────────────────────────────────────────────────────┐
   │ Automotive Buck Converter Step-Down (e.g. TI TPS54302-Q1   │
   │ or Industrial MP1584EN / LM2596-HV 40V Module)             │
   │ Vin: 7V - 36V DC  ──────>  Vout: 5.0V DC @ 2.5A Continuous │
   └───┬────────────────────────────────────────────────────────┘
       │
      GND (Heavy chassis star ground)
```

### 4.2 Power Distribution & Current Budget
| Subsystem | Operating Voltage | Peak Current | Average Current |
|---|---|---|---|
| ESP32-WROOM-32 (Wi-Fi AP active, transmitting WebSocket) | 5.0V (via onboard LDO) | 350 mA | 120 mA |
| 8 × JSN-SR04T Modules (Quiescent) | 5.0V | $8 \times 5\text{ mA} = 40\text{ mA}$ | 40 mA |
| 1 × JSN-SR04T Module (During $40\text{ kHz}$ acoustic burst) | 5.0V | 30 mA | 10 mA |
| Status LEDs / Level shifters | 3.3V | 15 mA | 8 mA |
| **Total System Load** | **5.0V** | **$\approx 435\text{ mA}$** | **$\approx 178\text{ mA}$** |

A 5V / 2.0A or 2.5A buck regulator provides over $400\%$ safety margin, preventing voltage droop when Wi-Fi transmit bursts coincide with sensor acoustic pulses.

---

## 5. Wiring and Harnessing Guidelines for Passenger Cars

1. **Star Ground Topology:**
   All sensor ground wires must return to a central ground distribution terminal at the shield enclosure. Avoid daisy-chaining sensor grounds around the bumper, as ultrasonic echo detection relies on micro-volt analog comparator thresholds that can be corrupted by ground-shift noise.
2. **Cable Type:**
   Use 4-conductor shielded automotive-grade wire (e.g., 22 AWG or 24 AWG stranded copper with foil shield and drain wire) for runs exceeding 1.5 meters (front-to-back chassis routing). Connect the cable drain shield to the enclosure ground at the microcontroller end only (single-point shield ground).
3. **Connectors:**
   Use IP67 waterproof automotive connectors (e.g., Deutsch DT series or AMP Superseal 1.5mm 4-pin connectors) at each bumper penetration point to enable easy bumper removal during vehicle maintenance.
4. **Sensor Mounting Angle:**
   Mount ultrasonic transceivers at a height of $45\text{ cm} - 65\text{ cm}$ above the asphalt. Point sensors horizontally or angled upward by $3^\circ - 5^\circ$. If angled downward, road texture and potholes create acoustic ground reflections that cause false obstacle triggers.
