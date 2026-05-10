/*
  # Add entity_comments table — Internal ERP Chat Engine (Phase 1)

  ## Summary
  Creates a universal comment/chat thread table that can be attached to any
  entity in the system (purchase_orders, vendor_invoices, projects, etc.)
  via an (entity_type, entity_id) composite key.

  ## New Tables

  ### entity_comments
  | Column       | Type        | Notes                                      |
  |--------------|-------------|--------------------------------------------|
  | id           | uuid PK      | Auto-generated                             |
  | entity_type  | text NOT NULL| e.g. 'purchase_order', 'vendor_invoice'    |
  | entity_id    | uuid NOT NULL| FK target (not enforced — poly relation)   |
  | user_id      | uuid NOT NULL| References auth.users                      |
  | content      | text NOT NULL| Message body, trimmed, min 1 char          |
  | created_at   | timestamptz  | DEFAULT now()                              |

  ## Indexes
  - (entity_type, entity_id, created_at) for efficient thread fetching

  ## Security
  - RLS enabled
  - authenticated users can INSERT their own comments
  - authenticated users can SELECT all comments (ERP internal tool — all staff
    have visibility into threads they participate in)
  - No UPDATE or DELETE — immutable audit trail

  ## Realtime
  The DBA has already added this table to the Supabase Realtime publication.
  This migration records the schema-as-code; Realtime config is a platform
  setting and does not appear in SQL migrations.
*/

CREATE TABLE IF NOT EXISTS entity_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text        NOT NULL,
  entity_id    uuid        NOT NULL,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content      text        NOT NULL CHECK (char_length(trim(content)) > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_comments_thread_idx
  ON entity_comments (entity_type, entity_id, created_at ASC);

ALTER TABLE entity_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all comments"
  ON entity_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own comments"
  ON entity_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
