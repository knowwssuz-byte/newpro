import crypto from 'crypto';

const DEVICE_TOKEN_PATTERN = /^[a-zA-Z0-9._:-]{16,160}$/;

function clean(value = '', max = 180) {
  return String(value || '').trim().slice(0, max);
}

function secret() {
  const value = clean(
    process.env.REFERRAL_FRAUD_SALT ||
      process.env.TELEGRAM_BOT_TOKEN ||
      process.env.ADMIN_PANEL_KEY,
    300
  );

  if (!value) throw new Error('REFERRAL_FRAUD_SALT yoki TELEGRAM_BOT_TOKEN topilmadi');
  return value;
}

function digest(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

function requestIp(request) {
  const forwarded = clean(request.headers.get('x-forwarded-for'), 300)
    .split(',')[0]
    .trim();
  return forwarded || clean(request.headers.get('x-real-ip'), 100) || 'unknown';
}

function ipNetwork(value) {
  const ip = clean(value, 100).toLowerCase();

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }

  if (ip.includes(':')) {
    return `${ip.split(':').slice(0, 4).join(':')}::/64`;
  }

  return 'unknown';
}

function normalizedDeviceInfo(value = {}) {
  const info = value && typeof value === 'object' ? value : {};

  return {
    platform: clean(info.platform, 60).toLowerCase(),
    language: clean(info.language, 24).toLowerCase(),
    timezone: clean(info.timezone, 60).toLowerCase(),
    screen: clean(info.screen, 40).toLowerCase(),
    colorDepth: clean(info.colorDepth, 10),
    cores: clean(info.cores, 10),
    memory: clean(info.memory, 10),
  };
}

async function readSignalRows(supabase, prefix) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key,value')
    .like('key', `${prefix}_%`);

  if (error) throw error;
  return data || [];
}

async function saveSignal(supabase, key, userId, kind) {
  const now = new Date().toISOString();
  const { data: existing, error: readError } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (readError) throw readError;

  const value = {
    kind,
    userId: Number(userId),
    firstSeenAt: existing?.value?.firstSeenAt || now,
    lastSeenAt: now,
  };
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value }, { onConflict: 'key' });

  if (error) throw error;
}

export function referralDevicePayload() {
  return {
    tokenKey: 'gift_myst_device_v1',
  };
}

export async function assessAndRegisterReferralDevice({
  supabase,
  request,
  userId,
  deviceToken,
  deviceInfo,
}) {
  const token = clean(deviceToken, 180);

  if (!DEVICE_TOKEN_PATTERN.test(token)) {
    return {
      ok: false,
      blocked: true,
      reason: 'DEVICE_TOKEN_REQUIRED',
    };
  }

  const info = normalizedDeviceInfo(deviceInfo);
  const userAgent = clean(request.headers.get('user-agent'), 260).toLowerCase();
  const network = ipNetwork(requestIp(request));
  const deviceHash = digest(`device|${token}`);
  const environmentHash = digest(
    `environment|${network}|${userAgent}|${info.platform}|${info.language}|${info.timezone}|${info.screen}|${info.colorDepth}|${info.cores}|${info.memory}`
  );
  const devicePrefix = `rf_device_${deviceHash.slice(0, 40)}`;
  const environmentPrefix = `rf_environment_${environmentHash.slice(0, 40)}`;
  const [deviceRows, environmentRows] = await Promise.all([
    readSignalRows(supabase, devicePrefix),
    readSignalRows(supabase, environmentPrefix),
  ]);
  const deviceUsers = deviceRows.map((row) => Number(row?.value?.userId)).filter(Number.isSafeInteger);
  const environmentUsers = environmentRows.map((row) => Number(row?.value?.userId)).filter(Number.isSafeInteger);
  let otherDeviceUser = deviceUsers.find((id) => id !== Number(userId));
  let otherEnvironmentUser = environmentUsers.find((id) => id !== Number(userId));
  const deviceKey = `${devicePrefix}_${Number(userId)}`;
  const environmentKey = `${environmentPrefix}_${Number(userId)}`;

  await Promise.all([
    saveSignal(supabase, deviceKey, userId, 'device'),
    saveSignal(supabase, environmentKey, userId, 'environment'),
  ]);

  // Parallel ochilgan ikki akkaunt ham alohida key yozadi. Yozuvdan keyingi
  // qayta tekshiruv simultaneous first-use bypassni yopadi.
  if (!otherDeviceUser || !otherEnvironmentUser) {
    const [confirmedDeviceRows, confirmedEnvironmentRows] = await Promise.all([
      readSignalRows(supabase, devicePrefix),
      readSignalRows(supabase, environmentPrefix),
    ]);
    otherDeviceUser = otherDeviceUser || confirmedDeviceRows
      .map((row) => Number(row?.value?.userId))
      .find((id) => Number.isSafeInteger(id) && id !== Number(userId));
    otherEnvironmentUser = otherEnvironmentUser || confirmedEnvironmentRows
      .map((row) => Number(row?.value?.userId))
      .find((id) => Number.isSafeInteger(id) && id !== Number(userId));
  }

  if (otherDeviceUser) {
    return {
      ok: true,
      blocked: true,
      reason: 'DEVICE_REUSED',
      matchedUserId: otherDeviceUser,
    };
  }

  if (otherEnvironmentUser) {
    return {
      ok: true,
      blocked: true,
      reason: 'ENVIRONMENT_REUSED',
      matchedUserId: otherEnvironmentUser,
    };
  }

  return {
    ok: true,
    blocked: false,
    deviceHash: deviceHash.slice(0, 16),
  };
}

export async function saveReferralAudit(supabase, {
  invitedId,
  inviterId,
  status,
  reason,
}) {
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: `referral_audit_${Number(invitedId)}`,
      value: {
        invitedId: Number(invitedId),
        inviterId: Number(inviterId),
        status: clean(status, 40),
        reason: clean(reason, 80),
        checkedAt: new Date().toISOString(),
      },
    },
    { onConflict: 'key' }
  );

  if (error) throw error;
}
