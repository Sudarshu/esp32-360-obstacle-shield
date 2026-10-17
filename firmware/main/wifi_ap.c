#include <string.h>
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_mac.h"
#include "config.h"
#include "wifi_ap.h"

static const char *TAG = "WIFI_AP";
static int s_station_count = 0;

static void wifi_event_handler(void* arg, esp_event_base_t event_base,
                               int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STACONNECTED) {
        wifi_event_ap_staconnected_t* event = (wifi_event_ap_staconnected_t*) event_data;
        s_station_count++;
        ESP_LOGI(TAG, "Client connected: MAC="MACSTR" (AID=%d). Active stations: %d",
                 MAC2STR(event->mac), event->aid, s_station_count);
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_STADISCONNECTED) {
        wifi_event_ap_stadisconnected_t* event = (wifi_event_ap_stadisconnected_t*) event_data;
        if (s_station_count > 0) s_station_count--;
        ESP_LOGI(TAG, "Client disconnected: MAC="MACSTR" (AID=%d). Active stations: %d",
                 MAC2STR(event->mac), event->aid, s_station_count);
    }
}

int wifi_ap_get_station_count(void) {
    return s_station_count;
}

esp_err_t wifi_ap_init(void) {
    ESP_LOGI(TAG, "Configuring Wi-Fi SoftAP...");

    esp_netif_t *ap_netif = esp_netif_create_default_wifi_ap();
    if (!ap_netif) {
        ESP_LOGE(TAG, "Failed to create default Wi-Fi AP netif");
        return ESP_FAIL;
    }

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_err_t err = esp_wifi_init(&cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_wifi_init failed: %s", esp_err_to_name(err));
        return err;
    }

    err = esp_event_handler_instance_register(WIFI_EVENT,
                                              ESP_EVENT_ANY_ID,
                                              &wifi_event_handler,
                                              NULL,
                                              NULL);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to register Wi-Fi event handler");
        return err;
    }

    wifi_config_t wifi_config = {
        .ap = {
            .ssid = WIFI_AP_SSID,
            .ssid_len = strlen(WIFI_AP_SSID),
            .channel = WIFI_AP_CHANNEL,
            .password = WIFI_AP_PASS,
            .max_connection = WIFI_AP_MAX_CONN,
            .authmode = WIFI_AUTH_WPA2_PSK,
            .pmf_cfg = {
                .required = false,
            },
        },
    };

    if (strlen(WIFI_AP_PASS) == 0) {
        wifi_config.ap.authmode = WIFI_AUTH_OPEN;
    }

    err = esp_wifi_set_mode(WIFI_MODE_AP);
    if (err != ESP_OK) return err;

    err = esp_wifi_set_config(WIFI_IF_AP, &wifi_config);
    if (err != ESP_OK) return err;

    err = esp_wifi_start();
    if (err != ESP_OK) return err;

    /* Reduce Wi-Fi TX power to 13 dBm (52 * 0.25 dBm) to lower RF power amplifier heat */
    esp_wifi_set_max_tx_power(52);

    ESP_LOGI(TAG, "SoftAP started successfully (TX power limited to 13 dBm for thermal management).");
    ESP_LOGI(TAG, "SSID: %s, Pass: %s, IP: 192.168.4.1", WIFI_AP_SSID, WIFI_AP_PASS);

    return ESP_OK;
}
