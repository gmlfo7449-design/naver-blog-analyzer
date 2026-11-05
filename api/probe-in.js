// 임시 확인용 (확인 후 삭제): 인플루언서 둘러보기 화면에서 실제 인플루언서 홈 ID와 데이터 주소 찾기
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
module.exports = async function handler(req, res) {
  const html = await (await fetch('https://in.naver.com/discover', { headers: { 'User-Agent': UA } })).text();
  const uniq = (re, n = 30) => [...new Set([...html.matchAll(re)].map((m) => m[1]))].slice(0, n);
  const out = {
    apiHosts: uniq(/(https?:\/\/[a-z0-9.-]*(?:api|apis)[a-z0-9.-]*\.naver\.com[^"'\s\\]{0,80})/g, 40),
    scriptSrc: uniq(/<script[^>]*src=["']([^"']+)["']/g, 20),
    homes: uniq(/in\.naver\.com\/([a-z0-9_.-]{3,30})(?=["'/?\\])/gi, 40).filter((h) => !/^(intro|discover|static|search|keyword|my|notice)$/i.test(h)),
    jsonKeys: uniq(/"((?:influencer|creator|channel|blog)[A-Za-z]{0,20})":/g, 40),
    sample: (html.match(/.{0,200}"blogId".{0,200}/) || [''])[0],
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(out));
};
