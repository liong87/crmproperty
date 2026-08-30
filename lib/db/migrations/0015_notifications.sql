-- In-app notifications, with email as an optional second channel.
--
-- Why a table rather than just sending email: email is not configured yet, and even
-- once it is, an agent working in the CRM should not have to leave it to find out that
-- a lead was passed to them. The inbox works from the moment this ships; email starts
-- working when RESEND_API_KEY appears, with no code change.
--
-- The important column is `dedupe_key`. Every notification here is produced by a
-- SCHEDULED job, and a nightly job that cannot recognise what it already sent produces
-- one "document due" message per night per document until somebody turns it off. The
-- key is a caller-chosen string identifying the *thing being said*, not the moment of
-- saying it — "doc-due:<id>:<due-date>" changes when the deadline moves and not
-- otherwise, so a genuinely new fact notifies again and a repeat does not.

CREATE TABLE IF NOT EXISTS notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- lead-passed-on | document-due | appointment-reminder | digest | lead-assigned
  kind          varchar(40) NOT NULL,
  title         varchar(255) NOT NULL,
  body          text,
  -- Where clicking it should go, e.g. /leads/<id>. Relative, always internal.
  link          varchar(500),
  entity_type   varchar(20),
  entity_id     uuid,
  read_at       timestamptz,
  -- NULL   = email not attempted (channel off, or no address)
  -- skipped| queued | sent | failed
  email_status  varchar(20),
  email_error   text,
  /**
   * Idempotency. NULL means "always create" — a one-off, human-triggered event.
   */
  dedupe_key    varchar(200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- The inbox query: this user's unread, newest first.
CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id)
  WHERE read_at IS NULL AND deleted_at IS NULL;

-- One notification per user per thing said. Partial, so a soft-deleted one does not
-- block the same fact being raised again later.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe
  ON notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND deleted_at IS NULL;
