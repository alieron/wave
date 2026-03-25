import { useState, useEffect, useRef, useCallback } from 'react';
import { Waves, Play, Pause, BookOpen } from 'lucide-react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import OceanScene from '@/components/OceanScene';
import SceneOverlayPanel from '@/components/SceneOverlayPanel';
import AnalysisPanel from '@/components/AnalysisPanel';
import TutorialOverlay from '@/components/TutorialOverlay';
import { type WaveSource, DEFAULT_SOURCES, SAMPLE_RATE } from '@/lib/waveTypes';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [sources, setSources] = useState<WaveSource[]>(DEFAULT_SOURCES);
  const [buoyX, setBuoyX] = useState(0);
  const [buoyZ, setBuoyZ] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userSampleRate, setUserSampleRate] = useState(SAMPLE_RATE);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [tutorialOpen, setTutorialOpen] = useState(true);
  const isResizingRef = useRef(false);

  const handleChanging = useCallback(() => {
    isResizingRef.current = true;
  }, []);

  const handleChanged = useCallback(() => {
    isResizingRef.current = false;
  }, []);

  // Spacebar to toggle pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setPaused(p => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-10 border-b border-border flex items-center px-4 shrink-0 bg-card gap-3">
        <Waves className="w-4 h-4 text-primary" />
        <h1 className="text-xs font-bold text-foreground">Ocean Wave FFT Simulator</h1>
        <span className="text-[10px] text-muted-foreground">CS2108 · Fourier Analysis</span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={tutorialOpen ? 'default' : 'secondary'}
            className="h-6 text-[10px] px-3 rounded-full"
            onClick={() => setTutorialOpen(!tutorialOpen)}
          >
            <BookOpen className="w-3 h-3 mr-1" />
            Tutorial
          </Button>
          <Button
            size="sm"
            variant={paused ? 'default' : 'secondary'}
            className="h-6 w-6 p-0 rounded-full flex items-center justify-center"
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </Button>
        </div>
      </header>

      {/* Resizable panels (v4 API) */}
      <Group orientation="vertical" className="flex-1 min-h-0" onLayoutChange={handleChanging} onLayoutChanged={handleChanged}>
        {/* 3D Scene */}
        <Panel defaultSize={50} minSize={30}>
          <div className="relative w-full h-full" style={{ willChange: 'transform' }}>
            <OceanScene
              sources={sources}
              buoyX={buoyX}
              buoyZ={buoyZ}
              paused={paused}
              isResizingRef={isResizingRef}
              onSourcesChange={setSources}
            />
            <SceneOverlayPanel
              sources={sources}
              onSourcesChange={setSources}
              buoyX={buoyX}
              buoyZ={buoyZ}
              onBuoyChange={(x, z) => { setBuoyX(x); setBuoyZ(z); }}
            />
            {tutorialOpen && (
              <TutorialOverlay step={analysisStep} onClose={() => setTutorialOpen(false)} />
            )}
          </div>
        </Panel>

        <Separator
          className="group h-2 flex items-center justify-center bg-card border-y border-border cursor-row-resize hover:bg-secondary/50 transition-colors"
        >
          <div className="w-8 h-0.5 rounded bg-muted-foreground/30 group-hover:bg-muted-foreground/50 transition-colors" />
        </Separator>

        {/* Analysis graphs */}
        <Panel defaultSize={50} minSize={30}>
          <div className="w-full h-full">
            <AnalysisPanel
              sources={sources}
              buoyX={buoyX}
              buoyZ={buoyZ}
              sampleRate={userSampleRate}
              onSampleRateChange={setUserSampleRate}
              step={analysisStep}
              onStepChange={setAnalysisStep}
            />
          </div>
        </Panel>
      </Group>
    </div>
  );
};

export default Index;

