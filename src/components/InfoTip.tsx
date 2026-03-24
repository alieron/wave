import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

export function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="w-4 h-4 text-muted-foreground/60 hover:text-muted-foreground shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px] text-[12px]">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
