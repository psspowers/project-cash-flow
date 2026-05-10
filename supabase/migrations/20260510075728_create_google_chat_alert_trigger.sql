/*
  # Google Chat Alert — DB Trigger via pg_net

  Enables the pg_net extension and creates an AFTER INSERT trigger on
  entity_comments that calls the deployed google-chat-alert Edge Function
  for every new comment. The trigger fires asynchronously (pg_net HTTP POST)
  so it never blocks the comment insert.

  1. Extensions
    - Enable pg_net (async HTTP from Postgres)

  2. New function
    - notify_google_chat_on_comment() — assembles the webhook payload and
      fires a non-blocking POST to the Edge Function

  3. New trigger
    - entity_comments_google_chat_trigger — AFTER INSERT on entity_comments
*/

-- Enable pg_net for async HTTP calls from Postgres
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Function called by the trigger
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

  PERFORM extensions.http_post(
    url     := _endpoint,
    body    := _payload::text,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;

-- Trigger: fires after each new comment row is committed
DROP TRIGGER IF EXISTS entity_comments_google_chat_trigger ON entity_comments;

CREATE TRIGGER entity_comments_google_chat_trigger
  AFTER INSERT ON entity_comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_google_chat_on_comment();
