export function formatReplyNotificationText({
  senderName,
  topicTitle,
  body
}: {
  senderName: string;
  topicTitle: string;
  body: string;
}) {
  const preview = body.length > 120 ? `${body.slice(0, 117)}...` : body;
  return `Вам ответили в чате "${topicTitle}".\n${senderName}: ${preview}`;
}
