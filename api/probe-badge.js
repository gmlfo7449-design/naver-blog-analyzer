// 임시 확인용 (확인 후 삭제): '네이버 메이트 선정' 후기를 쓴 블로그를 검색해 메이트 여부 확인
module.exports = async function handler(req, res) {
  const q = new URLSearchParams({ query: '"네이버 메이트" 선정 11월', display: '40', sort: 'date' });
  const s = await (await fetch('https://naverapihub.apigw.ntruss.com/search/v1/blog?' + q, { headers: { 'X-NCP-APIGW-API-KEY-ID': process.env.NAVER_CLIENT_ID, 'X-NCP-APIGW-API-KEY': process.env.NAVER_CLIENT_SECRET } })).json();
  const ids = [...new Set((s.items || []).map((it) => (String(it.bloggerlink || it.link).match(/blog\.naver\.com\/([\w-]+)/) || [])[1]).filter(Boolean))].slice(0, 25);
  const checks = await Promise.all(ids.map(async (id) => { try { const r = (await (await fetch(`https://m.blog.naver.com/api/blogs/${id}`, { headers: { Accept: 'application/json', Referer: `https://m.blog.naver.com/${id}` } })).json()).result || {};
    return { id, mate: r.isNaverMateBlog, mateInfo: r.mateInfo, cit: r.mateCitations && r.mateCitations.currentMonthCount, dir: r.blogDirectoryName }; } catch (e) { return { id, error: e.message }; } }));
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify({ found: ids.length, mates: checks.filter((c) => c.mate), sample: checks.slice(0, 6) }));
};
