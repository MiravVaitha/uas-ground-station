const G = 9.81;
const DEG = Math.PI / 180;

export type ReleaseInputs = {
    groundspeed_mps: number;
    altitude_m: number;
    heading_deg: number;    // compass direction the plane is flying
    wind_speed_mps: number;
    wind_from_deg: number;  // compass direction the wind blows FROM
};

export type ReleaseSolution = {
    offset_north_m: number; // release point relative to the target
    offset_east_m: number;
    fall_time_s: number;
    forward_carry_m: number;
    wind_drift_m: number;
};

export function solveRelease(inputs: ReleaseInputs): ReleaseSolution {
    const {
        groundspeed_mps, altitude_m, heading_deg, wind_speed_mps, wind_from_deg,
    } = inputs;

    // 1. fall_time_s      — how long the payload is in the air
    const fall_time_s = Math.sqrt(2 * altitude_m / G);
    // 2. forward_carry_m  — how far it travels along the heading
    const forward_carry_m = groundspeed_mps * fall_time_s;
    // 3. wind_drift_m     — how far the wind pushes it
    const wind_drift_m = wind_speed_mps * fall_time_s;
    // 4. push_deg         — the bearing the wind pushes it TOWARD
    const push_deg = wind_from_deg + 180;
    // 5. north/east components of the carry vector, and of the drift vector
    const carry_north_m = forward_carry_m * Math.cos(heading_deg * DEG);
    const carry_east_m = forward_carry_m * Math.sin(heading_deg * DEG);
    const drift_north_m = wind_drift_m * Math.cos(push_deg * DEG);
    const drift_east_m = wind_drift_m * Math.sin(push_deg * DEG);
    // 6. offset_north_m / offset_east_m
    const offset_north_m = (carry_north_m + drift_north_m) * -1;
    const offset_east_m = (carry_east_m + drift_east_m) * -1;

    return {
        fall_time_s,
        forward_carry_m,
        wind_drift_m,
        offset_north_m,
        offset_east_m,
    };
}