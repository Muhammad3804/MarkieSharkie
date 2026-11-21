-- Dev bootstrap for MarkieSharkie.
-- The postgres image runs this ONLY on first start, when the data volume is empty.
-- To run it again: docker compose down -v && docker compose up -d   (this deletes all local data)
-- Runs as the superuser because CREATE EXTENSION needs one; the app connects as markie_app.
-- Tables are NOT created here; migrations do that.

CREATE ROLE markie_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'markie_dev_password';

CREATE DATABASE markiesharkie OWNER markie_app;
CREATE DATABASE markiesharkie_test OWNER markie_app;

\connect markiesharkie
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;

\connect markiesharkie_test
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
