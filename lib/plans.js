// 요금제별 한도. 결제를 붙이면 members.plan 값이 바뀐다. 숫자는 나중에 정하면 여기만 고치면 된다.
const PLANS = {
  free: { name: '무료', me: 1, competitors: 2 },
  pro: { name: '프로', me: 1, competitors: 10 },
};
const planOf = (p) => PLANS[p] || PLANS.free;
module.exports = { PLANS, planOf };
