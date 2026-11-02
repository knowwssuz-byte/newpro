import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

// Isolated PostgreSQL/WASM. Minimal external tables; no production credentials.
// PGlite has built-in SHA-256 but not pgcrypto. Only its two crypto primitives
// are supplied here; giveaway table/function SQL is executed unmodified.
export async function createGiveawayDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions;
    create function extensions.digest(value text, algorithm text) returns bytea language sql immutable as $$ select sha256(convert_to(value,'UTF8')) $$;
    create function extensions.gen_random_bytes(length integer) returns bytea language sql volatile as $$ select substring(decode(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'hex') for length) $$;
    create table public.users(id bigint primary key,first_name text,username text,balance numeric not null default 0,is_banned boolean not null default false);
    create table public.gift_library(id uuid primary key default gen_random_uuid(),title text,is_active boolean default true,image_url text default '',png_url text default '',webp_url text default '',animation_url text default '');
    grant all on public.users,public.gift_library to service_role;
  `);
  const baseline = await readFile(
    new URL("../../supabase/baselines/giveaway.sql", import.meta.url),
    "utf8",
  );
  await db.exec(
    baseline.replace(
      "create extension if not exists pgcrypto with schema extensions;",
      "",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261102163022_giveaway_experience.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return db;
}
