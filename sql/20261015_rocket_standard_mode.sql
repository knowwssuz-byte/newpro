-- Release: use the declared unbiased server distribution for new Rocket rounds.
-- Pending automatic plans are safely rotated; active bets are not modified.
select public.rocket_v8_set_bias('standard');