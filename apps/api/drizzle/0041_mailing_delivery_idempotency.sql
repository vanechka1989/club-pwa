WITH recipient_counts AS (
  SELECT
    recipient.mailing_id,
    COUNT(*)::integer AS delivery_count,
    (COUNT(*) FILTER (WHERE recipient.status = 'sent'))::integer AS sent_count,
    (COUNT(*) FILTER (WHERE recipient.status = 'failed'))::integer AS failed_count,
    (COUNT(*) FILTER (WHERE recipient.status LIKE 'skipped_%'))::integer AS skipped_count
  FROM "admin_mailing_recipients" AS recipient
  GROUP BY recipient.mailing_id
)
UPDATE "admin_mailings" AS mailing
SET
  "delivery_count" = recipient_counts.delivery_count,
  "sent_count" = recipient_counts.sent_count,
  "failed_count" = recipient_counts.failed_count,
  "skipped_count" = recipient_counts.skipped_count,
  "updated_at" = NOW()
FROM recipient_counts
WHERE mailing.id = recipient_counts.mailing_id;
