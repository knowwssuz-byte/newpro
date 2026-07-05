#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const input = require('input');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);

  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const apiId = Number(process.env.TG_API_ID || process.env.TELEGRAM_API_ID || 0);
const apiHash = String(process.env.TG_API_HASH || process.env.TELEGRAM_API_HASH || '').trim();

if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash) {
  console.error('TG_API_ID va TG_API_HASH kerak.');
  console.error('Masalan .env.local ichiga:');
  console.error('TG_API_ID=123456');
  console.error('TG_API_HASH=abcdef1234567890abcdef1234567890');
  process.exit(1);
}

const session = new StringSession('');
const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
});

(async () => {
  console.log('Telegram admin account session olinmoqda...');
  console.log('Bu sessionni hech kimga bermang va GitHubga qo‘shmang.');

  await client.start({
    phoneNumber: async () => input.text('Telefon raqam (+998...): '),
    phoneCode: async () => input.text('Telegram code: '),
    password: async () => input.text('2FA password bo‘lsa kiriting: '),
    onError: (error) => console.error('Login xatosi:', error?.message || error),
  });

  const saved = client.session.save();
  const outputPath = path.join(process.cwd(), 'telegram.session.txt');
  fs.writeFileSync(outputPath, saved, 'utf8');

  console.log('\n✅ Session tayyor.');
  console.log(`Faylga yozildi: ${outputPath}`);
  console.log('\nVercel ENV ichiga shuni qo‘ying:');
  console.log(`TG_STRING_SESSION=${saved}`);

  await client.disconnect();
})();
