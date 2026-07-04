# Restore old design + add Gift Catalog / Case Rewards

Bu update eski casino/home/case/inventory dizaynni qaytaradi va ustiga yangi Gift Catalog tizimini qo‘shadi.

## Muhim o‘zgarishlar

- Eski Home dizayn saqlandi.
- Case cardlar Home’da qoladi.
- Games bo‘limi hozircha bo‘sh turadi.
- Profile ichida Admin Panel tugmasi qoladi.
- Admin panel eski bo‘limlari qaytarildi.
- Yangi bo‘limlar qo‘shildi:
  - Gift Catalog
  - Case Rewards
- Gift Catalog’da Telegram giftlar qidiruvsiz ham ketma-ket grid bo‘lib chiqadi.
- Case Rewards’da admin 2 tur tanlaydi:
  - Moneta
  - NFT Gift
- NFT Gift tanlanganda catalogdagi barcha giftlar chiqadi, admin faqat chance va stock kiritadi.
- Oldingi legacy `gifts` jadvali ham fallback sifatida ishlaydi.

## Supabase SQL

Avval Supabase SQL Editor’da ishlating:

```sql
-- sql/gift-catalog-system.sql ichidagi kodni to‘liq ishlating
```

## Storage bucket

Supabase Storage’da public bucket oching:

```txt
telegram-gift-assets
```

## Vercel env

Qo‘shing:

```env
SUPABASE_TELEGRAM_GIFT_BUCKET=telegram-gift-assets
```

Oldingi envlar qoladi.

## Ishlatish

1. Web App → Profile → Admin Panel
2. Gift Catalog → Sync Telegram Gifts
3. Case Rewards → Case tanlash
4. Moneta yoki NFT Gift tanlash
5. Chance % va Stock yozish
6. Saqlash

