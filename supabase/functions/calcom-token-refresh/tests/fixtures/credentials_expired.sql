-- Fixture: Cal.com credential with expired token (placeholder)
-- Replace values as needed before running integration tests.
INSERT INTO core.business_credentials (
  id,
  account_id,
  name,
  api_name,
  access_token,
  refresh_token,
  expires_at,
  client_id,
  client_secret,
  external_status,
  is_deleted
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Cal.com - Test',
  'CAL_COM',
  'enc_access_token_placeholder',
  'enc_refresh_token_placeholder',
  now() - interval '1 hour',
  'cal_client_id',
  'cal_client_secret',
  'active',
  false
);
