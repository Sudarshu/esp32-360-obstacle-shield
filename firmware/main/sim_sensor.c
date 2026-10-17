#include <stdio.h>
#include <string.h>
#include <math.h>
#include <stdlib.h>
#include "esp_timer.h"
#include "esp_log.h"
#include "sim_sensor.h"
#include "sensor_manager.h"

static const char *TAG = "SIM_SENSOR";
static bool s_sim_enabled = false; /* Real hardware mode enabled by default for testing physical sensors */
static float s_time_phase = 0.0f;

void sim_sensor_init(void) {
    ESP_LOGI(TAG, "Synthetic sensor generator initialized. Mode=%s",
             s_sim_enabled ? "SIMULATION" : "HARDWARE");
}

void sim_sensor_set_enabled(bool enabled) {
    s_sim_enabled = enabled;
    ESP_LOGI(TAG, "Simulation mode set to: %s", enabled ? "ENABLED" : "DISABLED");
}

bool sim_sensor_is_enabled(void) {
    return s_sim_enabled;
}

void sim_sensor_generate_sweep(telemetry_sweep_t *sweep) {
    s_time_phase += 0.08f;
    if (s_time_phase > 628.3f) s_time_phase = 0.0f;

    int64_t now_us = esp_timer_get_time();
    sweep->seq++;
    sweep->timestamp_ms = (uint32_t)(now_us / 1000);
    sweep->sweep_time_ms = 140.0f;
    sweep->rate_hz = 7.14f;
    sweep->temperature_c = sensor_manager_get_temperature();
    sweep->simulation_active = true;

    /*
     * Generate 3 dynamic scenario components:
     * 1. Approaching front obstacle (sinusoidal oscillate between 45cm and 280cm)
     * 2. Right side vehicle pass (traveling alongside RFS and RRS)
     * 3. Rear static obstacle at ~120cm with slight jitter
     */
    float front_wave = 160.0f + 120.0f * sinf(s_time_phase);
    float side_wave = 130.0f + 80.0f * cosf(s_time_phase * 0.7f);
    float rear_dist = 115.0f + 5.0f * sinf(s_time_phase * 2.0f);

    for (int i = 0; i < NUM_SENSORS; i++) {
        sensor_channel_t *ch = &sweep->channels[i];
        ch->id = i;
        float d = -1.0f;
        sensor_status_t st = STATUS_OK;

        switch (i) {
            case 0: /* Front-Left */
                d = front_wave + 18.0f;
                break;
            case 1: /* Front-Center */
                d = front_wave;
                break;
            case 2: /* Front-Right */
                d = front_wave + 22.0f;
                break;
            case 3: /* Right-Front Side */
                d = side_wave;
                break;
            case 4: /* Right-Rear Side */
                d = side_wave + 15.0f;
                break;
            case 5: /* Rear-Right */
                d = rear_dist + 10.0f;
                break;
            case 6: /* Rear-Left */
                d = rear_dist;
                break;
            case 7: /* Left-Side: Clear open space with occasional timeout */
                if (sinf(s_time_phase * 0.5f) > 0.4f) {
                    d = 260.0f + 40.0f * sinf(s_time_phase);
                } else {
                    d = -1.0f; /* Timeout/open space */
                    st = STATUS_TIMEOUT;
                }
                break;
        }

        /* Check blind zone and range boundaries */
        if (st == STATUS_TIMEOUT || d < 0.0f) {
            ch->raw_cm = -1.0f;
            ch->filtered_cm = -1.0f;
            ch->pulse_us = 0;
            ch->is_valid = false;
            ch->status = STATUS_TIMEOUT;
            ch->proximity = PROXIMITY_UNKNOWN;
            ch->consecutive_timeouts++;
        } else if (d < DEFAULT_BLIND_ZONE_CM) {
            ch->raw_cm = d;
            ch->filtered_cm = d;
            ch->pulse_us = (uint32_t)(d * 58.24f);
            ch->is_valid = false;
            ch->status = STATUS_BELOW_BLINDZONE;
            ch->proximity = PROXIMITY_CRITICAL_RED;
            ch->consecutive_timeouts = 0;
        } else if (d > DEFAULT_MAX_RANGE_CM) {
            ch->raw_cm = d;
            ch->filtered_cm = -1.0f;
            ch->pulse_us = (uint32_t)(d * 58.24f);
            ch->is_valid = false;
            ch->status = STATUS_OUT_OF_RANGE;
            ch->proximity = PROXIMITY_UNKNOWN;
            ch->consecutive_timeouts++;
        } else {
            ch->raw_cm = d;
            ch->filtered_cm = d;
            ch->pulse_us = (uint32_t)(d * 58.24f);
            ch->is_valid = true;
            ch->status = STATUS_OK;
            ch->consecutive_timeouts = 0;

            if (d <= THRESHOLD_RED_CRITICAL_CM) {
                ch->proximity = PROXIMITY_CRITICAL_RED;
            } else if (d <= THRESHOLD_YELLOW_WARN_CM) {
                ch->proximity = PROXIMITY_WARNING_YELLOW;
            } else {
                ch->proximity = PROXIMITY_SAFE_GREEN;
            }
        }
    }
}
