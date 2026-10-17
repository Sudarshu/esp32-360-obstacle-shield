#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"
#include "esp_timer.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "cJSON.h"

#include "config.h"
#include "ws_server.h"
#include "sensor_manager.h"
#include "sim_sensor.h"
#include "wifi_ap.h"
#include "web_dashboard_html.h"

static const char *TAG = "WS_SERVER";

static httpd_handle_t s_server = NULL;
static telemetry_sweep_t s_latest_sweep;
static bool s_has_sweep = false;
static SemaphoreHandle_t s_sweep_mutex = NULL;

static char* build_telemetry_json(const telemetry_sweep_t *sweep) {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "telemetry");
    cJSON_AddNumberToObject(root, "seq", sweep->seq);
    cJSON_AddNumberToObject(root, "timestamp_ms", sweep->timestamp_ms);
    cJSON_AddNumberToObject(root, "sweep_time_ms", sweep->sweep_time_ms);
    cJSON_AddNumberToObject(root, "rate_hz", sweep->rate_hz);
    cJSON_AddNumberToObject(root, "temperature_c", sweep->temperature_c);
    cJSON_AddBoolToObject(root, "simulation", sweep->simulation_active);

    cJSON *sensors = cJSON_AddArrayToObject(root, "sensors");
    for (int i = 0; i < NUM_SENSORS; i++) {
        const sensor_channel_t *ch = &sweep->channels[i];
        cJSON *s = cJSON_CreateObject();
        cJSON_AddNumberToObject(s, "id", ch->id);

        if (ch->is_valid && ch->filtered_cm >= 0.0f) {
            cJSON_AddNumberToObject(s, "distance_cm", ch->filtered_cm);
        } else {
            cJSON_AddNullToObject(s, "distance_cm");
        }

        cJSON_AddNumberToObject(s, "raw_cm", ch->raw_cm);
        cJSON_AddNumberToObject(s, "pulse_us", ch->pulse_us);
        cJSON_AddBoolToObject(s, "valid", ch->is_valid);
        cJSON_AddStringToObject(s, "status", sensor_status_to_str(ch->status));
        cJSON_AddStringToObject(s, "proximity", sensor_proximity_to_str(ch->proximity));
        cJSON_AddNumberToObject(s, "consecutive_timeouts", ch->consecutive_timeouts);

        cJSON_AddItemToArray(sensors, s);
    }

    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    return json_str;
}

int ws_server_get_client_count(void) {
    if (!s_server) return 0;
    size_t max_fds = WS_MAX_CLIENTS + 3;
    size_t clients = max_fds;
    int client_fds[max_fds];
    int count = 0;
    if (httpd_get_client_list(s_server, &clients, client_fds) == ESP_OK) {
        for (size_t i = 0; i < clients; ++i) {
            if (httpd_ws_get_fd_info(s_server, client_fds[i]) == HTTPD_WS_CLIENT_WEBSOCKET) {
                count++;
            }
        }
    }
    return count;
}

/* HTTP GET Handler for root dashboard */
static esp_err_t index_get_handler(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/html");
    httpd_resp_set_hdr(req, "Content-Encoding", "identity");
    httpd_resp_set_hdr(req, "Connection", "close");
    return httpd_resp_send(req, s_dashboard_html, HTTPD_RESP_USE_STRLEN);
}

/* HTTP GET Handler for REST telemetry endpoint */
static esp_err_t telemetry_get_handler(httpd_req_t *req) {
    char *json_str = NULL;
    if (s_sweep_mutex && xSemaphoreTake(s_sweep_mutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        if (s_has_sweep) {
            json_str = build_telemetry_json(&s_latest_sweep);
        }
        xSemaphoreGive(s_sweep_mutex);
    }

    if (!json_str) {
        json_str = strdup("{\"type\":\"telemetry\",\"sensors\":[]}");
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Cache-Control", "no-cache, no-store, must-revalidate");
    esp_err_t ret = httpd_resp_send(req, json_str, HTTPD_RESP_USE_STRLEN);
    free(json_str);
    return ret;
}

/* HTTP GET Handler for REST health/diagnostics endpoint */
static esp_err_t status_get_handler(httpd_req_t *req) {
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "system", SYSTEM_NAME);
    cJSON_AddStringToObject(root, "version", FIRMWARE_VERSION);
    cJSON_AddNumberToObject(root, "uptime_s", (uint32_t)(esp_timer_get_time() / 1000000));
    cJSON_AddNumberToObject(root, "free_heap_bytes", esp_get_free_heap_size());
    cJSON_AddNumberToObject(root, "min_free_heap_bytes", esp_get_minimum_free_heap_size());
    cJSON_AddNumberToObject(root, "ws_clients", ws_server_get_client_count());
    cJSON_AddNumberToObject(root, "wifi_stations", wifi_ap_get_station_count());
    cJSON_AddBoolToObject(root, "simulation_active", sim_sensor_is_enabled());

    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    esp_err_t ret = httpd_resp_send(req, json_str, HTTPD_RESP_USE_STRLEN);
    free(json_str);
    return ret;
}

/* WebSocket Request Handler */
static esp_err_t ws_handler(httpd_req_t *req) {
    int fd = httpd_req_to_sockfd(req);

    httpd_ws_frame_t ws_pkt;
    memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));
    ws_pkt.type = HTTPD_WS_TYPE_TEXT;

    /* First call to get frame length */
    esp_err_t ret = httpd_ws_recv_frame(req, &ws_pkt, 0);
    if (ret != ESP_OK) {
        ESP_LOGD(TAG, "httpd_ws_recv_frame length check returned %s", esp_err_to_name(ret));
        return ret;
    }

    if (ws_pkt.len) {
        uint8_t *buf = calloc(1, ws_pkt.len + 1);
        if (!buf) {
            ESP_LOGE(TAG, "Failed to allocate memory for incoming WS packet");
            return ESP_ERR_NO_MEM;
        }
        ws_pkt.payload = buf;
        ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len);
        if (ret == ESP_OK) {
            /* Parse JSON command */
            cJSON *cmd = cJSON_Parse((const char *)buf);
            if (cmd) {
                cJSON *action = cJSON_GetObjectItem(cmd, "action");
                if (cJSON_IsString(action)) {
                    if (strcmp(action->valuestring, "set_simulation") == 0) {
                        cJSON *sim = cJSON_GetObjectItem(cmd, "simulation_enabled");
                        if (cJSON_IsBool(sim)) {
                            sim_sensor_set_enabled(cJSON_IsTrue(sim));
                        }
                    } else if (strcmp(action->valuestring, "set_temperature") == 0) {
                        cJSON *temp = cJSON_GetObjectItem(cmd, "temperature_c");
                        if (cJSON_IsNumber(temp)) {
                            sensor_manager_set_temperature((float)temp->valuedouble);
                        }
                    } else if (strcmp(action->valuestring, "set_thresholds") == 0) {
                        cJSON *thresh = cJSON_GetObjectItem(cmd, "thresholds");
                        if (thresh) {
                            cJSON *r = cJSON_GetObjectItem(thresh, "red_cm");
                            cJSON *y = cJSON_GetObjectItem(thresh, "yellow_cm");
                            cJSON *g = cJSON_GetObjectItem(thresh, "green_cm");
                            if (cJSON_IsNumber(r) && cJSON_IsNumber(y) && cJSON_IsNumber(g)) {
                                sensor_manager_set_thresholds((float)r->valuedouble,
                                                              (float)y->valuedouble,
                                                              (float)g->valuedouble);
                            }
                        }
                    } else if (strcmp(action->valuestring, "ping") == 0 || strcmp(action->valuestring, "subscribe") == 0) {
                        if (s_has_sweep) {
                            char *reply_str = build_telemetry_json(&s_latest_sweep);
                            if (reply_str) {
                                httpd_ws_frame_t resp_frame = {
                                    .final = true,
                                    .fragmented = false,
                                    .type = HTTPD_WS_TYPE_TEXT,
                                    .payload = (uint8_t*)reply_str,
                                    .len = strlen(reply_str)
                                };
                                httpd_ws_send_frame_async(s_server, fd, &resp_frame);
                                free(reply_str);
                            }
                        }
                    }
                }
                cJSON_Delete(cmd);
            }
        }
        free(buf);
    }
    return ESP_OK;
}

esp_err_t ws_server_start(void) {
    if (!s_sweep_mutex) {
        s_sweep_mutex = xSemaphoreCreateMutex();
    }

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = HTTP_SERVER_PORT;
    config.max_open_sockets = WS_MAX_CLIENTS + 3;
    config.lru_purge_enable = true;

    ESP_LOGI(TAG, "Starting HTTP & WebSocket server on port %d...", config.server_port);
    esp_err_t ret = httpd_start(&s_server, &config);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start HTTP server: %s", esp_err_to_name(ret));
        return ret;
    }

    /* URI handler for / */
    httpd_uri_t uri_get_index = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = index_get_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &uri_get_index);

    /* URI handler for /index.html */
    httpd_uri_t uri_get_index2 = {
        .uri = "/index.html",
        .method = HTTP_GET,
        .handler = index_get_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &uri_get_index2);

    /* URI handler for /api/status */
    httpd_uri_t uri_get_status = {
        .uri = "/api/status",
        .method = HTTP_GET,
        .handler = status_get_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &uri_get_status);

    /* URI handler for /api/telemetry (High-reliability HTTP polling endpoint) */
    httpd_uri_t uri_get_telemetry = {
        .uri = "/api/telemetry",
        .method = HTTP_GET,
        .handler = telemetry_get_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &uri_get_telemetry);

    /* URI handler for WebSocket endpoint /ws */
    httpd_uri_t uri_ws = {
        .uri = WS_ENDPOINT_URI,
        .method = HTTP_GET,
        .handler = ws_handler,
        .user_ctx = NULL,
        .is_websocket = true
    };
    httpd_register_uri_handler(s_server, &uri_ws);

    ESP_LOGI(TAG, "HTTP & WebSocket server started successfully.");
    return ESP_OK;
}

void ws_server_stop(void) {
    if (s_server) {
        httpd_stop(s_server);
        s_server = NULL;
    }
}

esp_err_t ws_server_broadcast_telemetry(const telemetry_sweep_t *sweep) {
    if (!sweep) return ESP_ERR_INVALID_ARG;

    /* Always cache latest sweep for /api/telemetry HTTP fallback */
    if (s_sweep_mutex && xSemaphoreTake(s_sweep_mutex, pdMS_TO_TICKS(20)) == pdTRUE) {
        s_latest_sweep = *sweep;
        s_has_sweep = true;
        xSemaphoreGive(s_sweep_mutex);
    }

    if (!s_server) return ESP_OK;

    /* Query active client socket descriptors from ESP-IDF HTTP server */
    size_t max_fds = WS_MAX_CLIENTS + 3;
    size_t clients = max_fds;
    int client_fds[max_fds];
    if (httpd_get_client_list(s_server, &clients, client_fds) != ESP_OK || clients == 0) {
        return ESP_OK;
    }

    /* Check if at least one socket is a WebSocket client */
    bool has_ws = false;
    for (size_t i = 0; i < clients; ++i) {
        if (httpd_ws_get_fd_info(s_server, client_fds[i]) == HTTPD_WS_CLIENT_WEBSOCKET) {
            has_ws = true;
            break;
        }
    }
    if (!has_ws) return ESP_OK;

    char *json_str = build_telemetry_json(sweep);
    if (!json_str) return ESP_ERR_NO_MEM;

    httpd_ws_frame_t ws_frame = {
        .final = true,
        .fragmented = false,
        .type = HTTPD_WS_TYPE_TEXT,
        .payload = (uint8_t*)json_str,
        .len = strlen(json_str)
    };

    for (size_t i = 0; i < clients; ++i) {
        int sock = client_fds[i];
        if (httpd_ws_get_fd_info(s_server, sock) == HTTPD_WS_CLIENT_WEBSOCKET) {
            esp_err_t ret = httpd_ws_send_frame_async(s_server, sock, &ws_frame);
            if (ret != ESP_OK) {
                httpd_sess_trigger_close(s_server, sock);
            }
        }
    }

    free(json_str);
    return ESP_OK;
}

esp_err_t ws_server_broadcast_heartbeat(void) {
    if (!s_server) return ESP_OK;

    size_t max_fds = WS_MAX_CLIENTS + 3;
    size_t clients = max_fds;
    int client_fds[max_fds];
    if (httpd_get_client_list(s_server, &clients, client_fds) != ESP_OK || clients == 0) {
        return ESP_OK;
    }

    bool has_ws = false;
    for (size_t i = 0; i < clients; ++i) {
        if (httpd_ws_get_fd_info(s_server, client_fds[i]) == HTTPD_WS_CLIENT_WEBSOCKET) {
            has_ws = true;
            break;
        }
    }
    if (!has_ws) return ESP_OK;

    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "type", "heartbeat");
    cJSON_AddNumberToObject(root, "uptime_s", (uint32_t)(esp_timer_get_time() / 1000000));
    cJSON_AddNumberToObject(root, "free_heap_bytes", esp_get_free_heap_size());
    cJSON_AddNumberToObject(root, "min_free_heap_bytes", esp_get_minimum_free_heap_size());
    cJSON_AddNumberToObject(root, "wifi_rssi_dbm", -40);
    cJSON_AddNumberToObject(root, "clients_connected", ws_server_get_client_count());
    cJSON_AddStringToObject(root, "firmware_version", FIRMWARE_VERSION);
    cJSON_AddStringToObject(root, "system_status", "normal");

    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (!json_str) return ESP_ERR_NO_MEM;

    httpd_ws_frame_t ws_frame = {
        .final = true,
        .fragmented = false,
        .type = HTTPD_WS_TYPE_TEXT,
        .payload = (uint8_t*)json_str,
        .len = strlen(json_str)
    };

    for (size_t i = 0; i < clients; ++i) {
        int sock = client_fds[i];
        if (httpd_ws_get_fd_info(s_server, sock) == HTTPD_WS_CLIENT_WEBSOCKET) {
            esp_err_t ret = httpd_ws_send_frame_async(s_server, sock, &ws_frame);
            if (ret != ESP_OK) {
                httpd_sess_trigger_close(s_server, sock);
            }
        }
    }

    free(json_str);
    return ESP_OK;
}
