ALTER TABLE ai_core.ai_core_approvals
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
