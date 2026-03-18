import { useMemo, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine,
} from 'recharts';
import { fft as computeFFT, ifft, magnitude, applyBandpass } from '@/lib/fft';
import { type WaveSource, SAMPLE_RATE, computeIndividualWaveHeight, computeWaveHeight } from '@/lib/waveTypes';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  sources: WaveSource[];
  buoyX: number;
  buoyZ: number;
  sampleRate: number;
  onSampleRateChange: (rate: number) => void;
}

const GRID_STROKE = 'hsl(215, 15%, 18%)';
const TICK_STYLE = { fontSize: 10, fill: 'hsl(200, 10%, 50%)' };
const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'hsl(215, 25%, 11%)',
    border: '1px solid hsl(215, 15%, 18%)',
    fontSize: 11,
    borderRadius: 8,
    color: 'hsl(200, 20%, 90%)',
  },
};

const STEP_LABELS = [
  '① Individual Waves → Superposition',
  '② Sampling → DFT (FFT)',
  '③ Filtering → IDFT Reconstruction',
];

// Fixed analytical window: next power-of-2 at or above 4 s of samples.
// This gives the FFT a stable, deterministic signal regardless of simulation time.
const ANALYSIS_N = (() => {
  let n = 1;
  const target = SAMPLE_RATE * 4;
  while (n < target) n *= 2;
  return n;
})();

// Visible slice in time-domain plots (keeps charts snappy)
const DISPLAY_N = Math.min(256, ANALYSIS_N);

export default function AnalysisPanel({ sources, buoyX, buoyZ, sampleRate, onSampleRateChange }: Props) {
  const [step, setStep] = useState(0);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterRange, setFilterRange] = useState<[number, number]>([0, 0.4]);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  const analysis = useMemo(() => {
    const enabledSources = sources.filter(s => s.enabled);
    if (enabledSources.length === 0) return null;

    // ── Synthesise analytical buffer at full SAMPLE_RATE ─────────────────────
    // t = 0 … ANALYSIS_N/SAMPLE_RATE. Because the wave functions are stationary
    // sinusoids this window captures all frequency content without needing a
    // live-updated ring buffer.
    const raw = new Float32Array(ANALYSIS_N);
    for (let i = 0; i < ANALYSIS_N; i++) {
      raw[i] = computeWaveHeight(buoyX, buoyZ, i / SAMPLE_RATE, enabledSources);
    }

    // ── Step 1: individual waves + superposition ──────────────────────────────
    const step1Data: Record<string, number>[] = [];
    for (let i = 0; i < DISPLAY_N; i++) {
      const t = i / SAMPLE_RATE;
      const entry: Record<string, number> = { time: +t.toFixed(3) };
      let sum = 0;
      enabledSources.forEach((s, si) => {
        const h = computeIndividualWaveHeight(buoyX, buoyZ, t, s);
        entry[`src_${si}`] = +h.toFixed(4);
        sum += h;
      });
      entry.sum = +sum.toFixed(4);
      step1Data.push(entry);
    }

    // ── Step 2: sampled signal + FFT ─────────────────────────────────────────
    const downsampleFactor = Math.max(1, Math.round(SAMPLE_RATE / sampleRate));
    const sampledIndices: number[] = [];
    for (let i = 0; i < ANALYSIS_N; i += downsampleFactor) sampledIndices.push(i);

    const startIdx = ANALYSIS_N - DISPLAY_N;
    const sampledSet = new Set(sampledIndices);
    const timeData: Record<string, number | undefined>[] = [];
    for (let i = 0; i < DISPLAY_N; i++) {
      const idx = startIdx + i;
      const entry: Record<string, number | undefined> = {
        time: +(i / SAMPLE_RATE).toFixed(3),
        raw: +raw[idx].toFixed(3),
      };
      if (sampledSet.has(idx)) entry.sampled = +raw[idx].toFixed(3);
      timeData.push(entry);
    }

    // FFT on the downsampled signal (zero-padded to next power of 2)
    const sampledValues = sampledIndices.map(i => raw[i]);
    let fftSize = 1;
    while (fftSize < sampledValues.length) fftSize *= 2;
    const re = new Array(fftSize).fill(0);
    const im = new Array(fftSize).fill(0);
    // Hann window
    for (let i = 0; i < sampledValues.length; i++) {
      re[i] = sampledValues[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / sampledValues.length));
    }
    computeFFT(re, im);

    const mags = magnitude(re, im);
    const effectiveSR = SAMPLE_RATE / downsampleFactor;
    const freqBinSize = effectiveSR / fftSize;
    const maxFreqDisplay = Math.min(effectiveSR / 2, 4);
    const maxBin = Math.ceil(maxFreqDisplay / freqBinSize);
    const freqData: { frequency: number; magnitude: number; bin: number }[] = [];
    for (let k = 0; k <= Math.min(maxBin, fftSize / 2); k++) {
      freqData.push({
        bin: k,
        frequency: +(k * freqBinSize).toFixed(3),
        magnitude: +(mags[k] * 2 / fftSize).toFixed(4),
      });
    }

    // Peaks
    const peaks: { frequency: number; magnitude: number }[] = [];
    for (let i = 2; i < freqData.length - 2; i++) {
      if (
        freqData[i].magnitude > 0.01 &&
        freqData[i].magnitude > freqData[i - 1].magnitude &&
        freqData[i].magnitude > freqData[i + 1].magnitude &&
        freqData[i].magnitude > freqData[i - 2].magnitude &&
        freqData[i].magnitude > freqData[i + 2].magnitude
      ) {
        peaks.push(freqData[i]);
      }
    }

    // ── Step 3: bandpass filter + IDFT ───────────────────────────────────────
    let filteredTimeData: Record<string, number>[] | null = null;
    if (filterEnabled) {
      const fRe = Array.from(raw);
      const fIm = new Array(ANALYSIS_N).fill(0);
      for (let i = 0; i < ANALYSIS_N; i++) {
        fRe[i] *= (0.5 - 0.5 * Math.cos(2 * Math.PI * i / ANALYSIS_N));
      }
      computeFFT(fRe, fIm);
      applyBandpass(fRe, fIm, SAMPLE_RATE, filterRange[0], filterRange[1]);
      ifft(fRe, fIm);

      filteredTimeData = [];
      for (let i = 0; i < DISPLAY_N; i++) {
        filteredTimeData.push({
          time: +(i / SAMPLE_RATE).toFixed(3),
          raw: +raw[startIdx + i].toFixed(3),
          filtered: +fRe[startIdx + i].toFixed(3),
        });
      }
    }

    return { step1Data, timeData, freqData, peaks, filteredTimeData, enabledSources, freqBinSize, effectiveSR, fftSize };
  }, [sources, buoyX, buoyZ, filterEnabled, filterRange, sampleRate]);

  // Frequency chart drag handlers for filter range
  const handleFreqMouseDown = useCallback((e: any) => {
    if (e && e.activeLabel != null) {
      setDragStart(parseFloat(e.activeLabel));
      setDragEnd(null);
    }
  }, []);
  const handleFreqMouseMove = useCallback((e: any) => {
    if (dragStart !== null && e && e.activeLabel != null) {
      setDragEnd(parseFloat(e.activeLabel));
    }
  }, [dragStart]);
  const handleFreqMouseUp = useCallback(() => {
    if (dragStart !== null && dragEnd !== null) {
      const lo = Math.min(dragStart, dragEnd);
      const hi = Math.max(dragStart, dragEnd);
      if (hi - lo > 0.01) {
        setFilterRange([lo, hi]);
        setFilterEnabled(true);
      }
    }
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd]);

  if (!analysis) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-center">
          <p>Enable at least one wave source to see analysis.</p>
        </div>
      </div>
    );
  }

  const { step1Data, timeData, freqData, peaks, filteredTimeData, enabledSources, freqBinSize, effectiveSR, fftSize } = analysis;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Step navigation */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-card/50 shrink-0">
        <Button
          size="sm" variant="ghost" className="h-6 text-xs"
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="w-3 h-3 mr-1" /> Prev
        </Button>
        <div className="flex items-center gap-3">
          {STEP_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors ${i === step
                  ? 'bg-primary/20 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          size="sm" variant="ghost" className="h-6 text-xs"
          onClick={() => setStep(s => Math.min(2, s + 1))}
          disabled={step === 2}
        >
          Next <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {/* Graphs area */}
      <div className="flex-1 flex gap-2 p-3 min-h-0 overflow-hidden">
        {step === 0 && <Step1Graphs data={step1Data} sources={enabledSources} />}
        {step === 1 && (
          <Step2Graphs
            timeData={timeData}
            freqData={freqData}
            peaks={peaks}
            sampleRate={sampleRate}
            onSampleRateChange={onSampleRateChange}
            freqBinSize={freqBinSize}
            effectiveSR={effectiveSR}
            fftSize={fftSize}
          />
        )}
        {step === 2 && (
          <Step3Graphs
            filteredTimeData={filteredTimeData}
            freqData={freqData}
            filterEnabled={filterEnabled}
            setFilterEnabled={setFilterEnabled}
            filterRange={filterRange}
            dragStart={dragStart}
            dragEnd={dragEnd}
            onFreqMouseDown={handleFreqMouseDown}
            onFreqMouseMove={handleFreqMouseMove}
            onFreqMouseUp={handleFreqMouseUp}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Step 1: Individual waves + Superposition ─── */
function Step1Graphs({ data, sources }: {
  data: Record<string, number>[];
  sources: WaveSource[];
}) {
  return (
    <>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <h3 className="text-xs font-semibold text-foreground mb-1">
          Individual Wave Functions at Buoy Position
        </h3>
        <p className="text-[10px] text-muted-foreground mb-1">
          Each source: A · sin(2πft − kr) / √(r·0.05+1)
        </p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="time" tick={TICK_STYLE}
                label={{ value: 'Time (s)', position: 'bottom', offset: 5, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis tick={TICK_STYLE} label={{ value: 'Height (m)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }} />
              <Tooltip {...TOOLTIP_STYLE} />
              {sources.map((s, i) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={`src_${i}`}
                  stroke={s.color}
                  dot={false}
                  strokeWidth={1.5}
                  name={s.label}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <h3 className="text-xs font-semibold text-foreground mb-1">
          Superposition → Buoy Height h(t) = Σ waves
        </h3>
        <p className="text-[10px] text-muted-foreground mb-1">
          The buoy measures the sum of all wave contributions
        </p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="time" tick={TICK_STYLE}
                label={{ value: 'Time (s)', position: 'bottom', offset: 5, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis tick={TICK_STYLE} label={{ value: 'Height (m)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="sum" stroke="hsl(185, 70%, 45%)" dot={false} strokeWidth={2} name="h(t) = Σ" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

/* ─── Step 2: Sampled signal + FFT ─── */
function Step2Graphs({ timeData, freqData, peaks, sampleRate, onSampleRateChange, freqBinSize, effectiveSR, fftSize }: {
  timeData: Record<string, number | undefined>[];
  freqData: { frequency: number; magnitude: number; bin: number }[];
  peaks: { frequency: number; magnitude: number }[];
  sampleRate: number;
  onSampleRateChange: (r: number) => void;
  freqBinSize: number;
  effectiveSR: number;
  fftSize: number;
}) {
  return (
    <>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <h3 className="text-xs font-semibold text-foreground mb-1">
          Sampling the Continuous Signal
        </h3>
        <div className="flex items-center gap-2 mb-1">
          <Label className="text-[10px] text-muted-foreground whitespace-nowrap">
            Sample rate: {sampleRate} Hz (Nyquist: {(sampleRate / 2).toFixed(1)} Hz)
          </Label>
          <Slider
            value={[sampleRate]}
            onValueChange={([v]) => onSampleRateChange(v)}
            min={2} max={30} step={1}
            className="w-32"
          />
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeData} margin={{ top: 5, right: 10, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="time" tick={TICK_STYLE}
                label={{ value: 'Time (s)', position: 'bottom', offset: 5, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis tick={TICK_STYLE} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="raw" stroke="hsl(185, 70%, 45%)" dot={false} strokeWidth={1} strokeOpacity={0.3} name="Continuous" isAnimationActive={false} />
              <Line
                type="monotone" dataKey="sampled"
                stroke="hsl(30, 85%, 55%)"
                dot={{ r: 3, fill: 'hsl(30, 85%, 55%)', stroke: 'hsl(30, 85%, 70%)', strokeWidth: 1 }}
                strokeWidth={0}
                name="Samples"
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <h3 className="text-xs font-semibold text-foreground mb-1">
          DFT of Sampled Signal — |X[k]|
        </h3>
        <p className="text-[10px] text-muted-foreground mb-1">
          N={fftSize} · fs={effectiveSR.toFixed(1)} Hz · <strong>Δf = fs/N = {freqBinSize.toFixed(3)} Hz</strong>
        </p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={freqData} margin={{ top: 5, right: 10, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="frequency" tick={TICK_STYLE}
                label={{ value: 'Frequency (Hz)', position: 'bottom', offset: 5, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis tick={TICK_STYLE} label={{ value: '|X[k]|', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Line
                type="stepAfter" dataKey="magnitude"
                stroke="hsl(30, 85%, 55%)" strokeWidth={1}
                dot={{ r: 2.5, fill: 'hsl(30, 85%, 55%)', stroke: 'hsl(30, 85%, 70%)', strokeWidth: 1 }}
                name="|X[k]|" isAnimationActive={false}
              />
              {peaks.map((peak, i) => (
                <ReferenceLine
                  key={i} x={peak.frequency}
                  stroke="hsl(200, 20%, 40%)" strokeDasharray="3 3"
                  label={{
                    value: `${peak.frequency.toFixed(2)} Hz`,
                    position: 'top', fontSize: 9, fill: 'hsl(200, 20%, 90%)',
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

/* ─── Step 3: Filtering + IDFT ─── */
function Step3Graphs({ filteredTimeData, freqData, filterEnabled, setFilterEnabled, filterRange, dragStart, dragEnd, onFreqMouseDown, onFreqMouseMove, onFreqMouseUp }: {
  filteredTimeData: Record<string, number>[] | null;
  freqData: { frequency: number; magnitude: number; bin: number }[];
  filterEnabled: boolean;
  setFilterEnabled: (v: boolean) => void;
  filterRange: [number, number];
  dragStart: number | null;
  dragEnd: number | null;
  onFreqMouseDown: (e: any) => void;
  onFreqMouseMove: (e: any) => void;
  onFreqMouseUp: () => void;
}) {
  return (
    <>
      {/* Frequency domain with filter selection */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-xs font-semibold text-foreground">
            Select Passband Range
          </h3>
          <div className="flex items-center gap-1.5 ml-auto">
            <Switch checked={filterEnabled} onCheckedChange={setFilterEnabled} className="scale-75" />
            <Label className="text-[10px]">{filterEnabled ? `${filterRange[0].toFixed(2)}–${filterRange[1].toFixed(2)} Hz` : 'Off'}</Label>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mb-1">
          Click & drag on the frequency plot to select which bins to keep
        </p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={freqData}
              margin={{ top: 5, right: 10, bottom: 20, left: 10 }}
              onMouseDown={onFreqMouseDown}
              onMouseMove={onFreqMouseMove}
              onMouseUp={onFreqMouseUp}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis dataKey="frequency" tick={TICK_STYLE}
                label={{ value: 'Frequency (Hz)', position: 'bottom', offset: 5, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis tick={TICK_STYLE} label={{ value: '|X[k]|', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }} />
              <Tooltip {...TOOLTIP_STYLE} />

              {filterEnabled && (
                <>
                  <ReferenceArea x1={0} x2={filterRange[0]} fill="hsl(0, 70%, 50%)" fillOpacity={0.15}
                    label={{ value: 'Zeroed', fontSize: 9, fill: 'hsl(0,60%,60%)' }} />
                  <ReferenceArea x1={filterRange[1]} x2={4} fill="hsl(0, 70%, 50%)" fillOpacity={0.15}
                    label={{ value: 'Zeroed', fontSize: 9, fill: 'hsl(0,60%,60%)' }} />
                  <ReferenceArea x1={filterRange[0]} x2={filterRange[1]} fill="hsl(145, 65%, 50%)" fillOpacity={0.08}
                    label={{ value: 'Passband', fontSize: 9, fill: 'hsl(145,60%,60%)' }} />
                </>
              )}

              {dragStart !== null && dragEnd !== null && (
                <ReferenceArea
                  x1={Math.min(dragStart, dragEnd)}
                  x2={Math.max(dragStart, dragEnd)}
                  fill="hsl(185, 70%, 45%)" fillOpacity={0.2}
                />
              )}

              <Line
                type="stepAfter" dataKey="magnitude"
                stroke="hsl(30, 85%, 55%)" strokeWidth={1}
                dot={{ r: 2.5, fill: 'hsl(30, 85%, 55%)', stroke: 'hsl(30, 85%, 70%)', strokeWidth: 1 }}
                name="|X[k]|" isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filtered / reconstructed signal */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <h3 className="text-xs font-semibold text-foreground mb-1">
          {filterEnabled ? 'IDFT Reconstruction — Filtered Signal' : 'Enable filter to see IDFT reconstruction'}
        </h3>
        {filterEnabled && filteredTimeData ? (
          <>
            <p className="text-[10px] text-muted-foreground mb-1">
              X[k] outside passband → 0, then IDFT → cleaned time-domain signal
            </p>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredTimeData} margin={{ top: 5, right: 10, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="time" tick={TICK_STYLE}
                    label={{ value: 'Time (s)', position: 'bottom', offset: 5, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
                  />
                  <YAxis tick={TICK_STYLE} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="raw" stroke="hsl(185, 70%, 45%)" dot={false} strokeWidth={1} strokeOpacity={0.3} name="Original" isAnimationActive={false} />
                  <Line type="monotone" dataKey="filtered" stroke="hsl(145, 65%, 50%)" dot={false} strokeWidth={2} name="Filtered (IDFT)" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs border border-dashed border-border rounded-lg">
            <div className="text-center space-y-1">
              <p>Drag a range on the frequency plot to set the bandpass filter</p>
              <p className="text-[10px]">Bins outside range → 0, then IDFT reconstructs cleaned signal</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
