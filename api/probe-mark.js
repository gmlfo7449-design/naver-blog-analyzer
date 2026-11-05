// 임시 확인용 (확인 후 삭제): 인플루언서 인증 표시가 블로그 데이터 어디에 있는지 비교
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const flat = (o, p = '', out = {}) => { if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k, out); } else out[p] = o; return out; };
module.exports = async function handler(req, res) {
  const ids = String(req.query.ids || 'pso164,titan742').split(',').slice(0, 3);
  const out = {};
  for (const id of ids) {
    const H = { Accept: 'application/json', Referer: `https://m.blog.naver.com/${id}`, 'User-Agent': UA };
    const r = {};
    try { r.info = flat(((await (await fetch(`https://m.blog.naver.com/api/blogs/${id}`, { headers: H })).json()).result) || {}); } catch (e) { r.infoErr = e.message; }
    try {
      const html = await (await fetch(`https://m.blog.naver.com/${id}`, { headers: { 'User-Agent': UA } })).text();
      r.htmlHits = [...html.matchAll(/.{0,60}(?:[Ii]nfluencer|인플루언서|in\.naver\.com|certif|badge|Badge).{0,60}/g)].map((m) => m[0].replace(/\s+/g, ' ')).slice(0, 12);
    } catch (e) { r.htmlErr = e.message; }
    out[id] = r;
  }
  // 두 블로그의 정보 필드 중 값이 다른 것만
  const [a, b] = ids; const A = out[a].info || {}, B = out[b].info || {};
  out.diff = Object.keys({ ...A, ...B }).filter((k) => typeof (A[k] ?? B[k]) !== 'string' || k.length < 40).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]) && typeof (A[k] ?? B[k]) === 'boolean').map((k) => `${k}: ${a}=${A[k]} / ${b}=${B[k]}`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
