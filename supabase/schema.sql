-- ============================================================
-- EntrepreFrance — Supabase Bootstrap Schema
-- Generated 2026-06-05
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

CREATE TABLE journalists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  bio TEXT, photo_url TEXT, job_title TEXT NOT NULL DEFAULT 'Journalist',
  countries TEXT[] NOT NULL DEFAULT '{}', specializations TEXT[] NOT NULL DEFAULT '{}',
  style_tags TEXT[] NOT NULL DEFAULT '{}', article_structure TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
  photo_gender TEXT, photo_age TEXT, photo_ethnicity TEXT, photo_style TEXT, photo_background TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, chapo TEXT, body TEXT,
  category TEXT NOT NULL, featured_image_url TEXT, image_credit TEXT,
  image_source TEXT, image_relevance_score INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_urls TEXT[], tags TEXT[], deleted_at TIMESTAMPTZ,
  journalist_id UUID REFERENCES journalists(id) ON DELETE SET NULL
);

CREATE INDEX idx_articles_public ON articles (status, published_at DESC) WHERE status = 'published';
CREATE INDEX idx_articles_slug ON articles (slug);
CREATE INDEX idx_articles_category ON articles (category, published_at DESC);
CREATE INDEX idx_articles_journalist ON articles (journalist_id);

CREATE TABLE newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL, confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_reading_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT NOT NULL, article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (clerk_id, article_id)
);
CREATE INDEX idx_reading_history_user ON user_reading_history (clerk_id, read_at DESC);

CREATE TABLE pipeline_config (
  id INTEGER PRIMARY KEY DEFAULT 1, config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pipeline_config_one_row CHECK (id = 1)
);

CREATE TABLE pipeline_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command TEXT NOT NULL CHECK (command IN ('run_pipeline', 'scrape_now', 'post_now', 'refresh_selection', 'add_to_selection', 'clear_selection', 'generate_all', 'generate_article', 'clear_ready', 'post_article', 'mark_posted', 'update_schedule')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  payload JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), executed_at TIMESTAMPTZ
);
CREATE INDEX idx_pipeline_commands_pending ON pipeline_commands (created_at) WHERE status = 'pending';

CREATE TABLE pipeline_scrape_cache (id INTEGER PRIMARY KEY DEFAULT 1, data JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT c1 CHECK (id=1));
CREATE TABLE pipeline_selection_cache (id INTEGER PRIMARY KEY DEFAULT 1, data JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT c2 CHECK (id=1));
CREATE TABLE pipeline_ready_cache (id INTEGER PRIMARY KEY DEFAULT 1, data JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT c3 CHECK (id=1));

CREATE TABLE pipeline_logs (
  id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_error BOOLEAN NOT NULL DEFAULT FALSE, scope TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_pipeline_logs_created ON pipeline_logs (created_at DESC);

CREATE OR REPLACE FUNCTION trim_pipeline_logs() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN DELETE FROM pipeline_logs WHERE id IN (SELECT id FROM pipeline_logs ORDER BY created_at DESC OFFSET 300); RETURN NEW; END; $$;
CREATE TRIGGER trg_trim_pipeline_logs AFTER INSERT ON pipeline_logs FOR EACH ROW EXECUTE FUNCTION trim_pipeline_logs();

CREATE TABLE claude_usage (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), model TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cost NUMERIC(10,6) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE openai_usage (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), model TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cost NUMERIC(10,6) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE journalists ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reading_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_scrape_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_selection_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_ready_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE claude_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE openai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads published articles" ON articles FOR SELECT USING (status='published' AND published_at<=NOW() AND deleted_at IS NULL);
CREATE POLICY "Public reads active journalists" ON journalists FOR SELECT USING (active=TRUE);

INSERT INTO pipeline_config (id, config, updated_at) VALUES (1, '{
  "schedule": {
    "time": "07:26",
    "timezone": "Europe/Brussels"
  },
  "pipeline": {
    "articlesPerDay": 3,
    "minArticlesRequired": 3,
    "topicRepetitionWeight": 4
  },
  "posting": {
    "mode": "same-time",
    "firstPostTime": "09:00",
    "intervalMinutes": 130,
    "randomMin": 60,
    "randomMax": 180,
    "specificTimes": [
      "09:00",
      "11:10",
      "13:00"
    ]
  },
  "rssFeeds": [
    {
      "name": "BFM",
      "url": "https://www.bfmtv.com/rss/economie/",
      "enabled": true
    },
    {
      "name": "BFM",
      "url": "https://www.bfmtv.com/rss/crypto/",
      "enabled": true
    },
    {
      "name": "BFM",
      "url": "https://www.bfmtv.com/rss/economie/patrimoine/",
      "enabled": true
    },
    {
      "name": "BFM",
      "url": "https://www.bfmtv.com/rss/economie/economie-social/",
      "enabled": true
    },
    {
      "name": "BFM",
      "url": "https://www.bfmtv.com/rss/economie/economie-social/finances-publiques/",
      "enabled": true
    },
    {
      "name": "BFM",
      "url": "https://www.bfmtv.com/rss/economie/international/",
      "enabled": true
    },
    {
      "name": "BFM",
      "url": "https://www.bfmtv.com/rss/economie/entreprises/",
      "enabled": true
    },
    {
      "name": "BFM",
      "url": "https://www.bfmtv.com/rss/economie/emploi/",
      "enabled": true
    },
    {
      "name": "BFM",
      "url": "https://www.bfmtv.com/rss/economie/patrimoine/impots-fiscalite/",
      "enabled": true
    },
    {
      "name": "La Tribune",
      "url": "https://www.latribune.fr/rss/homepage",
      "enabled": true
    },
    {
      "name": "FrenchWeb",
      "url": "https://www.frenchweb.fr/feed",
      "enabled": true
    }
  ],
  "images": {
    "enabled": true,
    "relevanceThreshold": 7,
    "generationStyle": "Photojournalistic style, natural lighting, documentary aesthetic, high quality press photo",
    "strategy": "priority",
    "sources": [
      {
        "name": "pexels",
        "enabled": true,
        "weight": 25
      },
      {
        "name": "unsplash",
        "enabled": true,
        "weight": 25
      },
      {
        "name": "pixabay",
        "enabled": true,
        "weight": 25
      },
      {
        "name": "openverse",
        "enabled": true,
        "weight": 25
      }
    ]
  },
  "articleStructure": {
    "mode": "auto",
    "allowlist": [
      "pyramide-inversee",
      "flash",
      "narratif",
      "analyse",
      "qr",
      "listicle",
      "chronologie",
      "contexte-dabord",
      "mise-en-perspective",
      "briefing"
    ]
  }
}'::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET config=EXCLUDED.config, updated_at=NOW();

INSERT INTO journalists (name,slug,bio,job_title,countries,specializations,style_tags,article_structure,active,photo_gender,photo_age,photo_ethnicity,photo_style,photo_background) VALUES ('Marc Delvaux','marc-delvaux','Ancien correspondant pour plusieurs médias économiques belges et français, Marc Delvaux dirige EntrepreFrance depuis 2018. Fort de 20 ans d''expérience dans le journalisme d''affaires, il a couvert les plus grandes transformations du secteur entrepreneurial européen. Passionné par les histoires de création et d''innovation, il pilote la stratégie éditoriale du titre avec rigueur et vision.','Directeur de la rédaction',ARRAY['Belgium', 'France']::text[],ARRAY['Entrepreneuriat et Startups', 'Leadership et Développement']::text[],ARRAY['analytique', 'enquête', 'vétéran']::text[],'grand-format',TRUE,'man','50s','caucasian',NULL,NULL);
INSERT INTO journalists (name,slug,bio,job_title,countries,specializations,style_tags,article_structure,active,photo_gender,photo_age,photo_ethnicity,photo_style,photo_background) VALUES ('Isabelle Fontaine','isabelle-fontaine','Journaliste d''investigation reconnue, Isabelle Fontaine est la directrice adjointe d''EntrepreFrance. Spécialisée dans les scandales financiers et les pratiques douteuses du monde des affaires, elle a remporté plusieurs prix pour ses enquêtes approfondies. Elle supervise les sections Finance et Économie avec une exigence de vérification poussée.','Directrice adjointe de la rédaction',ARRAY['France']::text[],ARRAY['Finance et Investissement', 'Économie et Marché']::text[],ARRAY['investigation', 'enquête', 'justice']::text[],'enquête-approfondie',TRUE,'woman','45s','caucasian',NULL,NULL);
INSERT INTO journalists (name,slug,bio,job_title,countries,specializations,style_tags,article_structure,active,photo_gender,photo_age,photo_ethnicity,photo_style,photo_background) VALUES ('Thomas Benoit','thomas-benoit','Responsable de la section Technologie et Innovation, Thomas Benoit possède une double formation en informatique et journalisme. Depuis 2015, il couvre l''écosystème des startups tech français et belges, avec une expertise particulière sur l''IA et les deeptech. Son approche combine l''analyse technique et la narration accessible.','Responsable de section - Technologie et Innovation',ARRAY['France']::text[],ARRAY['Technologie et Innovation', 'Entrepreneuriat et Startups']::text[],ARRAY['analytique', 'data', 'terrain']::text[],'analyse-technique',TRUE,'man','35s','caucasian',NULL,NULL);
INSERT INTO journalists (name,slug,bio,job_title,countries,specializations,style_tags,article_structure,active,photo_gender,photo_age,photo_ethnicity,photo_style,photo_background) VALUES ('Sophie Mercier','sophie-mercier','Responsable de la section Leadership et Développement, Sophie Mercier est spécialisée dans les portraits d''entrepreneurs et les études de cas de transformation d''entreprises. Avec 12 ans d''expérience, elle excelle dans l''art de raconter les histoires humaines derrière les réussites commerciales. Elle contribue également à des contenus sur les tendances managériales.','Responsable de section - Leadership et Développement',ARRAY['Belgium']::text[],ARRAY['Leadership et Développement', 'Entrepreneuriat et Startups']::text[],ARRAY['portrait', 'terrain', 'opinion']::text[],'portrait-enquête',TRUE,'woman','40s','caucasian',NULL,NULL);
INSERT INTO journalists (name,slug,bio,job_title,countries,specializations,style_tags,article_structure,active,photo_gender,photo_age,photo_ethnicity,photo_style,photo_background) VALUES ('Jean-Luc Morel','jean-luc-morel','Journaliste senior spécialisé dans les marchés financiers et l''investissement, Jean-Luc Morel apporte une perspective macroéconomique aux analyses d''EntrepreFrance. Basé à la fois en France et en Belgique, il entretient un réseau unique de sources institutionnelles et professionnelles. Il contribue des chroniques régulières sur les tendances d''investissement.','Journaliste senior - Finance et Marchés',ARRAY['France', 'Belgium']::text[],ARRAY['Finance et Investissement', 'Économie et Marché']::text[],ARRAY['analytique', 'marchés', 'data']::text[],'chronique-analyse',TRUE,'man','55s','caucasian',NULL,NULL);
INSERT INTO journalists (name,slug,bio,job_title,countries,specializations,style_tags,article_structure,active,photo_gender,photo_age,photo_ethnicity,photo_style,photo_background) VALUES ('Amélie Durand','amelie-durand','Journaliste polyvalente basée à Bruxelles, Amélie Durand couvre l''entrepreneuriat et l''innovation avec un focus sur les PME belges et les échanges franco-belges. Dotée d''une grande curiosité et d''une excellente capacité de terrain, elle produit des reportages immersifs et des interviews captivantes. Elle collabore régulièrement avec les sections Innovation et Leadership.','Journaliste - Entrepreneuriat et Startups',ARRAY['Belgium']::text[],ARRAY['Entrepreneuriat et Startups', 'Technologie et Innovation']::text[],ARRAY['terrain', 'portrait', 'correspondant']::text[],'reportage-immersif',TRUE,'woman','32s','caucasian',NULL,NULL);
INSERT INTO journalists (name,slug,bio,job_title,countries,specializations,style_tags,article_structure,active,photo_gender,photo_age,photo_ethnicity,photo_style,photo_background) VALUES ('Nicolas Gauthier','nicolas-gauthier','Correspondant à Paris pour l''économie générale, Nicolas Gauthier apporte une expertise des politiques gouvernementales et de leurs impacts sur l''entrepreneuriat. Il cultive des relations privilégiées avec les décideurs politiques et économiques français. Ses reportages mêlent analyse institutionnelle et impacts concrets sur les entreprises.','Correspondant - Économie et Politiques',ARRAY['France']::text[],ARRAY['Économie et Marché', 'Leadership et Développement']::text[],ARRAY['institutionnel', 'enquête', 'correspondant']::text[],'analyse-contextuelle',TRUE,'man','38s','caucasian',NULL,NULL);

-- STORAGE BUCKET (manual step):
-- Supabase Dashboard → Storage → New bucket → Name: article-images → Public: YES
