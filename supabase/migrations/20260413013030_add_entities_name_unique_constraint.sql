
/*
  # Add unique constraint on entities.name

  Adds a unique constraint to the entities table on the name column,
  enabling safe upserts with ON CONFLICT (name) DO NOTHING.
*/

ALTER TABLE entities ADD CONSTRAINT entities_name_unique UNIQUE (name);
