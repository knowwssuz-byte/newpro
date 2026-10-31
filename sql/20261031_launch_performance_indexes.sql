-- Lightweight FK covering indexes for Arena, PvP and Upgrade.
-- Existing tables are currently small; additive indexes do not alter game outcomes.
CREATE INDEX IF NOT EXISTS idx_ca_bets_user_release ON public.color_arena_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_gift_room_release ON public.color_arena_gift_stakes(room_id);
CREATE INDEX IF NOT EXISTS idx_ca_gift_winner_release ON public.color_arena_gift_stakes(winner_id);
CREATE INDEX IF NOT EXISTS idx_ca_history_winner_release ON public.color_arena_history(winner_id);
CREATE INDEX IF NOT EXISTS idx_ca_ledger_room_release ON public.color_arena_ledger(room_id);
CREATE INDEX IF NOT EXISTS idx_ca_revenue_room_release ON public.color_arena_platform_revenue(room_id);
CREATE INDEX IF NOT EXISTS idx_ca_rooms_owner_release ON public.color_arena_rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_ca_rooms_winner_release ON public.color_arena_rooms(winner_id);
CREATE INDEX IF NOT EXISTS idx_ca_stars_room_release ON public.color_arena_stars_ledger(room_id);
CREATE INDEX IF NOT EXISTS idx_pvp_xo_ledger_user_release ON public.pvp_xo_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_reward_history_release ON public.upgrade_rounds(reward_history_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_source_gift_release ON public.upgrade_rounds(source_gift_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_target_gift_release ON public.upgrade_rounds(target_gift_id);
