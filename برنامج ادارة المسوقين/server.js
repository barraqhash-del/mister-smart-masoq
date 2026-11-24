const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { db, databasePath } = require('./db');

const scrypt = promisify(crypto.scrypt);
const root = __dirname;
const PORT = Number(process.env.PORT || 4173);
const SESSION_COOKIE = 'bm_session';
const CSRF_COOKIE = 'bm_csrf';
const loginAttempts = new Map();
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };

function json(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...extra });
  res.end(JSON.stringify(body));
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const i=x.indexOf('='); return [x.slice(0,i), decodeURIComponent(x.slice(i+1))];
  }));
}
function cookie(name, value, req, httpOnly = true, maxAge = 28800) {
  return name+'='+encodeURIComponent(value)+'; Path=/; SameSite=Strict; Max-Age='+maxAge+(httpOnly?'; HttpOnly':'')+(req.socket.encrypted?'; Secure':'');
}
function hashToken(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function safeEqual(a,b) {
  const x=Buffer.from(String(a||'')); const y=Buffer.from(String(b||''));
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
function normalizePhone(value) {
  return String(value||'').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g,'');
}
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'')); }
function validText(value, max=160) { return typeof value==='string' && value.trim().length>0 && value.trim().length<=max; }
function audit(actor, action, type, id, details={}) {
  db.prepare('INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?)')
    .run(actor||null,action,type,id||null,JSON.stringify(details));
}
async function readBody(req) {
  let raw=''; for await (const part of req) { raw+=part; if(raw.length>1024*1024) throw Object.assign(new Error('too_large'),{status:413}); }
  if(!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('invalid_json'),{status:400}); }
}
function requireCsrf(req) {
  const c=cookies(req);
  if(!c[CSRF_COOKIE] || !safeEqual(c[CSRF_COOKIE],req.headers['x-csrf-token'])) throw Object.assign(new Error('csrf_failed'),{status:403});
}
async function authenticate(req) {
  const token=cookies(req)[SESSION_COOKIE];
  if(!token) return null;
  return db.prepare(`SELECT u.id,u.full_name,u.email,u.phone,u.role,u.is_active,s.token_hash
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.is_active=1`).get(hashToken(token)) || null;
}
function requireRole(user, roles) {
  if(!user) throw Object.assign(new Error('unauthorized'),{status:401});
  if(roles && !roles.includes(user.role)) throw Object.assign(new Error('forbidden'),{status:403});
}
function rateLimit(req) {
  const ip=req.socket.remoteAddress||'unknown', now=Date.now();
  const item=loginAttempts.get(ip)||{count:0,start:now};
  if(now-item.start>15*60*1000){item.count=0;item.start=now;}
  if(item.count>=8) return false;
  item.count++; loginAttempts.set(ip,item); return true;
}
function clearRateLimit(req){loginAttempts.delete(req.socket.remoteAddress||'unknown');}
async function passwordHash(password) {
  const salt=crypto.randomBytes(16);
  const derived=await scrypt(password,salt,64);
  return 'scrypt$'+salt.toString('hex')+'$'+derived.toString('hex');
}
async function verifyPassword(password, encoded) {
  const [scheme,saltHex,hashHex]=String(encoded||'').split('$');
  if(scheme!=='scrypt'||!saltHex||!hashHex) return false;
  const expected=Buffer.from(hashHex,'hex');
  const actual=await scrypt(password,Buffer.from(saltHex,'hex'),expected.length);
  return expected.length===actual.length && crypto.timingSafeEqual(expected,actual);
}

async function handleApi(req,res,url) {
  const method=req.method, p=url.pathname;
  if(p==='/api/health' && method==='GET') {
    try { const check=db.prepare('PRAGMA quick_check').get().quick_check;
      return json(res,check==='ok'?200:503,{ok:check==='ok',service:'basma-marketers',database:'sqlite',databaseFile:path.basename(databasePath),mode:'api-foundation'});
    } catch { return json(res,503,{ok:false,error:'database_unavailable'}); }
  }
  if(p==='/api/setup-status' && method==='GET') {
    return json(res,200,{needsBootstrap:db.prepare("SELECT COUNT(*) n FROM users WHERE email<>'development@local.invalid'").get().n===0});
  }
  if(p==='/api/bootstrap' && method==='POST') {
    const key=process.env.BASMA_BOOTSTRAP_KEY;
    if(!key || !safeEqual(key,req.headers['x-bootstrap-key'])) return json(res,403,{error:'bootstrap_not_authorized'});
    if(db.prepare("SELECT COUNT(*) n FROM users WHERE email<>'development@local.invalid'").get().n>0) return json(res,409,{error:'bootstrap_already_completed'});
    const b=await readBody(req);
    if(!validText(b.fullName,120)||!validEmail(b.email)||typeof b.password!=='string'||b.password.length<12||b.password.length>200)
      return json(res,400,{error:'invalid_manager_details',message:'أدخل الاسم والبريد وكلمة مرور لا تقل عن 12 حرفاً.'});
    let id=crypto.randomUUID();
    const hash=await passwordHash(b.password);
    const devUser=db.prepare("SELECT id FROM users WHERE email='development@local.invalid'").get();
    if(devUser) {
      id=devUser.id;
      db.prepare("UPDATE users SET full_name=?,email=?,password_hash=? WHERE id=?").run(b.fullName.trim(),b.email.trim().toLowerCase(),hash,id);
    } else {
      db.prepare("INSERT INTO users(id,full_name,email,password_hash,role) VALUES(?,?,?,?,'manager')").run(id,b.fullName.trim(),b.email.trim().toLowerCase(),hash);
    }
    audit(id,'bootstrap_manager_created','user',id);
    return json(res,201,{ok:true,user:{id,fullName:b.fullName.trim(),email:b.email.trim().toLowerCase(),role:'manager'}});
  }
  if(p==='/api/login' && method==='POST') {
    if(!rateLimit(req)) return json(res,429,{error:'too_many_attempts'});
    const b=await readBody(req);
    const identity=String(b.email||'').trim().toLowerCase();
    const user=db.prepare('SELECT * FROM users WHERE email=? AND is_active=1').get(identity);
    if(!user || typeof b.password!=='string' || !(await verifyPassword(b.password,user.password_hash)))
      return json(res,401,{error:'invalid_credentials'});
    clearRateLimit(req);
    const token=crypto.randomBytes(32).toString('base64url');
    const csrf=crypto.randomBytes(24).toString('hex');
    const hours=Number(db.prepare("SELECT value_json FROM app_settings WHERE key='session_hours'").get()?.value_json||8);
    const expiry=Math.max(1,Math.min(hours,24))*60*60;
    db.prepare("DELETE FROM sessions WHERE expires_at<=datetime('now')").run();
    db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now',?))").run(hashToken(token),user.id,'+'+Math.round(expiry/3600)+' hours');
    audit(user.id,'login','session',null);
    return json(res,200,{ok:true,user:{id:user.id,fullName:user.full_name,email:user.email,role:user.role}},{
      'Set-Cookie':[cookie(SESSION_COOKIE,token,req,true,expiry),cookie(CSRF_COOKIE,csrf,req,false,expiry)]
    });
  }
  if(p==='/api/logout' && method==='POST') {
    const user=await authenticate(req); requireRole(user);
    requireCsrf(req);
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);
    return json(res,200,{ok:true},{'Set-Cookie':[cookie(SESSION_COOKIE,'',req,true,0),cookie(CSRF_COOKIE,'',req,false,0)]});
  }
  const user=await authenticate(req);
  if(p==='/api/me' && method==='GET') {
    requireRole(user);
    return json(res,200,{user:{id:user.id,fullName:user.full_name,email:user.email,phone:user.phone,role:user.role}});
  }
  if(p==='/api/users' && method==='GET') {
    requireRole(user,['manager']);
    const rows=db.prepare('SELECT id,full_name,email,phone,role,is_active,created_at FROM users ORDER BY created_at DESC').all();
    return json(res,200,{users:rows});
  }
  if(p==='/api/users' && method==='POST') {
    requireRole(user,['manager']); requireCsrf(req);
    const b=await readBody(req);
    if(!validText(b.fullName,120)||!validEmail(b.email)||typeof b.password!=='string'||b.password.length<12||b.password.length>200)
      return json(res,400,{error:'invalid_user_details'});
    const id=crypto.randomUUID(), hash=await passwordHash(b.password);
    try {
      db.prepare("INSERT INTO users(id,full_name,email,phone,password_hash,role) VALUES(?,?,?,?,?,'marketer')")
        .run(id,b.fullName.trim(),b.email.trim().toLowerCase(),b.phone?normalizePhone(b.phone):null,hash);
    } catch(e) { if(String(e.message).includes('UNIQUE')) return json(res,409,{error:'email_already_exists'}); throw e; }
    audit(user.id,'marketer_created','user',id);
    return json(res,201,{user:{id,fullName:b.fullName.trim(),email:b.email.trim().toLowerCase(),role:'marketer'}});
  }
  if(p==='/api/customers' && method==='GET') {
    requireRole(user,['manager','marketer']);
    const q=String(url.searchParams.get('q')||'').trim();
    const like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
    const rows=db.prepare(`SELECT c.*,u.full_name AS marketer_name,
        r.marketer_id AS reserved_by,ru.full_name AS reserved_by_name,r.expires_at AS reservation_expires_at
      FROM customers c
      LEFT JOIN users u ON u.id=c.assigned_to
      LEFT JOIN reservations r ON r.customer_id=c.id AND r.status='active' AND r.expires_at>datetime('now')
      LEFT JOIN users ru ON ru.id=r.marketer_id
      WHERE (?='' OR c.business_name LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.street LIKE ? ESCAPE '\\' OR c.neighborhood LIKE ? ESCAPE '\\' OR c.address_description LIKE ? ESCAPE '\\')
      ORDER BY c.created_at DESC LIMIT 500`).all(q,like,like,like,like,like);
    return json(res,200,{customers:rows});
  }
  if(p==='/api/unconverted-customers' && method==='GET') {
    requireRole(user,['manager','marketer']);
    const rows=db.prepare(`SELECT c.*,u.full_name AS marketer_name,
        lv.last_visit_at,lv.last_result,lv.last_marketer_name,lv.visit_count,
        r.marketer_id AS reserved_by,ru.full_name AS reserved_by_name,r.expires_at AS reservation_expires_at
      FROM customers c
      JOIN (
        SELECT v.customer_id,MAX(v.visited_at) AS last_visit_at,
          (SELECT v2.result FROM visits v2 WHERE v2.customer_id=v.customer_id ORDER BY v2.visited_at DESC,v2.created_at DESC LIMIT 1) AS last_result,
          (SELECT u2.full_name FROM visits v3 JOIN users u2 ON u2.id=v3.marketer_id WHERE v3.customer_id=v.customer_id ORDER BY v3.visited_at DESC,v3.created_at DESC LIMIT 1) AS last_marketer_name,
          COUNT(*) AS visit_count
        FROM visits v GROUP BY v.customer_id
      ) lv ON lv.customer_id=c.id
      LEFT JOIN users u ON u.id=c.assigned_to
      LEFT JOIN reservations r ON r.customer_id=c.id AND r.status='active' AND r.expires_at>datetime('now')
      LEFT JOIN users ru ON ru.id=r.marketer_id
      WHERE c.status<>'sold'
        AND lv.last_visit_at<=datetime('now','-10 days')
        AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.customer_id=c.id AND s.status='approved')
      ORDER BY lv.last_visit_at ASC LIMIT 1000`).all();
    return json(res,200,{customers:rows});
  }
  if(p==='/api/customers' && method==='POST') {
    requireRole(user,['manager','marketer']); requireCsrf(req);
    const b=await readBody(req);
    if(!validText(b.businessName,180)) return json(res,400,{error:'business_name_required'});
    const phone=normalizePhone(b.phone);
    const city=String(b.city||'').trim(), district=String(b.district||'').trim(), street=String(b.street||'').trim();
    const id=crypto.randomUUID();
    const assigned=user.role==='manager'?(b.assignedTo||null):user.id;
    if(assigned && !db.prepare("SELECT id FROM users WHERE id=? AND role='marketer' AND is_active=1").get(assigned))
      return json(res,400,{error:'invalid_assignee'});
    let created;
    try {
      db.exec('BEGIN IMMEDIATE');
      const duplicate=db.prepare(`SELECT id,business_name,phone,city,district,neighborhood,street FROM customers
        WHERE (?<>'' AND phone_normalized=?) OR (lower(business_name)=lower(?) AND lower(city)=lower(?) AND lower(district)=lower(?) AND lower(street)=lower(?)) LIMIT 10`)
        .all(phone,phone,b.businessName.trim(),city,district,street);
      if(duplicate.length) { db.exec('ROLLBACK'); return json(res,409,{error:'possible_duplicate',matches:duplicate}); }
      db.prepare(`INSERT INTO customers(id,business_name,business_type,phone,phone_normalized,city,district,neighborhood,street,address_description,latitude,longitude,photo_path,status,created_by,assigned_to)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,b.businessName.trim(),String(b.businessType||'').trim()||null,b.phone||null,phone||null,city||null,district||null,String(b.neighborhood||'').trim()||null,street||null,String(b.addressDescription||'').trim()||null,b.latitude??null,b.longitude??null,null,'new',user.id,assigned);
      db.exec('COMMIT');
      created=db.prepare('SELECT * FROM customers WHERE id=?').get(id);
    } catch(e) { try{db.exec('ROLLBACK')}catch{} throw e; }
    audit(user.id,'customer_created','customer',id);
    return json(res,201,{customer:created});
  }

  if(p==='/api/reservations' && method==='POST') {
    requireRole(user,['marketer']); requireCsrf(req);
    const b=await readBody(req);
    if(!validText(b.customerId,80)) return json(res,400,{error:'customer_id_required'});
    const customer=db.prepare(`SELECT id,assigned_to,status,
      (SELECT MAX(visited_at) FROM visits WHERE customer_id=customers.id) AS last_visit_at
      FROM customers WHERE id=?`).get(b.customerId);
    if(!customer) return json(res,404,{error:'customer_not_found'});
    const cutoff=db.prepare("SELECT datetime('now','-10 days') AS value").get().value;
    const isRevisitAvailable=customer.status!=='sold' && !!customer.last_visit_at &&
      customer.last_visit_at<=cutoff &&
      !db.prepare("SELECT 1 FROM sales WHERE customer_id=? AND status='approved' LIMIT 1").get(b.customerId);
    if(customer.assigned_to && customer.assigned_to!==user.id && !isRevisitAvailable)
      return json(res,403,{error:'customer_assigned_to_another'});
    const minutes=Number(db.prepare("SELECT value_json FROM app_settings WHERE key='reservation_minutes'").get()?.value_json||120);
    const reservationId=crypto.randomUUID();
    try {
      db.exec('BEGIN IMMEDIATE');
      const latestCustomer=db.prepare(`SELECT id,assigned_to,status,
        (SELECT MAX(visited_at) FROM visits WHERE customer_id=customers.id) AS last_visit_at
        FROM customers WHERE id=?`).get(b.customerId);
      if(!latestCustomer) { db.exec('ROLLBACK'); return json(res,404,{error:'customer_not_found'}); }
      const latestCutoff=db.prepare("SELECT datetime('now','-10 days') AS value").get().value;
      const latestRevisitAvailable=latestCustomer.status!=='sold' && !!latestCustomer.last_visit_at &&
        latestCustomer.last_visit_at<=latestCutoff &&
        !db.prepare("SELECT 1 FROM sales WHERE customer_id=? AND status='approved' LIMIT 1").get(b.customerId);
      if(latestCustomer.assigned_to && latestCustomer.assigned_to!==user.id && !latestRevisitAvailable) {
        db.exec('ROLLBACK');
        return json(res,403,{error:'customer_assigned_to_another'});
      }
      db.prepare("UPDATE reservations SET status='expired',released_at=datetime('now') WHERE customer_id=? AND status='active' AND expires_at<=datetime('now')").run(b.customerId);
      const active=db.prepare("SELECT id,marketer_id,expires_at FROM reservations WHERE customer_id=? AND status='active'").get(b.customerId);
      if(active) { db.exec('ROLLBACK'); return json(res,409,{error:'customer_reserved',reservation:active}); }
      db.prepare("INSERT INTO reservations(id,customer_id,marketer_id,expires_at) VALUES(?,?,?,datetime('now',?))")
        .run(reservationId,b.customerId,user.id,'+'+Math.max(5,Math.min(minutes,1440))+' minutes');
      db.exec('COMMIT');
    } catch(e) { try{db.exec('ROLLBACK')}catch{} throw e; }
    audit(user.id,'customer_reserved','reservation',reservationId,{customerId:b.customerId});
    return json(res,201,{reservation:db.prepare('SELECT * FROM reservations WHERE id=?').get(reservationId)});
  }
  if(p==='/api/reservations' && method==='GET') {
    requireRole(user,['manager','marketer']);
    const rows=db.prepare(`SELECT r.*,c.business_name,u.full_name AS marketer_name
      FROM reservations r JOIN customers c ON c.id=r.customer_id JOIN users u ON u.id=r.marketer_id
      WHERE r.status='active' AND r.expires_at>datetime('now')
        AND (?='manager' OR r.marketer_id=?) ORDER BY r.reserved_at DESC`).all(user.role,user.id);
    return json(res,200,{reservations:rows});
  }
  const cancelReservation=p.match(/^\/api\/reservations\/([0-9a-f-]+)$/i);
  if(cancelReservation && method==='DELETE') {
    requireRole(user,['manager']); requireCsrf(req);
    const result=db.prepare("UPDATE reservations SET status='cancelled',released_at=datetime('now'),released_by=? WHERE id=? AND status='active'")
      .run(user.id,cancelReservation[1]);
    if(!result.changes) return json(res,404,{error:'active_reservation_not_found'});
    audit(user.id,'reservation_cancelled','reservation',cancelReservation[1]);
    return json(res,200,{ok:true});
  }
  const assignment=p.match(/^\/api\/customers\/([0-9a-f-]+)\/assignment$/i);
  if(assignment && method==='PATCH') {
    requireRole(user,['manager']); requireCsrf(req);
    const b=await readBody(req);
    const nextAssignee=b.assignedTo==null||b.assignedTo===''?null:String(b.assignedTo);
    if(nextAssignee && !db.prepare("SELECT id FROM users WHERE id=? AND role='marketer' AND is_active=1").get(nextAssignee))
      return json(res,400,{error:'invalid_assignee'});
    let result;
    db.exec('BEGIN IMMEDIATE');
    try {
      const customer=db.prepare('SELECT id,assigned_to FROM customers WHERE id=?').get(assignment[1]);
      if(!customer) { db.exec('ROLLBACK'); return json(res,404,{error:'customer_not_found'}); }
      if(customer.assigned_to===nextAssignee) {
        db.exec('ROLLBACK');
        return json(res,200,{ok:true,unchanged:true,assignedTo:nextAssignee});
      }
      const released=db.prepare("UPDATE reservations SET status='cancelled',released_at=datetime('now'),released_by=? WHERE customer_id=? AND status='active'").run(user.id,customer.id);
      db.prepare("UPDATE customers SET assigned_to=?,updated_at=datetime('now') WHERE id=?").run(nextAssignee,customer.id);
      audit(user.id,'customer_reassigned','customer',customer.id,{from:customer.assigned_to,to:nextAssignee,cancelledReservations:released.changes});
      result={from:customer.assigned_to,to:nextAssignee,cancelledReservations:released.changes};
      db.exec('COMMIT');
    } catch(e) { try{db.exec('ROLLBACK')}catch{} throw e; }
    return json(res,200,{ok:true,...result});
  }
  if(p==='/api/visits' && method==='GET') {
    requireRole(user,['manager','marketer']);
    const rows=db.prepare(`SELECT v.*,c.business_name,u.full_name AS marketer_name
      FROM visits v JOIN customers c ON c.id=v.customer_id JOIN users u ON u.id=v.marketer_id
      WHERE (?='manager' OR v.marketer_id=?)
      ORDER BY v.visited_at DESC LIMIT 1000`).all(user.role,user.id);
    return json(res,200,{visits:rows});
  }
  if(p==='/api/visits' && method==='POST') {
    requireRole(user,['manager','marketer']); requireCsrf(req);
    const b=await readBody(req);
    if(!validText(b.customerId,80)||!validText(b.result,100)) return json(res,400,{error:'invalid_visit'});
    const customer=db.prepare('SELECT id FROM customers WHERE id=?').get(b.customerId);
    if(!customer) return json(res,404,{error:'customer_not_found'});
    if(user.role==='marketer') {
      const reservation=db.prepare("SELECT id FROM reservations WHERE customer_id=? AND marketer_id=? AND status='active' AND expires_at>datetime('now')")
        .get(b.customerId,user.id);
      const ownership=db.prepare('SELECT created_by,assigned_to FROM customers WHERE id=?').get(b.customerId);
      const directlyOwned=ownership.created_by===user.id && (!ownership.assigned_to || ownership.assigned_to===user.id);
      if(!reservation && !directlyOwned) return json(res,409,{error:'reservation_required'});
    }
    const lat=b.latitude==null?null:Number(b.latitude), lng=b.longitude==null?null:Number(b.longitude);
    if((lat!==null&&(!Number.isFinite(lat)||lat < -90||lat>90))||(lng!==null&&(!Number.isFinite(lng)||lng < -180||lng>180)))
      return json(res,400,{error:'invalid_coordinates'});
    const id=crypto.randomUUID();
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO visits(id,customer_id,marketer_id,result,notes,latitude,longitude) VALUES(?,?,?,?,?,?,?)')
        .run(id,b.customerId,user.id,b.result.trim(),String(b.notes||'').trim()||null,lat,lng);
      db.prepare("UPDATE reservations SET status='completed',released_at=datetime('now') WHERE customer_id=? AND marketer_id=? AND status='active'")
        .run(b.customerId,user.id);
      const nextStatus=b.result==='تم البيع'?'sold':(['مهتم','طلب عرض سعر','متابعة لاحقاً'].includes(b.result)?'follow_up':'visited');
      db.prepare("UPDATE customers SET status=?,updated_at=datetime('now') WHERE id=?").run(nextStatus,b.customerId);
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK'); throw e; }
    audit(user.id,'visit_created','visit',id);
    return json(res,201,{visit:db.prepare('SELECT * FROM visits WHERE id=?').get(id)});
  }
  const correction=p.match(/^\/api\/visits\/([0-9a-f-]+)\/corrections$/i);
  if(correction && method==='POST') {
    requireRole(user,['manager','marketer']); requireCsrf(req);
    const b=await readBody(req);
    if(!validText(b.reason,1000)) return json(res,400,{error:'correction_reason_required'});
    const visit=db.prepare('SELECT id,marketer_id FROM visits WHERE id=?').get(correction[1]);
    if(!visit) return json(res,404,{error:'visit_not_found'});
    if(user.role==='marketer'&&visit.marketer_id!==user.id) return json(res,403,{error:'not_visit_owner'});
    const id=crypto.randomUUID();
    db.prepare('INSERT INTO visit_correction_requests(id,visit_id,requested_by,reason,proposed_correction) VALUES(?,?,?,?,?)')
      .run(id,visit.id,user.id,b.reason.trim(),JSON.stringify(b.proposedCorrection||{}));
    audit(user.id,'visit_correction_requested','visit_correction',id);
    return json(res,201,{request:db.prepare('SELECT * FROM visit_correction_requests WHERE id=?').get(id)});
  }

  if(p==='/api/visit-corrections' && method==='GET') {
    requireRole(user,['manager']);
    const rows=db.prepare(`SELECT r.*,v.customer_id,c.business_name,u.full_name AS requested_by_name
      FROM visit_correction_requests r JOIN visits v ON v.id=r.visit_id
      JOIN customers c ON c.id=v.customer_id JOIN users u ON u.id=r.requested_by
      ORDER BY r.created_at DESC LIMIT 500`).all();
    return json(res,200,{requests:rows});
  }
  const review=p.match(/^\/api\/visit-corrections\/([0-9a-f-]+)$/i);
  if(review && method==='PATCH') {
    requireRole(user,['manager']); requireCsrf(req);
    const b=await readBody(req);
    if(!['approved','rejected'].includes(b.status)) return json(res,400,{error:'invalid_review_status'});
    const result=db.prepare("UPDATE visit_correction_requests SET status=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND status='pending'")
      .run(b.status,user.id,review[1]);
    if(!result.changes) return json(res,404,{error:'pending_request_not_found'});
    audit(user.id,'visit_correction_reviewed','visit_correction',review[1],{status:b.status});
    return json(res,200,{ok:true,status:b.status,originalVisitUnchanged:true});
  }
  return false;
}

const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','geolocation=(self)');
  let url;
  try { url=new URL(req.url||'/', 'http://localhost'); }
  catch { return json(res,400,{error:'bad_request'}); }
  if(url.pathname.startsWith('/api/')) {
    try {
      const handled=await handleApi(req,res,url);
      if(handled!==false) return handled;
      return json(res,404,{error:'not_found'});
    } catch(e) {
      const status=e.status||500;
      if(status>=500) console.error('API error:',e.message);
      return json(res,status,{error:status===500?'internal_error':e.message});
    }
  }
  if(!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{'Allow':'GET, HEAD'}); return res.end(); }
  const allowed=new Set(['/','/index.html','/styles.css','/app.js']);
  if(!allowed.has(url.pathname)) { res.writeHead(404); return res.end('Not found'); }
  const file=path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);return res.end('Not found');}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    if(req.method==='HEAD') return res.end();
    res.end(data);
  });
});

server.listen(PORT,process.env.BASMA_HOST || '127.0.0.1',()=>{
  console.log('Basma Marketers API running at http://localhost:'+PORT);
  console.log('Database:',databasePath);
});
process.on('SIGINT',()=>{server.close(()=>{db.close();process.exit(0);});});
process.on('SIGTERM',()=>{server.close(()=>{db.close();process.exit(0);});});
