-- Fix: Set is_active = true for customer and internal templates that were inserted without it
UPDATE message_templates SET is_active = true WHERE is_active IS NULL OR is_active = false;
