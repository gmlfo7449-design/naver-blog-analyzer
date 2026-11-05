// 임시 확인용 (확인 후 삭제): 인플루언서 홈(in.naver.com) 존재 여부
module.exports = async function handler(req, res) {
  const id = String(req.query.id || '').replace(/[^\w-]/g, '');
  const out = [];
  for (const u of [`https://in.naver.com/${id}`, `https://in.naver.com/${id}/contents`]) {
    try {
      const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
      const t = r.status === 200 ? await r.text() : '';
      out.push({ u, status: r.status, location: r.headers.get('location'), title: (t.match(/<title>([^<]*)<\/title>/) || [])[1] || '',
        og: (t.match(/property="og:title" content="([^"]*)"/) || [])[1] || '', blogLink: (t.match(/blog\.naver\.com\/([\w-]+)/) || [])[1] || '',
        keys: [...t.matchAll(/"(influencerId|channelId|nickName|keyword|subject|category)":"([^"]{0,40})"/g)].slice(0, 8).map((m) => m[1] + '=' + m[2]) });
    } catch (e) { out.push({ u, error: e.message }); }
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
