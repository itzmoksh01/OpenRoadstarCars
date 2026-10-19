export type VehicleMode = 'performance' | 'thrust' | 'rocket'

export const DEFAULT_CONFIG = {
  run: {
    seconds: 180,
    lives: 3,
    invulnerable: 1.6,
    killY: -12,
  },
  score: {
    core: 250,
    comboWindow: 4.2,
    comboMax: 6,
    timeBonus: 30,
    lifeBonus: 600,
  },
  player: {
    radius: 0.82,
    halfHeight: 0.48,
    walkSpeed: 7,
    sprintSpeed: 11,
    acceleration: 60,
    gravity: -26,
    lowJumpGravity: -52,
    jumpSpeed: 10.5,
    maxFall: -34,
    airControl: 0.45,
    jumpBuffer: 0.14,
    dashSpeed: 22,
    dashTime: 0.16,
    dashCooldown: 0.9,
    turnSpeed: 14,
  },
  vehicle: {
    performance: { topSpeed: 16, grip: 10, steering: 8, airControl: 0.35, boostSpeed: 28, boostDuration: 0.5, boostCooldown: 2.4, thrusterLift: 0 },
    thrust: { topSpeed: 19, grip: 8, steering: 8.5, airControl: 0.48, boostSpeed: 38, boostDuration: 0.55, boostCooldown: 1.5, thrusterLift: 5 },
    rocket: { topSpeed: 14, grip: 6, steering: 6.5, airControl: 0.9, boostSpeed: 30, boostDuration: 0.8, boostCooldown: 1.1, thrusterLift: 16 },
  },
  camera: {
    distance: 10,
    height: 3.4,
    minPitch: -0.3,
    maxPitch: 1.0,
    follow: 8,
    fov: 64,
  },
  drones: { speed: 3.2, radius: 0.7, rageSpeed: 5, rageAt: 45 },
} as const

type MutableConfig<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? MutableConfig<T[K]> : T[K] }
export const CONFIG: MutableConfig<typeof DEFAULT_CONFIG> = structuredClone(DEFAULT_CONFIG)
