export function resolveLavaCheckoutBuyerEmail(input: {
  isOwner: boolean;
  userEmail: string | null;
  testBuyerEmail: string | null;
}) {
  return input.isOwner && input.testBuyerEmail ? input.testBuyerEmail : input.userEmail;
}
