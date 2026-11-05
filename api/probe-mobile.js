// 임시 확인용 (확인 후 삭제): 모바일 블로그 화면이 부르는 데이터 주소 중 방문자 관련 것을 찾는다
module.exports = async function handler(req, res) {
  const id = String(req.query.id || 'titan742').replace(/[^\w-]/g, '');
  const H = { Referer: `https://m.blog.naver.com/${id}` };
  const out = { scripts: [], paths: [] };
  try {
    const html = await (await fetch(`https://m.blog.naver.com/${id}`, { headers: H })).text();
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => m[1].startsWith('http') ? m[1] : 'https://m.blog.naver.com' + m[1]);
    out.scripts = srcs.slice(0, 30);
    const found = new Set();
    for (const s of srcs.slice(0, 30)) {
      try {
        const js = await (await fetch(s, { headers: H, signal: AbortSignal.timeout(8000) })).text();
        for (const m of js.matchAll(/["'`]([^"'`\s]{0,80}(?:[Vv]isit|[Vv]isitor|stat|Stat|count|Count)[^"'`\s]{0,80})["'`]/g)) {
          const v = m[1]; if (/\/|api|ajax|\.naver/i.test(v) && v.length < 160) found.add(v);
        }
      } catch (_) {}
    }
    out.paths = [...found].slice(0, 200);
  } catch (e) { out.error = e.message; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
