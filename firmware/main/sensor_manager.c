#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "esp_log.h"
#include "sensor_manager.h"

static const char *TAG = "SENSOR_MGR";

static sensor_channel_t s_sensors[NUM_SENSORS];
static float s_temperature_c = DEFAULT_TEMPERATURE_C;
static float s_us_per_cm = 58.24f; /* At 20 C */

static float s_thresh_red = THRESHOLD_RED_CRITICAL_CM;
static float s_thresh_yellow = THRESHOLD_YELLOW_WARN_CM;
static float s_thresh_green = THRESHOLD_GREEN_SAFE_CM;

static void update_speed_of_sound(float temp_c) {
    s_temperature_c = temp_c;
    float speed_m_s = 331.3f + (0.606f * temp_c);
    if (speed_m_s < 300.0f) speed_m_s = 300.0f;
    if (speed_m_s > 370.0f) speed_m_s = 370.0f;
    s_us_per_cm = 20000.0f / speed_m_s;
    ESP_LOGI(TAG, "Speed of sound updated: %.2f m/s (%.3f us/cm roundtrip at %.1f C)",
             speed_m_s, s_us_per_cm, temp_c);
}

void sensor_manager_set_temperature(float temp_c) {
    update_speed_of_sound(temp_c);
}

float sensor_manager_get_temperature(void) {
    return s_temperature_c;
}

void sensor_manager_set_thresholds(float red_cm, float yellow_cm, float green_cm) {
    s_thresh_red = red_cm;
    s_thresh_yellow = yellow_cm;
    s_thresh_green = green_cm;
    ESP_LOGI(TAG, "Proximity thresholds updated: Red=%.1f cm, Yellow=%.1f cm, Green=%.1f cm",
             s_thresh_red, s_thresh_yellow, s_thresh_green);
}

const char* sensor_status_to_str(sensor_status_t status) {
    switch (status) {
        case STATUS_OK:              return "ok";
        case STATUS_TIMEOUT:         return "timeout";
        case STATUS_BELOW_BLINDZONE: return "below_blindzone";
        case STATUS_OUT_OF_RANGE:    return "out_of_range";
        case STATUS_HARDWARE_ERROR:  return "hardware_error";
        case STATUS_DISABLED:        return "disabled";
        default:                     return "unknown";
    }
}

const char* sensor_proximity_to_str(proximity_level_t prox) {
    switch (prox) {
        case PROXIMITY_CRITICAL_RED:   return "critical_red";
        case PROXIMITY_WARNING_YELLOW: return "warning_yellow";
        case PROXIMITY_SAFE_GREEN:     return "safe_green";
        default:                       return "unknown";
    }
}

static void configure_sensor_metadata(void) {
    /* Channel 0: Front-Left */
    s_sensors[0] = (sensor_channel_t){
        .id = 0, .name = "Front-Left", .short_code = "FL",
        .trig_pin = SENSOR_0_TRIG_GPIO, .echo_pin = SENSOR_0_ECHO_GPIO,
        .azimuth_deg = 45.0f, .mount_x_cm = 230.0f, .mount_y_cm = 70.0f, .mount_z_cm = 55.0f,
        .blind_zone_cm = DEFAULT_BLIND_ZONE_CM, .max_range_cm = DEFAULT_MAX_RANGE_CM
    };

    /* Channel 1: Front-Center */
    s_sensors[1] = (sensor_channel_t){
        .id = 1, .name = "Front-Center", .short_code = "FC",
        .trig_pin = SENSOR_1_TRIG_GPIO, .echo_pin = SENSOR_1_ECHO_GPIO,
        .azimuth_deg = 0.0f, .mount_x_cm = 230.0f, .mount_y_cm = 0.0f, .mount_z_cm = 55.0f,
        .blind_zone_cm = DEFAULT_BLIND_ZONE_CM, .max_range_cm = DEFAULT_MAX_RANGE_CM
    };

    /* Channel 2: Front-Right */
    s_sensors[2] = (sensor_channel_t){
        .id = 2, .name = "Front-Right", .short_code = "FR",
        .trig_pin = SENSOR_2_TRIG_GPIO, .echo_pin = SENSOR_2_ECHO_GPIO,
        .azimuth_deg = -45.0f, .mount_x_cm = 230.0f, .mount_y_cm = -70.0f, .mount_z_cm = 55.0f,
        .blind_zone_cm = DEFAULT_BLIND_ZONE_CM, .max_range_cm = DEFAULT_MAX_RANGE_CM
    };

    /* Channel 3: Right-Front Side */
    s_sensors[3] = (sensor_channel_t){
        .id = 3, .name = "Right-Front Side", .short_code = "RFS",
        .trig_pin = SENSOR_3_TRIG_GPIO, .echo_pin = SENSOR_3_ECHO_GPIO,
        .azimuth_deg = -90.0f, .mount_x_cm = 100.0f, .mount_y_cm = -92.5f, .mount_z_cm = 55.0f,
        .blind_zone_cm = DEFAULT_BLIND_ZONE_CM, .max_range_cm = 300.0f
    };

    /* Channel 4: Right-Rear Side */
    s_sensors[4] = (sensor_channel_t){
        .id = 4, .name = "Right-Rear Side", .short_code = "RRS",
        .trig_pin = SENSOR_4_TRIG_GPIO, .echo_pin = SENSOR_4_ECHO_GPIO,
        .azimuth_deg = -90.0f, .mount_x_cm = -100.0f, .mount_y_cm = -92.5f, .mount_z_cm = 55.0f,
        .blind_zone_cm = DEFAULT_BLIND_ZONE_CM, .max_range_cm = 300.0f
    };

    /* Channel 5: Rear-Right */
    s_sensors[5] = (sensor_channel_t){
        .id = 5, .name = "Rear-Right", .short_code = "RR",
        .trig_pin = SENSOR_5_TRIG_GPIO, .echo_pin = SENSOR_5_ECHO_GPIO,
        .azimuth_deg = -135.0f, .mount_x_cm = -230.0f, .mount_y_cm = -70.0f, .mount_z_cm = 55.0f,
        .blind_zone_cm = DEFAULT_BLIND_ZONE_CM, .max_range_cm = DEFAULT_MAX_RANGE_CM
    };

    /* Channel 6: Rear-Left */
    s_sensors[6] = (sensor_channel_t){
        .id = 6, .name = "Rear-Left", .short_code = "RL",
        .trig_pin = SENSOR_6_TRIG_GPIO, .echo_pin = SENSOR_6_ECHO_GPIO,
        .azimuth_deg = 135.0f, .mount_x_cm = -230.0f, .mount_y_cm = 70.0f, .mount_z_cm = 55.0f,
        .blind_zone_cm = DEFAULT_BLIND_ZONE_CM, .max_range_cm = DEFAULT_MAX_RANGE_CM
    };

    /* Channel 7: Left-Side */
    s_sensors[7] = (sensor_channel_t){
        .id = 7, .name = "Left-Side", .short_code = "LS",
        .trig_pin = SENSOR_7_TRIG_GPIO, .echo_pin = SENSOR_7_ECHO_GPIO,
        .azimuth_deg = 90.0f, .mount_x_cm = 0.0f, .mount_y_cm = 92.5f, .mount_z_cm = 55.0f,
        .blind_zone_cm = DEFAULT_BLIND_ZONE_CM, .max_range_cm = 300.0f
    };

    for (int i = 0; i < NUM_SENSORS; i++) {
        s_sensors[i].pulse_us = 0;
        s_sensors[i].raw_cm = -1.0f;
        s_sensors[i].filtered_cm = -1.0f;
        s_sensors[i].is_valid = false;
        s_sensors[i].status = STATUS_TIMEOUT;
        s_sensors[i].proximity = PROXIMITY_UNKNOWN;
        s_sensors[i].consecutive_timeouts = 0;
        s_sensors[i].history_idx = 0;
        s_sensors[i].history_count = 0;
    }
}

esp_err_t sensor_manager_init(void) {
    ESP_LOGI(TAG, "Initializing 8 ultrasonic sensor channels...");
    configure_sensor_metadata();
    update_speed_of_sound(DEFAULT_TEMPERATURE_C);

    for (int i = 0; i < NUM_SENSORS; i++) {
        /* Configure Trigger Pin (Output, LOW) */
        gpio_config_t trig_conf = {
            .pin_bit_mask = (1ULL << s_sensors[i].trig_pin),
            .mode = GPIO_MODE_OUTPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_ENABLE,
            .intr_type = GPIO_INTR_DISABLE
        };
        esp_err_t err = gpio_config(&trig_conf);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to configure Trigger GPIO %d for channel %d",
                     s_sensors[i].trig_pin, i);
            return err;
        }
        gpio_set_level(s_sensors[i].trig_pin, 0);

        /* Configure Echo Pin (Input) */
        /* Pins >= 34 are input-only and do not support pull-down resistors */
        bool has_internal_pulldown = (s_sensors[i].echo_pin < GPIO_NUM_34);
        gpio_config_t echo_conf = {
            .pin_bit_mask = (1ULL << s_sensors[i].echo_pin),
            .mode = GPIO_MODE_INPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = has_internal_pulldown ? GPIO_PULLDOWN_ENABLE : GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE
        };
        err = gpio_config(&echo_conf);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Failed to configure Echo GPIO %d for channel %d",
                     s_sensors[i].echo_pin, i);
            return err;
        }

        ESP_LOGI(TAG, "Ch %d [%s]: Trig=GPIO_%d, Echo=GPIO_%d, Azimuth=%.0f deg",
                 i, s_sensors[i].short_code, s_sensors[i].trig_pin,
                 s_sensors[i].echo_pin, s_sensors[i].azimuth_deg);
    }

    ESP_LOGI(TAG, "All 8 ultrasonic channels configured successfully.");
    return ESP_OK;
}

/* Helper to sort floats for median computation */
static int compare_floats(const void *a, const void *b) {
    float fa = *(const float*)a;
    float fb = *(const float*)b;
    if (fa < fb) return -1;
    if (fa > fb) return 1;
    return 0;
}

static float calculate_median_filtered(sensor_channel_t *ch, float new_val) {
    ch->history[ch->history_idx] = new_val;
    ch->history_idx = (ch->history_idx + 1) % SENSOR_HISTORY_DEPTH;
    if (ch->history_count < SENSOR_HISTORY_DEPTH) {
        ch->history_count++;
    }

    float sorted[SENSOR_HISTORY_DEPTH];
    memcpy(sorted, ch->history, ch->history_count * sizeof(float));
    qsort(sorted, ch->history_count, sizeof(float), compare_floats);

    return sorted[ch->history_count / 2];
}

/* Ping a single sensor channel and measure pulse duration */
static void ping_single_sensor(sensor_channel_t *ch) {
    gpio_num_t trig = ch->trig_pin;
    gpio_num_t echo = ch->echo_pin;

    /* Check if Echo line is currently HIGH from previous acoustic cycle */
    if (gpio_get_level(echo) == 1) {
        int64_t t_check = esp_timer_get_time();
        while (gpio_get_level(echo) == 1) {
            if ((esp_timer_get_time() - t_check) > 40000) {
                /* Line is permanently stuck HIGH (e.g. UART mode or disconnected cable) */
                ch->pulse_us = 0;
                ch->raw_cm = -1.0f;
                ch->is_valid = false;
                ch->status = STATUS_HARDWARE_ERROR;
                ch->proximity = PROXIMITY_UNKNOWN;
                ch->consecutive_timeouts++;
                if (ch->consecutive_timeouts >= 3) {
                    ch->filtered_cm = -1.0f;
                    ch->history_count = 0;
                }
                return;
            }
            esp_rom_delay_us(100);
        }
        /* Brief settling delay after falling edge */
        esp_rom_delay_us(200);
    }

    /* Ensure trigger is low before pulse */
    gpio_set_level(trig, 0);
    esp_rom_delay_us(10);

    /* Send 25 us HIGH trigger pulse (recommended for JSN-SR04T modules) */
    gpio_set_level(trig, 1);
    esp_rom_delay_us(25);
    gpio_set_level(trig, 0);

    /* Wait for Echo to go HIGH (bounded rise timeout) */
    int64_t t_trigger = esp_timer_get_time();
    while (gpio_get_level(echo) == 0) {
        if ((esp_timer_get_time() - t_trigger) > ECHO_RISE_TIMEOUT_US) {
            /* Echo line never transitioned high */
            ch->pulse_us = 0;
            ch->raw_cm = -1.0f;
            ch->is_valid = false;
            ch->status = STATUS_TIMEOUT;
            ch->proximity = PROXIMITY_UNKNOWN;
            ch->consecutive_timeouts++;
            if (ch->consecutive_timeouts >= 3) {
                ch->filtered_cm = -1.0f;
                ch->history_count = 0; /* Reset filter on prolonged loss */
            }
            return;
        }
    }

    /* Echo line transitioned HIGH - measure pulse width until it falls LOW */
    int64_t t_start = esp_timer_get_time();
    while (gpio_get_level(echo) == 1) {
        if ((esp_timer_get_time() - t_start) > ECHO_TIMEOUT_US) {
            /* Out of range or echo lost */
            ch->pulse_us = 0;
            ch->raw_cm = -1.0f;
            ch->is_valid = false;
            ch->status = STATUS_TIMEOUT;
            ch->proximity = PROXIMITY_UNKNOWN;
            ch->consecutive_timeouts++;
            if (ch->consecutive_timeouts >= 3) {
                ch->filtered_cm = -1.0f;
                ch->history_count = 0;
            }
            return;
        }
    }
    int64_t t_end = esp_timer_get_time();

    uint32_t duration_us = (uint32_t)(t_end - t_start);
    ch->pulse_us = duration_us;
    float dist_cm = (float)duration_us / s_us_per_cm;
    ch->raw_cm = dist_cm;

    /* Blind Zone check: Transducer ring-down deadband (<22cm is physical ringdown noise) */
    if (dist_cm < ch->blind_zone_cm) {
        ch->is_valid = false;
        ch->status = STATUS_BELOW_BLINDZONE;
        ch->proximity = PROXIMITY_CRITICAL_RED;
        ch->filtered_cm = -1.0f; /* Do not propagate ringdown noise as real distance */
        ch->consecutive_timeouts = 0;
        return;
    }

    /* Out of Range check */
    if (dist_cm > ch->max_range_cm) {
        ch->is_valid = false;
        ch->status = STATUS_OUT_OF_RANGE;
        ch->proximity = PROXIMITY_UNKNOWN;
        ch->filtered_cm = -1.0f;
        ch->consecutive_timeouts++;
        return;
    }

    /* Valid Echo received */
    ch->is_valid = true;
    ch->status = STATUS_OK;
    ch->consecutive_timeouts = 0;

    /* Apply median filtering */
    ch->filtered_cm = calculate_median_filtered(ch, dist_cm);

    /* Proximity Zone Classification */
    if (ch->filtered_cm <= s_thresh_red) {
        ch->proximity = PROXIMITY_CRITICAL_RED;
    } else if (ch->filtered_cm <= s_thresh_yellow) {
        ch->proximity = PROXIMITY_WARNING_YELLOW;
    } else if (ch->filtered_cm <= s_thresh_green) {
        ch->proximity = PROXIMITY_SAFE_GREEN;
    } else {
        ch->proximity = PROXIMITY_UNKNOWN;
    }
}

void sensor_manager_perform_sweep(telemetry_sweep_t *sweep) {
    int64_t sweep_start = esp_timer_get_time();

    /* 
     * Dual-Opposed Quadrant Interleaved Scheduling:
     * Sensors pointing in opposing directions (>= 180 deg apart, separated by 4+ meters)
     * are fired concurrently to double array update rate without acoustic crosstalk.
     */
    const int pairs[4][2] = {
        {0, 5}, /* Front-Left  & Rear-Right */
        {2, 6}, /* Front-Right & Rear-Left  */
        {1, 4}, /* Front-Center & Right-Rear Side */
        {3, 7}  /* Right-Front Side & Left-Side */
    };

    for (int p = 0; p < 4; p++) {
        int ch_a = pairs[p][0];
        int ch_b = pairs[p][1];

        /* Trigger pair sequentially within a tight microsecond window */
        ping_single_sensor(&s_sensors[ch_a]);
        ping_single_sensor(&s_sensors[ch_b]);

        /* Non-blocking inter-ping settling delay to allow acoustic reverberations to decay */
        vTaskDelay(pdMS_TO_TICKS(INTER_PING_SETTLING_MS));
    }

    int64_t sweep_end = esp_timer_get_time();
    float sweep_ms = (float)(sweep_end - sweep_start) / 1000.0f;

    /* Populate Telemetry Sweep Record */
    sweep->seq++;
    sweep->timestamp_ms = (uint32_t)(sweep_end / 1000);
    sweep->sweep_time_ms = sweep_ms;
    sweep->rate_hz = (sweep_ms > 0.0f) ? (1000.0f / sweep_ms) : 0.0f;
    sweep->temperature_c = s_temperature_c;
    sweep->simulation_active = false;

    memcpy(sweep->channels, s_sensors, sizeof(s_sensors));
}
