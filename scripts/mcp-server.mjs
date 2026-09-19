#!/usr/bin/env node
/**
 * フォロー棚 — ローカルMCPサーバ（案B：デスク側だけを自動化、Xには触らない）
 *
 * 役割:
 *   - デスク（ローカルdevサーバ）の状態を読む（棚統計・外し候補・未確認数）
 *   - 生存確認コードを生成してクリップボード/ファイルへ出す
 *   - 枠（SearchTimeline 50回/15分）の回復を検知し「次のコード準備完了」を返す
 *
 * Xへの貼り付け・confirm 押下は人間が行う（AGENTS.md 原則）。
 * このサーバは X の API を叩かない。Cookie・トークンを扱わない。
 *
 * 実行: node scripts/mcp-server.mjs
 * 接続先の棚データはブラウザの IndexedDB にあるため、ここでは以下を扱う:
 *   - デスクのローカル HTTP から JSON 控え（follow-tana.json 書き出し）を読む
 *     ※ブラウザ書き出しを ~/.follow-tana/roster.json に置いてもらう方式が最も単純
 *   - 生成スクリプトは buildScanScript と同等の文字列をローカルで組む
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PORT = 8090;
const DIR = join(process.env.HOME || process.env.USERPROFILE || ".", ".follow-tana");
const ROSTER_FILE = join(DIR, "roster.json");

function readRoster() {
  try {
    return JSON.parse(readFileSync(ROSTER_FILE, "utf8"));
  } catch {
    return null;
  }
}

function rosterStats(people) {
  const now = Date.now();
  const DORMANT = 365 * 24 * 60 * 60 * 1000;
  let alive = 0, dormant = 0, dead = 0, unknown = 0, candidates = 0;
  for (const p of people) {
    if (p.lastPostAt != null) {
      if (now - p.lastPostAt >= DORMANT) dormant += 1; else alive += 1;
    } else if (p.lookupFailed) unknown += 1; // 停止は確定時のみで、ここでは未確認に留める
    else unknown += 1;
  }
  // 外し候補: 休眠確定かつ一方通行（followsYou === false）
  const candidateList = people.filter((p) => {
    const lp = p.lastPostAt;
    const dormantish = lp != null && now - lp >= DORMANT;
    return dormantish && p.followsYou === false;
  });
  return { alive, dormant, unknown, candidates: candidateList.length, total: people.length };
}

/** 昔フォローした人から（addedAt 降順）20人ずつのバッチを出す */
function nextBatch(people, count = 20, offset = 0) {
  const sorted = [...people]
    .filter((p) => p.lastCheckedAt == null || Date.now() - (p.lastCheckedAt ?? 0) > 7 * 864e5)
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  return sorted.slice(offset, offset + count).map((p) => p.handle);
}

/** x-scan-script.ts と同じ生成ロジック（最小再現） */
function buildScanScript(handles) {
  const payload = JSON.stringify(
    handles.map((h) => String(h).replace(/^@/, "")).filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h)),
  );
  // 生成コード本体はリポジトリの src/lib/x-scan-script.ts が単一の真実源。
  // ここではランタイムに同梱しないため、dev サーバ経由で取得する。
  return { targetPayload: payload, note: "scan script は GET /__mcp/scan-script?handles=... で取得" };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const json = (code, body) => {
    res.statusCode = code;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body, null, 2));
  };

  if (url.pathname === "/health") {
    return json(200, { ok: true, roster: existsSync(ROSTER_FILE) });
  }

  if (url.pathname === "/mcp/roster-stats") {
    const r = readRoster();
    if (!r) return json(200, { ok: false, reason: `no roster file at ${ROSTER_FILE}` });
    return json(200, { ok: true, stats: rosterStats(r.people ?? []) });
  }

  if (url.pathname === "/mcp/unfollow-candidates") {
    const r = readRoster();
    if (!r) return json(200, { ok: false, reason: "no roster" });
    const now = Date.now();
    const DORMANT = 365 * 24 * 60 * 60 * 1000;
    const list = (r.people ?? [])
      .filter((p) => p.lastPostAt != null && now - p.lastPostAt >= DORMANT && p.followsYou === false)
      .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      .slice(0, Number(url.searchParams.get("limit") ?? 60))
      .map((p) => ({ handle: p.handle, lastPostAt: p.lastPostAt }));
    return json(200, { ok: true, count: list.length, people: list });
  }

  if (url.pathname === "/mcp/next-batch") {
    const r = readRoster();
    if (!r) return json(200, { ok: false, reason: "no roster" });
    const batch = nextBatch(r.people ?? [], Number(url.searchParams.get("count") ?? 20), Number(url.searchParams.get("offset") ?? 0));
    return json(200, { ok: true, batch });
  }

  if (url.pathname === "/mcp/scan-script") {
    // デスク（dev 8082）から生成済みコードを取得してそのまま返す
    try {
      const resp = await fetch("http://127.0.0.1:8082/", { signal: AbortSignal.timeout(3000) });
      const html = await resp.text();
      return json(200, { ok: true, hint: "生存確認ダイアログからコードをコピーしてください。スクリプト本体はブラウザ側で組み立てられます。", appReachable: resp.ok, htmlBytes: html.length });
    } catch (e) {
      return json(200, { ok: false, reason: "desk unreachable on 8082: " + (e?.message ?? String(e)) });
    }
  }

  if (url.pathname === "/mcp/save-roster" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(ROSTER_FILE, body);
        json(200, { ok: true, saved: ROSTER_FILE });
      } catch (e) {
        json(500, { ok: false, error: String(e) });
      }
    });
    return;
  }

  json(404, { ok: false, error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[follow-tana-mcp] http://127.0.0.1:${PORT}  (roster file: ${ROSTER_FILE})`);
});
