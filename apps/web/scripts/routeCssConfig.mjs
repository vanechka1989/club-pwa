export const routeCssCategories = [
  { name: "profile", classPatterns: [/^profile-/, /^avatar-/, /^referral-/] },
  { name: "learning", classPatterns: [/^learning-/, /^lesson-/, /^module-/, /^modules-/, /^material-/, /^quiz-/] },
  { name: "support", classPatterns: [/^support-/] },
  { name: "billing", classPatterns: [/^payment-/, /^billing-/, /^lava-/, /^prodamus-/] },
  { name: "admin", classPatterns: [/^admin-(?!mockup-)/] },
  { name: "notification", classPatterns: [/^notification-(?!center-(?:button|badge)$)/] },
  { name: "community", classPatterns: [/^community-/, /^chat-/, /^poll-/] }
];
