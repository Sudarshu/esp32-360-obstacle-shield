#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_timer.h"

#include "config.h"
#include "wifi_ap.h"
#include "sensor_manager.h"
#include "sim_sensor.h"
#include "ws_server.h"

static const char *TAG = "MAIN_APP";

static telemetry_sweep_t s_current_sweep;

/* Sensor Acquisition & Telemetry Streaming Task (Pinned to Core 1) */
static void sensor_task(void *pvParameters) {
    ESP_LOGI(TAG, "Sensor acquisition task started on core %d", xPortGetCoreID());

    memset(&s_current_sweep, 0, sizeof(telemetry_sweep_t));
    s_current_sweep.temperature_c = DEFAULT_TEMPERATURE_C;

    while (1) {
        if (sim_sensor_is_enabled()) {
            /* Generate synthetic simulated sweep for bench testing */
            sim_sensor_generate_sweep(&s_current_sweep);
            vTaskDelay(pdMS_TO_TICKS(140)); /* Emulate ~7 Hz physical sweep rate */
        } else {
            /* Execute real physical ultrasonic sweep with settling intervals */
            sensor_manager_perform_sweep(&s_current_sweep);
            /* Cool-down idle period allowing FreeRTOS idle task to clock-gate CPU */
            vTaskDelay(pdMS_TO_TICKS(60));
        }

        /* Stream telemetry to all active WebSocket clients */
        ws_server_broadcast_telemetry(&s_current_sweep);

        /* Print real-time sensor distance readouts to serial console every ~1s */
        if (s_current_sweep.seq % 5 == 0) {
            char log_buf[256] = "";
            int offset = 0;
            int active_count = 0;

            for (int i = 0; i < NUM_SENSORS; i++) {
                const sensor_channel_t *ch = &s_current_sweep.channels[i];
                if (ch->is_valid) {
                    offset += snprintf(log_buf + offset, sizeof(log_buf) - offset,
                                       " | S%d [%s]: %.1f cm", i, ch->short_code, ch->filtered_cm);
                    active_count++;
                } else if (ch->status == STATUS_BELOW_BLINDZONE) {
                    offset += snprintf(log_buf + offset, sizeof(log_buf) - offset,
                                       " | S%d [%s]: <22cm (HAZARD)", i, ch->short_code);
                    active_count++;
                } else if (ch->status == STATUS_HARDWARE_ERROR) {
                    offset += snprintf(log_buf + offset, sizeof(log_buf) - offset,
                                       " | S%d [%s]: STUCK_HIGH", i, ch->short_code);
                    active_count++;
                }
            }

            if (active_count == 0) {
                snprintf(log_buf, sizeof(log_buf), " | S0 [FL]: timeout | S1 [FC]: %s",
                         sensor_status_to_str(s_current_sweep.channels[1].status));
            }

            ESP_LOGI(TAG, "Sweep #%lu (%.1f Hz)%s",
                     s_current_sweep.seq, s_current_sweep.rate_hz, log_buf);
        }

        /* Yield task to prevent starvation */
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

/* System Health & Heartbeat Task (Pinned to Core 0) */
static void heartbeat_task(void *pvParameters) {
    ESP_LOGI(TAG, "Heartbeat diagnostics task started on core %d", xPortGetCoreID());

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS));

        /* Broadcast WebSocket keepalive & health status */
        ws_server_broadcast_heartbeat();

        /* Print periodic console diagnostics */
        uint32_t uptime_s = (uint32_t)(esp_timer_get_time() / 1000000);
        uint32_t free_heap = esp_get_free_heap_size();
        int clients = ws_server_get_client_count();
        int stations = wifi_ap_get_station_count();

        ESP_LOGI(TAG, "[Uptime: %lu s] Free Heap: %lu B | WS Clients: %d | Wi-Fi STAs: %d | Mode: %s | Sweep #%lu (%.1f Hz)",
                 uptime_s, free_heap, clients, stations,
                 sim_sensor_is_enabled() ? "SIMULATION" : "HARDWARE",
                 s_current_sweep.seq, s_current_sweep.rate_hz);
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "=======================================================");
    ESP_LOGI(TAG, "  360-DEGREE VEHICLE OBSTACLE DETECTION SHIELD");
    ESP_LOGI(TAG, "  Firmware Version: %s", FIRMWARE_VERSION);
    ESP_LOGI(TAG, "  Target: ESP32-WROOM-32 (Xtensa Dual-Core 240MHz)");
    ESP_LOGI(TAG, "=======================================================");

    /* Initialize Non-Volatile Storage (NVS) for Wi-Fi storage */
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    /* Initialize TCP/IP Network Interface and Event Loop */
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    /* Initialize Wi-Fi SoftAP */
    ESP_ERROR_CHECK(wifi_ap_init());

    /* Initialize Sensor Manager Hardware GPIOs */
    ESP_ERROR_CHECK(sensor_manager_init());

    /* Initialize Synthetic Sensor Generator */
    sim_sensor_init();

    /* Start HTTP Dashboard Server & WebSocket Endpoint */
    ESP_ERROR_CHECK(ws_server_start());

    /* Create Sensor Acquisition Task on Core 1 (Isolated from Wi-Fi stack on Core 0) */
    xTaskCreatePinnedToCore(
        sensor_task,
        "sensor_task",
        4096,
        NULL,
        5,
        NULL,
        1
    );

    /* Create Heartbeat & Diagnostics Task on Core 0 */
    xTaskCreatePinnedToCore(
        heartbeat_task,
        "heartbeat_task",
        3072,
        NULL,
        2,
        NULL,
        0
    );

    ESP_LOGI(TAG, "Initialization complete. Ready for vehicle obstacle monitoring.");
}
