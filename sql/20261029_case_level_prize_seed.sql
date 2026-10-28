-- MYST case level/prize catalog; applied to production on 2026-10-29.
-- Idempotent to preserve any already won copies (open_history references).
-- A collectible's in-app stock is not evidence of Telegram NFT ownership.
-- Telegram gift entries stay at 0 draw weight until verified deliverable supply exists.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS level_xp bigint NOT NULL DEFAULT 0;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_level_xp_check;
ALTER TABLE public.users ADD CONSTRAINT users_level_xp_check CHECK(level_xp>=0);
ALTER TABLE public.gifts DROP CONSTRAINT IF EXISTS gifts_type_check;
ALTER TABLE public.gifts ADD CONSTRAINT gifts_type_check CHECK(type IN ('gift','balance','xp'));

CREATE OR REPLACE FUNCTION public.credit_case_xp_on_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=public
AS $$
DECLARE v_type text;v_value text;v_amount bigint;
BEGIN
 SELECT type,value INTO v_type,v_value FROM public.gifts WHERE id=NEW.gift_id;
 IF v_type<>'xp' THEN RETURN NEW; END IF;
 IF v_value IS NULL OR v_value !~ '^[0-9]{1,6}$' THEN RAISE EXCEPTION 'INVALID_XP_REWARD'; END IF;
 v_amount:=v_value::bigint;
 IF v_amount NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'INVALID_XP_REWARD'; END IF;
 UPDATE public.users SET level_xp=level_xp+v_amount,updated_at=now() WHERE id=NEW.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'XP_USER_NOT_FOUND'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS case_xp_history_credit ON public.open_history;
CREATE TRIGGER case_xp_history_credit AFTER INSERT ON public.open_history
 FOR EACH ROW EXECUTE FUNCTION public.credit_case_xp_on_history();
REVOKE EXECUTE ON FUNCTION public.credit_case_xp_on_history() FROM public,anon,authenticated;

-- Legacy prizes are preserved for inventory/history but removed from new draw pools.
UPDATE public.gifts SET is_active=false,updated_at=now()
 WHERE case_id IN (SELECT id FROM public.cases WHERE is_active=true AND archived_at IS NULL)
 AND source IS DISTINCT FROM 'case_seed_v1' AND is_active=true;

WITH c AS (SELECT id,price FROM public.cases WHERE is_active=true AND archived_at IS NULL),
 plan AS (
 SELECT c.id case_id,c.price,ix,
 (ARRAY[54,25,12,4])[ix] weight,
 (ARRAY['common','rare','epic','legendary'])[ix] rarity,
 CASE WHEN c.price=0 THEN (ARRAY[1,2,5,12])[ix] ELSE
 GREATEST(1,round(c.price*(ARRAY[.08,.23,.65,1.30])[ix])::int) END val
 FROM c CROSS JOIN generate_series(1,4) ix
)
INSERT INTO public.gifts(case_id,title,type,value,chance,real_chance,stock,image_url,background_value,rarity,is_active,source)
SELECT p.case_id,p.val||' Stars','balance',p.val::text,p.weight,p.weight,10000,
'/rewards/stars-preview.svg','#e8a837',p.rarity,true,'case_seed_v1'
FROM plan p WHERE NOT EXISTS(
 SELECT 1 FROM public.gifts g WHERE g.case_id=p.case_id AND g.source='case_seed_v1'
 AND g.type='balance' AND g.value=p.val::text
);
WITH c AS (SELECT id,price FROM public.cases WHERE is_active=true AND archived_at IS NULL),
 plan AS (
 SELECT c.id case_id,c.price,ix,
 (ARRAY[3,1.5,.5])[ix] weight,
 (ARRAY['common','rare','epic'])[ix] rarity,
 CASE WHEN c.price=0 THEN (ARRAY[5,15,35])[ix] ELSE
 LEAST(100000,GREATEST(5,round(c.price*(ARRAY[.08,.20,.42])[ix])::int)) END val
 FROM c CROSS JOIN generate_series(1,3) ix
)
INSERT INTO public.gifts(case_id,title,type,value,chance,real_chance,stock,image_url,background_value,rarity,is_active,source)
SELECT p.case_id,p.val||' XP','xp',p.val::text,p.weight,p.weight,10000,
'/rewards/xp-orb.svg','#8b5cf6',p.rarity,true,'case_seed_v1'
FROM plan p WHERE NOT EXISTS(
 SELECT 1 FROM public.gifts g WHERE g.case_id=p.case_id AND g.source='case_seed_v1'
 AND g.type='xp' AND g.value=p.val::text
);
WITH picked AS (
 SELECT c.id case_id,slot,lib.id library_id,lib.title,lib.price,lib.background_value
 FROM public.cases c CROSS JOIN generate_series(1,3) slot
 CROSS JOIN LATERAL (
   SELECT id,title,price,background_value FROM public.gift_library
   WHERE is_active=true AND price>0
   ORDER BY abs(price-(greatest(240,c.price*(CASE slot WHEN 1 THEN .7 WHEN 2 THEN 1.5 ELSE 3 END))+(slot-1)*380)),price,id LIMIT 1
 ) lib
 WHERE c.is_active=true AND c.archived_at IS NULL
)
INSERT INTO public.gifts(case_id,title,type,value,chance,real_chance,stock,image_url,background_value,rarity,is_active,source,library_gift_id,buy_price,sell_price,floor_price)
SELECT case_id,title,'gift',price::text,0,0,10000,'/rewards/gift-preview.svg',
 COALESCE(NULLIF(background_value,''),'#362248'),
 CASE slot WHEN 1 THEN 'rare' WHEN 2 THEN 'legendary' ELSE 'mythic' END,
 true,'case_seed_v1',library_id,price,price,price
FROM picked m
WHERE NOT EXISTS (SELECT 1 FROM public.gifts g WHERE g.case_id=m.case_id
 AND g.source='case_seed_v1' AND g.library_gift_id=m.library_id);
UPDATE public.gifts SET stock=10000,updated_at=now()
 WHERE case_id IN (SELECT id FROM public.cases WHERE is_active=true AND archived_at IS NULL);
COMMIT;
