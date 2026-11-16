CREATE TABLE photo_files (id TEXT PRIMARY KEY, collect_after TEXT NOT NULL, claimed INTEGER NOT NULL DEFAULT 0 CHECK(claimed IN(0,1)));
CREATE INDEX photo_files_collection ON photo_files(collect_after,id);
ALTER TABLE products ADD COLUMN photo_id TEXT REFERENCES photo_files(id);
ALTER TABLE clients ADD COLUMN photo_id TEXT REFERENCES photo_files(id);
ALTER TABLE user ADD COLUMN photo_id TEXT REFERENCES photo_files(id);
CREATE INDEX product_photo ON products(photo_id) WHERE photo_id IS NOT NULL;
CREATE INDEX client_photo ON clients(photo_id) WHERE photo_id IS NOT NULL;
CREATE INDEX user_photo ON user(photo_id) WHERE photo_id IS NOT NULL;
