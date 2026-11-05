// 네이버 블로그 RSS 프록시 + 파서
// - 브라우저에서 rss.blog.naver.com을 직접 호출하면 CORS 헤더가 없어 막히므로 서버에서 대신 가져온다.
// - Vercel 서버리스 함수(/api/rss)와 로컬 server.js 양쪽에서 같은 코드를 쓴다.

const ID_RE = /^[a-zA-Z0-9_-]{1,40}$/;
const cache = new Map(); // 로컬/웜 인스턴스용 간단 캐시
const TTL_MS = 10 * 60 * 1000;

function decode(str = '') {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .trim();
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) : '';
}

// http 이미지 → https. *.phinf.naver.net은 https 인증서가 없어 *-phinf.pstatic.net으로 바꾼다.
const toHttps = (u) => u
  .replace(/^http:\/\/([a-z0-9]+)\.phinf\.naver\.net/i, 'https://$1-phinf.pstatic.net')
  .replace(/^http:/, 'https:');

function parseRss(xml) {
  const head = xml.split('<item>')[0];
  const channel = {
    title: pick(head, 'title'),
    link: pick(head, 'link').replace(/\?.*$/, ''),
    description: pick(head, 'description'),
    image: (head.match(/<image>[\s\S]*?<url>([\s\S]*?)<\/url>/) || [])[1] ? decode(head.match(/<image>[\s\S]*?<url>([\s\S]*?)<\/url>/)[1]) : '',
  };
  if (channel.image) channel.image = toHttps(channel.image);
  const items = xml.split('<item>').slice(1).map((raw) => {
    const block = raw.split('</item>')[0];
    const descHtml = pick(block, 'description');
    const img = ((descHtml.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '');
    const text = descHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const tagStr = pick(block, 'tag');
    return {
      title: pick(block, 'title'),
      link: (pick(block, 'guid') || pick(block, 'link')).replace(/\?.*$/, ''),
      category: pick(block, 'category') || '(미분류)',
      pubDate: new Date(pick(block, 'pubDate')).toISOString(),
      tags: tagStr ? tagStr.split(',').map((t) => t.trim()).filter(Boolean) : [],
      summary: text,
      thumbnail: toHttps(img),
    };
  });
  return { channel, items };
}

async function getBlog(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const res = await fetch(`https://rss.blog.naver.com/${id}.xml`, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (blog-analyzer)' },
  });
  if (!res.ok) throw Object.assign(new Error(`네이버 응답 오류 (${res.status})`), { status: 502 });
  const xml = await res.text();
  const data = parseRss(xml);
  if (!data.channel.title && data.items.length === 0) {
    throw Object.assign(new Error('블로그를 찾을 수 없거나 RSS가 비공개입니다.'), { status: 404 });
  }
  data.blogId = id;
  data.fetchedAt = new Date().toISOString();
  cache.set(id, { at: Date.now(), data });
  return data;
}

module.exports = async function handler(req, res) {
  const id = String((req.query && req.query.id) || '').trim();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!ID_RE.test(id)) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: '블로그 ID 형식이 올바르지 않습니다.' }));
  }
  try {
    const data = await getBlog(id);
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = e.status || 500;
    res.end(JSON.stringify({ error: e.message || '알 수 없는 오류' }));
  }
};

module.exports.parseRss = parseRss;
