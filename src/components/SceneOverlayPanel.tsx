import { useState } from 'react';
import { type WaveSource, createSourceFromPreset, SOURCE_PRESETS } from '@/lib/waveTypes';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, Flag, ChevronDown, ChevronRight, Disc } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { InfoTip } from './InfoTip';

interface Props {
  sources: WaveSource[];
  onSourcesChange: (s: WaveSource[]) => void;
  buoyX: number;
  buoyZ: number;
  onBuoyChange: (x: number, z: number) => void;
}

function SourceItem({ source, onUpdate, onRemove }: {
  source: WaveSource;
  onUpdate: (id: string, u: Partial<WaveSource>) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const freqRange = { min: 1, max: 15, step: 1 };
  const ampRange = { min: 0, max: 2.5, step: 0.01 };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded border border-border/60 bg-background/40 backdrop-blur-sm">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-secondary/30 transition-colors rounded-t">
            {open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: source.color }} />
            <span className="text-[11px] font-medium text-foreground truncate flex-1">{source.label}</span>
            <Switch
              checked={source.enabled}
              onCheckedChange={v => { onUpdate(source.id, { enabled: v }); }}
              onClick={e => e.stopPropagation()}
              className="scale-75"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pb-2 pt-1 space-y-1.5 border-t border-border/40">
            <div className="flex items-center justify-between gap-1">
              <Label className="text-[10px] text-muted-foreground whitespace-nowrap w-20">
                Freq: {source.frequency} Hz
              </Label>
              <Slider
                value={[source.frequency]}
                onValueChange={([v]) => onUpdate(source.id, { frequency: Math.round(v) })}
                min={freqRange.min} max={freqRange.max} step={freqRange.step}
                className="w-24"
              />
              {/* <InfoTip> */}
              {/*   {source.isInterference */}
              {/*     ? 'Boat wakes typically range 0.5–2.0 Hz (periods 0.5–2s)' */}
              {/*     : 'Ocean swells: 0.05–0.15 Hz. Wind waves: 0.15–0.5 Hz'} */}
              {/* </InfoTip> */}
            </div>
            <div className="flex items-center justify-between gap-1">
              <Label className="text-[10px] text-muted-foreground whitespace-nowrap w-20">
                Amp: {source.amplitude} m
              </Label>
              <Slider
                value={[source.amplitude]}
                onValueChange={([v]) => onUpdate(source.id, { amplitude: v })}
                min={ampRange.min} max={ampRange.max} step={ampRange.step}
                className="w-24"
              />
              <InfoTip>
                Wave amplitude in metres. Typical ocean swells: 0.3–1.5m. Boat wakes: 0.05–0.2m.
              </InfoTip>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] text-muted-foreground w-4">X</Label>
              <Input
                type="number"
                value={source.x}
                onChange={e => onUpdate(source.id, { x: Math.round(parseFloat(e.target.value) || 0) })}
                className="h-5 text-[10px] px-1.5 w-16 bg-secondary/50"
                min={-30} max={30} step={1}
              />
              <Label className="text-[10px] text-muted-foreground w-4">Z</Label>
              <Input
                type="number"
                value={source.z}
                onChange={e => onUpdate(source.id, { z: Math.round(parseFloat(e.target.value) || 0) })}
                className="h-5 text-[10px] px-1.5 w-16 bg-secondary/50"
                min={-30} max={30} step={1}
              />
              <Button
                size="icon" variant="ghost"
                className="h-5 w-5 text-destructive/70 hover:text-destructive ml-auto"
                onClick={() => onRemove(source.id)}
              >
                <Trash2 className="w-2.5 h-2.5" />
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function SceneOverlayPanel({ sources, onSourcesChange, buoyX, buoyZ, onBuoyChange }: Props) {
  const updateSource = (id: string, updates: Partial<WaveSource>) => {
    onSourcesChange(sources.map(s => s.id === id ? { ...s, ...updates } : s));
  };
  const removeSource = (id: string) => {
    onSourcesChange(sources.filter(s => s.id !== id));
  };

  return (
    <div className="absolute top-2 left-2 z-10 w-56 space-y-1.5 max-h-[calc(100%-16px)] overflow-y-auto overflow-x-hidden scrollbar-thin">
      {/* All sources combined */}
      <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-md p-2 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Disc className="w-3.5 h-3.5" />
          <h3 className="text-[11px] font-semibold text-foreground flex-1">
            Wave Sources
          </h3>
          <InfoTip>
            Similar to sound sources, each wave source emits waves in all directions along the ocean surface. For simplicity, the sources emit sine waves.
          </InfoTip>
        </div>
        {sources.map(s => (
          <SourceItem key={s.id} source={s} onUpdate={updateSource} onRemove={removeSource} />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm" variant="ghost"
              className="w-full h-6 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-3 h-3 mr-1" /> Add Source
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {SOURCE_PRESETS.map((preset, i) => (
              <DropdownMenuItem
                key={i}
                className="text-[11px] gap-2"
                onClick={() => onSourcesChange([...sources, createSourceFromPreset(preset)])}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.color }} />
                {preset.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Buoy */}
      <div className="rounded-lg border border-border/50 bg-card/80 backdrop-blur-md p-2 space-y-1">
        <div className="flex items-center gap-1.5">
          <Flag className="w-3.5 h-3.5 text-[#ff3333]" />
          <h3 className="text-[11px] font-semibold text-foreground flex-1">Buoy</h3>
          <InfoTip>
            The buoy acts as a sensor measuring the superposition (sum) of all waves at its position. It serves as our time-domain signal.
          </InfoTip>
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-[10px] text-muted-foreground w-4">X</Label>
          <Input
            type="number" value={buoyX}
            onChange={e => onBuoyChange(Math.round(parseFloat(e.target.value) || 0), buoyZ)}
            className="h-5 text-[10px] px-1.5 w-16 bg-secondary/50"
            step={1}
          />
          <Label className="text-[10px] text-muted-foreground w-4">Z</Label>
          <Input
            type="number" value={buoyZ}
            onChange={e => onBuoyChange(buoyX, Math.round(parseFloat(e.target.value) || 0))}
            className="h-5 text-[10px] px-1.5 w-16 bg-secondary/50"
            step={1}
          />
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground/80 px-1">
        Shift+drag markers to move
        <br />
        Space to pause
      </p>
    </div>
  );
}

