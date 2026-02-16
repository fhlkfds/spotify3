"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function LogoutButton() {
  const router = useRouter();

  const onLogout = async () => {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
    });

    if (!response.ok) {
      toast({
        title: "Sign out failed",
        description: "Please try again.",
        variant: "destructive",
      });
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <Button variant="ghost" size="sm" onClick={onLogout}>
      Sign out
    </Button>
  );
}
