// 임시 확인용 (확인 후 삭제): 메이트·인플루언서 판별에 쓸 수 있는 값 찾기
module.exports = async function handler(req, res) {
  const id = String(req.query.id || '').replace(/[^\w-]/g, '');
  const H = { Accept: 'application/json', Referer: `https://m.blog.naver.com/${id}` };
  const out = {};
  const info = await (await fetch(`https://m.blog.naver.com/api/blogs/${id}`, { headers: H })).json();
  const r = info.result || {};
  out.fields = Object.fromEntries(Object.entries(r).filter(([k]) => /mate|influ|power|official|suggest|direct|year|badge|cert/i.test(k)));
  if (req.query.js) {
    const html = await (await fetch(`https://m.blog.naver.com/${id}`, { headers: H })).text();
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map((m) => (m[1].startsWith('http') ? m[1] : 'https://m.blog.naver.com' + m[1]));
    const found = new Set();
    for (const s of srcs) { try { const js = await (await fetch(s, { headers: H })).text();
      for (const m of js.matchAll(/["'`]([^"'`\s]{0,90}[Ii]nfluencer[^"'`\s]{0,90})["'`]/g)) if (/\/|api|\.naver|in\.naver/i.test(m[1])) found.add(m[1]); } catch (_) {} }
    out.influencerPaths = [...found].slice(0, 60);
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
