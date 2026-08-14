DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cliente_avila') THEN
    GRANT USAGE ON SCHEMA operations TO cliente_avila;
    GRANT SELECT ON TABLE operations.organizations TO cliente_avila;
    GRANT SELECT ON TABLE operations.organization_web_presence TO cliente_avila;
    GRANT SELECT ON TABLE operations.organization_profiles TO cliente_avila;
    GRANT SELECT ON TABLE operations.organization_contacts TO cliente_avila;
    GRANT SELECT ON TABLE operations.organization_addresses TO cliente_avila;
    GRANT SELECT ON TABLE operations.organization_social_profiles TO cliente_avila;
  END IF;
END $$;
