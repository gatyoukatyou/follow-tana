"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { parseImport } from "@/lib/parse-import";
import { isValidHandle, normalizeHandle } from "@/lib/utils";

export function AddPersonDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (handle: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = parseImport(value).handles[0] ?? normalizeHandle(value);

  async function submit() {
    if (!isValidHandle(parsed)) {
      toast.error("ハンドルを入力してください");
      return;
    }
    setBusy(true);
    try {
      await onAdd(parsed);
      toast.success(`@${parsed} を追加しました`);
      setValue("");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>1人追加</DialogTitle>
          <DialogDescription>ハンドルまたはプロフィールURLを入力します。</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="@handle"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              やめる
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              追加
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
