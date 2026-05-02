# Demo Account Setup Guide

## Quickest Option: Add Demo Email to Admin List

Add demo email to `ADMIN_EMAILS` in `.env.local`:

```env
ADMIN_EMAILS=demo@profit-tebel.com
```

Then create the account via UI (see below). Admin users get **instant full access** without payment.

---

## Create Demo Account via UI

1. Go to the login page: `http://localhost:3000/login`
2. Click **Daftar** (Register) tab
3. Enter demo credentials:
   - **Email:** `demo@profit-tebel.com`
   - **Password:** `Demo123456!`
4. Click "Daftar"
5. Check email for verification link (if enabled)
6. Login with demo credentials

**If added to ADMIN_EMAILS:** Instant full access ✅

---

## Alternative: Create via Supabase Dashboard

1. Go to Supabase > Authentication > Users
2. Click "Invite" button
3. Enter: `demo@profit-tebel.com`
4. Set password to: `Demo123456!`
5. Check "Auto confirm user"
6. Click "Invite"

Profile will auto-create via database trigger.

---

## Demo Account Credentials

```
Email:    demo@profit-tebel.com
Password: Demo123456!
```

---

## What You Get

- ✅ Full dashboard access (if in ADMIN_EMAILS)
- ✅ Can upload income/ads files
- ✅ Can view analytics
- ✅ No payment required
- ✅ Empty slate to start fresh with test data

---

## Cleanup

To remove demo account:

```sql
DELETE FROM profiles WHERE email = 'demo@profit-tebel.com';
-- All related data will cascade delete
```
