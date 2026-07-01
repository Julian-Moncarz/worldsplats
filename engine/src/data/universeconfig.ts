export const CONFIG = {
  // Physics
  GRAVITY: { x: 0, y: -9.81, z: 0 },
  ENVIRONMENT_RESTITUTION: 0.0,

  // Player
  PLAYER: {
    RADIUS: 0.33,
    HALF_HEIGHT: 0.55,
    START: [0, 1.4, 0] as [number, number, number],
    FRICTION: 0.9,
    RESTI: 0.0,
    // Low, so gravity actually accelerates a fall (real quadratic drop) instead
    // of capping it at a floaty ~2.5 m/s terminal velocity. Horizontal velocity
    // is set explicitly every frame in PlayerController, so it doesn't rely on
    // damping to stop — walking stays snappy.
    LINEAR_DAMPING: 0.1,
  },
}
