-- MYST PvP X/O Arena: deployed on 2026-10-29.
-- Server-authoritative state, atomic Stars stakes and settlement.
CREATE TABLE IF NOT EXISTS public.pvp_xo_matches (
 id uuid primary key default gen_random_uuid(),
 mode text not null check(mode in ('bot','online')),
 status text not null default 'waiting' check(status in ('waiting','active','finished','cancelled')),
 x_id bigint not null references public.users(id),
 o_id bigint references public.users(id),
 stake integer not null check(stake in (5,10,25,50)),
 board text not null default '.........' check(length(board)=9),
 turn text not null default 'X' check(turn in ('X','O')),
 winner text check(winner in ('X','O','D')),
 moves integer not null default 0 check(moves between 0 and 9),
 deadline timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 finished_at timestamptz,
 check(x_id is distinct from o_id)
);
CREATE INDEX IF NOT EXISTS pvp_xo_waiting_lookup ON public.pvp_xo_matches(stake,created_at)
 WHERE status='waiting' and mode='online';
CREATE INDEX IF NOT EXISTS pvp_xo_x_open ON public.pvp_xo_matches(x_id,status);
CREATE INDEX IF NOT EXISTS pvp_xo_o_open ON public.pvp_xo_matches(o_id,status);
CREATE TABLE IF NOT EXISTS public.pvp_xo_ledger (
 id bigint generated always as identity primary key,
 match_id uuid not null references public.pvp_xo_matches(id),
 user_id bigint not null references public.users(id),
 kind text not null check(kind in ('entry','win','draw','forfeit')),
 amount numeric not null,
 created_at timestamptz not null default now(),
 unique(match_id,user_id,kind)
);
ALTER TABLE public.pvp_xo_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvp_xo_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pvp_xo_matches,public.pvp_xo_ledger FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pvp_xo_eval(p_board text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare a int; b int; c int; l int[];
begin
 if length(p_board)<>9 or p_board ~ '[^XO.]' then raise exception 'INVALID_BOARD'; end if;
 foreach l slice 1 in array array[
  array[1,2,3],array[4,5,6],array[7,8,9],
  array[1,4,7],array[2,5,8],array[3,6,9],
  array[1,5,9],array[3,5,7]
 ] loop
 a:=l[1];b:=l[2];c:=l[3];
 if substring(p_board,a,1) <> '.' and
 substring(p_board,a,1)=substring(p_board,b,1) and
 substring(p_board,b,1)=substring(p_board,c,1) then
 return substring(p_board,a,1);
 end if;
 end loop;
 if position('.' in p_board)=0 then return 'D'; end if;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public.pvp_xo_bot_pick(p_board text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare i int; trial text; target text;
begin
 -- Bot makes tactical decisions (win, block, centre, corner, side).
 for target in select unnest(array['O','X']) loop
  for i in 1..9 loop
   if substring(p_board,i,1)='.' then
    trial:=overlay(p_board placing target from i for 1);
    if public.pvp_xo_eval(trial)=target then return i-1; end if;
   end if;
  end loop;
 end loop;
 foreach i in array array[5,1,3,7,9,2,4,6,8] loop
  if substring(p_board,i,1)='.' then return i-1; end if;
 end loop;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public.pvp_xo_command(p_user_id bigint, p_action text, p_match_id uuid DEFAULT NULL::uuid, p_mode text DEFAULT NULL::text, p_stake integer DEFAULT NULL::integer, p_cell integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
 m public.pvp_xo_matches%rowtype;
 other bigint;
 mark text;
 outcome text;
 moveidx integer;
 credit numeric;
 ubalance numeric;
 x_name text;
 o_name text;
 got_user bigint;
 newboard text;
begin
 if p_action not in ('start','state','move','cancel') then raise exception 'PVP_INVALID_ACTION'; end if;
 if p_action='start' then
  if p_mode not in ('bot','online') or p_stake not in (5,10,25,50) then raise exception 'PVP_INVALID_ENTRY'; end if;
  perform pg_advisory_xact_lock(hashtextextended('pvp:user:'||p_user_id::text,0));
  select * into m from public.pvp_xo_matches
   where (x_id=p_user_id or o_id=p_user_id) and status in ('waiting','active')
   order by created_at desc limit 1 for update;
  if found then
   -- An existing active match cannot be silently replaced to avoid losing escrow.
   null;
  else
   select id into got_user from public.users
    where id=p_user_id and coalesce(is_banned,false)=false for update;
   if not found then raise exception 'PVP_USER_NOT_FOUND'; end if;
   if p_mode='bot' then
    update public.users set balance=balance-p_stake,updated_at=now()
      where id=p_user_id and balance>=p_stake returning balance into ubalance;
    if not found then raise exception 'PVP_INSUFFICIENT_BALANCE'; end if;
    insert into public.pvp_xo_matches(mode,status,x_id,stake,deadline)
      values('bot','active',p_user_id,p_stake,now()+interval '90 seconds') returning * into m;
    insert into public.pvp_xo_ledger(match_id,user_id,kind,amount)
      values(m.id,p_user_id,'entry',-p_stake);
   else
    perform pg_advisory_xact_lock(78931,p_stake);
    select * into m from public.pvp_xo_matches
      where mode='online' and status='waiting' and x_id<>p_user_id
        and created_at>now()-interval '4 minutes'
      order by created_at for update skip locked limit 1;
    if found then
      -- Lock both user rows in a consistent order before any balance mutation.
      perform 1 from public.users where id in (m.x_id,p_user_id)
        order by id for update;
      if (select balance from public.users where id=m.x_id) < p_stake then
        update public.pvp_xo_matches set status='cancelled',finished_at=now(),updated_at=now()
          where id=m.id;
        insert into public.pvp_xo_matches(mode,status,x_id,stake)
          values('online','waiting',p_user_id,p_stake) returning * into m;
      else
        if (select balance from public.users where id=p_user_id) < p_stake then
          raise exception 'PVP_INSUFFICIENT_BALANCE';
        end if;
        update public.users set balance=balance-p_stake,updated_at=now()
          where id in (m.x_id,p_user_id) and balance>=p_stake;
        if (select count(*) from public.users where id in (m.x_id,p_user_id) and balance>=0) <> 2
          then raise exception 'PVP_INSUFFICIENT_BALANCE'; end if;
        update public.pvp_xo_matches set o_id=p_user_id,status='active',
          deadline=now()+interval '90 seconds',updated_at=now()
          where id=m.id returning * into m;
        insert into public.pvp_xo_ledger(match_id,user_id,kind,amount)
          values(m.id,m.x_id,'entry',-p_stake),(m.id,p_user_id,'entry',-p_stake);
      end if;
    else
      insert into public.pvp_xo_matches(mode,status,x_id,stake)
        values('online','waiting',p_user_id,p_stake) returning * into m;
    end if;
   end if;
  end if;
 else
  select * into m from public.pvp_xo_matches
   where id=p_match_id and (x_id=p_user_id or o_id=p_user_id)
   for update;
  if not found then raise exception 'PVP_MATCH_NOT_FOUND'; end if;
 end if;
 -- Expired active games: current turn's opponent wins. Once-only payout under match lock.
 if m.status='active' and m.deadline<now() then
   outcome:=case when m.turn='X' then 'O' else 'X' end;
   other:=case when outcome='X' then m.x_id else m.o_id end;
   if other is not null then
     update public.users set balance=balance+(m.stake*2),updated_at=now() where id=other;
     insert into public.pvp_xo_ledger(match_id,user_id,kind,amount)
       values(m.id,other,'forfeit',m.stake*2);
   end if;
   update public.pvp_xo_matches set winner=outcome,status='finished',finished_at=now(),
     deadline=null,updated_at=now() where id=m.id returning * into m;
 end if;
 if p_action='cancel' and m.status='waiting' and m.x_id=p_user_id then
   update public.pvp_xo_matches set status='cancelled',finished_at=now(),updated_at=now()
     where id=m.id returning * into m;
 elsif p_action='cancel' and m.status='active' then
   outcome:=case when m.x_id=p_user_id then 'O' else 'X' end;
   other:=case when outcome='X' then m.x_id else m.o_id end;
   if other is not null then
     update public.users set balance=balance+m.stake*2,updated_at=now() where id=other;
     insert into public.pvp_xo_ledger(match_id,user_id,kind,amount)
       values(m.id,other,'forfeit',m.stake*2);
   end if;
   update public.pvp_xo_matches set status='finished',winner=outcome,
     deadline=null,finished_at=now(),updated_at=now() where id=m.id returning * into m;
 elsif p_action='move' then
   if m.status<>'active' then raise exception 'PVP_NOT_ACTIVE'; end if;
   mark:=case when m.x_id=p_user_id then 'X' else 'O' end;
   if m.turn<>mark then raise exception 'PVP_NOT_YOUR_TURN'; end if;
   if p_cell is null or p_cell not between 0 and 8 or substring(m.board,p_cell+1,1)<>'.'
     then raise exception 'PVP_INVALID_MOVE'; end if;
   newboard:=overlay(m.board placing mark from p_cell+1 for 1);
   outcome:=public.pvp_xo_eval(newboard);
   if m.mode='bot' and outcome is null then
     moveidx:=public.pvp_xo_bot_pick(newboard);
     if moveidx is not null then
       newboard:=overlay(newboard placing 'O' from moveidx+1 for 1);
       outcome:=public.pvp_xo_eval(newboard);
     end if;
   end if;
   if outcome is not null then
     if outcome='D' then
       update public.users set balance=balance+m.stake,updated_at=now()
         where id=m.x_id or (m.o_id is not null and id=m.o_id);
       insert into public.pvp_xo_ledger(match_id,user_id,kind,amount)
         select m.id,id,'draw',m.stake from public.users
         where id=m.x_id or (m.o_id is not null and id=m.o_id);
     else
       other:=case when outcome='X' then m.x_id else m.o_id end;
       if other is not null then
         update public.users set balance=balance+m.stake*2,updated_at=now() where id=other;
         insert into public.pvp_xo_ledger(match_id,user_id,kind,amount)
           values(m.id,other,'win',m.stake*2);
       end if;
     end if;
   end if;
   update public.pvp_xo_matches set board=newboard,
     moves=length(replace(newboard,'.','')),
     turn=case when m.mode='bot' or outcome is not null then 'X'
       else case when mark='X' then 'O' else 'X' end end,
     winner=outcome,
     status=case when outcome is not null then 'finished' else 'active' end,
     deadline=case when outcome is not null then null else now()+interval '90 seconds' end,
     updated_at=now(),
     finished_at=case when outcome is not null then now() else null end
     where id=m.id returning * into m;
 end if;
 select balance into ubalance from public.users where id=p_user_id;
 select coalesce(nullif(first_name,''),nullif(username,''),'Player') into x_name
   from public.users where id=m.x_id;
 if m.o_id is not null then
   select coalesce(nullif(first_name,''),nullif(username,''),'Player') into o_name
     from public.users where id=m.o_id;
 else o_name:='MYST BOT'; end if;
 return jsonb_build_object('match',to_jsonb(m)||jsonb_build_object('x_name',x_name,'o_name',o_name),
   'balance',ubalance);
end $function$;

REVOKE ALL ON FUNCTION public.pvp_xo_eval(text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.pvp_xo_bot_pick(text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.pvp_xo_command(bigint,text,uuid,text,integer,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pvp_xo_eval(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pvp_xo_bot_pick(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pvp_xo_command(bigint,text,uuid,text,integer,integer) TO service_role;
