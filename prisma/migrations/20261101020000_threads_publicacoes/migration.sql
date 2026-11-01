ALTER TABLE operations.social_destinations DROP CONSTRAINT social_destinations_canal_check;
ALTER TABLE operations.social_destinations ADD CONSTRAINT social_destinations_canal_check
  CHECK(canal IN ('instagram','facebook','threads','reddit','tiktok','whatsapp'));
