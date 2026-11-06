// 저장소: Supabase(Postgres)가 연결돼 있으면 그걸 쓰고, 아니면 Upstash Redis, 둘 다 없으면 저장하지 않는다.
// 바깥에서 쓰는 함수는 두 저장소가 같다.
//   register / unregister / isRegistered  : 매일 기록할 블로그 등록
//   due(day, limit)                        : 오늘 아직 저장 안 한 등록 블로그
//   saveTotal(id, day, total)              : 그날 자정 시점 누적 방문자 수
//   totals(id)                             : { 'YYYY-MM-DD': 누적 }
//   touchBlog(id, info) / saveSnapshot(id, day, fields) : 분석 기록 (Supabase에서만)

const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 10);

// ---------- Supabase (PostgREST) ----------
const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const sbOn = !!(SB_URL && SB_KEY);

async function sb(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      // 예전 service_role 키(eyJ...로 시작하는 JWT)는 Authorization에도 넣고,
      // 새 비밀 키(sb_secret_...)는 apikey 헤더만 쓴다 (Authorization에는 JWT만 들어가야 한다)
      apikey: SB_KEY, ...(SB_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}), 'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`DB 오류 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}
const upsert = (table, rows, onConflict) => sb(`${table}?on_conflict=${onConflict}`, { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal' });
const enc = encodeURIComponent;

const supabase = {
  backend: 'supabase',
  async touchBlog(id, info = {}) {
    const row = { blog_id: id, last_analyzed_at: new Date().toISOString() };
    for (const k of ['blog_name', 'nickname', 'topic']) if (info[k]) row[k] = info[k];
    await upsert('blogs', [row], 'blog_id');
  },
  async register(id, role) {
    await supabase.touchBlog(id);
    await upsert('watchlist', [{ blog_id: id, role: role || null, active: true }], 'blog_id');
  },
  async unregister(id) { await sb(`watchlist?blog_id=eq.${enc(id)}`, { method: 'PATCH', body: { active: false }, prefer: 'return=minimal' }); },
  async isRegistered(id) { const r = await sb(`watchlist?select=active&blog_id=eq.${enc(id)}`); return !!(r && r[0] && r[0].active); },
  async due(day, limit = 1000) {
    const r = await sb(`watchlist?select=blog_id&active=is.true&or=(last_collected.is.null,last_collected.lt.${day})&order=last_collected.asc.nullsfirst&limit=${limit}`);
    return (r || []).map((x) => x.blog_id);
  },
  async countActive() { const r = await sb('watchlist?select=blog_id&active=is.true'); return (r || []).length; },
  async saveTotal(id, day, total) {
    await supabase.touchBlog(id);
    await upsert('daily_totals', [{ blog_id: id, day, midnight_total: total, collected_at: new Date().toISOString() }], 'blog_id,day');
    await sb(`watchlist?blog_id=eq.${enc(id)}`, { method: 'PATCH', body: { last_collected: day }, prefer: 'return=minimal' });
  },
  async totals(id) {
    const r = await sb(`daily_totals?select=day,midnight_total&blog_id=eq.${enc(id)}&order=day.asc&limit=400`);
    const out = {}; (r || []).forEach((x) => { out[x.day] = Number(x.midnight_total); }); return out;
  },
  async saveSnapshot(id, day, fields) {
    await supabase.touchBlog(id);
    await upsert('snapshots', [{ blog_id: id, day, taken_at: new Date().toISOString(), ...fields }], 'blog_id,day');
  },
};

// ---------- Upstash Redis (예전 방식, Supabase가 없을 때) ----------
// 접두어(Custom Prefix)에 따라 이름이 달라질 수 있어 ..._REST_API_URL / ..._REST_API_TOKEN 짝을 찾는다.
function findRedis() {
  const env = process.env;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN];
  for (const k of Object.keys(env)) {
    const m = k.match(/^(.*)REST_API_URL$/);
    if (!m) continue;
    const tok = env[`${m[1]}REST_API_TOKEN`];
    if (env[k] && tok && /^https:\/\//.test(env[k])) return [env[k], tok];
  }
  return ['', ''];
}
const [R_URL, R_TOKEN] = findRedis();
const redisOn = !!(R_URL && R_TOKEN);
async function rcmd(...args) {
  const res = await fetch(R_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${R_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(String)), signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`저장소 오류 ${res.status}`);
  return (await res.json()).result;
}
const redis = {
  backend: 'redis',
  async touchBlog() {},
  async saveSnapshot() {},
  register: (id) => rcmd('SADD', 'blogs:tracked', id),
  unregister: (id) => rcmd('SREM', 'blogs:tracked', id),
  isRegistered: async (id) => (await rcmd('SISMEMBER', 'blogs:tracked', id)) === 1,
  async due(day, limit = 300) {
    const ids = (await rcmd('SMEMBERS', 'blogs:tracked')) || [];
    const out = [];
    for (const id of ids) { if (out.length >= limit) break; if ((await rcmd('HEXISTS', `visits:${id}`, day)) !== 1) out.push(id); }
    return out;
  },
  countActive: async () => Number(await rcmd('SCARD', 'blogs:tracked')) || 0,
  saveTotal: (id, day, total) => rcmd('HSET', `visits:${id}`, day, total),
  async totals(id) {
    const flat = (await rcmd('HGETALL', `visits:${id}`)) || [];
    const out = {}; for (let i = 0; i < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]); return out;
  },
};

const impl = sbOn ? supabase : redisOn ? redis : null;
module.exports = { enabled: !!impl, backend: impl ? impl.backend : 'none', kstDate, ...(impl || {}),
  // 회원 기능에서 쓰는 Supabase 직접 접근 (Supabase가 연결된 경우만)
  supabaseOn: sbOn, SB_URL, sb, upsert };
