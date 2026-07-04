# Gift system optimization update

This update fixes gift creation and case opening readiness.

## Supabase SQL
Run `sql/gift-system-fix.sql` in Supabase SQL Editor.

## Storage
Create this public bucket if it does not exist:

- `gift-assets` — Public ON

## Vercel env
Add:

```env
SUPABASE_GIFT_ASSETS_BUCKET=gift-assets
```

## Changed files

- `app/webapp/WebAppClient.jsx`
- `app/globals.css`
- `app/api/open-case/route.js`
- `app/api/admin/gift/route.js`
- `app/api/admin/upload-gift-asset/route.js`
- `sql/gift-system-fix.sql`
