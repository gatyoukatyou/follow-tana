"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function TagDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (tag: string) => void;
}) {
  const [tag, setTag] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>選択中にタグ</DialogTitle>
          <DialogDescription>まとめて分類します。</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (tag.trim()) onApply(tag.trim());
            setTag("");
          }}
        >
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="AI、投資、仕事" />
          <div className="flex justify-end">
            <Button type="submit">付ける</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
