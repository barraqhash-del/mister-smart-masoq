const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { db } = require('./db');

// Local desktop mode uses real authentication. The server binds to loopback by default.
const devEmail = 'development@local.invalid';
const realUsers = db.prepare('SELECT COUNT(*) AS n FROM users WHERE email<>?').get(devEmail).n;

if (realUsers === 0 && !process.env.BASMA_BOOTSTRAP_KEY) {
  const key = crypto.randomBytes(32).toString('base64url');
  process.env.BASMA_BOOTSTRAP_KEY = key;
  try {
    execFileSync('clip.exe', [], { input: key, encoding: 'utf8' });
    console.log('تم نسخ مفتاح تهيئة المدير إلى الحافظة.');
  } catch {
    console.log('تعذر النسخ التلقائي إلى الحافظة.');
  }
  console.log('مفتاح تهيئة المدير الأول (يستخدم مرة واحدة فقط):');
  console.log(key);
}

console.log('المصادقة الحقيقية مفعلة. افتح http://localhost:' + (process.env.PORT || 4173));
require('./server');
