-- Add duration column to holidays table
ALTER TABLE holidays 
ADD COLUMN IF NOT EXISTS duration TEXT CHECK (duration IN ('FULL', 'MORNING', 'AFTERNOON')) DEFAULT 'FULL';

-- Comment on column
COMMENT ON COLUMN holidays.duration IS 'Duration of the holiday: FULL (all day), MORNING (08:00-12:00), or AFTERNOON (13:30-17:30)';
