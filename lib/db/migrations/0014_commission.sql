-- Project commission: configurable schemes, staged release, and splits.
--
-- Three ideas, and the second is the one that matters:
--
-- 1. A SCHEME is the reusable configuration — how the developer's commission is
--    released across the transaction, and how it is split between the agency and the
--    people who earned it. Editable, so rates can change without a deploy.
--
-- 2. A deal's commission SNAPSHOTS the scheme at the moment it is created. Editing a
--    scheme later must never silently rewrite what an agent was already told they would
--    earn. Every rate and every amount is copied onto the deal's own rows.
--
-- 3. Stages are RECORDS, not a status field. A stage can be invoiced and received on
--    its own dates, independent of where the deal sits on the board, because in
--    practice the paperwork and the money do not move together.
--
-- Money is MYR integer cents. Rates are integer basis points (250 = 2.50%).

-- ---------------------------------------------------------------- schemes

CREATE TABLE IF NOT EXISTS commission_schemes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          varchar(120) NOT NULL,
  description   text,
  -- Applied to the deal value to get the gross commission. NULL means "use the
  -- project's own developer_commission_bp", which is the usual case — the rate is a
  -- property of the project, while the SPLIT is a property of the agency.
  developer_bp  integer,
  -- The split. Must total 10000 (100%); enforced below.
  agency_bp     integer NOT NULL,
  setter_bp     integer NOT NULL,
  closer_bp     integer NOT NULL,
  co_broke_bp   integer NOT NULL DEFAULT 0,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT commission_schemes_split_totals CHECK (
    agency_bp + setter_bp + closer_bp + co_broke_bp = 10000
  ),
  CONSTRAINT commission_schemes_bp_range CHECK (
    agency_bp   BETWEEN 0 AND 10000 AND
    setter_bp   BETWEEN 0 AND 10000 AND
    closer_bp   BETWEEN 0 AND 10000 AND
    co_broke_bp BETWEEN 0 AND 10000 AND
    (developer_bp IS NULL OR developer_bp BETWEEN 0 AND 10000)
  )
);

-- At most one default. A partial unique index rather than a trigger.
CREATE UNIQUE INDEX IF NOT EXISTS commission_schemes_one_default
  ON commission_schemes (is_default)
  WHERE is_default AND deleted_at IS NULL;

-- ---------------------------------------------------------------- scheme stages

CREATE TABLE IF NOT EXISTS commission_scheme_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id   uuid NOT NULL REFERENCES commission_schemes(id) ON DELETE CASCADE,
  label       varchar(120) NOT NULL,
  -- Share of the GROSS released at this stage. All stages of a scheme must total 10000;
  -- that is checked in the application, because a table constraint cannot see siblings.
  release_bp  integer NOT NULL,
  -- Days after the deal reaches this point, used to suggest an expected date. NULL
  -- means "no suggestion" rather than "immediately".
  due_days    integer,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT commission_scheme_stages_bp_range CHECK (release_bp BETWEEN 0 AND 10000)
);

CREATE INDEX IF NOT EXISTS commission_scheme_stages_scheme_idx
  ON commission_scheme_stages (scheme_id, sort_order);

-- ---------------------------------------------------------------- per-deal

CREATE TABLE IF NOT EXISTS deal_commissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  -- Which scheme it was built from. Kept for provenance only: every rate below is a
  -- snapshot, so editing the scheme afterwards changes nothing here.
  scheme_id      uuid REFERENCES commission_schemes(id) ON DELETE SET NULL,
  scheme_name    varchar(120) NOT NULL,
  -- The figure the percentage is applied to. Usually the unit's nett price, and
  -- deliberately stored rather than read from the deal, because a deal's value can be
  -- corrected later and the commission already agreed should not move with it.
  base_amount    bigint NOT NULL,
  developer_bp   integer NOT NULL,
  gross_amount   bigint NOT NULL,
  -- Who earned it. Copied from the appointment that produced the booking where there
  -- is one, and editable, because the CRM's record and the agency's agreement can
  -- legitimately differ on a co-broke or an override.
  setter_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  closer_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  co_broke_name  varchar(255),
  notes          text,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT deal_commissions_amounts CHECK (base_amount >= 0 AND gross_amount >= 0)
);

-- One live commission per deal.
CREATE UNIQUE INDEX IF NOT EXISTS deal_commissions_one_per_deal
  ON deal_commissions (deal_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS deal_commission_stages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_commission_id  uuid NOT NULL REFERENCES deal_commissions(id) ON DELETE CASCADE,
  label               varchar(120) NOT NULL,
  release_bp          integer NOT NULL,
  amount              bigint NOT NULL,
  expected_at         timestamptz,
  -- The two dates the principal actually asks about on a Monday morning.
  invoiced_at         timestamptz,
  received_at         timestamptz,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT deal_commission_stages_amount CHECK (amount >= 0),
  -- Money cannot arrive before it was billed.
  CONSTRAINT deal_commission_stages_dates CHECK (
    received_at IS NULL OR invoiced_at IS NULL OR received_at >= invoiced_at
  )
);

CREATE INDEX IF NOT EXISTS deal_commission_stages_parent_idx
  ON deal_commission_stages (deal_commission_id, sort_order);
-- Drives "what is outstanding" without scanning every stage.
CREATE INDEX IF NOT EXISTS deal_commission_stages_outstanding_idx
  ON deal_commission_stages (expected_at)
  WHERE received_at IS NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS deal_commission_splits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_commission_id  uuid NOT NULL REFERENCES deal_commissions(id) ON DELETE CASCADE,
  -- agency | setter | closer | co-broke
  party               varchar(20) NOT NULL,
  -- Null for the agency and for an external co-broke party.
  user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
  label               varchar(255) NOT NULL,
  share_bp            integer NOT NULL,
  amount              bigint NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT deal_commission_splits_party CHECK (
    party IN ('agency', 'setter', 'closer', 'co-broke')
  ),
  CONSTRAINT deal_commission_splits_amount CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS deal_commission_splits_parent_idx
  ON deal_commission_splits (deal_commission_id);
-- "What am I owed" per agent.
CREATE INDEX IF NOT EXISTS deal_commission_splits_user_idx
  ON deal_commission_splits (user_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- seed

-- A starting scheme so the feature is usable before anybody configures anything.
-- Deliberately even between setter and closer: the agency will change this, and a
-- visibly arbitrary default invites that more than a plausible-looking one does.
INSERT INTO commission_schemes (name, description, agency_bp, setter_bp, closer_bp, co_broke_bp, is_default)
SELECT
  'Agency default',
  'Starting point. Adjust the split and the release stages to match your agreement.',
  5000, 2500, 2500, 0, true
WHERE NOT EXISTS (SELECT 1 FROM commission_schemes WHERE deleted_at IS NULL);

INSERT INTO commission_scheme_stages (scheme_id, label, release_bp, due_days, sort_order)
SELECT s.id, v.label, v.release_bp, v.due_days, v.sort_order
FROM commission_schemes s
CROSS JOIN (VALUES
  ('Booking',        2000, 14,  0),
  ('SPA signed',     3000, 90,  1),
  ('Loan approved',  3000, 150, 2),
  ('Completion',     2000, 365, 3)
) AS v(label, release_bp, due_days, sort_order)
WHERE s.is_default AND s.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM commission_scheme_stages t WHERE t.scheme_id = s.id);
