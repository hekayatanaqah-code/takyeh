export const photographyPolicy = Object.freeze({
  introBookings: 3,
  cancellationThreshold: 3,
  cancellationWindowDays: 30,
  qualityThreshold: 3.5,
});

export type PhotographyPolicy = { introBookings: number; cancellationThreshold: number; cancellationWindowDays: number; qualityThreshold: number };
export function qualityEligible(p: { status: string; ratingSum: number; ratingCount: number }, policy: PhotographyPolicy = photographyPolicy) {
  return p.status === "approved" && (p.ratingCount === 0 || p.ratingSum >= p.ratingCount * policy.qualityThreshold);
}
export function rotationWeight(confirmedAssignments: number, cancellations: number, policy: PhotographyPolicy = photographyPolicy) {
  // Temporary introduction boost; repeated declines override that boost.
  return cancellations >= policy.cancellationThreshold ? 1
    : confirmedAssignments < policy.introBookings ? 4 : 2;
}
export function roundRobinTurn<T extends { id: number; rotationCredit: number; weight: number; lastAssignedAt: Date | null }>(candidates: T[]) {
  if (!candidates.length) return null;
  const totalWeight = candidates.reduce((n, p) => n + p.weight, 0);
  const credits = candidates.map(p => ({ ...p, nextCredit: p.rotationCredit + p.weight }));
  credits.sort((a, b) => b.nextCredit - a.nextCredit
    || +(a.lastAssignedAt ?? new Date(0)) - +(b.lastAssignedAt ?? new Date(0)) || a.id - b.id);
  const winner = credits[0];
  return {
    winner,
    credits: credits.map(p => ({ id: p.id, credit: p.nextCredit - (p.id === winner.id ? totalWeight : 0) })),
  };
}
