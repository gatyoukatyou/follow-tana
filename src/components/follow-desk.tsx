"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  ArrowUpDown,
  BadgeCheck,
  Copy,
  Download,
  Eraser,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  Tag,
  Trash2,
  Upload,
  UserMinus,
  X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { AddPersonDialog } from "@/components/add-person-dialog";
import { CrossSearchDialog } from "@/components/cross-search-dialog";
import { ImportDialog } from "@/components/import-dialog";
import { Mark } from "@/components/mark";
import { OwnerDialog } from "@/components/owner-dialog";
import { PersonAvatar } from "@/components/person-avatar";
import { PersonSheet } from "@/components/person-sheet";
import { ScanDialog } from "@/components/scan-dialog";
import { TagDialog } from "@/components/tag-dialog";
import { UnfollowDialog } from "@/components/unfollow-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  applyFilters,
  peopleToScan,
  queryTokens,
  rosterStats,
  sortPeople,
  uniqueTags,
} from "@/lib/filter-sort";
import { wipeRosterStorage, flushRosterStorage } from "@/lib/idb-storage";
import { useRoster } from "@/lib/roster-store";
import {
  ACTIVITY_LABEL,
  RELATION_LABEL,
  activityOf,
  relationOf,
  type Activity as ActivityKind,
  type Person,
  type Relation,
  type SortKey,
} from "@/lib/types";
import { cn, copyTextSync, formatLastPost } from "@/lib/utils";
import { lookupXProfiles } from "@/lib/x-lookup";
import { useEnrich } from "@/hooks/use-enrich";
import { useOwnerHandle } from "@/hooks/use-owner";
import { useRosterHydrate } from "@/hooks/use-roster-hydrate";
import { useXBridge } from "@/hooks/use-x-bridge";

const SORT_LABEL: Record<SortKey, string> = {
  "last-asc": "最終投稿が古い順",
  "last-desc": "最終投稿が新しい順",
  "followers-desc": "フォロワーが多い順",
  "followers-asc": "フォロワーが少ない順",
  name: "名前順",
  handle: "ハンドル順",
  "added-desc": "追加が新しい順",
};

const VIRTUALIZE_AFTER = 60;
const ROW_PX = 88;

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 640px)");
    const on = () => setMobile(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return mobile;
}

function PersonRow({
  person,
  checked,
  onToggle,
  onOpen,
}: {
  person: Person;
  checked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const activity = activityOf(person);
  const relation = relationOf(person);
  const stale = activity === "dormant" || activity === "dead";
  return (
    <div
      className={cn(
        "flex h-[88px] cursor-pointer items-center gap-3 rounded-lg px-3 transition-colors duration-150",
        checked ? "bg-card" : "hover:bg-card/70",
      )}
      onClick={onOpen}
    >
      <span
        className="relative flex size-10 items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          aria-label={`${person.handle}を選択`}
        />
      </span>
      <PersonAvatar person={person} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{person.name || person.handle}</p>
          {person.verified ? <BadgeCheck className="size-3.5 shrink-0 text-slate" /> : null}
        </div>
        <p className="truncate font-mono text-[12px] text-muted-foreground">@{person.handle}</p>
        <div className="mt-1 flex items-center gap-1 overflow-hidden">
          <Badge
            variant={stale ? "outline" : "default"}
            className={activity === "dead" ? "text-destructive" : undefined}
          >
            {ACTIVITY_LABEL[activity]}
          </Badge>
          {relation !== "unknown" ? (
            <Badge variant={relation === "mutual" ? "solid" : "default"}>
              {RELATION_LABEL[relation]}
            </Badge>
          ) : null}
        </div>
      </div>
      <p
        className={cn(
          "w-16 shrink-0 text-right text-[13px] tabular-nums",
          stale ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {formatLastPost(person.lastPostAt, {
          lookupFailed: person.lookupFailed,
          protected: person.protected,
        })}
      </p>
    </div>
  );
}

function StatChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] transition-colors duration-150",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className="tabular-nums">{count.toLocaleString("ja-JP")}</span>
    </button>
  );
}

async function copyHandles(handles: string[]) {
  if (handles.length === 0) {
    toast.message("コピーする人がいません");
    return;
  }
  const text = handles.map((h) => `@${h}`).join("\n");
  if (copyTextSync(text)) {
    toast.success(`${handles.length}人のハンドルをコピーしました`);
  } else {
    toast.error("コピーできませんでした");
  }
}

function emptyHint(filters: ReturnType<typeof useRoster.getState>["filters"], hasQuery: boolean) {
  if (filters.unfollowQueue) {
    return "外し候補は、1年以上投稿がなく相互でもない人です。フォローを取り込んで生存確認すると、ここに並びます。";
  }
  if (filters.activity === "dormant") {
    return "1年以上投稿が止まっている人がここに出ます。先に生存確認してください。";
  }
  if (filters.activity === "dead") {
    return "プロフィールが取れない、消えたアカウントがここに出ます。";
  }
  if (filters.activity === "unknown") {
    return "生存確認を押すと、最終投稿を調べて未確認が減っていきます。";
  }
  if (filters.activity === "alive") {
    return "直近1年以内に投稿がある人です。";
  }
  if (filters.relation === "mutual") {
    return "フォロワー一覧を取り込むと、相互がここに付きます。";
  }
  if (hasQuery) return "検索語を変えるか、フォロー一覧を取り込んで棚を増やしてください。";
  return "該当する人がいません。フォロー一覧を取り込んでください。";
}

export function FollowDesk() {
  const people = useRoster((s) => s.people);
  const selected = useRoster((s) => s.selected);
  const query = useRoster((s) => s.query);
  const sort = useRoster((s) => s.sort);
  const filters = useRoster((s) => s.filters);
  const bannerDismissed = useRoster((s) => s.bannerDismissed);
  const followersImported = useRoster((s) => s.followersImported);
  const setQuery = useRoster((s) => s.setQuery);
  const setSort = useRoster((s) => s.setSort);
  const setFilter = useRoster((s) => s.setFilter);
  const toggleSelected = useRoster((s) => s.toggleSelected);
  const selectVisible = useRoster((s) => s.selectVisible);
  const clearSelected = useRoster((s) => s.clearSelected);
  const dismissBanner = useRoster((s) => s.dismissBanner);
  const addHandles = useRoster((s) => s.addHandles);
  const mergeProfiles = useRoster((s) => s.mergeProfiles);
  const addTag = useRoster((s) => s.addTag);
  const removePeople = useRoster((s) => s.removePeople);
  const clearRoster = useRoster((s) => s.clearRoster);
  const ownerHandle = useOwnerHandle();

  const [active, setActive] = useState<Person | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importKind, setImportKind] = useState<"following" | "followers">("following");
  const [addOpen, setAddOpen] = useState(false);
  const [crossOpen, setCrossOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [unfollowOpen, setUnfollowOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();

  const hydrated = useRosterHydrate(() => setOwnerOpen(true));
  useXBridge();
  const { enriching, enrichDone, enrichTotal, runEnrich, stopEnrich } = useEnrich();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tokens = useMemo(() => queryTokens(query), [query]);
  const tags = useMemo(() => uniqueTags(people), [people]);
  const stats = useMemo(() => rosterStats(people), [people]);
  const visible = useMemo(
    () => sortPeople(applyFilters(people, filters, tokens), sort),
    [people, filters, tokens, sort],
  );
  const virtualize = visible.length > VIRTUALIZE_AFTER;
  const scanPeople = useMemo(() => peopleToScan(people, selected), [people, selected]);
  const scanCount = scanPeople.length;

  const virtualizer = useVirtualizer({
    count: virtualize ? visible.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_PX,
    overscan: 10,
  });

  const selectedPeople = useMemo(() => {
    const keys = new Set(selected);
    return people.filter((p) => keys.has(p.handle.toLowerCase()));
  }, [people, selected]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allVisibleSelected =
    visible.length > 0 && visible.every((p) => selectedSet.has(p.handle.toLowerCase()));

  function exportRoster() {
    const payload = people.map(({ haystack: _haystack, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "follow-tana.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("棚の控えを保存しました。取込から戻せます。");
  }

  function openImport(kind: "following" | "followers") {
    setImportKind(kind);
    setImportOpen(true);
  }

  function toggleActivity(value: ActivityKind) {
    setFilter({
      activity: filters.activity === value ? "any" : value,
      unfollowQueue: false,
    });
  }

  function toggleRelation(value: Relation) {
    setFilter({
      relation: filters.relation === value ? "any" : value,
      unfollowQueue: false,
    });
  }

  function toggleQueue() {
    const next = !filters.unfollowQueue;
    setFilter({
      unfollowQueue: next,
      activity: "any",
      relation: "any",
    });
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        このブラウザに保存した棚を読み込んでいます…
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
          <Mark className="size-7 text-slate" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-medium tracking-tight">フォロー棚</h1>
            <p className="truncate text-[12px] text-muted-foreground">
              {ownerHandle ? `@${ownerHandle}` : "ハンドル未設定"} · 棚{" "}
              {people.length.toLocaleString("ja-JP")} 人 · このブラウザに保存
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOwnerOpen(true)}
                aria-label="使うアカウントを設定"
              >
                <Settings2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>使うXアカウント</TooltipContent>
          </Tooltip>
          <Button size="sm" variant="secondary" onClick={() => openImport("following")}>
            <Upload className="size-4" />
            <span className="hidden sm:inline">取込</span>
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">追加</span>
          </Button>
        </header>

        {!bannerDismissed ? (
          <div className="flex items-start gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
            <p className="min-w-0 flex-1 text-[13px] text-pretty text-muted-foreground">
              投稿が止まっているフォローを外すデスクです。棚はこのブラウザに自動保存されます。再起動しても残ります。念のため右上付近のダウンロードで控えを取ってください。
            </p>
            <button
              type="button"
              className="relative size-8 shrink-0 text-muted-foreground after:absolute after:top-1/2 after:left-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 hover:text-foreground"
              onClick={dismissBanner}
              aria-label="案内を閉じる"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名前、ハンドル、生存、休眠、相互、メモで一斉検索"
              className="h-12 rounded-md bg-card pr-12 pl-10 text-base shadow-[var(--shadow-border)]"
              aria-label="棚を検索"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-sm px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground shadow-[var(--shadow-border)] sm:inline">
              /
            </kbd>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatChip
              label="外し候補"
              count={stats.queue}
              active={filters.unfollowQueue}
              onClick={toggleQueue}
            />
            <StatChip
              label="休眠"
              count={stats.dormant}
              active={filters.activity === "dormant"}
              onClick={() => toggleActivity("dormant")}
            />
            <StatChip
              label="停止"
              count={stats.dead}
              active={filters.activity === "dead"}
              onClick={() => toggleActivity("dead")}
            />
            <StatChip
              label="生存"
              count={stats.alive}
              active={filters.activity === "alive"}
              onClick={() => toggleActivity("alive")}
            />
            <StatChip
              label="未確認"
              count={stats.unknown}
              active={filters.activity === "unknown"}
              onClick={() => toggleActivity("unknown")}
            />
            <StatChip
              label="相互"
              count={stats.mutual}
              active={filters.relation === "mutual"}
              onClick={() => toggleRelation("mutual")}
            />
            <StatChip
              label="一方"
              count={stats.oneway}
              active={filters.relation === "oneway"}
              onClick={() => toggleRelation("oneway")}
            />
            {!followersImported ? (
              <button
                type="button"
                className="text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => openImport("followers")}
              >
                フォロワーを照合
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <ArrowUpDown className="size-3.5" />
                  {SORT_LABEL[sort]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>並び替え</DropdownMenuLabel>
                {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                  <DropdownMenuItem key={key} onSelect={() => setSort(key)}>
                    {SORT_LABEL[key]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  絞り込み
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuCheckboxItem
                  checked={filters.unfollowQueue}
                  onCheckedChange={() => toggleQueue()}
                >
                  外し候補
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.activity === "alive"}
                  onCheckedChange={() => toggleActivity("alive")}
                >
                  生存
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.activity === "protected"}
                  onCheckedChange={() => toggleActivity("protected")}
                >
                  鍵
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={filters.verifiedOnly}
                  onCheckedChange={(v) => setFilter({ verifiedOnly: Boolean(v) })}
                >
                  認証済み
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.missingProfile}
                  onCheckedChange={(v) => setFilter({ missingProfile: Boolean(v) })}
                >
                  プロフィール未取得
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.hasNote}
                  onCheckedChange={(v) => setFilter({ hasNote: Boolean(v) })}
                >
                  メモあり
                </DropdownMenuCheckboxItem>
                {tags.length > 0 ? <DropdownMenuSeparator /> : null}
                {tags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t}
                    checked={filters.tag === t}
                    onCheckedChange={(v) => setFilter({ tag: v ? t : null })}
                  >
                    {t}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {enriching ? (
              <>
                <Button variant="secondary" size="sm" disabled>
                  <LoaderCircle className="size-3.5 animate-spin" />
                  確認中 {enrichDone.toLocaleString("ja-JP")} / {enrichTotal.toLocaleString("ja-JP")}
                </Button>
                <Button variant="outline" size="sm" onClick={stopEnrich}>
                  停止
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={people.length === 0 || scanCount === 0}
                onClick={() => setScanOpen(true)}
              >
                <Activity className="size-3.5" />
                {selected.length > 0 ? "選択を生存確認" : "生存確認"} {scanCount.toLocaleString("ja-JP")}
              </Button>
            )}

            <Button variant="ghost" size="sm" onClick={() => setCrossOpen(true)}>
              投稿をXで横断検索
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void copyHandles(visible.map((p) => p.handle))}
                  aria-label="表示中のハンドルをコピー"
                >
                  <Copy className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>表示中のハンドルをコピー</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={exportRoster} aria-label="書き出し">
                  <Download className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>棚の控えを保存（取込から戻せます）</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setClearOpen(true)}
                  aria-label="JSONを消す"
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>保存したJSONを消す</TooltipContent>
            </Tooltip>

            <label className="ml-auto flex items-center gap-2 text-[12px] tabular-nums text-muted-foreground">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={(v) => {
                  if (v) selectVisible(visible.map((p) => p.handle));
                  else clearSelected();
                }}
                aria-label="表示中をすべて選択"
              />
              表示 {visible.length.toLocaleString("ja-JP")} / {people.length.toLocaleString("ja-JP")}
            </label>
          </div>
          {enriching ? (
            <div className="flex flex-col gap-2 rounded-lg bg-card px-3 py-3 shadow-[var(--shadow-border)]">
              <div className="flex items-center gap-2">
                <LoaderCircle className="size-4 shrink-0 animate-spin text-slate" />
                <p className="text-[13px]">
                  最終投稿を調べています {enrichDone.toLocaleString("ja-JP")} /{" "}
                  {enrichTotal.toLocaleString("ja-JP")}
                </p>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-slate transition-[width] duration-300"
                  style={{
                    width: `${enrichTotal > 0 ? Math.min(100, (enrichDone / enrichTotal) * 100) : 0}%`,
                  }}
                />
              </div>
              <p className="text-[12px] text-pretty text-muted-foreground">
                全員を順に調べます。未確認は、投稿日が取れた人から生存・休眠・停止に変わります。取れなかった人は未確認のまま残ります。止めるときは「停止」。タブはこのまま開いておいてください。
              </p>
            </div>
          ) : stats.unknown > 0 ? (
            <p className="text-[12px] text-pretty text-muted-foreground">
              最終投稿が未確認の {stats.unknown.toLocaleString("ja-JP")} 人です。上の「生存確認」から、Xでまとめて調べてください。待っているだけでは進みません。
            </p>
          ) : null}
        </div>

        {selected.length > 0 ? (
          <div className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-card px-3 py-2 shadow-[var(--shadow-border)] sm:mx-6">
            <span className="text-[13px] tabular-nums">{selected.length}人を選択</span>
            <Button size="sm" onClick={() => setUnfollowOpen(true)}>
              <UserMinus className="size-3.5" />
              Xでまとめて外す
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setScanOpen(true)}
              disabled={enriching || scanCount === 0}
            >
              {enriching ? "確認中" : "生存確認"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void copyHandles(selected)}
            >
              <Copy className="size-3.5" />
              ハンドル
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setCrossOpen(true)}>
              Xで横断検索
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setTagOpen(true)}>
              <Tag className="size-3.5" />
              タグ
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (
                  selected.length >= 20 &&
                  !confirm(`${selected.length}人を棚から外します。よろしいですか？`)
                ) {
                  return;
                }
                removePeople(selected);
                toast.message("棚から外しました（Xのフォローは別途外してください）");
              }}
            >
              <Eraser className="size-3.5" />
              棚から外す
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelected}>
              選択解除
            </Button>
          </div>
        ) : null}

        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4"
        >
          {visible.length === 0 ? (
            <div className="mx-auto max-w-md px-4 py-16 text-center">
              <p className="text-base font-medium">該当する人がいません</p>
              <p className="mt-2 text-sm text-pretty text-muted-foreground">
                {emptyHint(filters, tokens.length > 0)}
              </p>
              <Button className="mt-5" onClick={() => openImport("following")}>
                取り込む
              </Button>
            </div>
          ) : virtualize ? (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((row) => {
                const person = visible[row.index]!;
                return (
                  <div
                    key={person.handle}
                    className="absolute top-0 left-0 w-full px-2"
                    style={{ transform: `translateY(${row.start}px)`, height: row.size }}
                  >
                    <PersonRow
                      person={person}
                      checked={selectedSet.has(person.handle.toLowerCase())}
                      onToggle={() => toggleSelected(person.handle)}
                      onOpen={() => setActive(person)}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col">
              {visible.map((person) => (
                <div key={person.handle} className="px-2">
                  <PersonRow
                    person={person}
                    checked={selectedSet.has(person.handle.toLowerCase())}
                    onToggle={() => toggleSelected(person.handle)}
                    onOpen={() => setActive(person)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <PersonSheet person={active} onClose={() => setActive(null)} mobile={mobile} />
        <OwnerDialog open={ownerOpen} onOpenChange={setOwnerOpen} />
        <ImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          defaultKind={importKind}
          ownerHandle={ownerHandle}
          onNeedOwner={() => setOwnerOpen(true)}
        />
        <UnfollowDialog
          open={unfollowOpen}
          onOpenChange={setUnfollowOpen}
          people={selectedPeople}
          ownerHandle={ownerHandle}
          onNeedOwner={() => setOwnerOpen(true)}
        />
        <ScanDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          people={scanPeople}
          ownerHandle={ownerHandle}
          onNeedOwner={() => setOwnerOpen(true)}
          onLocalScan={() => void runEnrich()}
        />
        <AddPersonDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onAdd={async (handle) => {
            addHandles([handle], "manual");
            try {
              const res = await lookupXProfiles({ data: { handles: [handle] } });
              mergeProfiles(res.profiles);
            } catch {
              /* keep handle-only */
            }
          }}
        />
        <CrossSearchDialog
          open={crossOpen}
          onOpenChange={setCrossOpen}
          selected={selected}
          visible={visible}
          query={query}
        />
        <TagDialog
          open={tagOpen}
          onOpenChange={setTagOpen}
          onApply={(tag) => {
            addTag(selected, tag);
            setTagOpen(false);
          }}
        />
        <Dialog open={clearOpen} onOpenChange={setClearOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>保存したJSONを消す</DialogTitle>
              <DialogDescription>
                このブラウザの棚 {people.length.toLocaleString("ja-JP")}{" "}
                人とJSON控えを消します。先に書き出していれば取込から戻せます。
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setClearOpen(false)}>
                やめる
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                disabled={clearing}
                onClick={() => {
                  void (async () => {
                    setClearing(true);
                    try {
                      await wipeRosterStorage();
                      clearRoster();
                      await flushRosterStorage();
                      toast.success("保存したJSONを消しました");
                      setClearOpen(false);
                    } catch {
                      toast.error("削除できませんでした");
                    } finally {
                      setClearing(false);
                    }
                  })();
                }}
              >
                {clearing ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                消す
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Toaster theme="dark" position="bottom-center" richColors={false} />
      </div>
    </TooltipProvider>
  );
}
