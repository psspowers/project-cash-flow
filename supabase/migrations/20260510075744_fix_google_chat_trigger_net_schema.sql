/*
  # Fix Google Chat trigger — use correct net.http_post schema

  pg_net functions live in the `net` schema, not `extensions`.
  This replaces the trigger function with the corrected call.
*/

CREATE OR REPLACE FUNCTION notify_google_chat_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _payload  jsonb;
  _endpoint text := 'https://pojwenjrwbdksoqciyfa.supabase.co/functions/v1/google-chat-alert';
BEGIN
  _payload := jsonb_build_object('record', row_to_json(NEW));

  PERFORM net.http_post(
    url     := _endpoint,
    body    := _payload::text,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;
