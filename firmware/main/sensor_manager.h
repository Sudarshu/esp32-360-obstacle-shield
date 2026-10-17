#ifndef VEHICLE_SHIELD_SENSOR_MANAGER_H
#define VEHICLE_SHIELD_SENSOR_MANAGER_H

#include "config.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Initialize all 8 sensor channels and GPIO pins */
esp_err_t sensor_manager_init(void);

/* Execute one full 8-sensor interleaved measurement sweep */
void sensor_manager_perform_sweep(telemetry_sweep_t *sweep);

/* Update ambient temperature for speed of sound calculation */
void sensor_manager_set_temperature(float temp_c);

/* Update proximity distance thresholds */
void sensor_manager_set_thresholds(float red_cm, float yellow_cm, float green_cm);

/* Get current temperature */
float sensor_manager_get_temperature(void);

/* Helper to convert status enum to string */
const char* sensor_status_to_str(sensor_status_t status);

/* Helper to convert proximity enum to string */
const char* sensor_proximity_to_str(proximity_level_t prox);

#ifdef __cplusplus
}
#endif

#endif /* VEHICLE_SHIELD_SENSOR_MANAGER_H */
