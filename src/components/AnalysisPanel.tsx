import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine, Scatter
} from 'recharts';
import { fft as computeFFT, ifft, magnitude, applyBandpass } from '@/lib/fft';
import { type WaveSource, AMP_RANGE, DIST_SCALE, SAMPLE_RATE, computeIndividualWaveHeight, computeWaveHeight, computeFundamentalPeriod, TIME_SCALE } from '@/lib/waveTypes';
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
  '② Time Domain → Frequency Domain (FFT)',
  '③ Frequency Filtering → iFFT Reconstruction',
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
// const DISPLAY_N = Math.min(256, ANALYSIS_N);
const DISPLAY_N = 512;

export default function AnalysisPanel({ sources, buoyX, buoyZ, sampleRate, onSampleRateChange }: Props) {
  const [step, setStep] = useState(0);
  const [filterRange, setFilterRange] = useState<[number, number]>([0, 0.4]);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  const analysis = useMemo(() => {
    const enabledSources = sources.filter(s => s.enabled);
    if (enabledSources.length === 0) return null;

    // ── Step 1: individual waves + superposition ──────────────────────────────
    const step1Data: Record<string, number>[] = [];
    const fundamentalPeriod = computeFundamentalPeriod(enabledSources);
    for (let i = 0; i < DISPLAY_N; i++) {
      // const t = (i / (DISPLAY_N));
      const t = (i / (DISPLAY_N)) * fundamentalPeriod;
      const entry: Record<string, number> = { time: +t.toFixed(3) };
      let sum = 0;
      enabledSources.forEach((s, si) => {
        const h = computeIndividualWaveHeight(buoyX, buoyZ, t, s);
        // entry[`src_${si}`] = (h / DIST_SCALE);
        entry[`src_${si}`] = +(h / DIST_SCALE).toFixed(3);
        sum += h / DIST_SCALE;
      });
      // entry.sum = sum;
      entry.sum = +sum.toFixed(3);
      step1Data.push(entry);
    }

    // console.log(
    //   step1Data[0].sum,
    //   step1Data[DISPLAY_N - 1].sum
    // );

    // ── Step 2: sampled signal + FFT ─────────────────────────────────────────
    const dtSample = 1 / sampleRate;

    const sampledIndices: number[] = [];
    let nextSampleTime = 0;

    for (let i = 0; i < DISPLAY_N; i++) {
      const t = step1Data[i]["time"];

      if (t >= nextSampleTime) {
        sampledIndices.push(i);
        nextSampleTime += dtSample;
      }
    }

    const sampledSet = new Set(sampledIndices);

    // Build time-domain data
    const timeData: Record<string, number | undefined>[] = [];

    for (let i = 0; i < DISPLAY_N; i++) {
      const entry: Record<string, number | undefined> = {
        time: step1Data[i]["time"],
        raw: step1Data[i]["sum"],
      };

      if (sampledSet.has(i)) {
        entry.sampled = step1Data[i]["sum"];
      }

      timeData.push(entry);
    }

    // FFT on the downsampled signal (zero-padded to next power of 2)
    const sampledValues = sampledIndices.map(i => step1Data[i]["sum"]);

    // Zero-pad to next power of 2
    let fftSize = 1;
    while (fftSize < sampledValues.length) fftSize *= 2;

    const re = new Array(fftSize).fill(0);
    const im = new Array(fftSize).fill(0);

    // Hann window (correct normalization)
    const N = sampledValues.length;
    for (let i = 0; i < N; i++) {
      //   const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)); // better form
      //   re[i] = sampledValues[i] * w;
      re[i] = sampledValues[i];
    }

    // FFT
    computeFFT(re, im);

    // Magnitudes
    const mags = magnitude(re, im);

    const effectiveSR = sampleRate;
    // Frequency resolution
    const freqBinSize = effectiveSR / fftSize;

    // Nyquist limit
    const maxBin = Math.floor(fftSize / 2);

    // Build spectrum
    const freqData: { frequency: number; magnitude: number; bin: number }[] = [];

    for (let k = 0; k <= maxBin; k++) {
      freqData.push({
        bin: k,
        frequency: +(k * freqBinSize).toFixed(3),
        magnitude: +((mags[k] * 2) / N).toFixed(3), // normalize by actual signal length
      });
    }

    // ── Step 3: bandpass filter + iFFT ───────────────────────────────────────
    const fRe = Array.from(re);
    const fIm = Array.from(im);
    applyBandpass(fRe, fIm, effectiveSR, filterRange[0], filterRange[1]);
    ifft(fRe, fIm);

    let filteredTimeData: Record<string, number>[] = [];
    for (let i = 0, a = 0; i < DISPLAY_N; i++) {
      const entry: Record<string, number> = {
        time: step1Data[i]['time'],
        raw: step1Data[i]['sum'],
      };

      if (sampledSet.has(i)) {
        entry.filtered = +(fRe[a]).toFixed(3);
        a++;
      }

      filteredTimeData.push(entry);
    }

    return { step1Data, timeData, freqData, filteredTimeData, enabledSources, freqBinSize, effectiveSR, fftSize };
  }, [sources, buoyX, buoyZ, filterRange, sampleRate]);

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
      }
    }
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd]);

  useEffect(() => {
    if (!analysis) return;

    const maxBin = Math.floor(analysis.fftSize / 1);
    const nyquist = maxBin * analysis.freqBinSize;

    setFilterRange([0, nyquist]);
  }, [analysis?.fftSize, analysis?.freqBinSize]);

  if (!analysis) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-center">
          <p>Enable at least one wave source to see analysis.</p>
        </div>
      </div>
    );
  }

  const { step1Data, timeData, freqData, filteredTimeData, enabledSources, freqBinSize, effectiveSR, fftSize } = analysis;

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
            sources={enabledSources}
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
            sources={enabledSources}
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

const chartMargin = { top: 5, right: 10, bottom: 15, left: 5 };

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
        {/* <p className="text-[10px] text-muted-foreground mb-1"> */}
        {/*   Each source: A · sin(2πft − kr) / √(r·0.05+1) */}
        {/* </p> */}
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={chartMargin} syncId="amp">
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <ReferenceLine y={0} />
              <XAxis
                type="number"
                domain={['dataMin', 'dataMax']}
                dataKey="time"
                tick={TICK_STYLE}
                label={{ value: 'Time (s)', position: 'bottom', offset: 0, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis

                type="number"
                // domain={[-AMP_RANGE.max, AMP_RANGE.max]}
                // ticks={Array.from(
                //   { length: Math.floor((AMP_RANGE.max * 2) / 0.5) },
                //   (_, i) => +(-AMP_RANGE.max + i * 0.5).toFixed(1)
                // )}
                tickFormatter={(v) => v.toFixed(1)}
                tick={TICK_STYLE}
                label={{ value: 'Amplitude (m)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(label: any) => `Time: ${label} s`} formatter={(value: any, name: any) => [`${value} m`, name]} />
              {sources.map((s, i) => (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={`src_${i}`}
                  stroke={s.color}
                  dot={false}
                  strokeWidth={1.5}
                  name={`${s.label} (${s.frequency}Hz)`}
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
        {/* <p className="text-[10px] text-muted-foreground mb-1"> */}
        {/*   The buoy measures the sum of all wave contributions */}
        {/* </p> */}
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={chartMargin} syncId="amp">
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
              <ReferenceLine y={0} />
              <XAxis
                type="number"
                domain={['dataMin', 'dataMax']}
                dataKey="time"
                tick={TICK_STYLE}
                label={{ value: 'Time (s)', position: 'bottom', offset: 0, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis
                type="number"
                // domain={[-AMP_RANGE.max, AMP_RANGE.max]}
                // interval={0.5}
                // ticks={Array.from(
                //   { length: Math.floor((AMP_RANGE.max * 2) / 0.5) + 1 },
                //   (_, i) => +(-AMP_RANGE.max + i * 0.5).toFixed(1)
                // )}
                tickFormatter={(v) => v.toFixed(1)}
                tick={TICK_STYLE}
                label={{ value: 'Buoy Height (m)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(label: any) => `Time: ${label} s`} formatter={(value: any, name: any) => [`${value} m`, name]} />
              <Line type="monotone" dataKey="sum" stroke="hsl(185, 70%, 45%)" dot={false} strokeWidth={2} name="Buoy Height" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

/* ─── Step 2: Sampled signal + FFT ─── */
function Step2Graphs({ timeData, freqData, sources, sampleRate, onSampleRateChange, freqBinSize, effectiveSR, fftSize }: {
  timeData: Record<string, number | undefined>[];
  freqData: { frequency: number; magnitude: number; bin: number }[];
  sources: WaveSource[];
  sampleRate: number;
  onSampleRateChange: (r: number) => void;
  freqBinSize: number;
  effectiveSR: number;
  fftSize: number;
}) {
  return (
    <>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-xs font-semibold text-foreground mb-1">
            Sampling the Continuous Signal
          </h3>
          <div className="flex items-center">
            <Label className="text-[10px] text-left px-2 text-muted-foreground whitespace-nowrap">
              Sampling rate: {sampleRate} Hz (Nyquist: {(sampleRate / 2)} Hz)
            </Label>
            <Slider
              value={[sampleRate]}
              onValueChange={([v]) => onSampleRateChange(v)}
              min={0.1} max={7} step={0.1}
              className="w-32"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeData} margin={{ top: 5, right: 10, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <ReferenceLine y={0} />
              <XAxis
                type="number"
                domain={['dataMin', 'dataMax']}
                dataKey="time"
                tick={TICK_STYLE}
                label={{ value: 'Time (s)', position: 'bottom', offset: 0, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis
                type="number"
                // domain={[-AMP_RANGE.max, AMP_RANGE.max]}
                // interval={0.5}
                // ticks={Array.from(
                //   { length: Math.floor((AMP_RANGE.max * 2) / 0.5) + 1 },
                //   (_, i) => +(-AMP_RANGE.max + i * 0.5).toFixed(1)
                // )}
                tickFormatter={(v) => v.toFixed(1)}
                tick={TICK_STYLE}
                label={{ value: 'Buoy Height (m)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(label: any) => `Time: ${label} s`} formatter={(value: any, name: any) => [`${value} m`, name]} />
              <Line type="monotone" dataKey="raw" stroke="hsl(185, 70%, 45%)" dot={false} strokeWidth={1} strokeOpacity={0.6} name="Buoy Height (Continuous)" isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="sampled"
                stroke="hsl(30, 85%, 55%)"
                dot={{ r: 3, fill: 'hsl(30, 85%, 55%)', stroke: 'hsl(30, 85%, 70%)', strokeWidth: 1 }}
                strokeWidth={0}
                name="Buoy Height (Sampled)"
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <h3 className="text-xs font-semibold text-foreground mb-1">
          FFT of Sampled Signal — |X[k]|
        </h3>
        <p className="text-[10px] text-muted-foreground mb-1">
          N={fftSize} · fs={effectiveSR.toFixed(1)} Hz · <strong>Δf = fs/N = {freqBinSize.toFixed(3)} Hz</strong>
        </p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={freqData}
              margin={{ top: 15, right: 10, bottom: 20, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                type="number"
                domain={['dataMin', 'dataMax']}
                dataKey="frequency"
                tick={TICK_STYLE}
                label={{ value: 'Frequency (Hz)', position: 'bottom', offset: 5, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis
                tick={TICK_STYLE}
                label={{ value: '|X[k]|', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(label: any) => `Frequency: ${label} Hz`} />
              <Line
                type="stepAfter"
                dataKey="magnitude"
                stroke="hsl(30, 85%, 55%)" strokeWidth={1}
                dot={{ r: 2.5, fill: 'hsl(30, 85%, 55%)', stroke: 'hsl(30, 85%, 70%)', strokeWidth: 1 }}
                name="|X[k]|" isAnimationActive={false}
              />
              {sources.map((s, i) => (
                <ReferenceLine
                  key={i}
                  x={s.frequency}
                  stroke="hsl(200, 20%, 40%)" strokeDasharray="3 3"
                  label={{
                    value: `${s.label}: ${s.frequency.toFixed(2)} Hz`,
                    position: 'top',
                    fontSize: 9,
                    fill: 'hsl(200, 20%, 90%)',
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
function Step3Graphs({ filteredTimeData, freqData, sources, filterRange, dragStart, dragEnd, onFreqMouseDown, onFreqMouseMove, onFreqMouseUp }: {
  filteredTimeData: Record<string, number>[] | null;
  freqData: { frequency: number; magnitude: number; bin: number }[];
  sources: WaveSource[];
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
            <p className="text-[10px] text-muted-foreground mb-1">
              Click & drag on the frequency plot to select which bins to keep
            </p>
            <Label className="text-[10px] w-18">{filterRange[0].toFixed(2)}–{filterRange[1].toFixed(2)} Hz</Label>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={freqData}
              margin={{ top: 15, right: 10, bottom: 20, left: 10 }}
              onMouseDown={onFreqMouseDown}
              onMouseMove={onFreqMouseMove}
              onMouseUp={onFreqMouseUp}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                type="number"
                domain={['dataMin', 'dataMax']}
                dataKey="frequency"
                tick={TICK_STYLE}
                label={{ value: 'Frequency (Hz)', position: 'bottom', offset: 5, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <YAxis
                tick={TICK_STYLE}
                label={{ value: '|X[k]|', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }}
              />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(label: any) => `Frequency: ${label} Hz`} />
              <Line
                type="stepAfter"
                dataKey="magnitude"
                stroke="hsl(30, 85%, 55%)" strokeWidth={1}
                dot={{ r: 2.5, fill: 'hsl(30, 85%, 55%)', stroke: 'hsl(30, 85%, 70%)', strokeWidth: 1 }}
                name="|X[k]|" isAnimationActive={false}
              />
              {sources.map((s, i) => (
                <ReferenceLine
                  key={i}
                  x={s.frequency}
                  stroke="hsl(200, 20%, 40%)" strokeDasharray="3 3"
                  label={{
                    value: `${s.label}: ${s.frequency.toFixed(2)} Hz`,
                    position: 'top',
                    fontSize: 9,
                    fill: 'hsl(200, 20%, 90%)',
                  }}
                />
              ))}

              {/* <ReferenceArea x1={0} x2={filterRange[0]} fill="hsl(0, 70%, 50%)" fillOpacity={0.15} */}
              {/*   label={{ value: 'Zeroed', fontSize: 9, fill: 'hsl(0,60%,60%)' }} /> */}
              {/* <ReferenceArea x1={filterRange[1]} x2={4} fill="hsl(0, 70%, 50%)" fillOpacity={0.15} */}
              {/*   label={{ value: 'Zeroed', fontSize: 9, fill: 'hsl(0,60%,60%)' }} /> */}
              <ReferenceArea x1={filterRange[0]} x2={filterRange[1]} fill="hsl(145, 65%, 50%)" fillOpacity={0.08}
                label={{ value: 'Passband', fontSize: 9, fill: 'hsl(145,60%,60%)' }} />

              {dragStart !== null && dragEnd !== null && (
                <ReferenceArea
                  x1={Math.min(dragStart, dragEnd)}
                  x2={Math.max(dragStart, dragEnd)}
                  fill="hsl(185, 70%, 45%)" fillOpacity={0.2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filtered / reconstructed signal */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <h3 className="text-xs font-semibold text-foreground mb-1">
          iFFT Reconstruction — Filtered Signal
        </h3>
        {filteredTimeData ? (
          <>
            <p className="text-[10px] text-muted-foreground mb-1">
              X[k] outside passband → 0, then IDFT → cleaned time-domain signal
            </p>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredTimeData} margin={{ top: 5, right: 10, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    dataKey="time"
                    tick={TICK_STYLE}
                    label={{ value: 'Time (s)', position: 'bottom', offset: 5, fontSize: 10, fill: 'hsl(200,10%,50%)' }}
                  />
                  <YAxis
                    type="number"
                    tickFormatter={(v) => v.toFixed(1)}
                    tick={TICK_STYLE}
                    label={{ value: 'Height (m)', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'hsl(200,10%,50%)' }}
                  />
                  <Tooltip {...TOOLTIP_STYLE} labelFormatter={(label: any) => `Time: ${label} s`} formatter={(value: any, name: any) => [`${value} m`, name]} />
                  <Line type="monotone" dataKey="raw" stroke="hsl(185, 70%, 45%)" dot={false} strokeWidth={1} strokeOpacity={0.5} name="Original" isAnimationActive={false} />
                  <Line type="monotone" dataKey="filtered" connectNulls stroke="hsl(145, 65%, 50%)" dot={false} strokeWidth={2} name="Filtered (iFFT)" isAnimationActive={false} />
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
