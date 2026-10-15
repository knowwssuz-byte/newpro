import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  BONUS_TASK_TYPES,
  bonusTaskForClient,
  getBonusTasks,
} from '@/lib/bonusTasks';
import { telegramApi } from '@/lib/telegramBot';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(value = '', max = 120) {
  return String(value || '').trim().slice(0, max);
}

function progressKey(userId, taskId) {
  return `bonus_progress_${Number(userId)}_${clean(taskId, 72)}`;
}

async function readProgress(supabase, userId, taskId) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', progressKey(userId, taskId))
    .maybeSingle();

  if (error) throw error;
  return data?.value || null;
}

async function writeProgress(supabase, userId, taskId, value) {
  const { error } = await supabase.from('app_settings').upsert(
    { key: progressKey(userId, taskId), value },
    { onConflict: 'key' }
  );

  if (error) throw error;
  return value;
}

async function loadTaskState(supabase, userId, tasks) {
  const prefix = `bonus_progress_${Number(userId)}_`;
  const [progressResult, claimsResult] = await Promise.all([
    supabase.from('app_settings').select('key,value').like('key', `${prefix}%`),
    supabase.from('bonus_claim_ledger').select('task_id,reward,claimed_at').eq('user_id', Number(userId)),
  ]);
  if (progressResult.error) throw progressResult.error;
  if (claimsResult.error) throw claimsResult.error;
  const progressByTask = new Map(
    (progressResult.data || []).map((row) => [
      String(row.key || '').slice(prefix.length), row.value || null,
    ])
  );
  const claimsByTask = new Map((claimsResult.data || []).map((row) => [row.task_id, row]));
  return tasks.map((task) => {
    const claim = claimsByTask.get(task.id);
    const progress = progressByTask.get(task.id) || null;
    return bonusTaskForClient(task, claim ? {
      ...progress, status: 'completed', reward: claim.reward,
      completedAt: claim.claimed_at,
    } : progress);
  });
}

async function verifyTelegramMembership(task, userId) {
  try {
    const member = await telegramApi(
      'getChatMember',
      { chat_id: task.chatId, user_id: Number(userId) },
      { timeoutMs: 6_000 }
    );
    const accepted = ['creator', 'administrator', 'member'].includes(member?.status) ||
      (member?.status === 'restricted' && member?.is_member === true);

    if (!accepted) {
      return {
        ok: false,
        error: 'Kanalga a’zo bo‘lganingiz aniqlanmadi. Avval kanalga qo‘shiling.',
      };
    }

    return { ok: true };
  } catch (error) {
    console.error('[bonus:getChatMember]', error?.message || error);
    return {
      ok: false,
      error: 'Kanal a’zoligini tekshirib bo‘lmadi. Bot kanalga admin qilinganini tekshiring.',
    };
  }
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);
    if (!auth.ok) return jsonError(auth.error, auth.status);

    const userId = Number(auth.telegramUser.id);
    const action = clean(auth.body?.action || 'list', 24).toLowerCase();
    const taskId = clean(auth.body?.taskId, 72);
    const supabase = getSupabaseAdmin();
    const [user, tasks] = await Promise.all([
      ensureUser(auth.telegramUser),
      getBonusTasks(supabase),
    ]);

    if (user.is_banned) return jsonError('Siz bloklangansiz', 403);

    if (action === 'list') {
      const clientTasks = await loadTaskState(supabase, userId, tasks);
      const completed = clientTasks.filter((task) => task.status === 'completed');

      return Response.json({
        ok: true,
        balance: Number(user.balance || 0),
        stats: {
          total: clientTasks.length,
          completed: completed.length,
          earned: completed.reduce((sum, task) => sum + Number(task.reward || 0), 0),
        },
        tasks: clientTasks,
      });
    }

    const task = tasks.find((item) => item.id === taskId);
    if (!task) return jsonError('Task topilmadi yoki vaqtincha o‘chirilgan.', 404);

    const existing = await readProgress(supabase, userId, task.id);

    if (action === 'start') {
      if (existing?.status === 'completed') {
        return Response.json({
          ok: true,
          task: bonusTaskForClient(task, existing),
          alreadyCompleted: true,
        });
      }

      const startedAt = existing?.startedAt || new Date().toISOString();
      const effectiveWaitMinutes =
        BONUS_TASK_TYPES[task.type]?.verification === 'telegram_membership'
          ? 0
          : task.waitMinutes;
      const eligibleAt = effectiveWaitMinutes === 0
        ? new Date().toISOString()
        : existing?.eligibleAt || new Date(
            new Date(startedAt).getTime() + effectiveWaitMinutes * 60_000
          ).toISOString();
      const progress = await writeProgress(supabase, userId, task.id, {
        userId,
        taskId: task.id,
        status: 'waiting',
        startedAt,
        eligibleAt,
        updatedAt: new Date().toISOString(),
      });

      return Response.json({
        ok: true,
        task: bonusTaskForClient(task, progress),
      });
    }

    if (action !== 'claim') return jsonError('Noma’lum bonus amali.', 400);
    if (existing?.status === 'completed') {
      return Response.json({
        ok: true,
        completed: true,
        balance: Number(user.balance || 0),
        task: bonusTaskForClient(task, existing),
      });
    }
    if (!existing?.startedAt) {
      return jsonError('Avval taskni ochib, shartini bajaring.', 400, { reason: 'TASK_NOT_STARTED' });
    }

    const eligibleAt = new Date(existing.eligibleAt || 0).getTime();
    if (
      BONUS_TASK_TYPES[task.type]?.verification !== 'telegram_membership' &&
      Number.isFinite(eligibleAt) &&
      eligibleAt > Date.now()
    ) {
      return jsonError('Tekshirish vaqti hali kelmadi.', 425, {
        reason: 'TASK_WAITING',
        eligibleAt: existing.eligibleAt,
      });
    }

    if (BONUS_TASK_TYPES[task.type]?.verification === 'telegram_membership') {
      if (!task.chatId) return jsonError('Task kanal ID’si admin tomonidan sozlanmagan.', 503);
      const membership = await verifyTelegramMembership(task, userId);
      if (!membership.ok) return jsonError(membership.error, 400, { reason: 'NOT_A_MEMBER' });
    }

    // One SQL transaction atomically credits + records the claim. Retrying
    // this RPC is idempotent even if the browser disconnects during response.
    const { data: settlement, error: settlementError } = await supabase.rpc('bonus_claim_atomic', {
      p_user_id: userId,
      p_task_id: task.id,
      p_reward: task.reward,
    });
    if (settlementError) {
      const reason = String(settlementError.message || '');
      if (reason.includes('BONUS_LEGACY_REVIEW')) {
        return jsonError('Oldingi bonus amali tekshiruv talab qiladi. Admin bilan bog‘laning.', 409, {
          reason: 'BONUS_REVIEW_REQUIRED',
        });
      }
      if (reason.includes('BONUS_ALREADY_COMPLETED')) {
        return jsonError('Bu bonus oldin hisoblangan.', 409, { reason: 'BONUS_ALREADY_COMPLETED' });
      }
      throw settlementError;
    }

    const completedAt = new Date().toISOString();
    const progress = {
      ...existing,
      userId,
      taskId: task.id,
      status: 'completed',
      reward: settlement.reward,
      completedAt,
      updatedAt: completedAt,
    };
    try {
      await writeProgress(supabase, userId, task.id, progress);
    } catch (progressError) {
      // Ledger remains authoritative; task list reads it on next request.
      console.warn('[bonus:progress-cache]', progressError?.code || 'write failed');
    }
    return Response.json({
      ok: true,
      completed: true,
      alreadyClaimed: Boolean(settlement.alreadyClaimed),
      reward: Number(settlement.reward),
      balance: Number(settlement.balance),
      task: bonusTaskForClient(task, progress),
    });
  } catch (error) {
    console.error('[bonus]', error);
    return jsonError(error?.message || 'Bonus task xatosi', 500);
  }
}
