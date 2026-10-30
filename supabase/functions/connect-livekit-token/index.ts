// RESANTA CONNECT #131: LiveKit participant-token minting. Never expose API secret.
// Separate Edge Function; existing CRM endpoints, DB objects and secrets are unchanged.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { AccessToken } from "npm:livekit-server-sdk@2.19.2";

const origins = new Set([
  "https://resanta-crm.by",
  "https://www.resanta-crm.by",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://resanta-crm.by",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}
function json(req: Request, status: number, value: Record<string, unknown>) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
  });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "POST required" });
  const origin = req.headers.get("origin");
  if (origin && !origins.has(origin)) return json(req, 403, { ok: false, error: "Origin denied" });
  const authorization = req.headers.get("authorization") || "";
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === authorization) return json(req, 401, { ok: false, error: "Войдите в CRM заново." });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("bad payload");
    body = parsed;
  } catch (_e) {
    return json(req, 400, { ok: false, error: "Invalid request" });
  }
  const roomId = String(body.room_id || "").trim().toLowerCase();
  if (!uuid.test(roomId)) return json(req, 400, { ok: false, error: "Incorrect room identifier" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json(req, 503, { ok: false, error: "CRM auth temporarily unavailable" });

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Authorization JWT is checked on Supabase Auth server; no untrusted client ID accepted.
    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData.user?.id) {
      return json(req, 401, { ok: false, error: "Сессия CRM истекла. Войдите снова." });
    }
    const userId = authData.user.id;

    // Uses existing RLS and roster validation. No service-role access is used here.
    const [staffCheck, memberCheck, profileCheck] = await Promise.all([
      supabase.rpc("connect_active_staff_v1", { p_user_id: userId }),
      supabase.from("connect_room_members_v1").select("room_id")
        .eq("room_id", roomId).eq("user_id", userId).maybeSingle(),
      supabase.from("users").select("id,name,email").eq("id", userId).maybeSingle(),
    ]);
    if (staffCheck.error || memberCheck.error || profileCheck.error) {
      return json(req, 503, { ok: false, error: "Проверка прав CRM временно недоступна." });
    }
    if (staffCheck.data !== true || !memberCheck.data || !profileCheck.data ||
        String(profileCheck.data.email || "").toLowerCase() !==
        String(authData.user.email || "").toLowerCase()) {
      return json(req, 403, { ok: false, error: "Видеозвонок доступен только участникам чата." });
    }

    const livekitUrl = (Deno.env.get("LIVEKIT_URL") || "").trim();
    const apiKey = (Deno.env.get("LIVEKIT_API_KEY") || "").trim();
    const apiSecret = (Deno.env.get("LIVEKIT_API_SECRET") || "").trim();
    if (!livekitUrl || !apiKey || !apiSecret) {
      return json(req, 503, { ok: false, error: "LiveKit не настроен в Supabase Secrets." });
    }
    let url: URL;
    try { url = new URL(livekitUrl); }
    catch (_e) { return json(req, 503, { ok: false, error: "Некорректный LIVEKIT_URL в Supabase." }); }
    if (url.protocol !== "wss:" || !url.hostname.endsWith(".livekit.cloud") ||
        url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return json(req, 503, { ok: false, error: "LIVEKIT_URL должен указывать на LiveKit Cloud." });
    }

    // Same chat = same meeting. No arbitrary room name or identity from browser.
    const livekitRoom = "resanta-connect-" + roomId;
    const name = String(profileCheck.data.name || "Сотрудник CRM").slice(0, 90);
    const ttl = 5 * 60 * 60; // four-hour meeting + joining buffer
    const access = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name,
      ttl,
    });
    access.addGrant({
      roomJoin: true,
      room: livekitRoom,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await access.toJwt();
    return json(req, 200, { ok: true, url: livekitUrl, token, room: livekitRoom, identity: userId });
  } catch (_e) {
    // Never log or return token, credentials, or user messages.
    return json(req, 503, { ok: false, error: "Видеосервис временно недоступен. Повторите позже." });
  }
});
