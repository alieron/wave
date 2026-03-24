export interface WaveSource {
  id: string;
  label: string;
  x: number;
  z: number;
  frequency: number;
  amplitude: number;
  enabled: boolean;
  color: string;
}

export type SourcePreset = {
  label: string;
  frequency: number;
  amplitude: number;
  color: string;
};

export const DEFAULT_SOURCES: WaveSource[] = [
  {
    id: '1', label: 'Calm Swell', x: -20, z: -15,
    frequency: 0.02, amplitude: 2.5,
    enabled: true, color: '#00d4ff',
  },
  {
    id: '2', label: 'Wind Chop', x: 15, z: 12,
    frequency: 0.5, amplitude: 1.25,
    enabled: true, color: '#00ff88',
  },
  {
    id: '3', label: 'Boat Wake', x: 5, z: -5,
    frequency: 2, amplitude: 1,
    enabled: true, color: '#ff8800',
  },
];

export const FREQ_RANGE = { min: 0.01, max: 3.00, step: 0.01 };
export const AMP_RANGE = { min: 0, max: 2.5, step: 0.01 };

export const WAVE_SPEED = 5;
export const SAMPLE_RATE = 3;
export const TIME_SCALE = 1; // oopsies
export const DIST_SCALE = 0.15;
const PRECISION = 100;

export function batchComputeWaveHeights(
  pos: any,
  time: number,
  sources: WaveSource[]
) {
  const count = pos.count;
  const heights = new Float32Array(count); // reuse outside if possible

  for (let si = 0; si < sources.length; si++) {
    const s = sources[si];
    if (!s.enabled) continue;

    // precompute per-source constants
    const sx = s.x;
    const sz = s.z;
    const amp = s.amplitude * DIST_SCALE;
    const omega = 2 * Math.PI * s.frequency;
    const k = (omega * DIST_SCALE);

    for (let i = 0; i < count; i++) {
      const wx = pos.getX(i);
      const wz = -pos.getY(i);

      const dx = wx - sx;
      const dz = wz - sz;

      const distSq = dx * dx + dz * dz;
      const dist = Math.sqrt(distSq);

      // const falloff = 1 / Math.sqrt(distSq * 0.05 + 1);

      heights[i] += amp *
        Math.sin(omega * time - k * dist);
    }
  }

  // write back once
  for (let i = 0; i < count; i++) {
    pos.setZ(i, heights[i]);
  }

  pos.needsUpdate = true;
}

/**
 * Compute composite wave height at position (px, pz) at the given time
 */
export function computeWaveHeight(
  px: number, pz: number, time: number, sources: WaveSource[]
): number {
  let h = 0;
  for (const s of sources) {
    if (!s.enabled) continue;

    const dx = px - s.x;
    const dz = pz - s.z;

    const dist = Math.sqrt(dx * dx + dz * dz);

    const omega = 2 * Math.PI * s.frequency;
    const k = (omega * DIST_SCALE);

    h += s.amplitude * DIST_SCALE *
      Math.sin(omega * time - k * dist);
  }

  return h;
}

/**
 * Compute individual wave height from a single source at position (px, pz)
 */
export function computeIndividualWaveHeight(
  px: number, pz: number, time: number, source: WaveSource
): number {
  if (!source.enabled) return 0;
  const dx = px - source.x, dz = pz - source.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const omega = 2 * Math.PI * source.frequency;
  const k = (omega * DIST_SCALE);
  // const falloff = 1 / Math.sqrt(dist * 0.05 + 1);
  return source.amplitude * DIST_SCALE * Math.sin(omega * time - k * dist);
}

/**
 * Compute the fundamental period of combined wave sources using GCD of frequencies.
 */
export function computeFundamentalPeriod(sources: WaveSource[]): number {
  const enabled = sources.filter(s => s.enabled);
  if (enabled.length === 0) return 1;

  const freqValues = enabled.map(s => Math.round(s.frequency * PRECISION));

  function gcd(a: number, b: number): number {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a;
  }

  let g = freqValues[0];
  for (let i = 1; i < freqValues.length; i++) {
    g = gcd(g, freqValues[i]);
  }

  return PRECISION / (g);
}

/**
 * Compute fundamental frequency of combined wave sources
 */
export function computeFundamentalFrequency(sources: WaveSource[]): number {
  const period = computeFundamentalPeriod(sources);
  return 1 / period;
}

let _nextId = 4;

export function createSourceFromPreset(preset: SourcePreset): WaveSource {
  const id = String(_nextId++);
  return {
    id,
    label: preset.label,
    x: Math.round(Math.random() * 40 - 20),
    z: Math.round(Math.random() * 40 - 20),
    frequency: preset.frequency,
    amplitude: preset.amplitude || Math.floor(1 + Math.random() * 2),
    enabled: true,
    color: preset.color,
  };
}

export function createSource(): WaveSource {
  const id = String(_nextId++);
  return {
    id,
    label: `Wave ${id}`,
    x: Math.round(Math.random() * 40 - 20),
    z: Math.round(Math.random() * 40 - 20),
    frequency: 1,
    amplitude: 3,
    enabled: true,
    color: `hsl(${Math.floor(Math.random() * 160 + 140)}, 75%, 55%)`,
  };
}


