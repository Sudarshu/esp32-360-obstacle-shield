#ifndef VEHICLE_SHIELD_SIM_SENSOR_H
#define VEHICLE_SHIELD_SIM_SENSOR_H

#include "config.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Initialize synthetic simulation generator */
void sim_sensor_init(void);

/* Enable or disable synthetic simulation mode at runtime */
void sim_sensor_set_enabled(bool enabled);

/* Check if simulation mode is active */
bool sim_sensor_is_enabled(void);

/* Generate one simulated sweep */
void sim_sensor_generate_sweep(telemetry_sweep_t *sweep);

#ifdef __cplusplus
}
#endif

#endif /* VEHICLE_SHIELD_SIM_SENSOR_H */
