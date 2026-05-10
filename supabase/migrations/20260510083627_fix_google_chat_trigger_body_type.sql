/*
  # Fix Google Chat trigger — correct net.http_post signature

  net.http_post expects body as jsonb, not text.
  Previous version cast to ::text which caused a silent function-not-found
  error and no HTTP requests were ever queued.
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
    body    := _payload,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;
