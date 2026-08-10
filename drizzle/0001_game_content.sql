CREATE TABLE `card_sets` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `cards_pdf_url` text NOT NULL,
  `released_at` integer,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cards` (
  `id` text PRIMARY KEY NOT NULL,
  `set_id` text NOT NULL REFERENCES `card_sets`(`id`),
  `legacy_page` integer,
  `name` text NOT NULL,
  `card_type` text NOT NULL,
  `faction` text,
  `cost` integer DEFAULT 0 NOT NULL,
  `attack` integer,
  `health` integer,
  `rules_text` text DEFAULT '' NOT NULL,
  `tags` text DEFAULT '[]' NOT NULL,
  `effects` text DEFAULT '[]' NOT NULL,
  `art_page` integer,
  `is_image_card` integer DEFAULT 0 NOT NULL,
  `is_published` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_set_legacy_page_unique` ON `cards` (`set_id`, `legacy_page`);
--> statement-breakpoint
CREATE TABLE `heroes` (
  `id` text PRIMARY KEY NOT NULL,
  `set_id` text NOT NULL REFERENCES `card_sets`(`id`),
  `card_id` text REFERENCES `cards`(`id`),
  `name` text NOT NULL,
  `faction` text NOT NULL,
  `presentation` text DEFAULT '{}' NOT NULL,
  `progression` text DEFAULT '[]' NOT NULL,
  `abilities` text DEFAULT '[]' NOT NULL,
  `is_published` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decks` (
  `id` text PRIMARY KEY NOT NULL,
  `set_id` text NOT NULL REFERENCES `card_sets`(`id`),
  `hero_id` text NOT NULL REFERENCES `heroes`(`id`),
  `name` text NOT NULL,
  `format` text DEFAULT 'standard' NOT NULL,
  `is_starter` integer DEFAULT 0 NOT NULL,
  `is_published` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deck_cards` (
  `deck_id` text NOT NULL REFERENCES `decks`(`id`),
  `card_id` text NOT NULL REFERENCES `cards`(`id`),
  `quantity` integer NOT NULL,
  `zone` text DEFAULT 'main' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deck_cards_deck_card_zone_unique` ON `deck_cards` (`deck_id`, `card_id`, `zone`);
--> statement-breakpoint
CREATE TABLE `content_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `summary` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` integer NOT NULL
);
