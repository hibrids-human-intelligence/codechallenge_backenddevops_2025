CREATE TABLE IF NOT EXISTS campaign_checklist_items (
  campaign_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  label TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (campaign_id, item_id)
);

INSERT INTO campaign_checklist_items (campaign_id, item_id, label, done) VALUES
  ('demo-campaign-001', 'item-1', 'Definir mecánica de trivia', true),
  ('demo-campaign-001', 'item-2', 'Validar imágenes del reward', false),
  ('demo-campaign-001', 'item-3', 'Configurar Smart Shop pin codes', false)
ON CONFLICT (campaign_id, item_id) DO NOTHING;
