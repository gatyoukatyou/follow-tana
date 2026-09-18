"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ExternalLink, Trash2 } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTIVITY_LABEL,
  RELATION_LABEL,
  activityOf,
  relationOf,
  type Person,
} from "@/lib/types";
import { formatExactDate, formatFollowers, formatLastPost } from "@/lib/utils";
import { useRoster } from "@/lib/roster-store";

export function PersonSheet({
  person,
  onClose,
  mobile,
}: {
  person: Person | null;
  onClose: () => void;
  mobile: boolean;
}) {
  const updatePerson = useRoster((s) => s.updatePerson);
  const removePeople = useRoster((s) => s.removePeople);
  const [note, setNote] = useState("");
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    setNote(person?.note ?? "");
    setTagDraft("");
  }, [person?.handle, person?.note]);

  const activity = person ? activityOf(person) : "unknown";
  const relation = person ? relationOf(person) : "unknown";

  return (
    <Sheet open={!!person} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={mobile ? "bottom" : "right"} className="overflow-y-auto">
        {person ? (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3">
                <PersonAvatar person={person} size="lg" />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="flex items-center gap-1.5">
                    <span className="truncate">{person.name || person.handle}</span>
                    {person.verified ? (
                      <BadgeCheck className="size-4 shrink-0 text-slate" />
                    ) : null}
                  </SheetTitle>
                  <SheetDescription className="font-mono text-sm">
                    @{person.handle}
                  </SheetDescription>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant={activity === "dormant" || activity === "dead" ? "outline" : "solid"}>
                      {ACTIVITY_LABEL[activity]}
                    </Badge>
                    <Badge variant="default">{RELATION_LABEL[relation]}</Badge>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-5 pt-4 pb-8">
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-secondary p-3">
                <div>
                  <dt className="text-xs text-muted-foreground">最終投稿</dt>
                  <dd className="font-medium tabular-nums">
                    {formatLastPost(person.lastPostAt, {
                      lookupFailed: person.lookupFailed,
                      protected: person.protected,
                    })}
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {formatExactDate(person.lastPostAt)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">投稿数</dt>
                  <dd className="font-medium tabular-nums">
                    {person.tweetCount ? person.tweetCount.toLocaleString("ja-JP") : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">フォロワー</dt>
                  <dd className="font-medium tabular-nums">{formatFollowers(person.followers)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">開始</dt>
                  <dd className="font-medium tabular-nums">{formatExactDate(person.joinedAt)}</dd>
                </div>
              </dl>

              {person.lastPostText ? (
                <p className="text-sm text-pretty text-muted-foreground">{person.lastPostText}</p>
              ) : null}

              {person.bio ? (
                <p className="text-sm text-pretty whitespace-pre-wrap text-foreground/85">{person.bio}</p>
              ) : (
                <p className="text-sm text-muted-foreground">プロフィール未取得</p>
              )}

              {person.location ? (
                <p className="text-xs text-muted-foreground">{person.location}</p>
              ) : null}

              <div className="flex flex-col gap-2">
                <Label>相互フォロー</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={person.followsYou === true ? "default" : "secondary"}
                    onClick={() => updatePerson(person.handle, { followsYou: true })}
                  >
                    相互
                  </Button>
                  <Button
                    size="sm"
                    variant={person.followsYou === false ? "default" : "secondary"}
                    onClick={() => updatePerson(person.handle, { followsYou: false })}
                  >
                    一方通行
                  </Button>
                  <Button
                    size="sm"
                    variant={person.followsYou == null ? "default" : "ghost"}
                    onClick={() => updatePerson(person.handle, { followsYou: null })}
                  >
                    未確認
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  フォロワー一覧を取り込むと自動で付きます。手でも直せます。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={`https://x.com/${person.handle}`} target="_blank" rel="noreferrer">
                    Xで開いて外す
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
                {person.website ? (
                  <Button variant="secondary" asChild>
                    <a href={person.website} target="_blank" rel="noreferrer">
                      サイト
                    </a>
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="note">メモ</Label>
                <Textarea
                  id="note"
                  value={note}
                  placeholder="この人についてのメモ"
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => updatePerson(person.handle, { note })}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>タグ</Label>
                <div className="flex flex-wrap gap-1.5">
                  {person.tags.map((t) => (
                    <Badge key={t} variant="solid">
                      {t}
                    </Badge>
                  ))}
                  {person.tags.length === 0 ? (
                    <span className="text-xs text-muted-foreground">未設定</span>
                  ) : null}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = tagDraft.trim();
                    if (!t) return;
                    updatePerson(person.handle, {
                      tags: person.tags.includes(t) ? person.tags : [...person.tags, t],
                    });
                    setTagDraft("");
                  }}
                >
                  <Input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder="タグを追加"
                  />
                  <Button type="submit" variant="secondary">
                    追加
                  </Button>
                </form>
              </div>

              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  removePeople([person.handle]);
                  onClose();
                }}
              >
                <Trash2 className="size-4" />
                棚から外す
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
