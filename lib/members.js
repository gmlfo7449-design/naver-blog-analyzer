// 회원별 블로그 등록. 회원이 등록한 블로그는 매일 기록 목록(watchlist)에도 올리고,
// 아무 회원도 등록하지 않게 되면 매일 기록에서 뺀다 (쌓인 기록은 지우지 않는다).
const store = require('./store');
const { planOf } = require('./plans');

const enc = encodeURIComponent;

async function ensureMember(user) {
  await store.upsert('members', [{ user_id: user.id, email: user.email }], 'user_id');
  const r = await store.sb(`members?select=plan&user_id=eq.${user.id}`);
  return (r && r[0] && r[0].plan) || 'free';
}

async function listBlogs(userId) {
  const rows = (await store.sb(`member_blogs?select=blog_id,role,created_at&user_id=eq.${userId}&order=created_at.asc`)) || [];
  if (!rows.length) return [];
  const ids = rows.map((r) => `"${r.blog_id}"`).join(',');
  const names = (await store.sb(`blogs?select=blog_id,blog_name,nickname&blog_id=in.(${enc(ids)})`)) || [];
  const byId = new Map(names.map((n) => [n.blog_id, n]));
  return rows.map((r) => ({ blogId: r.blog_id, role: r.role, name: (byId.get(r.blog_id) || {}).blog_name || '' }));
}

async function summary(user) {
  const plan = await ensureMember(user);
  const blogs = await listBlogs(user.id);
  const lim = planOf(plan);
  return { user: { email: user.email }, plan, planName: lim.name, limits: { me: lim.me, competitors: lim.competitors }, blogs };
}

// role: 'me' 또는 'competitor'. 내 블로그는 1개라서 새로 넣으면 이전 내 블로그를 경쟁 블로그로 돌리지 않고 바꾼다.
async function addBlog(user, blogId, role) {
  const plan = await ensureMember(user);
  const lim = planOf(plan);
  const blogs = await listBlogs(user.id);
  const exists = blogs.find((b) => b.blogId === blogId);
  if (role === 'me') {
    for (const b of blogs.filter((x) => x.role === 'me' && x.blogId !== blogId)) await removeBlog(user, b.blogId);
  } else if (!exists || exists.role !== 'competitor') {
    const count = blogs.filter((b) => b.role === 'competitor' && b.blogId !== blogId).length;
    if (count >= lim.competitors) {
      const e = new Error(`${lim.name} 요금제는 경쟁 블로그를 ${lim.competitors}개까지 등록할 수 있어요. 다른 경쟁 블로그를 빼고 다시 시도해 주세요.`);
      e.status = 403; e.code = 'limit'; throw e;
    }
  }
  await store.register(blogId, role === 'me' ? 'me' : null); // blogs 행 + 매일 기록 켜기
  await store.upsert('member_blogs', [{ user_id: user.id, blog_id: blogId, role }], 'user_id,blog_id');
  return summary(user);
}

async function removeBlog(user, blogId) {
  await store.sb(`member_blogs?user_id=eq.${user.id}&blog_id=eq.${enc(blogId)}`, { method: 'DELETE', prefer: 'return=minimal' });
  const others = (await store.sb(`member_blogs?select=user_id&blog_id=eq.${enc(blogId)}&limit=1`)) || [];
  if (!others.length) await store.unregister(blogId);
  return summary(user);
}

module.exports = { summary, addBlog, removeBlog };
