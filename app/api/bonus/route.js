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

function claimKey(userId, taskId) {
  return `bonus_claim_${Number(userId)}_${clean(taskId, 72)}`;
}

function isConflict(error) {
  return error?.code === '23505' || String(error?.message || '').toLowerCase().includes('duplicate');
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
  const { data, error } = await supabase
    .from('app_settings')
    .select('key,value')
    .like('key', `${prefix}%`);

  if (error) throw error;

  const progressByTask = new Map(
    (data || []).map((row) => [String(row.key || '').slice(prefix.length), row.value || null])
  );

  return tasks.map((task) => bonusTaskForClient(task, progressByTask.get(task.id)));
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

async function acquireUserLock(supabase, userId) {
  const key = `bonus_reward_lock_${Number(userId)}`;
  const value = { lockedAt: new Date().toISOString() };
  let result = await supabase.from('app_settings').insert({ key, value });

  if (!result.error) return key;
  if (!isConflict(result.error)) throw result.error;

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;

  const lockedAt = new Date(data?.value?.lockedAt || 0).getTime();
  if (Number.isFinite(lockedAt) && Date.now() - lockedAt > 60_000) {
    await supabase.from('app_settings').delete().eq('key', key);
    result = await supabase.from('app_settings').insert({ key, value });
    if (!result.error) return key;
  }

  throw new Error('Boshqa bonus hisoblanmoqda. Bir necha soniyadan keyin qayta bosing.');
}

async function creditBalance(supabase, userId, reward) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: user, error: readError } = await supabase
      .from('users')
      .select('id,balance')
      .eq('id', Number(userId))
      .single();
    if (readError) throw readError;

    const currentBalance = Number(user.balance || 0);
    const nextBalance = currentBalance + Number(reward);
    const { data: updated, error: updateError } = await supabase
      .from('users')
      .update({ balance: nextBalance })
      .eq('id', Number(userId))
      .eq('balance', currentBalance)
      .select('id,balance')
      .maybeSingle();

    if (updateError) throw updateError;
    if (updated) return Number(updated.balance || nextBalance);
  }

  throw new Error('Balans band. Bonusni qayta olishga urinib ko‘ring.');
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
      const eligibleAt = existing?.eligibleAt || new Date(
        new Date(startedAt).getTime() + task.waitMinutes * 60_000
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
    if (Number.isFinite(eligibleAt) && eligibleAt > Date.now()) {
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

    const userLockKey = await acquireUserLock(supabase, userId);
    const persistentClaimKey = claimKey(userId, task.id);
    const claimValue = {
      userId,
      taskId: task.id,
      reward: task.reward,
      status: 'crediting',
      createdAt: new Date().toISOString(),
    };
    const claimInsert = await supabase.from('app_settings').insert({
      key: persistentClaimKey,
      value: claimValue,
    });

    if (claimInsert.error) {
      await supabase.from('app_settings').delete().eq('key', userLockKey);
      if (isConflict(claimInsert.error)) {
        const { data: claimRow, error: claimReadError } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', persistentClaimKey)
          .maybeSingle();
        if (claimReadError) throw claimReadError;
        if (claimRow?.value?.status !== 'completed') {
          return jsonError(
            'Bonus hisoblanmoqda. Bir daqiqadan keyin qayta tekshiring.',
            409,
            { reason: 'CLAIM_PROCESSING' }
          );
        }

        const completedProgress = {
          ...(existing || {}),
          status: 'completed',
          completedAt: existing?.completedAt || claimRow.value.completedAt || new Date().toISOString(),
          reward: task.reward,
          updatedAt: new Date().toISOString(),
        };
        await writeProgress(supabase, userId, task.id, completedProgress);
        return Response.json({
          ok: true,
          completed: true,
          balance: Number(user.balance || 0),
          reward: task.reward,
          task: bonusTaskForClient(task, completedProgress),
        });
      }
      throw claimInsert.error;
    }

    let balanceCredited = false;

    try {
      const balance = await creditBalance(supabase, userId, task.reward);
      balanceCredited = true;
      const completedAt = new Date().toISOString();
      await supabase.from('app_settings').upsert({
        key: persistentClaimKey,
        value: { ...claimValue, status: 'completed', completedAt, balance },
      }, { onConflict: 'key' });
      const completedProgress = await writeProgress(supabase, userId, task.id, {
        ...existing,
        userId,
        taskId: task.id,
        status: 'completed',
        reward: task.reward,
        completedAt,
        updatedAt: completedAt,
      });

      return Response.json({
        ok: true,
        completed: true,
        reward: task.reward,
        balance,
        task: bonusTaskForClient(task, completedProgress),
      });
    } catch (error) {
      if (!balanceCredited) {
        await supabase.from('app_settings').delete().eq('key', persistentClaimKey);
      }
      throw error;
    } finally {
      await supabase.from('app_settings').delete().eq('key', userLockKey);
    }
  } catch (error) {
    console.error('[bonus]', error);
    return jsonError(error?.message || 'Bonus task xatosi', 500);
  }
}
