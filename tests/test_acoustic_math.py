#!/usr/bin/env python3
"""
Unit Tests for Acoustic Physics & Distance Conversion
Validates speed of sound temperature compensation, round-trip microsecond conversion,
blind-zone deadband cutoff, and timeout handling.
"""

import unittest
import math

class TestAcousticMath(unittest.TestCase):
    def speed_of_sound_m_s(self, temp_c):
        v = 331.3 + (0.606 * temp_c)
        return max(300.0, min(370.0, v))

    def us_per_cm_roundtrip(self, temp_c):
        v = self.speed_of_sound_m_s(temp_c)
        return 20000.0 / v

    def pulse_to_distance_cm(self, pulse_us, temp_c=20.0, blind_zone_cm=22.0, max_range_cm=350.0):
        if pulse_us <= 0:
            return None, "timeout"
        
        k = self.us_per_cm_roundtrip(temp_c)
        dist = pulse_us / k

        if dist < blind_zone_cm:
            return dist, "below_blindzone"
        if dist > max_range_cm:
            return None, "out_of_range"
        
        return dist, "ok"

    def test_speed_of_sound_at_reference_temperatures(self):
        # 0 deg C: ~331.3 m/s
        v0 = self.speed_of_sound_m_s(0.0)
        self.assertAlmostEqual(v0, 331.3, places=2)

        # 20 deg C (Standard reference): ~343.42 m/s
        v20 = self.speed_of_sound_m_s(20.0)
        self.assertAlmostEqual(v20, 343.42, places=2)

        # 40 deg C: ~355.54 m/s
        v40 = self.speed_of_sound_m_s(40.0)
        self.assertAlmostEqual(v40, 355.54, places=2)

    def test_roundtrip_microsecond_factor(self):
        # At 20 C, ~58.237 us per cm
        k20 = self.us_per_cm_roundtrip(20.0)
        self.assertAlmostEqual(k20, 58.237, places=2)

        # At 0 C, sound is slower, takes MORE microseconds per cm
        k0 = self.us_per_cm_roundtrip(0.0)
        self.assertGreater(k0, k20)

    def test_blind_zone_rejection(self):
        # Transducer ring-down below 22 cm must NOT be classified as valid target
        short_pulse = 1000  # ~17.17 cm
        dist, status = self.pulse_to_distance_cm(short_pulse)
        self.assertEqual(status, "below_blindzone")
        self.assertLess(dist, 22.0)

    def test_valid_distance_measurement(self):
        # 100 cm obstacle at 20 C => ~5824 us
        pulse_100cm = int(100.0 * self.us_per_cm_roundtrip(20.0))
        dist, status = self.pulse_to_distance_cm(pulse_100cm)
        self.assertEqual(status, "ok")
        self.assertAlmostEqual(dist, 100.0, places=1)

    def test_timeout_rejection_never_zero(self):
        # When sensor times out (0 us pulse), distance MUST be None, NEVER 0.0 cm!
        dist, status = self.pulse_to_distance_cm(0)
        self.assertIsNone(dist)
        self.assertEqual(status, "timeout")

    def test_out_of_range_rejection(self):
        # Beyond 350 cm cutoff
        pulse_400cm = int(400.0 * self.us_per_cm_roundtrip(20.0))
        dist, status = self.pulse_to_distance_cm(pulse_400cm)
        self.assertIsNone(dist)
        self.assertEqual(status, "out_of_range")

if __name__ == '__main__':
    unittest.main()
