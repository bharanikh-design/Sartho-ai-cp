import { describe, expect, it } from "vitest";
import {
  RIBBON_STRIDE,
  createRng,
  generateParticles,
  packParticles,
  ribbonSpine,
} from "./ribbon-field";

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toEqual(b());
  });

  it("does not collapse to a constant stream on a zero seed", () => {
    const rng = createRng(0);
    const values = new Set([rng(), rng(), rng(), rng(), rng()]);
    expect(values.size).toBeGreaterThan(1);
  });

  it("stays within [0, 1)", () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("generateParticles", () => {
  it("returns exactly the requested count", () => {
    expect(generateParticles(2500, 7)).toHaveLength(2500);
  });

  it("floors fractional counts and never returns negative-length fields", () => {
    expect(generateParticles(10.9, 1)).toHaveLength(10);
    expect(generateParticles(-5, 1)).toHaveLength(0);
  });

  it("is fully deterministic for a given seed", () => {
    expect(generateParticles(500, 42)).toEqual(generateParticles(500, 42));
  });

  it("differs between seeds", () => {
    const a = generateParticles(200, 1);
    const b = generateParticles(200, 2);
    expect(a).not.toEqual(b);
  });

  it("keeps every attribute inside its documented range", () => {
    const TAU = Math.PI * 2;
    for (const p of generateParticles(3000, 5)) {
      expect(p.t).toBeGreaterThanOrEqual(0);
      expect(p.t).toBeLessThanOrEqual(1);
      expect(p.across).toBeGreaterThanOrEqual(-1);
      expect(p.across).toBeLessThanOrEqual(1);
      expect(p.depth).toBeGreaterThanOrEqual(0);
      expect(p.depth).toBeLessThanOrEqual(1);
      expect(p.phase).toBeGreaterThanOrEqual(0);
      expect(p.phase).toBeLessThanOrEqual(TAU);
      expect(p.speed).toBeGreaterThanOrEqual(0.6);
      expect(p.speed).toBeLessThanOrEqual(1.4);
      expect(p.twinkle).toBeGreaterThanOrEqual(0);
      expect(p.twinkle).toBeLessThanOrEqual(1);
    }
  });

  it("spreads t evenly down the spine rather than clumping", () => {
    // Stratification should put roughly a quarter of the field in each quarter
    // of the spine. Pure Math.random() would not hold this tightly.
    const particles = generateParticles(4000, 11);
    const buckets = [0, 0, 0, 0];
    for (const p of particles) {
      buckets[Math.min(3, Math.floor(p.t * 4))] += 1;
    }
    for (const bucket of buckets) {
      expect(bucket).toBeGreaterThan(4000 * 0.2);
      expect(bucket).toBeLessThan(4000 * 0.3);
    }
  });
});

describe("packParticles", () => {
  it("packs stride-6 floats in field order", () => {
    const particles = generateParticles(4, 3);
    const packed = packParticles(particles);
    expect(packed).toBeInstanceOf(Float32Array);
    expect(packed).toHaveLength(4 * RIBBON_STRIDE);
    // Float32 rounds, so compare through a round-trip rather than for equality.
    expect(packed[0]).toBeCloseTo(particles[0].t, 5);
    expect(packed[1]).toBeCloseTo(particles[0].across, 5);
    expect(packed[RIBBON_STRIDE]).toBeCloseTo(particles[1].t, 5);
    expect(packed[RIBBON_STRIDE + 5]).toBeCloseTo(particles[1].twinkle, 5);
  });

  it("returns an empty buffer for an empty field", () => {
    expect(packParticles([])).toHaveLength(0);
  });
});

describe("ribbonSpine", () => {
  it("returns y equal to the clamped input t", () => {
    expect(ribbonSpine(0.5).y).toBe(0.5);
    expect(ribbonSpine(-1).y).toBe(0);
    expect(ribbonSpine(2).y).toBe(1);
  });

  it("keeps x on the left of the stage across the whole spine and over time", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      for (let time = 0; time < 40; time += 2.5) {
        const { x } = ribbonSpine(t, time);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(0.45);
      }
    }
  });

  it("moves over time (the ribbon is not static)", () => {
    expect(ribbonSpine(0.5, 0).x).not.toBeCloseTo(ribbonSpine(0.5, 3).x, 6);
  });
});
