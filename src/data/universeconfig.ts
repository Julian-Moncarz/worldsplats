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
    LINEAR_DAMPING: 4.0,
  },
}
