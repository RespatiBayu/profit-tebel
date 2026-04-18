-- 007_orders_buyer_info.sql
-- Add buyer identifier columns to orders so we can rank top buyers.
-- Buyer data comes from Shopee Income XLSX column A (Username Pembeli)
-- and column D (Nama Penerima). Both are nullable — existing rows stay null
-- until the user re-uploads income data.

alter table public.orders
  add column if not exists buyer_username text,
  add column if not exists buyer_name text;

-- Index to speed up aggregation for Top Buyers section.
create index if not exists orders_buyer_username_idx
  on public.orders (user_id, store_id, buyer_username)
  where buyer_username is not null;

-- Reload PostgREST schema cache so the new columns become queryable immediately.
notify pgrst, 'reload schema';
