import {
  ArrowDownToLine, Award, Bot, Check, ChevronLeft, ChevronRight,
  Circle, CircleAlert, CircleCheck, ClipboardList, Coins, Copy,
  Dices, Gem, Gift, Globe, Megaphone, PackageOpen, RefreshCw,
  Rocket, Send, Settings, ShieldCheck, ShieldUser, Sparkles,
  Swords, TrendingUp, UserCheck, UserPlus, UserRound, X, Clock3,
} from 'lucide-react';

// Navigation and shortcuts share a small, purpose-specific duotone family.
// Utility actions retain familiar line icons at the same optical weight.
const illustrations = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" fill="currentColor" fillOpacity=".12" /><path d="m3 10 9-7 9 7M5 9v11h4v-6h6v6h4V9" /></>,
  inventory: <><rect x="4" y="8" width="16" height="13" rx="3" fill="currentColor" fillOpacity=".14" /><rect x="3" y="3" width="18" height="5" rx="1.5" /><path d="M5 8v10a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8m-10 4h6" /></>,
  cases: <><path d="m12 3 9 5v9l-9 5-9-5V8Z" fill="currentColor" fillOpacity=".12" /><path d="m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5m-9 5v9M7.5 5.5l9 5v4" /></>,
  bonus: <><path d="M4 5h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6V6a1 1 0 0 1 1-1Z" fill="currentColor" fillOpacity=".14" /><path d="m12 8 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4Z" fill="currentColor" fillOpacity=".35" /></>,
  games: <><path d="M7 6h10c2 0 3 2 3.5 4l1 6c.5 3-2 4-4 1l-1-1h-9l-1 1c-2 3-4.5 2-4-1l1-6C4 8 5 6 7 6Z" fill="currentColor" fillOpacity=".14" /><path d="M8 9v5m-2.5-2.5h5" /><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="18" cy="13" r="1" fill="currentColor" stroke="none" /></>,
  referral: <><circle cx="9" cy="7" r="3" fill="currentColor" fillOpacity=".2" /><path d="M3 21v-3a6 6 0 0 1 12 0v3Z" fill="currentColor" fillOpacity=".12" /><path d="M16 4a3 3 0 0 1 0 6m2 5v6m-3-3h6" /></>,
  deposit: <><rect x="3" y="6" width="18" height="15" rx="3" fill="currentColor" fillOpacity=".12" /><path d="M4 7V5a2 2 0 0 1 2-2h11m4 8h-5a2 2 0 0 0 0 4h5" /><circle cx="16" cy="13" r=".75" fill="currentColor" stroke="none" /></>,
};

const utilities = {
  admin: ShieldUser, award: Award, bot: Bot, box: PackageOpen,
  channel: Megaphone, check: Check, chevronLeft: ChevronLeft,
  chevronRight: ChevronRight, clock: Clock3, close: X, coin: Coins,
  copy: Copy, dice: Dices, gem: Gem, gift: Gift, globe: Globe,
  profile: UserRound, ready: CircleCheck, refresh: RefreshCw,
  rocket: Rocket, send: Send, settings: Settings, shield: ShieldCheck,
  spark: Sparkles, swords: Swords, tasks: ClipboardList,
  trend: TrendingUp, userCheck: UserCheck, userPlus: UserPlus,
  warning: CircleAlert, withdraw: ArrowDownToLine,
};

export default function AppIcon({ name, className = '' }) {
  const props = {
    className: `app-icon ${className}`.trim(),
    'aria-hidden': true,
    'data-icon': name,
    focusable: 'false',
    strokeWidth: 1.8,
  };
  if (illustrations[name]) {
    return <svg {...props} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{illustrations[name]}</svg>;
  }
  const Icon = utilities[name] || Circle;
  return <Icon {...props} />;
}
