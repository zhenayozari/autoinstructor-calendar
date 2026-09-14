"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StaffInvitationLinkCopy({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 w-full sm:w-auto"
      onClick={copyLink}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Скопировано" : "Скопировать"}
    </Button>
  );
}
