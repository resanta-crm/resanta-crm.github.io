import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://resanta-crm.by",
  "https://www.resanta-crm.by",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://resanta-crm.by",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function validatePassword(value: unknown) {
  const password = String(value ?? "");
  if (password.length < 10) return "Пароль должен содержать минимум 10 символов";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Пароль должен содержать строчную и заглавную латинскую букву и цифру";
  }
  return "";
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => normalizeEmail(user.email) === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "Метод не поддерживается" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json(req, 500, { ok: false, error: "Служебные параметры Supabase недоступны" });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(req, 401, { ok: false, error: "Сессия отсутствует. Войдите в CRM заново." });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    const caller = callerData.user;
    if (callerError || !caller?.email) {
      return json(req, 401, { ok: false, error: "Сессия истекла. Войдите в CRM заново." });
    }

    const callerEmail = normalizeEmail(caller.email);
    const { data: callerProfile, error: profileError } = await admin
      .from("users")
      .select("email,role")
      .eq("email", callerEmail)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!callerProfile || callerProfile.role !== "boss") {
      return json(req, 403, { ok: false, error: "Операция доступна только руководителю" });
    }

    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action ?? "");
    const email = normalizeEmail(payload.email);
    const password = String(payload.password ?? "");

    if (!email.endsWith("@resanta.ru")) {
      return json(req, 400, { ok: false, error: "Разрешены только корпоративные адреса @resanta.ru" });
    }
    const existingAuthUser = await findAuthUserByEmail(admin, email);
    const { data: existingProfile, error: existingProfileError } = await admin
      .from("users")
      .select("email,name,role,region,access_scope,access_key")
      .eq("email", email)
      .maybeSingle();
    if (existingProfileError) throw existingProfileError;

    if (action === "delete_user") {
      if (email === callerEmail) {
        return json(req, 403, { ok: false, error: "Нельзя удалить собственный доступ" });
      }
      if (existingProfile?.role === "boss") {
        return json(req, 403, { ok: false, error: "Удаление другого руководителя запрещено" });
      }

      if (existingAuthUser) {
        const { error: deleteAuthError } = await admin.auth.admin.deleteUser(existingAuthUser.id);
        if (deleteAuthError) throw deleteAuthError;
      }

      const { error: deleteProfileError } = await admin.from("users").delete().eq("email", email);
      if (deleteProfileError) throw deleteProfileError;

      return json(req, 200, {
        ok: true,
        auth_deleted: !!existingAuthUser,
        profile_deleted: !!existingProfile,
      });
    }

    const passwordError = validatePassword(password);
    if (passwordError) return json(req, 400, { ok: false, error: passwordError });

    if (existingProfile?.role === "boss" && email !== callerEmail) {
      return json(req, 403, { ok: false, error: "Нельзя менять пароль другого руководителя" });
    }

    if (action === "set_password") {
      if (!existingAuthUser) {
        if (!existingProfile) {
          return json(req, 404, { ok: false, error: "Пользователь не найден в CRM" });
        }
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: existingProfile.name || email },
        });
        if (error) throw error;
        return json(req, 200, { ok: true, created: true, user_id: data.user?.id ?? null });
      }

      const { error } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
        password,
        email_confirm: true,
      });
      if (error) throw error;
      return json(req, 200, { ok: true, created: false, user_id: existingAuthUser.id });
    }

    if (action === "create_user") {
      const name = String(payload.name ?? "").trim();
      const accessScope = payload.access_scope === "triovist" ? "triovist" : "standard";
      const region = accessScope === "triovist"
        ? "Триовист / 21vek.by"
        : String(payload.region ?? "Витебск").trim() || "Витебск";

      if (!name) return json(req, 400, { ok: false, error: "Укажите имя сотрудника" });

      // Dedicated read-only warehouse reviewer. Never create him as a regular
      // field manager: the Auth trigger provisions auditor_pending first.
      if (payload.access_scope === "auditor") {
        if (email !== "sazonov_ks@resanta.ru") {
          return json(req, 403, { ok: false, error: "Роль ревизора разрешена только Сазонову Кириллу Сергеевичу" });
        }
        if (existingAuthUser || existingProfile) {
          return json(req, 409, { ok: false, error: "Учётная запись ревизора уже существует. Не изменяйте её через создание менеджера." });
        }
        const reviewerName = "Сазонов Кирилл Сергеевич";
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: reviewerName },
        });
        if (createError) throw createError;
        const newId = created.user?.id;
        if (!newId) return json(req, 500, { ok: false, error: "Не удалось подтвердить создание ревизора" });

        // Update only the exact new Auth-linked profile. Never use an
        // email upsert that could generate another unrelated profile ID.
        const { data: reviewerProfile, error: reviewerError } = await admin
          .from("users")
          .update({
            name: reviewerName,
            role: "auditor",
            region: "Витебск",
            access_scope: "standard",
            access_key: null,
          })
          .eq("id", newId)
          .eq("email", email)
          .select("id,email,role")
          .single();
        if (reviewerError || reviewerProfile?.role !== "auditor") {
          // Do not leave a partially provisioned account after failure.
          await admin.auth.admin.deleteUser(newId);
          return json(req, 500, { ok: false, error: "Роль ревизора не подтверждена; создание отменено" });
        }
        return json(req, 200, {
          ok: true, created: true, user_id: newId, role: "auditor",
          access_scope: "auditor",
        });
      }

      // Single approved Gomel director pilot, same CRM boss role as Sidarovich.
      // Only the network director may create this boss account; no other staff
      // can promote themselves by sending access_scope from the browser.
      if (payload.access_scope === "gomel_director") {
        if (callerEmail !== "payushin_ar@resanta.ru") {
          return json(req, 403, { ok: false, error: "Назначить директора Гомеля может только ДФС" });
        }
        if (email !== "samoilov_ds@resanta.ru") {
          return json(req, 403, { ok: false, error: "Этот тип доступа предназначен только Самойлову Д. С." });
        }
        if (existingAuthUser || existingProfile) {
          return json(req, 409, { ok: false, error: "Учётная запись Самойлова уже существует. Повторное создание запрещено." });
        }
        const directorName = "Самойлов Д. С.";
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: directorName },
        });
        if (createError) throw createError;
        const newId = created.user?.id;
        if (!newId) return json(req, 500, { ok: false, error: "Сервер не подтвердил создание учётной записи" });

        // An existing Auth trigger creates a default CRM profile. Promote only
        // this exact, Auth-linked email and never touch any other employee.
        const { data: bossProfile, error: bossError } = await admin
          .from("users")
          .update({
            name: directorName,
            role: "boss",
            region: "Гомель",
            access_scope: "standard",
            access_key: null,
          })
          .eq("id", newId)
          .eq("email", email)
          .select("id,email,role,region")
          .single();
        if (bossError || bossProfile?.role !== "boss" || bossProfile.region !== "Гомель") {
          await admin.auth.admin.deleteUser(newId);
          return json(req, 500, { ok: false, error: "Не удалось подтвердить роль руководителя. Создание отменено." });
        }

        // CONNECT is independent of CRM boss role. Register it explicitly.
        const { error: connectError } = await admin.from("connect_permissions_v1").upsert({
          user_id: newId,
          chat_enabled: true,
          video_enabled: true,
          updated_by: caller.id,
        }, { onConflict: "user_id" });
        if (connectError) {
          await admin.auth.admin.deleteUser(newId);
          await admin.from("users").delete().eq("id", newId).eq("email", email);
          return json(req, 500, { ok: false, error: "Не удалось подключить CONNECT. Создание отменено." });
        }

        return json(req, 200, {
          ok: true, created: true, user_id: newId,
          role: "boss", region: "Гомель",
          chat_enabled: true, video_enabled: true,
        });
      }

      let authUser = existingAuthUser;
      if (!authUser) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name },
        });
        if (error) throw error;
        authUser = data.user;
      } else {
        const { error } = await admin.auth.admin.updateUserById(authUser.id, {
          password,
          email_confirm: true,
          user_metadata: { ...(authUser.user_metadata || {}), name },
        });
        if (error) throw error;
      }

      const profile = {
        email,
        name,
        role: "manager",
        region,
        access_scope: accessScope,
        access_key: accessScope === "triovist" ? email : null,
      };
      const { error: upsertError } = await admin.from("users").upsert(profile, { onConflict: "email" });
      if (upsertError) throw upsertError;

      return json(req, 200, {
        ok: true,
        created: !existingAuthUser,
        user_id: authUser?.id ?? null,
        access_scope: accessScope,
      });
    }

    return json(req, 400, { ok: false, error: "Неизвестная операция" });
  } catch (error) {
    console.error("crm-user-admin failed", error instanceof Error ? error.message : String(error));
    return json(req, 500, {
      ok: false,
      error: "Не удалось изменить доступ. Проверьте журнал Edge Function crm-user-admin.",
    });
  }
});
