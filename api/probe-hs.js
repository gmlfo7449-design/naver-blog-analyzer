// 임시 확인용 (확인 후 삭제): mellongi123(=hyesloth) 판별 실패 원인 찾기
const { getBlog } = require('./rss');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
module.exports = async function handler(req, res) {
  const id = 'mellongi123';
  const out = { home: {}, searches: [] };
  const h = await fetch('https://in.naver.com/hyesloth', { headers: { 'User-Agent': UA } });
  const ht = await h.text();
  out.home = { status: h.status, blogLinks: [...new Set([...ht.matchAll(/blog\.naver\.com\/([\w-]{3,30})/g)].map((m) => m[1]))].slice(0, 6) };
  const bl = await getBlog(id);
  const it = [...bl.items].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  for (const k of [3, 1, 6]) {
    const t = it[k] && it[k].title; if (!t) continue;
    const q = '"' + t.replace(/["“”]/g, ' ').trim() + '"';
    const r = await fetch('https://search.naver.com/search.naver?ssc=tab.blog.all&query=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR' } });
    const html = await r.text();
    const idx = [...html.matchAll(new RegExp(`blog\\.naver\\.com\\/${id}`, 'gi'))].map((m) => m.index);
    const homes = [...html.matchAll(/in\.naver\.com\/([\w.-]{2,40})/g)].map((m) => ({ h: m[1], at: m.index }));
    out.searches.push({ k, title: t.slice(0, 40), pubDate: it[k].pubDate, status: r.status, len: html.length, blogLinkAt: idx.slice(0, 5), homes: homes.slice(0, 8),
      nearHomes: idx.length ? [...html.slice(Math.max(0, idx[0] - 4000), idx[0] + 200).matchAll(/.{0,40}in\.naver\.com[^"'\s<]{0,60}.{0,20}/g)].map((m) => m[0].replace(/\s+/g, ' ')) : [],
      firstBlogLinkContext: idx.length ? html.slice(Math.max(0, idx[0] - 300), idx[0] + 120).replace(/\s+/g, ' ') : '' });
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
