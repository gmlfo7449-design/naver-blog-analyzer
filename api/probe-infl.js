// 임시 확인용 (확인 후 삭제): 인플루언서 판별법 검증
// 1) in.naver.com/{블로그ID}가 200인지 (브라우저 UA)  2) 실제 인플루언서 홈 주소를 찾아 블로그 ID와 같은지
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
async function inHome(handle) {
  try {
    const r = await fetch(`https://in.naver.com/${handle}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    const t = r.status === 200 ? await r.text() : '';
    return { status: r.status, final: r.url, blog: [...new Set([...t.matchAll(/blog\.naver\.com\/([\w-]{3,30})/g)].map((m) => m[1]))].slice(0, 3), title: (t.match(/<title>([^<]*)/) || [])[1] || '' };
  } catch (e) { return { error: e.message }; }
}
module.exports = async function handler(req, res) {
  const out = { direct: {}, found: [] };
  for (const id of ['mellongi123', 'titan742']) out.direct[id] = await inHome(id);
  // 인플루언서 홈 링크를 본문에 적은 글을 검색해 실제 인플루언서 홈 주소를 모은다
  const q = new URLSearchParams({ query: 'in.naver.com 인플루언서 홈', display: '50', sort: 'sim' });
  const s = await (await fetch('https://naverapihub.apigw.ntruss.com/search/v1/blog?' + q, { headers: { 'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID, 'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET } })).json();
  const handles = new Set();
  for (const it of s.items || []) for (const m of `${it.title} ${it.description}`.matchAll(/in\.naver\.com\/([\w.-]{3,30})/g)) handles.add(m[1]);
  for (const h of [...handles].slice(0, 8)) out.found.push({ handle: h, ...(await inHome(h)) });
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
