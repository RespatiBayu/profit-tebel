-- Hapus role 'admin' — hanya ada 'superadmin' dan 'member'
-- User yang sebelumnya role 'admin' di-downgrade ke 'member'
UPDATE profiles SET role = 'member' WHERE role = 'admin';
