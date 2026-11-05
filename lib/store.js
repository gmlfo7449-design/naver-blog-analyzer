// 아주 작은 저장소: Vercel에 연결한 Upstash Redis(REST)를 쓴다. 연결 전이면 enabled=false로 아무것도 저장하지 않는다.
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const enabled = !!(URL_ && TOKEN);

async function cmd(...args) {
  if (!enabled) return null;
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(String)),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`저장소 오류 ${res.status}`);
  return (await res.json()).result;
}

// 한국시간 날짜 (YYYY-MM-DD)
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 10);

module.exports = {
  enabled,
  kstDate,
  track: (id) => cmd('SADD', 'blogs:tracked', id),
  tracked: async () => (await cmd('SMEMBERS', 'blogs:tracked')) || [],
  // 그날 자정 직후의 누적 방문자 수를 저장한다
  saveTotal: (id, date, total) => cmd('HSET', `visits:${id}`, date, total),
  totals: async (id) => {
    const flat = (await cmd('HGETALL', `visits:${id}`)) || [];
    const out = {}; for (let i = 0; i < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]);
    return out;
  },
};
