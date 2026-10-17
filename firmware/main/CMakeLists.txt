idf_component_register(
    SRCS 
        "main.c" 
        "sensor_manager.c" 
        "wifi_ap.c" 
        "ws_server.c" 
        "sim_sensor.c"
    INCLUDE_DIRS "."
    REQUIRES 
        esp_driver_gpio
        esp_http_server 
        esp_wifi 
        esp_netif 
        esp_timer 
        nvs_flash 
        esp_event
)
