export function getQuizAttemptAllowance(maxAttempts: number, resetCount: number) {
  const attemptsPerPack = Math.max(1, Math.trunc(maxAttempts));
  const packs = Math.max(0, Math.trunc(resetCount)) + 1;
  return attemptsPerPack * packs;
}
