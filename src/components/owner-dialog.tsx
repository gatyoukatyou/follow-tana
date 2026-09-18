"use client";

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { setOwnerHandle } from "@/lib/owner";
import { useOwnerHandle } from "@/hooks/use-owner";
import { normalizeHandle } from "@/lib/utils";

export function OwnerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const handle = useOwnerHandle();
  const [value, setValue] = useState(handle);

  useEffect(() => {
    if (open) setValue(handle);
  }, [open, handle]);

  function save() {
    const next = normalizeHandle(value);
    if (!setOwnerHandle(next)) {
      toast.error("Xのハンドルを入力してください");
      return;
    }
    toast.success(`@${next} を使います`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>使うXアカウント</DialogTitle>
          <DialogDescription>
            フォロー一覧を開くためのハンドルです。名簿はサーバに送らず、このブラウザにだけ残します。
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Label htmlFor="owner-handle">ハンドル</Label>
          <Input
            id="owner-handle"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="@your_handle"
            autoFocus
            autoComplete="username"
          />
          <div className="flex justify-end gap-2">
            {handle ? (
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                やめる
              </Button>
            ) : null}
            <Button type="submit">使う</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
