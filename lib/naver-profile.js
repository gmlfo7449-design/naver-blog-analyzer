// 네이버 모바일 블로그 내부 주소에서 블로그 정보를 가져온다 (비공식)
async function fetchProfile(id) {
  const res = await fetch(`https://m.blog.naver.com/api/blogs/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json', Referer: `https://m.blog.naver.com/${id}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw Object.assign(new Error(`네이버 응답 ${res.status}`), { status: res.status });
  const body = await res.json();
  if (!body || body.isSuccess === false) throw new Error('네이버가 빈 응답을 보냈어요.');
  return body.result || {};
}
module.exports = { fetchProfile };
