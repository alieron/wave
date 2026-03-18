import { type WaveSource, createSource } from '@/lib/waveTypes';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Waves, Ship, MapPin, Play, Pause } from 'lucide-react';

interface Props {
  sources: WaveSource[];
  onSourcesChange: (s: WaveSource[]) => void;
  buoyX: number;
  buoyZ: number;
  onBuoyChange: (x: number, z: number) => void;
  paused: boolean;
  onPausedChange: (p: boolean) => void;
  onClearSignal: () => void;
}

function SourceCard({ source, onUpdate, onRemove }: {
  source: WaveSource;
  onUpdate: (id: string, u: Partial<WaveSource>) => void;
  onRemove: (id: string) => void;
}) {
  const freqRange = source.isInterference
    ? { min: 0.5, max: 3, step: 0.05 }
    : { min: 0.05, max: 0.8, step: 0.01 };

  return (
    <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: source.color }} />
          <span className="text-xs font-medium text-foreground">{source.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={source.enabled} onCheckedChange={v => onUpdate(source.id, { enabled: v })} />
          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => onRemove(source.id)}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {source.enabled && (
        <div className="space-y-1.5 pl-5">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Freq: {source.frequency.toFixed(2)} Hz</Label>
            <Slider
              value={[source.frequency]}
              onValueChange={([v]) => onUpdate(source.id, { frequency: +v.toFixed(2) })}
              min={freqRange.min} max={freqRange.max} step={freqRange.step}
              className="w-28"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Amp: {source.amplitude.toFixed(1)} m</Label>
            <Slider
              value={[source.amplitude]}
              onValueChange={([v]) => onUpdate(source.id, { amplitude: +v.toFixed(1) })}
              min={0.1} max={4} step={0.1}
              className="w-28"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap w-6">X</Label>
            <Input
              type="number"
              value={source.x}
              onChange={e => onUpdate(source.id, { x: parseFloat(e.target.value) || 0 })}
              className="h-6 text-xs px-2 w-20"
              min={-25} max={25}
            />
            <Label className="text-xs text-muted-foreground whitespace-nowrap w-6">Z</Label>
            <Input
              type="number"
              value={source.z}
              onChange={e => onUpdate(source.id, { z: parseFloat(e.target.value) || 0 })}
              className="h-6 text-xs px-2 w-20"
              min={-25} max={25}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ControlPanel({
  sources, onSourcesChange, buoyX, buoyZ, onBuoyChange,
  paused, onPausedChange, onClearSignal,
}: Props) {
  const updateSource = (id: string, updates: Partial<WaveSource>) => {
    onSourcesChange(sources.map(s => s.id === id ? { ...s, ...updates } : s));
  };
  const removeSource = (id: string) => {
    onSourcesChange(sources.filter(s => s.id !== id));
  };

  const oceanSources = sources.filter(s => !s.isInterference);
  const interferenceSources = sources.filter(s => s.isInterference);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-2">
        {/* Playback */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={paused ? 'default' : 'secondary'}
            className="flex-1 text-xs"
            onClick={() => onPausedChange(!paused)}
          >
            {paused ? <Play className="w-3 h-3 mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
            {paused ? 'Play' : 'Pause'}
          </Button>
          <Button size="sm" variant="secondary" className="text-xs" onClick={onClearSignal}>
            Clear Buffer
          </Button>
        </div>

        <Separator />

        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Waves className="w-4 h-4 text-primary" />
            Wave Generators
          </h2>
          <p className="text-[10px] text-muted-foreground mt-1">
            Each source emits circular sinusoidal waves
          </p>
        </div>

        {oceanSources.map(s => (
          <SourceCard key={s.id} source={s} onUpdate={updateSource} onRemove={removeSource} />
        ))}

        <Button
          size="sm" variant="outline" className="w-full text-xs"
          onClick={() => onSourcesChange([...sources, createSource(false)])}
        >
          <Plus className="w-3 h-3 mr-1" /> Add Wave Source
        </Button>

        <Separator />

        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Ship className="w-4 h-4 text-accent" />
            Interference
          </h2>
          <p className="text-[10px] text-muted-foreground mt-1">
            Higher-frequency noise (e.g. boat wakes)
          </p>
        </div>

        {interferenceSources.map(s => (
          <SourceCard key={s.id} source={s} onUpdate={updateSource} onRemove={removeSource} />
        ))}

        <Button
          size="sm" variant="outline" className="w-full text-xs"
          onClick={() => onSourcesChange([...sources, createSource(true)])}
        >
          <Plus className="w-3 h-3 mr-1" /> Add Interference
        </Button>

        <Separator />

        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MapPin className="w-4 h-4" style={{ color: '#ff3333' }} />
            Buoy Position
          </h2>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">X: {buoyX.toFixed(1)}</Label>
              <Slider value={[buoyX]} onValueChange={([v]) => onBuoyChange(v, buoyZ)} min={-25} max={25} step={0.5} className="w-32" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Z: {buoyZ.toFixed(1)}</Label>
              <Slider value={[buoyZ]} onValueChange={([v]) => onBuoyChange(buoyX, v)} min={-25} max={25} step={0.5} className="w-32" />
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

