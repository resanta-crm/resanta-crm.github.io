import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/crm-promotions-telegram`;
const LEADER_EMAILS = ['sidarovich_kn@resanta.ru','payushin_ar@resanta.ru'];
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-telegram-bot-api-secret-token, x-crm-dispatch-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' }
});
const esc = (s: unknown) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

async function tg(method: string, payload: Record<string, unknown> = {}) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN_NOT_SET');
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(`TELEGRAM_${method.toUpperCase()}_FAILED`);
  return j.result;
}
async function runtimeGet(key: string) {
  const { data } = await db.from('crm_telegram_runtime').select('value').eq('key', key).maybeSingle();
  return data?.value || null;
}
async function runtimeSet(key: string, value: unknown) {
  const { error } = await db.from('crm_telegram_runtime').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}
async function currentProfile(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) throw new Error('AUTH_REQUIRED');
  const jwt = auth.slice(7);
  const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: u, error } = await authClient.auth.getUser(jwt);
  if (error || !u?.user?.id) throw new Error('AUTH_REQUIRED');
  const { data: profile } = await db.from('users').select('id,name,role').eq('id', u.user.id).maybeSingle();
  if (!profile) throw new Error('CRM_USER_NOT_FOUND');
  return profile;
}
async function requireBoss(req: Request) {
  const p = await currentProfile(req);
  if (p.role !== 'boss') throw new Error('BOSS_REQUIRED');
  return p;
}
async function setupWebhook(req: Request) {
  const boss = await requireBoss(req);
  const secret = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  await runtimeSet('webhook_secret', { secret });
  const me = await tg('getMe');
  await tg('setWebhook', { url: FUNCTION_URL, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: true });
  await runtimeSet('bot_meta', { username: me.username, id: me.id, configured_at: new Date().toISOString(), configured_by: boss.name });
  return json({ ok: true, username: me.username, configured: true });
}
async function send(chatId: number | string, text: string) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}
async function handleStart(msg: any, code: string) {
  const chatId = msg?.chat?.id;
  if (!chatId) return;
  if (!code) {
    await send(chatId, 'Откройте Resanta CRM → Акции и нажмите «Подключить Telegram». Ссылка из CRM привяжет ваш аккаунт безопасно.');
    return;
  }
  const { data: link } = await db.from('crm_telegram_link_codes').select('code,user_id,expires_at,used_at').eq('code', code).maybeSingle();
  if (!link || link.used_at || new Date(link.expires_at).getTime() < Date.now()) {
    await send(chatId, 'Эта ссылка недействительна или уже использована. Создайте новую через Resanta CRM → Акции → «Подключить Telegram».');
    return;
  }
  const telegramUserId = msg?.from?.id || null;
  const { data: otherChat } = await db.from('crm_telegram_bindings').select('user_id').eq('chat_id', chatId).maybeSingle();
  if (otherChat && String(otherChat.user_id) !== String(link.user_id)) {
    await send(chatId, 'Этот Telegram уже привязан к другому пользователю CRM. Обратитесь к администратору.');
    return;
  }
  const { data: profile } = await db.from('users').select('id,name,email').eq('id', link.user_id).maybeSingle();
  if (!profile) {
    await send(chatId, 'Пользователь CRM не найден. Создайте новую ссылку из CRM.');
    return;
  }
  const row = {
    user_id: link.user_id,
    chat_id: chatId,
    telegram_user_id: telegramUserId,
    telegram_username: msg?.from?.username || null,
    telegram_first_name: msg?.from?.first_name || null,
    active: true,
    updated_at: new Date().toISOString()
  };
  const { error: bindErr } = await db.from('crm_telegram_bindings').upsert(row, { onConflict: 'user_id' });
  if (bindErr) throw bindErr;
  await db.from('crm_telegram_link_codes').update({ used_at: new Date().toISOString() }).eq('code', link.code);
  await send(chatId, `✅ <b>Telegram подключён к Resanta CRM</b>\n\nПользователь: <b>${esc(profile.name)}</b>\nБот: уведомления по акциям и согласованиям.\n\nПо действиям менеджеров контрольную копию также получают Сидарович и Паюшин.`);
}
async function handleTelegram(req: Request) {
  const stored = await runtimeGet('webhook_secret');
  const expected = stored?.secret || '';
  const got = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!expected || got !== expected) return json({ ok: false }, 403);
  const update = await req.json().catch(() => ({}));
  const msg = update?.message;
  if (!msg) return json({ ok: true });
  const text = String(msg.text || '').trim();
  const m = text.match(/^\/start(?:@\w+)?(?:\s+([0-9a-f-]{36}))?$/i);
  if (m) await handleStart(msg, m[1] || '');
  else if (/^\/status(?:@\w+)?$/i.test(text)) {
    const { data: b } = await db.from('crm_telegram_bindings').select('user_id,active').eq('chat_id', msg.chat.id).maybeSingle();
    await send(msg.chat.id, b?.active ? '✅ Telegram подключён к Resanta CRM.' : 'Telegram пока не привязан. Откройте CRM → Акции → «Подключить Telegram».');
  } else if (/^\/test(?:@\w+)?$/i.test(text)) {
    const { data: b } = await db.from('crm_telegram_bindings').select('user_id,active').eq('chat_id', msg.chat.id).maybeSingle();
    if (!b?.active) await send(msg.chat.id, 'Сначала подключите Telegram из Resanta CRM → Акции.');
    else {
      const { data: p } = await db.from('users').select('name').eq('id', b.user_id).maybeSingle();
      await send(msg.chat.id, `🧪 <b>Тест Resanta CRM · Акции</b>\n\nПолучатель: <b>${esc(p?.name || 'пользователь')}</b>\n\n🔴 <b>Пример уведомления</b>\nКлиент: тестовый\nДействие: загрузить обязательное фото «Старт»\nСрок: сегодня\n\n✅ Связка CRM → Telegram работает.`);
    }
  }
  return json({ ok: true });
}

type QueueRow = {
  id:string; recipient_user_id:string|null; event_type:string; severity:string; message:string; action_url:string|null;
  scheduled_at:string; attempts:number;
};
type UserRow = {id:string; name:string; email:string|null; role:string|null};

async function dispatchPending(req: Request) {
  const stored = await runtimeGet('dispatch_secret');
  const expected = stored?.secret || '';
  const got = req.headers.get('x-crm-dispatch-secret') || '';
  if (!expected || got !== expected) return json({ ok: false, error: 'FORBIDDEN' }, 403);

  await db.rpc('crm_refresh_promotion_notifications_v2');
  const { data: rawRows, error } = await db.from('promotion_notification_queue')
    .select('id,recipient_user_id,event_type,severity,message,action_url,scheduled_at,attempts')
    .eq('status','pending').lte('scheduled_at',new Date().toISOString()).lt('attempts',5)
    .order('severity',{ascending:true}).order('scheduled_at',{ascending:true}).limit(100);
  if (error) throw error;
  const rows = (rawRows || []) as QueueRow[];
  if (!rows.length) return json({ok:true,sent_users:0,sent_events:0,deliveries:0});

  const primaryIds = [...new Set(rows.map(x=>x.recipient_user_id).filter(Boolean))] as string[];
  const { data: primaryUsers, error: pe } = await db.from('users').select('id,name,email,role').in('id',primaryIds);
  if (pe) throw pe;
  const { data: leaderUsers, error: le } = await db.from('users').select('id,name,email,role').in('email',LEADER_EMAILS);
  if (le) throw le;
  const primaryMap = new Map((primaryUsers||[]).map((x:any)=>[String(x.id),x as UserRow]));
  const leaders = (leaderUsers||[]) as UserRow[];

  const audienceFor = (r:QueueRow):UserRow[] => {
    const primary = r.recipient_user_id ? primaryMap.get(String(r.recipient_user_id)) : null;
    if (!primary) return [];
    const list:UserRow[] = [primary];
    if (String(primary.role||'') !== 'boss') list.push(...leaders);
    const seen = new Set<string>();
    return list.filter(x=>x?.id && !seen.has(String(x.id)) && seen.add(String(x.id)));
  };

  const targetIds = [...new Set(rows.flatMap(r=>audienceFor(r).map(x=>String(x.id))))];
  const { data: bindings, error: be } = targetIds.length
    ? await db.from('crm_telegram_bindings').select('user_id,chat_id,active').in('user_id',targetIds).eq('active',true)
    : {data:[],error:null};
  if (be) throw be;
  const bind = new Map((bindings||[]).map((x:any)=>[String(x.user_id),x]));

  const qids = rows.map(x=>x.id);
  const { data: oldLog, error: de } = await db.from('promotion_notification_delivery_log')
    .select('queue_id,recipient_user_id').in('queue_id',qids);
  if (de) throw de;
  const delivered = new Set((oldLog||[]).map((x:any)=>`${x.queue_id}|${x.recipient_user_id}`));

  const perRecipient = new Map<string,{user:UserRow; items:{row:QueueRow; owner:UserRow}[]} >();
  for (const r of rows) {
    const owner = r.recipient_user_id ? primaryMap.get(String(r.recipient_user_id)) : null;
    if (!owner) continue;
    for (const target of audienceFor(r)) {
      const key = `${r.id}|${target.id}`;
      if (delivered.has(key)) continue;
      if (!bind.get(String(target.id))) continue;
      if (!perRecipient.has(String(target.id))) perRecipient.set(String(target.id),{user:target,items:[]});
      perRecipient.get(String(target.id))!.items.push({row:r,owner});
    }
  }

  let sentUsers=0, deliveries=0;
  for (const [uid, pack] of perRecipient) {
    const b:any = bind.get(uid); if (!b) continue;
    const group = pack.items.slice(0,8);
    if (!group.length) continue;
    const parts = group.map((x,i)=>{
      const msg=esc(String(x.row.message||'').replaceAll('\\n','\n'));
      const ownerLine = String(x.owner.id)===uid ? '' : `\n👤 Менеджер: <b>${esc(x.owner.name)}</b>`;
      const link=x.row.action_url?`\n<a href="${String(x.row.action_url).replace(/"/g,'')}">Открыть в CRM</a>`:'';
      return `${i+1}. ${msg}${ownerLine}${link}`;
    });
    const text = `🔔 <b>Resanta CRM · Акции</b>\n\n${parts.join('\n\n')}`;
    try {
      await send(b.chat_id,text);
      const logRows = group.map(x=>({queue_id:x.row.id,recipient_user_id:uid,telegram_chat_id:b.chat_id,delivered_at:new Date().toISOString()}));
      const { error: ie } = await db.from('promotion_notification_delivery_log').upsert(logRows,{onConflict:'queue_id,recipient_user_id',ignoreDuplicates:true});
      if (ie) throw ie;
      group.forEach(x=>delivered.add(`${x.row.id}|${uid}`));
      sentUsers++; deliveries+=group.length;
    } catch (e) {
      const err=e instanceof Error?e.message:String(e);
      const affected=[...new Set(group.map(x=>x.row.id))];
      for(const qid of affected){
        const src=rows.find(x=>x.id===qid);
        await db.from('promotion_notification_queue').update({attempts:(src?.attempts||0)+1,last_error:err,updated_at:new Date().toISOString()}).eq('id',qid);
      }
    }
  }

  const completedIds:string[]=[];
  for (const r of rows) {
    const audience = audienceFor(r);
    if (audience.length && audience.every(x=>delivered.has(`${r.id}|${x.id}`))) completedIds.push(r.id);
  }
  if (completedIds.length) {
    const { error: ue } = await db.from('promotion_notification_queue').update({status:'sent',sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),last_error:null}).in('id',completedIds);
    if (ue) throw ue;
  }
  return json({ok:true,sent_users:sentUsers,sent_events:completedIds.length,deliveries});
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('setup') === '1') return await setupWebhook(req);
    if (url.searchParams.get('dispatch') === '1') return await dispatchPending(req);
    if (req.method === 'POST') return await handleTelegram(req);
    return json({ ok: true, service: 'crm-promotions-telegram', routing: 'manager+sidarovich+payushin' });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : 'UNKNOWN_ERROR';
    const status = ['AUTH_REQUIRED','BOSS_REQUIRED'].includes(message) ? 403 : 500;
    return json({ ok: false, error: message }, status);
  }
});
