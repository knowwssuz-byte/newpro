-- NEW PRO: idempotent, reversible-in-principle 6-case content seed.
-- All cases remain OFF until real gift ownership and reward liability are checked.
-- Stock=0 for physical collectibles: a library listing is NOT proof of ownership.
DO $seed$
DECLARE
  v_case jsonb;
  v_gift jsonb;
  v_case_id uuid;
  v_library public.gift_library%rowtype;
  v_image text;
  v_balance numeric;
  v_stock integer;
BEGIN
  FOR v_case IN SELECT value FROM jsonb_array_elements('[{"slug":"starter","title":"Starter Case","description":"Yangi boshlovchilar uchun ko‘k rangli, Stars mukofotli case.","price":10,"color":"#38d9ff","badge":"START","badgeColor":"#0ea5e9","reward":[4,6,9,12,25],"nft":"Input Key #45302","rarities":["common","common","rare","epic","legendary"],"odds":0.1,"gifts":[{"kind":"balance","title":"4 Stars","value":4,"odds":40,"rarity":"common"},{"kind":"balance","title":"6 Stars","value":6,"odds":29,"rarity":"common"},{"kind":"balance","title":"9 Stars","value":9,"odds":17,"rarity":"rare"},{"kind":"balance","title":"12 Stars","value":12,"odds":9,"rarity":"epic"},{"kind":"balance","title":"25 Stars","value":25,"odds":4.9,"rarity":"legendary"},{"kind":"gift","title":"Input Key #45302","odds":0.1,"rarity":"legendary"}]},{"slug":"neon","title":"Neon Case","description":"Neon pushti-kiber mavzu: Stars mukofotlari va Surge Board collectible.","price":50,"color":"#f45ed4","badge":"NEON","badgeColor":"#a855f7","reward":[19,30,45,70,150],"nft":"Surge Board #124","rarities":["common","common","rare","epic","legendary"],"odds":0.1,"gifts":[{"kind":"balance","title":"19 Stars","value":19,"odds":40,"rarity":"common"},{"kind":"balance","title":"30 Stars","value":30,"odds":29,"rarity":"common"},{"kind":"balance","title":"45 Stars","value":45,"odds":17,"rarity":"rare"},{"kind":"balance","title":"70 Stars","value":70,"odds":9,"rarity":"epic"},{"kind":"balance","title":"150 Stars","value":150,"odds":4.9,"rarity":"legendary"},{"kind":"gift","title":"Surge Board #124","odds":0.1,"rarity":"legendary"}]},{"slug":"serpent","title":"Serpent Case","description":"Zumrad-yashil ilon sandig‘i: Stars mukofotlari va Snake Box collectible.","price":100,"color":"#36dfb2","badge":"RARE","badgeColor":"#059669","reward":[38,60,90,140,300],"nft":"Snake Box #11059","rarities":["common","common","rare","epic","legendary"],"odds":0.1,"gifts":[{"kind":"balance","title":"38 Stars","value":38,"odds":40,"rarity":"common"},{"kind":"balance","title":"60 Stars","value":60,"odds":29,"rarity":"common"},{"kind":"balance","title":"90 Stars","value":90,"odds":17,"rarity":"rare"},{"kind":"balance","title":"140 Stars","value":140,"odds":9,"rarity":"epic"},{"kind":"balance","title":"300 Stars","value":300,"odds":4.9,"rarity":"legendary"},{"kind":"gift","title":"Snake Box #11059","odds":0.1,"rarity":"legendary"}]},{"slug":"champion","title":"Champion Case","description":"G‘alaba kubogi mavzusi: Stars mukofotlari va Victory Medal collectible.","price":250,"color":"#ffb957","badge":"EPIC","badgeColor":"#ef7f32","reward":[98,150,225,350,750],"nft":"Victory Medal #40151","rarities":["common","common","rare","epic","legendary"],"odds":0.1,"gifts":[{"kind":"balance","title":"98 Stars","value":98,"odds":40,"rarity":"common"},{"kind":"balance","title":"150 Stars","value":150,"odds":29,"rarity":"common"},{"kind":"balance","title":"225 Stars","value":225,"odds":17,"rarity":"rare"},{"kind":"balance","title":"350 Stars","value":350,"odds":9,"rarity":"epic"},{"kind":"balance","title":"750 Stars","value":750,"odds":4.9,"rarity":"legendary"},{"kind":"gift","title":"Victory Medal #40151","odds":0.1,"rarity":"legendary"}]},{"slug":"quantum","title":"Quantum Case","description":"Binafsha olmos mavzusi: Stars mukofotlari va premium UFC Box katalog sovg‘asi.","price":500,"color":"#a688ff","badge":"ELITE","badgeColor":"#7c3aed","reward":[195,300,450,700,1500],"nft":"Ufs Box","rarities":["common","common","rare","epic","legendary"],"odds":0.01,"gifts":[{"kind":"balance","title":"195 Stars","value":195,"odds":40,"rarity":"common"},{"kind":"balance","title":"300 Stars","value":300,"odds":29,"rarity":"common"},{"kind":"balance","title":"450 Stars","value":450,"odds":17,"rarity":"rare"},{"kind":"balance","title":"700 Stars","value":700,"odds":9,"rarity":"epic"},{"kind":"balance","title":"1500 Stars","value":1500,"odds":4.99,"rarity":"legendary"},{"kind":"gift","title":"Ufs Box","odds":0.01,"rarity":"mythic"}]},{"slug":"royal-vault","title":"Royal Vault Case","description":"Oltin tojli sandiq: Stars mukofotlari va yuqori qiymatli UFC Box 2 sovg‘asi.","price":1000,"color":"#ffce68","badge":"ROYAL","badgeColor":"#b58127","reward":[390,600,900,1400,3000],"nft":"Ufc box 2","rarities":["common","common","rare","epic","legendary"],"odds":0.01,"gifts":[{"kind":"balance","title":"390 Stars","value":390,"odds":40,"rarity":"common"},{"kind":"balance","title":"600 Stars","value":600,"odds":29,"rarity":"common"},{"kind":"balance","title":"900 Stars","value":900,"odds":17,"rarity":"rare"},{"kind":"balance","title":"1400 Stars","value":1400,"odds":9,"rarity":"epic"},{"kind":"balance","title":"3000 Stars","value":3000,"odds":4.99,"rarity":"legendary"},{"kind":"gift","title":"Ufc box 2","odds":0.01,"rarity":"mythic"}]}]'::jsonb) AS a(value)
  LOOP
    SELECT id INTO v_case_id FROM public.cases
     WHERE title = v_case->>'title' LIMIT 1;
    IF v_case_id IS NULL THEN
      INSERT INTO public.cases
        (title,description,price,image_url,badge_text,badge_color,accent_color,
         card_style,is_active,is_pinned,sort_order)
      VALUES
        (v_case->>'title',v_case->>'description',(v_case->>'price')::numeric,
         'https://newpro-blue.vercel.app/cases/'||(v_case->>'slug')||'.svg',
         v_case->>'badge',v_case->>'badgeColor',v_case->>'color',
         'default',false,false,
         (SELECT coalesce(max(sort_order),0)+1 FROM public.cases))
      RETURNING id INTO v_case_id;
    END IF;

    FOR v_gift IN SELECT value FROM jsonb_array_elements(v_case->'gifts') AS a(value)
    LOOP
      IF EXISTS (SELECT 1 FROM public.gifts WHERE case_id=v_case_id AND title=v_gift->>'title')
      THEN CONTINUE; END IF;
      IF v_gift->>'kind'='gift' THEN
        SELECT * INTO v_library FROM public.gift_library
        WHERE title=v_gift->>'title' AND is_active=true LIMIT 1;
        IF v_library.id IS NULL THEN
          RAISE EXCEPTION 'Missing library collectible: %', v_gift->>'title';
        END IF;
        v_image:=nullif(coalesce(nullif(v_library.image_url,''),nullif(v_library.png_url,''),nullif(v_library.webp_url,''),''),'');
        v_balance:=coalesce(v_library.price,0);
        v_stock:=0;
      ELSE
        v_library:=null;
        v_image:='/currency/stars.png';
        v_balance:=(v_gift->>'value')::numeric;
        v_stock:=1000;
      END IF;
      INSERT INTO public.gifts
       (case_id,title,type,value,chance,real_chance,stock,is_active,image_url,
        animation_url,background_value,rarity,floor_price,sell_price,buy_price,
        library_gift_id,source)
      VALUES
       (v_case_id,v_gift->>'title',v_gift->>'kind',
        v_balance::text,(v_gift->>'odds')::numeric,(v_gift->>'odds')::numeric,
        v_stock,true,v_image,
        CASE WHEN v_gift->>'kind'='gift' THEN nullif(v_library.animation_url,'') ELSE NULL END,
        v_case->>'color',v_gift->>'rarity',
        v_balance,v_balance,v_balance,
        CASE WHEN v_gift->>'kind'='gift' THEN v_library.id ELSE NULL END,
        CASE WHEN v_gift->>'kind'='gift' THEN 'library_draft' ELSE 'balance_draft' END);
    END LOOP;
  END LOOP;
END;
$seed$;
