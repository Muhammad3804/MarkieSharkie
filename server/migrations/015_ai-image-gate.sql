-- Up Migration
-- 015_ai-image-gate
-- [Design] srs-alignment #42 (deviation from REQ-9 / REQ-10, team decision 2026-11-23): one admin-set AI-likelihood
-- threshold (0-100 %). A photo scoring at or above it is rejected as AI-generated (file quarantined, never deleted);
-- below it is accepted. Only accepted photos are published. The owner is emailed when the venue is onboarded or
-- rejected for AI-generated photos, once per review round (venue_emails).

CREATE TABLE platform_settings (                          -- exactly one row
  id                        boolean PRIMARY KEY DEFAULT true CHECK (id),
  ai_image_reject_threshold numeric(5, 2) NOT NULL DEFAULT 70
    CHECK (ai_image_reject_threshold BETWEEN 0 AND 100),
  updated_by                uuid REFERENCES admins(user_id),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_settings DEFAULT VALUES;

-- The check result of a photo uploaded in the wizard (before the venue exists); copied to venue_images at submit.
ALTER TABLE media_uploads
  ADD COLUMN ai_score           real CHECK (ai_score BETWEEN 0 AND 1),
  ADD COLUMN detection_status   text NOT NULL DEFAULT 'pending' CHECK (detection_status IN ('pending', 'scored', 'error')),
  ADD COLUMN decision           text CHECK (decision IN ('accepted', 'rejected_ai')),
  ADD COLUMN threshold_applied  numeric(5, 2),
  ADD COLUMN checked_at         timestamptz,
  ADD COLUMN detection_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN quarantined_at     timestamptz;

ALTER TABLE venue_images
  ADD COLUMN ai_score           real CHECK (ai_score BETWEEN 0 AND 1),
  ADD COLUMN detection_status   text NOT NULL DEFAULT 'pending' CHECK (detection_status IN ('pending', 'scored', 'error')),
  ADD COLUMN decision           text
    CHECK (decision IN ('accepted', 'rejected_ai', 'flagged_for_review', 'rejected_admin')),
  ADD COLUMN threshold_applied  numeric(5, 2),
  ADD COLUMN checked_at         timestamptz,
  ADD COLUMN detection_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN decided_by         uuid REFERENCES admins(user_id),        -- set by an admin override
  ADD COLUMN decision_reason    text CHECK (char_length(decision_reason) <= 500),
  ADD COLUMN quarantined_at     timestamptz;

-- Backfill from the old status: genuine / approved -> accepted, flagged -> flagged_for_review,
-- rejected -> rejected_admin, pending stays unchecked. The latest detector score is kept.
UPDATE venue_images i
   SET decision = CASE i.verification_status
                    WHEN 'genuine' THEN 'accepted' WHEN 'approved' THEN 'accepted'
                    WHEN 'flagged' THEN 'flagged_for_review' WHEN 'rejected' THEN 'rejected_admin' END,
       ai_score = (SELECT v.ai_score FROM image_verifications v
                    WHERE v.image_id = i.image_id AND v.ai_score IS NOT NULL
                    ORDER BY v.checked_at DESC LIMIT 1),
       detection_status = CASE WHEN i.verification_status = 'pending' THEN 'pending' ELSE 'scored' END;

-- Older writers (the seed, test helpers) only set verification_status: derive the decision for them on insert.
CREATE FUNCTION venue_images_default_decision() RETURNS trigger AS $$
BEGIN
  IF NEW.decision IS NULL AND NEW.verification_status <> 'pending' THEN
    NEW.decision := CASE NEW.verification_status
                      WHEN 'genuine' THEN 'accepted' WHEN 'approved' THEN 'accepted'
                      WHEN 'flagged' THEN 'flagged_for_review' ELSE 'rejected_admin' END;
    NEW.detection_status := 'scored';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER venue_images_default_decision BEFORE INSERT ON venue_images
  FOR EACH ROW EXECUTE FUNCTION venue_images_default_decision();

ALTER TABLE venue_images ADD CONSTRAINT venue_images_published_accepted
  CHECK (NOT is_published OR decision = 'accepted');
CREATE INDEX venue_images_review_idx ON venue_images (decision)
  WHERE decision IN ('rejected_ai', 'flagged_for_review');
CREATE INDEX venue_images_detection_idx ON venue_images (detection_status)
  WHERE detection_status <> 'scored';

-- REQ-7 "owner notified": the onboarded / AI-rejected email, at most once per venue, kind and review round
-- (submission = venues.submitted_at of that round). Failures are kept for the retry job and the admin's Resend.
CREATE TABLE venue_emails (
  email_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid        NOT NULL REFERENCES venues(venue_id) ON DELETE CASCADE,
  kind       text        NOT NULL CHECK (kind IN ('onboarded', 'ai_rejected')),
  submission timestamptz NOT NULL,
  recipient  text        NOT NULL,
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts   smallint    NOT NULL DEFAULT 0,
  last_error text        CHECK (char_length(last_error) <= 300),
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_emails_once UNIQUE (venue_id, kind, submission)
);
CREATE INDEX venue_emails_retry_idx ON venue_emails (status) WHERE status <> 'sent';
CREATE TRIGGER venue_emails_updated_at BEFORE UPDATE ON venue_emails FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration
DROP TABLE venue_emails;
DROP INDEX venue_images_detection_idx;
DROP INDEX venue_images_review_idx;
ALTER TABLE venue_images DROP CONSTRAINT venue_images_published_accepted;
DROP TRIGGER venue_images_default_decision ON venue_images;
DROP FUNCTION venue_images_default_decision();
ALTER TABLE venue_images
  DROP COLUMN quarantined_at, DROP COLUMN decision_reason, DROP COLUMN decided_by, DROP COLUMN detection_attempts,
  DROP COLUMN checked_at, DROP COLUMN threshold_applied, DROP COLUMN decision, DROP COLUMN detection_status,
  DROP COLUMN ai_score;
ALTER TABLE media_uploads
  DROP COLUMN quarantined_at, DROP COLUMN detection_attempts, DROP COLUMN checked_at, DROP COLUMN threshold_applied,
  DROP COLUMN decision, DROP COLUMN detection_status, DROP COLUMN ai_score;
DROP TABLE platform_settings;
