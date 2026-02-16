"use client";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function ShareWrappedButton({ summary }: { summary: string }) {
  const share = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      toast({
        title: "Wrapped summary copied",
        description: "Paste it into your social post.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Clipboard access is blocked in this browser.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button variant="outline" onClick={share}>
      Copy Share Text
    </Button>
  );
}
