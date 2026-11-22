-- Up Migration
-- 007_review-reports
-- [SRS] REQ-44 "Admin views flagged reviews, removes rule-breaking ones" (EUC-34), srs-alignment #36.
--   * review_reports: a logged-in user reports a review, at most once per review (UNIQUE). Reporting sets the ERD's
--     reviews.is_flagged; the admin resolves the reports by hiding, restoring, keeping or deleting the review.
--   * reviews.removal_reason: why the admin hid it (removed_at / removed_by already exist, srs-alignment #10).

CREATE TABLE review_reports (
  report_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES users(user_id),
  reason      text NOT NULL CHECK (reason IN ('spam', 'offensive', 'fake', 'off_topic', 'personal_info', 'other')),
  note        text CHECK (char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT review_reports_one_per_user UNIQUE (review_id, reporter_id)
);
CREATE INDEX review_reports_open_idx ON review_reports (review_id) WHERE resolved_at IS NULL;

ALTER TABLE reviews ADD COLUMN removal_reason text;
CREATE INDEX reviews_flagged_idx ON reviews (created_at) WHERE is_flagged;

-- Down Migration
DROP INDEX reviews_flagged_idx;
ALTER TABLE reviews DROP COLUMN removal_reason;
DROP TABLE review_reports;
