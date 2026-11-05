// 임시 확인용 (확인 후 삭제): in.naver.com 화면이 쓰는 검색 주소 찾기
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
module.exports = async function handler(req, res) {
  const out = { pages: [], paths: [] };
  const found = new Set();
  for (const u of ['https://in.naver.com/intro', 'https://in.naver.com/']) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      const html = await r.text();
      const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => new URL(m[1], u).href);
      out.pages.push({ u, status: r.status, final: r.url, len: html.length, scripts: srcs.length });
      for (const m of html.matchAll(/["'`]([^"'`\s]{0,100}(?:search|Search|influencer|Influencer)[^"'`\s]{0,100})["'`]/g)) if (/\/|api/.test(m[1])) found.add('html:' + m[1]);
      for (const s of srcs.slice(0, 25)) {
        try {
          const js = await (await fetch(s, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) })).text();
          for (const m of js.matchAll(/["'`]([^"'`\s]{0,100}(?:search|Search)[^"'`\s]{0,100})["'`]/g)) if (/\/|api/i.test(m[1]) && m[1].length < 180) found.add(m[1]);
        } catch (_) {}
      }
    } catch (e) { out.pages.push({ u, error: e.message }); }
  }
  out.paths = [...found].filter((x) => /api|\/search|keyword|query/i.test(x)).slice(0, 80);
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
