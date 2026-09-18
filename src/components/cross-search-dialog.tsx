"use client";

import { useEffect, useState } from "react";
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
import { buildXSearchUrl, X_SEARCH_HANDLE_CAP } from "@/lib/parse-import";
import type { Person } from "@/lib/types";

export function CrossSearchDialog({
  open,
  onOpenChange,
  selected,
  visible,
  query,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  visible: Person[];
  query: string;
}) {
  const [keyword, setKeyword] = useState(query);
  const [scope, setScope] = useState<"selected" | "visible">("visible");

  useEffect(() => {
    if (open) {
      setKeyword(query);
      setScope(selected.length > 0 ? "selected" : "visible");
    }
  }, [open, query, selected.length]);

  const pool =
    scope === "selected" && selected.length > 0 ? selected : visible.map((p) => p.handle);
  const capped = pool.slice(0, X_SEARCH_HANDLE_CAP);
  const url = capped.length ? buildXSearchUrl(capped, keyword) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>投稿をXで横断検索</DialogTitle>
          <DialogDescription>
            選択中または表示中の人（最大{X_SEARCH_HANDLE_CAP}人）の投稿を、Xの検索で一度に見ます。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Label htmlFor="kw">キーワード</Label>
          <Input
            id="kw"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="LLM、財務、沖縄…"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={scope === "visible" ? "default" : "secondary"}
              onClick={() => setScope("visible")}
            >
              表示中 {visible.length}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scope === "selected" ? "default" : "secondary"}
              onClick={() => setScope("selected")}
              disabled={selected.length === 0}
            >
              選択中 {selected.length}
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {pool.length > X_SEARCH_HANDLE_CAP
              ? `${pool.length}人中、上位${X_SEARCH_HANDLE_CAP}人で検索します。名簿を絞ると精度が上がります。`
              : `${capped.length}人の投稿を対象にします。`}
          </p>
          <div className="flex justify-end">
            <Button asChild disabled={!url}>
              <a href={url} target="_blank" rel="noreferrer">
                Xで開く
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
