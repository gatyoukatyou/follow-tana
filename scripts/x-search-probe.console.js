/**
 * フォロー棚 — SearchTimeline 実測プローブ（コンソール貼り付け用）
 *
 * 目的（公開アカウントだけで確認・検索枠を6回消費）:
 *   1. ページ自身の SearchTimeline リクエストから署名ヘッダごと横取りして
 *      再送（replay）できるか
 *   2. count を増やして1回に何人分の Tweet が入るか
 *   3. 応答の飽和（空 entries / cursor 無し）の出方
 *   4. 「from:ハンドル」で出なかった人が休眠確定に使えるか
 *
 * 使い方:
 *   https://x.com/search?q=from%3AX&src=typed_query&f=live を開き、
 *   F12 → コンソールに貼って Enter。あとは放置で search-probe.json が
 *   ダウンロードされる。
 */
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  let template = null;

  const run = async () => {

  // ---- 1) ページ自身の SearchTimeline を横取りして型紙を奪う ----
  const orig = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const isSearch =
      url.includes("/i/api/graphql/") &&
      (url.includes("SearchTimeline") || (init && typeof init.body === "string" && init.body.includes('"SearchTimeline"')));
    const res = await orig.apply(this, arguments);
    if (isSearch && !template) {
      try {
        const headers = {};
        if (init && init.headers) {
          if (init.headers instanceof Headers) {
            init.headers.forEach((v, k) => (headers[k] = v));
          } else if (typeof init.headers === "object") {
            Object.assign(headers, init.headers);
          }
        }
        template = { url, init: { method: init && init.method, headers, body: typeof (init && init.body) === "string" ? init.body : null } };
        console.log("フォロー棚 probe: SearchTimeline を捕捉しました", url.slice(0, 120));
      } catch (e) {}
    }
    return res;
  };

  // 最初の1リクエストを発生させるため自動スクロール
  const col = document.querySelector('[data-testid="primaryColumn"]');
  window.scrollTo(0, 300);
  if (col) col.scrollTop = 300;
  for (let i = 0; i < 30 && !template; i++) {
    await sleep(500);
    window.scrollTo(0, document.documentElement.scrollHeight);
    if (col) col.scrollTop = col.scrollHeight;
  }
  if (!template) {
    console.error("フォロー棚 probe: SearchTimeline を横取りできませんでした。検索結果が表示されているか確認してください。");
    window.fetch = orig;
    return;
  }

  // ---- 2) 型紙をもとに variables を差し替えて再送 ----
  const buildRequest = (rawQuery, count) => {
    let url = template.url;
    let body = template.init.body;
    const setVars = (vars) => {
      try {
        const u = new URL(url, location.origin);
        if (u.searchParams.has("variables")) {
          u.searchParams.set("variables", JSON.stringify(vars));
          url = u.toString();
        }
      } catch (e) {}
      if (body) {
        try {
          const b = JSON.parse(body);
          b.variables = vars;
          body = JSON.stringify(b);
        } catch (e) {}
      }
    };
    try {
      const u = new URL(url, location.origin);
      const vars = JSON.parse(u.searchParams.get("variables") || (body ? JSON.parse(body).variables : "{}"));
      vars.rawQuery = rawQuery;
      vars.count = count;
      if (vars.product !== undefined) delete vars.product; // Latest のみ想定。product があれば元のまま
      setVarsRaw(vars);
      function setVarsRaw(v) {
        // 上述 setVars の本体呼び出し
        try {
          const u2 = new URL(url, location.origin);
          if (u2.searchParams.has("variables")) {
            u2.searchParams.set("variables", JSON.stringify(v));
            url = u2.toString();
          }
        } catch (e) {}
        if (body) {
          try {
            const b = JSON.parse(body);
            b.variables = v;
            body = JSON.stringify(b);
          } catch (e) {}
        }
      }
    } catch (e) {}
    return { url, body };
  };

  const countEntries = (body) => {
    try {
      const instr = body.data.search_by_raw_query.search_timeline.timeline.instructions;
      for (const ins of instr) {
        if (ins.type === "TimelineAddEntries" && Array.isArray(ins.entries)) {
          const tweets = ins.entries.filter((e) => e && e.entryId && e.entryId.startsWith("tweet-"));
          const cursor = ins.entries.some((e) => e && e.content && e.content.cursorType === "Bottom");
          return { tweets: tweets.length, hasCursor: cursor };
        }
      }
      return { tweets: 0, hasCursor: false };
    } catch (e) {
      return { tweets: -1, hasCursor: false };
    }
  };

  const replay = async (name, rawQuery, count) => {
    const { url, body } = buildRequest(rawQuery, count);
    const t0 = Date.now();
    let status = 0;
    let parsed = null;
    let rlRemaining = null;
    let rlReset = null;
    let errCode = null;
    try {
      const res = await orig(url, {
        method: template.init.method || "GET",
        credentials: "include",
        headers: template.init.headers,
        body: body || undefined,
      });
      status = res.status;
      rlRemaining = res.headers.get("x-rate-limit-remaining");
      rlReset = res.headers.get("x-rate-limit-reset");
      try {
        parsed = await res.json();
        const errors = parsed && parsed.errors;
        if (Array.isArray(errors) && errors.length) errCode = errors[0].code;
      } catch (e) {}
    } catch (e) {}
    const cnt = parsed ? countEntries(parsed) : { tweets: -1, hasCursor: false };
    results.push({
      name,
      rawQuery,
      count,
      status,
      tweets: cnt.tweets,
      hasCursor: cnt.hasCursor,
      rateRemaining: rlRemaining,
      rateResetInSec: rlReset ? Number(rlReset) - Math.floor(Date.now() / 1000) : null,
      ms: Date.now() - t0,
      errCode,
    });
    await sleep(2000);
  };

  // ---- 3) 検証6発（公開アカウントのみ） ----
  await replay("baseline-active", "from:X", 20);
  await replay("count100", "from:X", 100);
  await replay("another-active", "from:cloudflare", 20);
  await replay("nonexistent", "from:zzzzz_nosuch_user_9999", 20);
  await replay("rate-check", "from:openai", 20);
  await replay("saturation", "from:X", 20);

  window.fetch = orig;

  console.table(results.map((r) => ({ name: r.name, status: r.status, tweets: r.tweets, cursor: r.hasCursor, remain: r.rateRemaining, resetIn: r.rateResetInSec, ms: r.ms })));
  const blob = new Blob([JSON.stringify(results, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "search-probe.json";
  a.click();
  console.log("フォロー棚 probe: 完了。search-probe.json を保存しました。内容を貼ってください。");
  };

  void run();
})();
