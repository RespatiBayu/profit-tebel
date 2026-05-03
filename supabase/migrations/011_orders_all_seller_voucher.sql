-- Add seller_voucher column for order-level seller-borne voucher/discount
-- (Voucher Ditanggung Penjual + Paket Diskon Diskon dari Penjual from Order.all)
ALTER TABLE orders_all
  ADD COLUMN IF NOT EXISTS seller_voucher NUMERIC(12,2) DEFAULT 0;
