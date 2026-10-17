#ifndef VEHICLE_SHIELD_CONFIG_H
#define VEHICLE_SHIELD_CONFIG_H

#include <stdint.h>
#include <stdbool.h>
#include "driver/gpio.h"

#ifdef __cplusplus
extern "C" {
#endif

#define FIRMWARE_VERSION           "1.0.0"
#define SYSTEM_NAME                "ESP32-Obstacle-Shield"

#define NUM_SENSORS                8
#define SENSOR_HISTORY_DEPTH       5

/* GPIO Assignment for 8 Dedicated Channels */
#define SENSOR_0_TRIG_GPIO         GPIO_NUM_4
#define SENSOR_0_ECHO_GPIO         GPIO_NUM_34

#define SENSOR_1_TRIG_GPIO         GPIO_NUM_16
#define SENSOR_1_ECHO_GPIO         GPIO_NUM_35

#define SENSOR_2_TRIG_GPIO         GPIO_NUM_17
#define SENSOR_2_ECHO_GPIO         GPIO_NUM_36

#define SENSOR_3_TRIG_GPIO         GPIO_NUM_18
#define SENSOR_3_ECHO_GPIO         GPIO_NUM_39

#define SENSOR_4_TRIG_GPIO         GPIO_NUM_19
#define SENSOR_4_ECHO_GPIO         GPIO_NUM_32

#define SENSOR_5_TRIG_GPIO         GPIO_NUM_21
#define SENSOR_5_ECHO_GPIO         GPIO_NUM_33

#define SENSOR_6_TRIG_GPIO         GPIO_NUM_22
#define SENSOR_6_ECHO_GPIO         GPIO_NUM_25

#define SENSOR_7_TRIG_GPIO         GPIO_NUM_23
#define SENSOR_7_ECHO_GPIO         GPIO_NUM_26

/* Acoustic Physics and Timing Constants */
#define DEFAULT_TEMPERATURE_C      20.0f
#define DEFAULT_BLIND_ZONE_CM      22.0f
#define DEFAULT_MAX_RANGE_CM       350.0f
#define ECHO_TIMEOUT_US            38000     /* 38 ms timeout (~650 cm roundtrip, matches JSN-SR04T hardware timeout) */
#define ECHO_RISE_TIMEOUT_US       12000     /* Bounded wait for Echo line to go HIGH (supports JSN-SR04T ringdown) */
#define INTER_PING_SETTLING_MS     15        /* Settling delay between pairs/pings */

/* Proximity Zone Thresholds in Centimeters */
#define THRESHOLD_RED_CRITICAL_CM  60.0f
#define THRESHOLD_YELLOW_WARN_CM   150.0f
#define THRESHOLD_GREEN_SAFE_CM    300.0f

/* Wi-Fi Access Point Configuration */
#define WIFI_AP_SSID               "ESP32_OBSTACLE_SHIELD"
#define WIFI_AP_PASS               "obstacle1234"
#define WIFI_AP_CHANNEL            1
#define WIFI_AP_MAX_CONN           4

/* WebSocket & HTTP Server */
#define HTTP_SERVER_PORT           80
#define WS_ENDPOINT_URI            "/ws"
#define WS_MAX_CLIENTS             4
#define HEARTBEAT_INTERVAL_MS      2000

/* Sensor Status Codes */
typedef enum {
    STATUS_OK = 0,
    STATUS_TIMEOUT,
    STATUS_BELOW_BLINDZONE,
    STATUS_OUT_OF_RANGE,
    STATUS_HARDWARE_ERROR,
    STATUS_DISABLED
} sensor_status_t;

/* Proximity Levels */
typedef enum {
    PROXIMITY_UNKNOWN = 0,
    PROXIMITY_CRITICAL_RED,
    PROXIMITY_WARNING_YELLOW,
    PROXIMITY_SAFE_GREEN
} proximity_level_t;

/* Single Sensor Channel Data */
typedef struct {
    uint8_t id;
    const char *name;
    const char *short_code;
    gpio_num_t trig_pin;
    gpio_num_t echo_pin;
    float azimuth_deg;
    float mount_x_cm;
    float mount_y_cm;
    float mount_z_cm;
    float blind_zone_cm;
    float max_range_cm;

    /* Live State */
    uint32_t pulse_us;
    float raw_cm;
    float filtered_cm;
    bool is_valid;
    sensor_status_t status;
    proximity_level_t proximity;
    uint16_t consecutive_timeouts;
    
    /* Filtering Ring Buffer */
    float history[SENSOR_HISTORY_DEPTH];
    uint8_t history_idx;
    uint8_t history_count;
} sensor_channel_t;

/* Telemetry Sweep Data */
typedef struct {
    uint32_t seq;
    uint32_t timestamp_ms;
    float sweep_time_ms;
    float rate_hz;
    float temperature_c;
    bool simulation_active;
    sensor_channel_t channels[NUM_SENSORS];
} telemetry_sweep_t;

#ifdef __cplusplus
}
#endif

#endif /* VEHICLE_SHIELD_CONFIG_H */
