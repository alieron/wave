import { X, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';
import { InlineMath } from 'react-katex';

const TUTORIALS: { title: string; content: ReactNode[] }[] = [
  {
    title: '1. Individual Waves & Superposition',
    content: [
      <>Similar to sound sources, each wave emits a <strong>sinusoidal wave</strong> with a specific frequency and amplitude.</>,

      <>The left graph shows each wave independently — these are the <em>component signals</em>.</>,

      <>The right graph shows their <strong>sum</strong>, analogous to hearing a complex sound composed of multiple frequencies.</>,

      <><em>Try</em> toggling individual sources on/off to see how each one contributes to the signal.</>,

      <><em>Try</em> moving the sources around to see the phase shift.</>,

      <><em>Try</em> adjusting the frequencies and see how the fundamental frequency and period changes.</>,

      <>The fundamental frequency <InlineMath math="f_0" /> is the GCD of all source frequencies.</>,

      <>For frequencies &lt; 1, they are first scaled up before computing the GCD.</>,
    ],
  },
  {
    title: '2. Discrete Sampling & the FFT',
    content: [
      <>To analyse a continuous signal digitally, we <strong>sample</strong> it at discrete intervals.</>,

      <>
        Due to the Nyquist sampling theorem, the sampling rate <InlineMath math="f_s" /> determines the maximum frequency we can capture in the signal by: <InlineMath math="f_s \geq 2f_{max}" />
      </>,

      <>The vertical lines in the FFT plot indicate the component frequencies of the signal, see that the peaks roughly line up with the lines.</>,

      <><em>Try</em> lowering the sampling rate to observe <strong>aliasing</strong> in the frequency domain.</>,

      <>
        Component frequencies higher than <InlineMath math="f_{max}" /> are now reflected as stray peaks in the FFT plot, this is the effect of <strong>aliasing</strong>.
      </>,

      <>
        The frequency bin size: <InlineMath math="\Delta f = \frac{f_s}{N}" /> is the frequency range represented by each point on the FFT plot.
      </>,
    ],
  },

  {
    title: '3. Filtering & iFFT Reconstruction',
    content: [
      <>In the frequency domain, <strong>filtering</strong> can be used to remove unwanted components, ie. high pitched noise or interference created by boats.</>,

      <><em>Try</em> dragging a region on the FFT plot to select a band-pass range.</>,

      <>The <strong>inverse FFT</strong>(iFFT) reconstructs the filtered signal, the resolution is slightly lower since the time domain is now discrete.</>,

      <>Keep low frequencies to extract data on the wave ie. <em>tidal waves</em>, or high frequencies to study the interference created by boats ie. <em>engine vibrations</em>.</>,
    ],
  },
];

interface Props {
  step: number;
  onClose: () => void;
}

export default function TutorialOverlay({ step, onClose }: Props) {
  const tutorial = TUTORIALS[step] ?? TUTORIALS[0];

  return (
    <div className="absolute top-2 right-2 z-20 w-[33vw] max-h-[calc(100%-16px)] flex flex-col rounded-lg border border-border/50 bg-card/90 backdrop-blur-md shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
        <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
        <h3 className="text-[14px] font-semibold text-foreground flex-1 truncate">
          {tutorial.title}
        </h3>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0"
          onClick={onClose}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      <ul className="px-3 py-2 space-y-2 overflow-y-scroll flex-1 w-full">
        {tutorial.content.map((text, i) => (
          <li key={i} className="text-[13px] text-muted-foreground leading-relaxed flex gap-1.5 min-w-0">
            <span className="text-primary/70 shrink-0 mt-0.2">•</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

