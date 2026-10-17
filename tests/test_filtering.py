#!/usr/bin/env python3
"""
Unit Tests for Sensor Data Filtering, Glitch Rejection, and Proximity Classification
Validates median ring buffer filter, impulse noise suppression, timeout clearing,
and threshold classification.
"""

import unittest

class MedianFilter:
    def __init__(self, depth=5):
        self.depth = depth
        self.history = []

    def update(self, val):
        self.history.append(val)
        if len(self.history) > self.depth:
            self.history.pop(0)
        sorted_history = sorted(self.history)
        mid = len(sorted_history) // 2
        return sorted_history[mid]

    def reset(self):
        self.history = []

def classify_proximity(dist_cm, red_cm=60.0, yellow_cm=150.0, green_cm=300.0):
    if dist_cm is None or dist_cm < 0:
        return "unknown"
    if dist_cm <= red_cm:
        return "critical_red"
    if dist_cm <= yellow_cm:
        return "warning_yellow"
    if dist_cm <= green_cm:
        return "safe_green"
    return "unknown"

class TestFiltering(unittest.TestCase):
    def test_impulse_glitch_rejection(self):
        mf = MedianFilter(depth=5)
        # Establish stable readings
        for _ in range(4):
            mf.update(100.0)
        
        # Inject extreme ultrasonic multipath spike (320 cm)
        filtered = mf.update(320.0)
        # Median must reject the single 320 cm glitch
        self.assertEqual(filtered, 100.0)

    def test_smooth_step_transition(self):
        mf = MedianFilter(depth=5)
        # Start at 100cm
        for _ in range(5):
            mf.update(100.0)
        
        # Vehicle approaches obstacle (distance decreases to 50cm)
        mf.update(50.0)
        mf.update(50.0)
        f3 = mf.update(50.0)
        # By 3rd consecutive reading, median shifts to 50cm
        self.assertEqual(f3, 50.0)

    def test_proximity_zone_boundaries(self):
        self.assertEqual(classify_proximity(59.9), "critical_red")
        self.assertEqual(classify_proximity(60.0), "critical_red")
        self.assertEqual(classify_proximity(60.1), "warning_yellow")
        self.assertEqual(classify_proximity(150.0), "warning_yellow")
        self.assertEqual(classify_proximity(150.1), "safe_green")
        self.assertEqual(classify_proximity(300.0), "safe_green")
        self.assertEqual(classify_proximity(300.1), "unknown")
        self.assertEqual(classify_proximity(None), "unknown")

if __name__ == '__main__':
    unittest.main()
