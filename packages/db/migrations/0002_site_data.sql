CREATE TABLE "site_buildings" (
	"osm_id" text PRIMARY KEY NOT NULL,
	"geom" geometry(MultiPolygon,4326) NOT NULL,
	"height_m" real NOT NULL,
	"base_m" real DEFAULT 0 NOT NULL,
	"height_source" text NOT NULL,
	"levels" real,
	"kind" text NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "site_roads" (
	"osm_id" text PRIMARY KEY NOT NULL,
	"geom" geometry(MultiLineString,4326) NOT NULL,
	"class" text NOT NULL,
	"name" text,
	"name_en" text,
	"width_m" real NOT NULL,
	"width_source" text NOT NULL,
	"lanes" integer
);
--> statement-breakpoint
CREATE TABLE "site_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"attribution" text NOT NULL,
	"license" text NOT NULL,
	"license_url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"osm_base_at" timestamp with time zone,
	"west" double precision NOT NULL,
	"south" double precision NOT NULL,
	"east" double precision NOT NULL,
	"north" double precision NOT NULL,
	"counts" jsonb NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_stations" (
	"osm_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"network" text,
	"geom" geometry(Point,4326) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "site_buildings_geom_idx" ON "site_buildings" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "site_roads_geom_idx" ON "site_roads" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "site_stations_geom_idx" ON "site_stations" USING gist ("geom");