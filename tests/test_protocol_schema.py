#!/usr/bin/env python3
"""
Unit Tests for Telemetry & WebSocket JSON Protocol Schema Validation
Validates compliant telemetry, heartbeat, and client command packets,
and tests rejection of malformed structures.
"""

import unittest
import json

VALID_STATUSES = {"ok", "timeout", "below_blindzone", "out_of_range", "hardware_error", "disabled"}
VALID_PROXIMITIES = {"critical_red", "warning_yellow", "safe_green", "unknown"}

def validate_telemetry_message(msg):
    if not isinstance(msg, dict):
        return False, "Message must be a dictionary"
    if msg.get("type") != "telemetry":
        return False, "Message type must be 'telemetry'"
    if not isinstance(msg.get("seq"), int) or msg.get("seq") < 0:
        return False, "Field 'seq' must be a non-negative integer"
    if not isinstance(msg.get("timestamp_ms"), (int, float)):
        return False, "Field 'timestamp_ms' must be numeric"
    if not isinstance(msg.get("rate_hz"), (int, float)):
        return False, "Field 'rate_hz' must be numeric"
    
    sensors = msg.get("sensors")
    if not isinstance(sensors, list) or len(sensors) != 8:
        return False, "Field 'sensors' must be a list of exactly 8 items"
    
    for s in sensors:
        if not isinstance(s, dict):
            return False, "Sensor entry must be an object"
        sid = s.get("id")
        if not isinstance(sid, int) or sid < 0 or sid > 7:
            return False, f"Invalid sensor id: {sid}"
        if not isinstance(s.get("valid"), bool):
            return False, "Sensor 'valid' must be boolean"
        if s.get("status") not in VALID_STATUSES:
            return False, f"Invalid sensor status: {s.get('status')}"
        if s.get("proximity") not in VALID_PROXIMITIES:
            return False, f"Invalid sensor proximity: {s.get('proximity')}"
        
        dist = s.get("distance_cm")
        if s.get("valid"):
            if dist is None or not isinstance(dist, (int, float)) or dist <= 0:
                return False, f"Valid sensor #{sid} must have positive distance, got {dist}"
        else:
            # When invalid, distance may be None or negative
            if dist is not None and not isinstance(dist, (int, float)):
                return False, f"Invalid sensor #{sid} distance must be null or number"
                
    return True, "Valid"

class TestProtocolSchema(unittest.TestCase):
    def test_valid_telemetry_packet(self):
        sample = {
            "type": "telemetry",
            "seq": 1420,
            "timestamp_ms": 328450,
            "sweep_time_ms": 164.2,
            "rate_hz": 6.1,
            "temperature_c": 20.0,
            "simulation": False,
            "sensors": [
                {
                    "id": i,
                    "distance_cm": 85.5 if i != 1 else None,
                    "raw_cm": 85.5 if i != 1 else -1.0,
                    "pulse_us": 4980 if i != 1 else 0,
                    "valid": (i != 1),
                    "status": "ok" if i != 1 else "timeout",
                    "proximity": "warning_yellow" if i != 1 else "unknown",
                    "consecutive_timeouts": 0 if i != 1 else 3
                }
                for i in range(8)
            ]
        }
        is_valid, msg = validate_telemetry_message(sample)
        self.assertTrue(is_valid, msg)

    def test_reject_incomplete_sensor_count(self):
        # Only 7 sensors instead of 8
        bad_sample = {
            "type": "telemetry",
            "seq": 10,
            "timestamp_ms": 1000,
            "rate_hz": 7.0,
            "sensors": [{"id": i, "distance_cm": 50.0, "valid": True, "status": "ok", "proximity": "critical_red"} for i in range(7)]
        }
        is_valid, reason = validate_telemetry_message(bad_sample)
        self.assertFalse(is_valid)
        self.assertIn("exactly 8", reason)

    def test_reject_valid_sensor_with_null_distance(self):
        # A sensor claiming valid=True must NOT have null distance
        sample = {
            "type": "telemetry",
            "seq": 12,
            "timestamp_ms": 1200,
            "rate_hz": 7.0,
            "sensors": [
                {
                    "id": i,
                    "distance_cm": None if i == 0 else 50.0,
                    "valid": True,
                    "status": "ok",
                    "proximity": "safe_green"
                }
                for i in range(8)
            ]
        }
        is_valid, reason = validate_telemetry_message(sample)
        self.assertFalse(is_valid)
        self.assertIn("must have positive distance", reason)

if __name__ == '__main__':
    unittest.main()
