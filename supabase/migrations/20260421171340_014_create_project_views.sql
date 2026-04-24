/*
  # Create project_views table

  Tracks how many times each authenticated user opens a project detail page.
  Used to sort projects by personal usage frequency (most-opened first).

  1. New Tables
    - `project_views`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to auth.users)
      - `project_id` (uuid, FK to projects)
      - `view_count` (int, incremented on each visit)
      - `last_viewed_at` (timestamptz, updated on each visit)
      - unique constraint on (user_id, project_id)

  2. Security
    - RLS enabled
    - Users can only read/upsert their own rows
*/

CREATE TABLE IF NOT EXISTS project_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  view_count integer NOT NULL DEFAULT 1,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);

ALTER TABLE project_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own project views"
  ON project_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project views"
  ON project_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own project views"
  ON project_views FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS project_views_user_id_idx ON project_views (user_id);
CREATE INDEX IF NOT EXISTS project_views_project_id_idx ON project_views (project_id);
