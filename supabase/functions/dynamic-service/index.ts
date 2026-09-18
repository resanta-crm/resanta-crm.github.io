import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8"

const ALLOWED_ORIGINS = new Set([
  "https://resanta-crm.by",
  "https://www.resanta-crm.by",
])

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || ""
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://resanta-crm.by"
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) })
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405)

  try {
    const auth = req.headers.get("authorization") || ""
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (!m) return json(req, { error: "Требуется авторизация" }, 401)

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    if (!supabaseUrl || !serviceKey || !openaiKey) throw new Error("Server configuration error")

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } = await admin.auth.getUser(m[1])
    const user = userData?.user
    if (userError || !user?.id || !user.email) return json(req, { error: "Сессия недействительна" }, 401)

    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id,email,role")
      .eq("email", user.email.toLowerCase())
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) return json(req, { error: "Профиль CRM отключён" }, 403)

    const contentLength = Number(req.headers.get("content-length") || "0")
    if (contentLength > 65000) return json(req, { error: "Слишком большой запрос" }, 413)

    const body = await req.json()
    const prompt = typeof body?.prompt === "string" ? body.prompt : ""
    const system = typeof body?.system === "string" ? body.system : ""
    if (!prompt.trim()) return json(req, { error: "Пустой запрос" }, 400)
    if (prompt.length > 40000 || system.length > 16000) {
      return json(req, { error: "Слишком большой запрос" }, 413)
    }

    const { data: quota, error: quotaError } = await admin.rpc("crm_ai_consume_quota_v1", {
      p_user_id: user.id,
      p_limit: 20,
    })
    if (quotaError) throw quotaError
    if (!quota?.allowed) {
      return json(req, { error: "Дневной лимит ИИ-анализа исчерпан", used: quota?.used ?? 20, limit: 20 }, 429)
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1800,
      }),
    })

    const data = await res.json()
    if (!res.ok || data?.error) {
      console.error("OpenAI error", res.status, data?.error?.message || "unknown")
      return json(req, { error: "ИИ временно недоступен" }, 502)
    }

    const text = data?.choices?.[0]?.message?.content || ""
    return json(req, { text, used: quota?.used ?? null, limit: 20 })
  } catch (e) {
    console.error("dynamic-service", e)
    return json(req, { error: "Ошибка сервера" }, 500)
  }
})