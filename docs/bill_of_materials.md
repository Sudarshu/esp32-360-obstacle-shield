# Bill of Materials (BOM)

**Project:** 360-Degree Vehicle Obstacle Detection Shield  
**Application:** Low-Cost Automotive Ultrasonic Surround Sensing Prototype  

| Item | Component | Specification / Part Number | Qty | Purpose / Placement | Automotive / Rating Notes |
|---|---|---|---|---|---|
| **1** | Microcontroller Dev Board | ESP32-WROOM-32 (30-pin or 38-pin DevKit) | 1 | Central controller, Wi-Fi SoftAP, WebSocket & sensor sequencing | Dual-core 240MHz, 520KB SRAM, 4MB Flash |
| **2** | Waterproof Ultrasonic Modules | JSN-SR04T V2.0 or V3.0 (Mode 0: GPIO) | 8 | Distance sensing transceivers (front, sides, rear) | IP67 sealed probes, 2.5m detachable cable, 20cm - 400cm range |
| **3** | Automotive DC-DC Step Down | TI TPS54302 / LM2596-HV / MP1584EN module | 1 | Steps down +12V/+14.4V vehicle power to regulated 5.0V @ 2.5A | Input rated to 36V+ DC, high efficiency buck |
| **4** | Inline Fuse Holder & Fuse | Mini Blade Fuse Holder + 2.0A Fast-Blow Fuse | 1 | Over-current protection on +12V switched vehicle feed | Protects vehicle harness against shorts |
| **5** | Reverse Polarity Diode | SS34 (3A 40V Schottky) or P-MOSFET circuit | 1 | Blocks reverse battery connection during jump-starts | Low forward voltage drop (<0.45V) |
| **6** | Transient Voltage Suppressor | SMBJ24CA (600W Bidirectional TVS Diode) | 1 | Clamps high-voltage inductive spikes & load dumps | Breakdown voltage 26.7V - 29.5V |
| **7** | Filter Inductor & Capacitors | 47µH inductor, 470µF 35V electrolytic, 100nF ceramic | 1 set | LC π-filter stage for alternator ripple reduction | Automotive temperature rated (-40°C to +105°C) |
| **8** | Level Shifter Resistors | 2.0 kΩ 1/4W 1% metal film resistors | 8 | Top resistor of 5V to 3.3V Echo divider ($R_1$) | Low thermal drift |
| **9** | Level Shifter Resistors | 3.3 kΩ 1/4W 1% metal film resistors | 8 | Bottom resistor of Echo divider to GND ($R_2$) | Yields 3.11V logic high on ESP32 |
| **10** | Current Limiting Resistors | 330 Ω 1/4W 5% carbon/metal film resistors | 8 | Series protection on ESP32 Trigger outputs | Protects against accidental chassis shorts |
| **11** | Enclosure | IP65 Sealed ABS Weatherproof Enclosure ($150 \times 100 \times 50\text{ mm}$) | 1 | Houses ESP32, power stage, and daughterboard inside cabin or trunk | Cable glands for ingress protection |
| **12** | External Wiring Cable | 24 AWG 4-Conductor Shielded Automotive Cable | 25m | Routes Trigger, Echo, 5V, and GND to front and rear bumpers | Shield drained to enclosure star ground |
| **13** | Connectors (Optional) | Deutsch DT 4-pin or AMP Superseal 1.5mm | 8 pairs | Waterproof quick-disconnects at vehicle bumper split points | IP67 rated, vibration proof |
| **14** | Perforated / Custom PCB | FR4 Protoboard or Custom Carrier PCB | 1 | Mounts ESP32, terminal blocks, dividers, and filter | Star ground plane layout |
| **15** | Screw Terminal Blocks | 2.54mm or 5.08mm 2-pin & 4-pin screw terminals | 10 | Secure wire termination inside central enclosure | Vibration-resistant screw clamp |
