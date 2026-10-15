-- Activate only the six new cases; existing Free case and history unchanged.
-- Operator explicitly attests owning all six selected collectible gifts.
-- Initial stock is ONE of each; no inferred infinite supply.
do $launch$
declare v_count int;
begin
 select count(*) into v_count from public.gifts g join public.cases c on c.id=g.case_id
 where c.title in ('Starter Case','Neon Case','Serpent Case','Champion Case','Quantum Case','Royal Vault Case')
 and g.source='library_draft' and g.stock=0;
 if v_count<>6 then raise exception 'Expected six untouched draft collectible slots, got %',v_count; end if;

 update public.gifts g set stock=1,is_active=true,
   source='operator_attested_one_copy_20261015'
 from public.cases c
 where g.case_id=c.id
   and c.title in ('Starter Case','Neon Case','Serpent Case','Champion Case','Quantum Case','Royal Vault Case')
   and g.source='library_draft' and g.stock=0;

 update public.cases set is_active=true
 where title in ('Starter Case','Neon Case','Serpent Case','Champion Case','Quantum Case','Royal Vault Case');

 insert into public.app_settings(key,value)
 values('new_case_operator_inventory_attestation_20261015',
 jsonb_build_object(
   'source','operator ownership confirmation in ChatGPT',
   'initialStockPerDraft',1,
   'automaticallyVerifiedOwnedCopies',false,
   'requiresManualPrizeDelivery',true,
   'caseCount',6,
   'recordedAt',now()
 )) on conflict (key) do nothing;
end $launch$;
