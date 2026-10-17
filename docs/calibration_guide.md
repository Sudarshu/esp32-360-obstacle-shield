# Sensor Calibration, Acoustic Physics & Mounting Guide

**Project:** 360-Degree Vehicle Obstacle Detection Shield  
**Sensor Model:** JSN-SR04T Waterproof Ultrasonic Transceiver (Single Piezo Element)  

---

## 1. Acoustic Physics & Speed of Sound Calculation

Ultrasonic sensors measure the elapsed time $\Delta t$ between transmitting an acoustic burst (typically 8 cycles at $40\text{ kHz}$) and receiving the reflected echo.

Because the acoustic wave travels to the target and back, the round-trip distance is:
$$d = \frac{v \times \Delta t}{2}$$

### 1.1 Temperature Compensation Formula
The velocity of sound in air is predominantly dependent on ambient temperature $T$ (in degrees Celsius) and is modeled by the thermodynamic ideal gas relationship:
$$v(T) = 331.3 \times \sqrt{1 + \frac{T}{273.15}} \approx 331.3 + 0.606 \cdot T \quad [\text{m/s}]$$

Converting to round-trip microsecond timing per centimeter:
$$k_{\mu s/\text{cm}}(T) = \frac{2 \times 10^4}{v(T)} = \frac{20000}{331.3 + 0.606 \cdot T} \quad [\mu s/\text{cm}]$$

| Temperature (°C) | Speed of Sound $v$ (m/s) | Round-Trip Factor ($\mu s/\text{cm}$) | Error if Uncompensated at 20°C Reference |
|---|---|---|---|
| **-10°C** | 325.2 m/s | 61.50 $\mu s/\text{cm}$ | +5.5% (Overestimates distance) |
| **0°C** | 331.3 m/s | 60.37 $\mu s/\text{cm}$ | +3.6% |
| **+10°C** | 337.4 m/s | 59.28 $\mu s/\text{cm}$ | +1.7% |
| **+20°C (Nominal)** | 343.4 m/s | 58.24 $\mu s/\text{cm}$ | 0.0% (Calibrated reference) |
| **+30°C** | 349.5 m/s | 57.22 $\mu s/\text{cm}$ | -1.7% |
| **+40°C** | 355.5 m/s | 56.25 $\mu s/\text{cm}$ | -3.4% (Underestimates distance) |

The firmware includes a configurable temperature calibration parameter ($T_{\text{ambient}}$) to dynamically correct the conversion coefficient.

---

## 2. The Transducer Blind Zone (Ring-Down Deadband)

Unlike dual-transducer modules (like the indoor HC-SR04, which has separate speaker and microphone cones), the waterproof JSN-SR04T utilizes a **single sealed piezo-electric ceramic disc** for both transmission and reception.

### 2.1 The Mechanical Ring-Down Phenomenon
When the driver pulses the transducer with $40\text{ kHz}$ high-voltage excitation, the ceramic crystal vibrates violently to launch sound pressure into the air. After the electrical drive ceases, the physical mass and silicone damping compound continue to oscillate ("ring down") for approximately $1.2\text{ ms} - 1.5\text{ ms}$.

During this ring-down interval:
- The receiver's internal amplifier stage cannot distinguish between transducer self-resonance and a weak incoming echo from an external obstacle.
- Any echo returning before ring-down ends is masked by self-noise.
- Minimum observable distance:
  $$d_{\text{min}} = \frac{v \times t_{\text{ringdown}}}{2} \approx \frac{343\text{ m/s} \times 1.3\text{ ms}}{2} \approx 22.3\text{ cm}$$

### 2.2 Blind Zone Handling Strategy
1. **Never Report Ring-Down as Valid:** If an echo pulse is detected in $<1300\,\mu s$ ($<22\text{ cm}$), the firmware classifies it as `below_blindzone`.
2. **Never Treat Below-Blindzone as Clear:** An object closer than $20\text{ cm}$ is at extreme collision hazard. The dashboard visually warns the driver that the sensor is saturated by an ultra-close obstacle.

---

## 3. Acoustic Crosstalk, Timeouts, and Array Refresh Rates

### 3.1 Acoustic Interference (Crosstalk)
If eight ultrasonic sensors are triggered simultaneously, the sound burst from Sensor 0 can bounce off adjacent obstacles or the ground and enter the receiver of Sensor 1, creating a ghost target. Furthermore, long reverberations from a concrete wall can echo for tens of milliseconds.

### 3.2 Cycle Timing Breakdown
For an ultrasonic channel with a maximum detection range of $350\text{ cm}$:
- **Max Flight Time:** $350\text{ cm} \times 58.24\,\mu s/\text{cm} = 20.38\text{ ms}$.
- **Hardware Timeout Limit:** Set to $25.0\text{ ms}$.
- **Acoustic Ring-Down Settling Guard Time:** Set to $15.0\text{ ms}$ between pings to allow reverberations to attenuate below detection threshold.
- **Total Slot Time per Channel:** $25.0\text{ ms} + 15.0\text{ ms} = 40.0\text{ ms}$.

### 3.3 Strict Sequential vs Dual-Opposed Interleaved Scheduling
1. **Strict 8-Channel Sequential Sweep:**
   $$\text{Sweep Duration} = 8 \times 40.0\text{ ms} = 320\text{ ms} \implies f_{\text{array}} = \frac{1000}{320} \approx 3.125\text{ Hz}$$
2. **Dual-Opposed Quadrant Interleaved Scheduling (Optimized):**
   Sensors on opposing ends of the car (e.g. Front-Left and Rear-Right) are separated by $>4.5\text{ meters}$ and point in diametrically opposed directions ($180^\circ$ apart). They cannot hear each other's direct sound pulses.
   By firing opposing pairs in 4 phases:
   - Phase 1: Sensor 0 (Front-Left) & Sensor 5 (Rear-Right)
   - Phase 2: Sensor 2 (Front-Right) & Sensor 6 (Rear-Left)
   - Phase 3: Sensor 1 (Front-Center) & Sensor 4 (Right-Rear Side)
   - Phase 4: Sensor 3 (Right-Front Side) & Sensor 7 (Left-Side)
   $$\text{Optimized Sweep Duration} = 4 \times 40.0\text{ ms} = 160\text{ ms} \implies f_{\text{array}} = \frac{1000}{160} \approx 6.25\text{ Hz}$$

The UI rendering loop runs at a smooth $60\text{ FPS}$ using client-side interpolation, while reflecting the true $6.25\text{ Hz}$ physical acoustic measurement cycle.

---

## 4. Vehicle Coordinate System and Geometric Projection

### 4.1 ISO 8855 Coordinate Convention
The vehicle body coordinate system $(X, Y, Z)$ is centered at the vehicle center of gravity or center of geometry at road level:
- $+X$: Directly forward along the longitudinal center line.
- $+Y$: Toward the vehicle's left side (port / driver side).
- $+Z$: Vertically upward perpendicular to the ground plane.
- Heading angle $\theta$: $0^\circ$ is straight ahead ($+X$). Angles increase counter-clockwise ($+90^\circ$ is Left, $180^\circ$ is Rear, $270^\circ$ / $-90^\circ$ is Right).

### 4.2 Horizontal Projection Formula
For a sensor $i$ mounted at local coordinates $(x_{s,i}, y_{s,i})$, pointed at azimuth angle $\theta_i$, and measuring obstacle distance $d_i$:
$$x_{o,i} = x_{s,i} + d_i \cdot \cos(\theta_i)$$
$$y_{o,i} = y_{s,i} + d_i \cdot \sin(\theta_i)$$

Where:
- $\theta_i$ in radians $= \theta_{i,\text{deg}} \times \frac{\pi}{180}$
- The target is rendered as an arc or sector spanning $\pm 30^\circ$ ($\pm \frac{\text{FOV}}{2}$) centered at $(x_{o,i}, y_{o,i})$ to visually communicate acoustic beam uncertainty rather than implying a single point laser measurement.
