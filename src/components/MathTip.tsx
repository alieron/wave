import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calculator } from 'lucide-react';

export function MathTip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Calculator className="w-4 h-4 text-muted-foreground/60 hover:text-muted-foreground shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[12px]">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
