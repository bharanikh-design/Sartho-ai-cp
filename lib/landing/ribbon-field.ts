/*
 * The particle ribbon, as data.
 *
 * The ribbon on the front door is thousands of points drawn by a GPU shader,
 * but the *arrangement* of those points — where each one sits on the ribbon,
 * how deep it is, when it shimmers — is ordinary arithmetic, and arithmetic can
 * be tested. The shader animates these attributes every frame; this module owns
 * the one-time distribution the shader reads, so the thing that decides what the
 * ribbon looks like is not locked inside a string of GLSL no test can reach.
 *
 * Everything here is deterministic given a seed. The same seed always produces
 * the same ribbon, which is what lets the reduced-motion still frame and the
 * animated frame agree, and what lets a test assert the field is well-formed
 * rather than eyeballing a canvas.
 */

/** Attributes computed once per particle and handed to the GPU unchanged. */
export type RibbonParticle = {
  /** Position along the ribbon spine, 0 (top) to 1 (bottom). */
  t: number;
  /** Offset across the ribbon's width, -1 (left edge) to 1 (right edge). */
  across: number;
  /** Depth, 0 (far, small, faint) to 1 (near, large, bright). Drives parallax. */
  depth: number;
  /** Animation phase, 0 to 2π, so particles breathe and flow out of step. */
  phase: number;
  /** Per-particle flow speed multiplier. */
  speed: number;
  /** Shimmer seed, 0 to 1, for the alpha twinkle. */
  twinkle: number;
};

/** Floats per particle in the packed buffer: t, across, depth, phase, speed, twinkle. */
export const RIBBON_STRIDE = 6;

const TAU = Math.PI * 2;

/*
 * mulberry32 — a small, fast, seedable PRNG. crypto.getRandomValues is not
 * seedable and Math.random is not either, and a ribbon that reshuffles on every
 * reload cannot be tested and cannot keep its still frame and its moving frame
 * in agreement. This returns a function producing values in [0, 1).
 */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  // A zero seed collapses mulberry32 to a constant stream; nudge it off zero.
  if (state === 0) state = 0x9e3779b9;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Two uniform draws folded into one value biased toward the centre. The ribbon
 * is denser along its spine and thins toward the edges, which is what makes it
 * read as a current of particles rather than a rectangle of them. Averaging two
 * uniforms is a triangular distribution — cheap, bounded, and centre-weighted —
 * mapped from [0,1] to [-1,1].
 */
function centreBiased(rng: () => number): number {
  return (rng() + rng() - 1);
}

/**
 * Build a deterministic ribbon field.
 *
 * @param count Number of particles. Clamped to at least 0 and floored.
 * @param seed  Any integer; the same seed always yields the same field.
 */
export function generateParticles(count: number, seed: number): RibbonParticle[] {
  const total = Math.max(0, Math.floor(count));
  const rng = createRng(seed);
  const particles: RibbonParticle[] = new Array(total);

  for (let i = 0; i < total; i += 1) {
    /*
     * t is stratified: each particle gets its own slice of the spine plus a
     * jitter inside that slice. Pure random t leaves visible clumps and bald
     * patches; stratifying spreads the field evenly down the ribbon while still
     * looking unplanned. Guard total === 1 so the divisor is never zero.
     */
    const slice = total > 0 ? (i + rng()) / total : 0;
    const t = Math.min(1, Math.max(0, slice));

    particles[i] = {
      t,
      across: Math.min(1, Math.max(-1, centreBiased(rng))),
      depth: rng(),
      phase: rng() * TAU,
      // 0.6 to 1.4 — a spread wide enough to break up the flow, tight enough
      // that no particle races or stalls relative to the rest.
      speed: 0.6 + rng() * 0.8,
      twinkle: rng(),
    };
  }

  return particles;
}

/**
 * Pack a field into a flat Float32Array for a single GPU buffer upload.
 * Layout per particle is {@link RIBBON_STRIDE} floats: t, across, depth, phase,
 * speed, twinkle.
 */
export function packParticles(particles: readonly RibbonParticle[]): Float32Array {
  const buffer = new Float32Array(particles.length * RIBBON_STRIDE);
  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    const o = i * RIBBON_STRIDE;
    buffer[o] = p.t;
    buffer[o + 1] = p.across;
    buffer[o + 2] = p.depth;
    buffer[o + 3] = p.phase;
    buffer[o + 4] = p.speed;
    buffer[o + 5] = p.twinkle;
  }
  return buffer;
}

/**
 * The ribbon's spine in normalised space, 0..1 on each axis. Both the shader
 * and the still-frame fallback place particles relative to this curve, so it is
 * defined once here. `time` is seconds; pass 0 for the static frame.
 *
 * The curve is a slow double sine down the left of the stage — a hanging length
 * of silk, not a diagonal — with a gentle horizontal drift over time so the
 * whole ribbon sways as one body.
 */
export function ribbonSpine(
  t: number,
  time = 0,
  amplitude = 0.09,
): { x: number; y: number } {
  const clampedT = Math.min(1, Math.max(0, t));
  const sway = Math.sin(time * 0.18) * 0.5 + 0.5; // 0..1, ~35s period
  const x =
    0.22 +
    Math.sin(clampedT * Math.PI * 1.6 + time * 0.12) * amplitude +
    Math.sin(clampedT * Math.PI * 3.1 + time * 0.05) * amplitude * 0.35 +
    (sway - 0.5) * 0.04;
  return { x, y: clampedT };
}
