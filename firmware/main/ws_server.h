#ifndef VEHICLE_SHIELD_WS_SERVER_H
#define VEHICLE_SHIELD_WS_SERVER_H

#include "esp_err.h"
#include "esp_http_server.h"
#include "config.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Initialize and start HTTP web server and WebSocket endpoint */
esp_err_t ws_server_start(void);

/* Stop HTTP and WebSocket server */
void ws_server_stop(void);

/* Broadcast a completed telemetry sweep to all connected WebSocket clients */
esp_err_t ws_server_broadcast_telemetry(const telemetry_sweep_t *sweep);

/* Broadcast system heartbeat and health statistics */
esp_err_t ws_server_broadcast_heartbeat(void);

/* Get number of currently connected WebSocket browser clients */
int ws_server_get_client_count(void);

#ifdef __cplusplus
}
#endif

#endif /* VEHICLE_SHIELD_WS_SERVER_H */
