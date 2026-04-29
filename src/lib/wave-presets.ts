export type WaveParams = {
  preset: string;
  // Stock (mm)
  stockX: number;
  stockY: number;
  stockZ: number;
  // Mesh resolution
  resolution: number; // samples per axis
  baseThickness: number; // mm — solid base under wave
  amplitude: number; // mm — peak height above base
  // Generic shape params
  freqX: number;
  freqY: number;
  phase: number;
  warp: number;
  ridges: number;
  seed: number;
};

export type Preset = {
  id: string;
  name: string;
  description: string;
  heightFn: string; // identifier; resolved by generator
  defaults: Partial<WaveParams>;
};

export const PRESETS: Preset[] = [
  {
    id: "dunes",
    name: "Dunes",
    description: "Soft flowing wood-grain dunes",
    heightFn: "dunes",
    defaults: { freqX: 2.2, freqY: 1.3, phase: 0.4, warp: 0.6, ridges: 3, amplitude: 18 },
  },
  {
    id: "ripples",
    name: "Ripples",
    description: "Concentric radial ripples",
    heightFn: "ripples",
    defaults: { freqX: 6, freqY: 6, phase: 0, warp: 0.1, ridges: 8, amplitude: 12 },
  },
  {
    id: "topo",
    name: "Topographic",
    description: "Layered terrain with stepped contours",
    heightFn: "topo",
    defaults: { freqX: 1.6, freqY: 1.8, phase: 0.7, warp: 0.9, ridges: 5, amplitude: 22 },
  },
  {
    id: "weave",
    name: "Weave",
    description: "Crossing sinusoids — woven texture",
    heightFn: "weave",
    defaults: { freqX: 5, freqY: 5, phase: 0, warp: 0.2, ridges: 2, amplitude: 10 },
  },
  {
    id: "flow",
    name: "Flow Field",
    description: "Curl-noise inspired streamlines",
    heightFn: "flow",
    defaults: { freqX: 2.4, freqY: 2.4, phase: 1.1, warp: 1.2, ridges: 4, amplitude: 16 },
  },
  {
    id: "spiral",
    name: "Spiral",
    description: "Logarithmic spiral ridges",
    heightFn: "spiral",
    defaults: { freqX: 4, freqY: 4, phase: 0.3, warp: 0.5, ridges: 6, amplitude: 14 },
  },
];

export const DEFAULT_PARAMS: WaveParams = {
  preset: "dunes",
  stockX: 500,
  stockY: 500,
  stockZ: 60,
  resolution: 200,
  baseThickness: 8,
  amplitude: 18,
  freqX: 2.2,
  freqY: 1.3,
  phase: 0.4,
  warp: 0.6,
  ridges: 3,
  seed: 1,
};

// Pure height function: returns 0..1 normalized height for normalized (u,v) in [-1,1]
export function heightAt(u: number, v: number, p: WaveParams): number {
  const TAU = Math.PI * 2;
  const s = p.seed * 0.137;
  const fx = p.freqX;
  const fy = p.freqY;
  const ph = p.phase * TAU;
  const w = p.warp;
  const r = Math.max(1, p.ridges);

  // warp coordinates
  const wu = u + w * 0.3 * Math.sin(v * fy + ph + s);
  const wv = v + w * 0.3 * Math.cos(u * fx - ph + s);

  let h = 0;
  switch (p.preset) {
    case "ripples": {
      const d = Math.sqrt(wu * wu + wv * wv);
      h = 0.5 + 0.5 * Math.cos(d * fx * Math.PI + ph);
      h *= Math.exp(-d * 0.6);
      break;
    }
    case "topo": {
      const a = Math.sin(wu * fx + ph) + Math.cos(wv * fy - ph * 0.5);
      const stepped = Math.round(a * r) / r;
      h = 0.5 + 0.25 * stepped + 0.15 * Math.sin(wu * wv * 2 + s);
      break;
    }
    case "weave": {
      const a = Math.sin(wu * fx * Math.PI) * Math.cos(wv * fy * Math.PI);
      h = 0.5 + 0.5 * a;
      break;
    }
    case "flow": {
      let acc = 0;
      let amp = 1;
      let frq = 1;
      for (let i = 0; i < r; i++) {
        acc += amp * Math.sin(wu * fx * frq + ph + i * 1.7 + s) *
                       Math.cos(wv * fy * frq - ph + i * 0.9);
        amp *= 0.55;
        frq *= 1.9;
      }
      h = 0.5 + 0.5 * Math.tanh(acc * 0.8);
      break;
    }
    case "spiral": {
      const ang = Math.atan2(wv, wu);
      const rad = Math.sqrt(wu * wu + wv * wv);
      h = 0.5 + 0.5 * Math.sin(rad * fx * Math.PI - ang * r + ph);
      break;
    }
    case "dunes":
    default: {
      const a =
        Math.sin(wu * fx + ph + s) * 0.6 +
        Math.sin((wu * 0.7 + wv * 1.3) * fy - ph * 0.4) * 0.4 +
        Math.sin(wv * fy * 0.6 + s * 2) * 0.3;
      const ridge = 1 - Math.abs(Math.sin(a * r * 0.6));
      h = 0.5 + 0.5 * (a * 0.5 + ridge * 0.5);
      break;
    }
  }
  // clamp
  if (h < 0) h = 0;
  if (h > 1) h = 1;
  return h;
}
