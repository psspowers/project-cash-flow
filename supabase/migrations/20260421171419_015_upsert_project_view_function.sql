/*
  # Add upsert_project_view RPC function

  Creates a Postgres function that increments view_count and updates last_viewed_at
  for the (user_id, project_id) pair atomically using INSERT ... ON CONFLICT DO UPDATE.

  Called from the frontend whenever a user opens a project detail page.
*/

CREATE OR REPLACE FUNCTION upsert_project_view(p_user_id uuid, p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO project_views (user_id, project_id, view_count, last_viewed_at)
  VALUES (p_user_id, p_project_id, 1, now())
  ON CONFLICT (user_id, project_id)
  DO UPDATE SET
    view_count = project_views.view_count + 1,
    last_viewed_at = now();
END;
$$;
