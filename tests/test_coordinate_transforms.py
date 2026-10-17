#!/usr/bin/env python3
"""
Unit Tests for Vehicle Geometric Coordinate Transforms
Validates ISO 8855 horizontal obstacle projection and Three.js 3D world mapping.
"""

import unittest
import math

class TestCoordinateTransforms(unittest.TestCase):
    def project_obstacle_2d(self, xs, ys, azimuth_deg, distance_cm):
        """
        ISO 8855 Vehicle Coordinate System:
        +X: Forward
        +Y: Left (Port / Driver side)
        theta: Azimuth angle relative to +X (Counter-Clockwise positive)
        """
        rad = math.radians(azimuth_deg)
        xo = xs + distance_cm * math.cos(rad)
        yo = ys + distance_cm * math.sin(rad)
        return round(xo, 2), round(yo, 2)

    def vehicle_to_threejs(self, x_veh_cm, y_veh_cm, z_veh_cm):
        """
        Maps vehicle cm coordinates to Three.js OpenGL world meter coordinates:
        Three.js: -Z is Forward, +X is Right (-Y veh), +Y is Up (+Z veh)
        """
        x_3d = -y_veh_cm / 100.0
        y_3d = z_veh_cm / 100.0
        z_3d = -x_veh_cm / 100.0
        return round(x_3d, 3), round(y_3d, 3), round(z_3d, 3)

    def test_front_center_projection(self):
        # Sensor at front bumper center (230, 0), pointing 0 deg (straight ahead)
        xo, yo = self.project_obstacle_2d(230.0, 0.0, 0.0, 100.0)
        self.assertEqual(xo, 330.0)
        self.assertEqual(yo, 0.0)

    def test_front_left_projection(self):
        # Sensor at (230, 70), pointing 45 deg forward-left
        xo, yo = self.project_obstacle_2d(230.0, 70.0, 45.0, 100.0)
        expected_x = round(230.0 + 100.0 * math.cos(math.radians(45.0)), 2)
        expected_y = round(70.0 + 100.0 * math.sin(math.radians(45.0)), 2)
        self.assertEqual(xo, expected_x)
        self.assertEqual(yo, expected_y)
        self.assertGreater(xo, 230.0)
        self.assertGreater(yo, 70.0)

    def test_right_side_projection(self):
        # Sensor on right side (100, -92.5), pointing -90 deg (starboard)
        xo, yo = self.project_obstacle_2d(100.0, -92.5, -90.0, 80.0)
        self.assertEqual(xo, 100.0)
        self.assertEqual(yo, -172.5)

    def test_rear_left_projection(self):
        # Sensor at rear left (-230, 70), pointing 135 deg (rearward left)
        xo, yo = self.project_obstacle_2d(-230.0, 70.0, 135.0, 100.0)
        self.assertLess(xo, -230.0)  # Further rearward
        self.assertGreater(yo, 70.0) # Further left

    def test_threejs_orientation_mapping(self):
        # Front point (+230 cm) must map to negative Z in Three.js
        x3, y3, z3 = self.vehicle_to_threejs(230.0, 0.0, 55.0)
        self.assertEqual(z3, -2.3)
        self.assertEqual(x3, 0.0)
        self.assertEqual(y3, 0.55)

        # Left point (+70 cm) must map to negative X in Three.js
        x3_l, _, _ = self.vehicle_to_threejs(0.0, 70.0, 55.0)
        self.assertEqual(x3_l, -0.7)

        # Right point (-70 cm) must map to positive X in Three.js
        x3_r, _, _ = self.vehicle_to_threejs(0.0, -70.0, 55.0)
        self.assertEqual(x3_r, 0.7)

if __name__ == '__main__':
    unittest.main()
