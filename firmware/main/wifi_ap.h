#ifndef VEHICLE_SHIELD_WIFI_AP_H
#define VEHICLE_SHIELD_WIFI_AP_H

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Initialize Wi-Fi Access Point mode with configured SSID and WPA2 security */
esp_err_t wifi_ap_init(void);

/* Return number of currently connected Wi-Fi stations */
int wifi_ap_get_station_count(void);

#ifdef __cplusplus
}
#endif

#endif /* VEHICLE_SHIELD_WIFI_AP_H */
