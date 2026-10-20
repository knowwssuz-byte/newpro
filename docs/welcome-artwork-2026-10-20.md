# Welcome artwork update — 20 October 2026

## Scope

The existing three-step Gift Myst welcome now uses original generated 3D artwork, matching feature cards, Telegram Stars badge, labelled step navigation, and a previous-step action. The app still shows the welcome on every fresh entry. Business logic and other screens are unchanged.

## Assets

Generated using the built-in image generation tool, with transparent backgrounds. Compressed to 768 × 768 WebP with alpha; original SVG assets remain available in the repository history and current public directory.

- `public/onboarding/welcome-gift-v2.webp`
- `public/onboarding/welcome-case-v2.webp`
- `public/onboarding/welcome-inventory-v2.webp`

The authentic Telegram Stars icon is reused through `StarIcon`, rather than baked into the generated artwork.

## Accessibility and layout

Keyboard navigation, Escape and Skip dismissals, focus containment/restoration, labelled 44px step controls, safe-area insets, scrolling on short displays, and reduced-motion support are retained or improved.

## Generation prompts

### Image 1

Use case: stylized-concept. Asset type: production hero illustration for the existing Gift Myst mobile app welcome dialog. Create ONE exquisite premium 3D illustration, square composition, genuinely transparent background. Main subject: a substantial softly rounded deep violet gift box, satin lavender ribbon and a sculptural flowing bow, lid hovering open at a slight angle, soft warm champagne light emerging from inside, two small amethyst crystal collectibles hovering near it. Refined product-render quality, tactile satin and frosted glass materials, physically believable reflections, polished bevels, cinematic lavender rim light and warm highlights. Three-quarter view; coherent strong silhouette, hero fills central 78 percent, generous padding on all sides, object entirely visible. Palette violet #8657fb, lilac #c491ff, champagne gold accents. Luxury and elegant, clean not cluttered; useful as a single cutout on a dark #0b0a20 app background. No text, no lettering, no UI, no border, no background scene, no platform or ground, no watermark, no star icons, no generic sparkles. Render rich detail and intentional art direction.

### Image 2

Use case: stylized-concept. Asset type: one production hero cutout for the CASES step of the Gift Myst dark-violet mobile welcome screen. Render ONE luxurious open collectible case, deep amethyst hard shell with rounded corners, precise champagne-gold edges and latches, velvet-lined interior, lid lifted behind the case, a large luminous faceted violet gemstone floating above the interior. Two small clear lilac crystals off to the sides. Exquisite physically believable 3D product render, polished beveled surfaces, satin materials, restrained lavender rim lighting, soft warm inner glow. Three-quarter view, centered square composition, entire object fits in central 78 percent with generous margins. Transparent background, no ground plane. Palette #8657fb, #c491ff, champagne gold; readable silhouette on near-black #0b0a20 background. One focused composition, editorial luxury not noisy cartoon. No writing, no UI, no watermark, no logos, no star or currency icons, no numbers.

### Image 3

Use case: stylized-concept. Asset type: one production hero cutout for the INVENTORY step of the Gift Myst dark-violet mobile welcome screen. Render a beautifully curated collection of THREE individual floating frosted-lilac glass collectible display cards arranged in a shallow fan, main large rounded rectangular card in front with a sculptural small purple gift box and satin champagne ribbon centered inside, rear left smaller card with an amethyst gemstone, rear right smaller card with a faceted lilac glass heart. These are physical glass display objects, no text or UI. Gallery-quality 3D product illustration, dimensional beveled edges, subtle champagne metal corner accents, controlled refraction and luxurious satin highlights, lavender rim lights. Entire composition centrally arranged within 78 percent of square canvas, generous clear margins, no crops, transparent background and no ground. Deep violet #8657fb and lilac #c491ff, touch of gold, designed to sit over #0b0a20. No lettering, no numbers, no labels, no logos, no watermark, no star or currency icons. Sophisticated, cohesive, uncluttered, physically plausible.

## Verification

- All 12 existing repository tests passed after updating the artwork expectations to WebP.
- The welcome component passed ESLint. The complete production build passed on 20 October 2026.
- Chromium checked all three slides at 320×568, 360×640, 390×844, 430×932, 844×390 and 1440×900. Images loaded, dialogs stayed within the viewport, and no horizontal overflow occurred. Short screens can scroll vertically.
- Previous/next, direct step navigation, completion, Skip, Escape, focus containment/restoration and reduced motion passed. No browser page errors were recorded.
- All three 390px screenshots were visually reviewed. A temporary route rendered the actual component with the app's global styles. External services were stubbed; this does not validate a live Telegram session.

## Rollback procedure

Revert the commit containing this update to restore the preceding component and CSS. No database migrations or environment-variable changes are involved.
