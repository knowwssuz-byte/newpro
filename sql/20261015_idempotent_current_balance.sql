-- Idempotent responses must reflect the CURRENT wallet, not historical balance.
do $patch$
declare ddl text;
begin
 ddl:=pg_get_functiondef('public.admin_balance_adjust_atomic(bigint,numeric,uuid,text)'::regprocedure);
 ddl:=replace(ddl,'v_previous.balance_after','v_user.balance');
 execute ddl;
 ddl:=pg_get_functiondef('public.bonus_claim_atomic(bigint,text,integer)'::regprocedure);
 ddl:=replace(ddl,'v_claim.balance_after','(select balance from public.users where id=p_user_id)');
 ddl:=replace(ddl,'if p_user_id is null or p_task_id !~','if p_user_id is null or p_task_id is null or p_task_id !~');
 execute ddl;
end;
$patch$;
revoke all on function public.admin_balance_adjust_atomic(bigint,numeric,uuid,text) from public,anon,authenticated;
revoke all on function public.bonus_claim_atomic(bigint,text,integer) from public,anon,authenticated;
grant execute on function public.admin_balance_adjust_atomic(bigint,numeric,uuid,text) to service_role;
grant execute on function public.bonus_claim_atomic(bigint,text,integer) to service_role;