# РЕСАНТА AI · INMO AIR3 V2 — согласованный проект и технический gate

**Основание:** согласование руководителя, 2 ноября 2026 года.
**Производственный статус:** ЭТАП 0 — совместимость и безопасная архитектура. Полноценное приложение, часовое подключение, единая Лера и трансляция **пока не развёрнуты**.
**Основной принцип:** одна CRM `resanta-crm.by`, одно ядро РЕСАНТА AI 360°, несколько защищённых интерфейсов. Никакой второй урезанной Леры и отдельной базы бизнес-логики.
**Production freeze:** `index.html`, рабочие CRM API, функции директорской/штатной Леры, мобильная APK менеджеров и текущий `air3.html` не изменяются до аппаратной проверки. Никаких платных Supabase веток.

## Что проверено в коде

1. `assets/137-resanta-ai360-lazy-launch-v1.js` намеренно не запускается на Android; это защита после инцидента 22 октября.
2. `assets/134-resanta-voice-ai360-pilot-v1.js` уже умеет маршрутизацию по разделам (sales, routes, debt, gps, tasks, clients, promotions, triovist).
3. `assets/143-resanta-ai360-unified-dialog-v1.js` направляет запросы в `crm-ai360-dialog-v4`, который требует обычный авторизованный пользовательский контекст; его нельзя вызывать под анонимным токеном очков.
4. `air3.html` содержит отдельный упрощённый помощник с доступом только к sales и debt; для V2 он считается *резервным демо*, не продуктовой основой.
5. `crm-ai360-air3-gateway-v1` хранит временный токен (только хеш в БД) и позволяет отдельно отозвать пару с MacBook.
6. В репозитории **нет исходников нативного Android приложения** для очков. Система существующего Android APK МПП — отдельный продукт; не затрагивать.

## Официальные ограничения оборудования

- INMO AIR3 — самостоятельное Android-устройство; native APK возможен, но работа конкретных Android API зависит от прошивки и сервисов.
- Официальная `Screen Mirroring` означает **телефон -> очки**, а не очки -> проектор.
- Производитель документирует проводное копирование изображения **очков -> Windows ПК** посредством ADB/QtScrcpy. Наша MacBook + scrcpy связка и удалённый режим требуют экспериментальной проверки; не объявлять их готовыми.
- Системная фраза «Привет, IMO» принадлежит штатному помощнику; доступ к её wake-word listener через публичный SDK **не подтверждён**.
- Android `SpeechRecognizer` не предназначен для бесконечного слушания. Встроенный сервис распознавания на нашем экземпляре нужно проверить; для настоящей Леры использовать одобренный OpenAI STT и Yandex TTS через существующее ядро.

## Архитектура V2

```
                       RESANTA CRM (existing production, unchanged)
                      |  navigation registry  |  AI 360° shared core
                      |  existing role scope  |  audited actions
                                        |
                            secure AIR3 companion gateway
                          device-bound 60-min ephemeral session
                          10-min inactivity / instant owner revoke
                          no Supabase refresh token in shared glasses
                                        |
                   INMO AIR3 native Android client (new APK)
                  full permitted CRM sections in glasses display
                  spoken commands -> typed navigation intents
                  no direct table write / no blind screen automation
                                        |
                    optional presentation channel (separate consent)
                      MacBook presentation viewer / projector
```

**Authentication contract for V2 (not implemented yet):**
1. Pair on Mac/phone using existing authorized director; physical device identifies with high-entropy challenge; no password entry on glasses.
2. Six-digit **pairing code** (2 min) is separate from **working session** (3600 s absolute from issue). Once paired, manual owner approval and device secret; 10 min pairing completion grace.
3. Glasses keep ephemeral device token only in RAM. No CRM password/JWT refresh token, cookies or Supabase service_role on device. Individual API calls validate allowed owner, device session, remaining TTL, allowed operation and scope on server.
4. On each authorized activity, update last_seen; after 600 s without activity, expire. Transport ping alone must not count as user activity or extend idle time, so no indefinite session by heartbeat.
5. Owner can revoke immediately on MacBook/phone. Backend validates revoked state for all reads/writes/streaming channels. Closing application must wipe private UI and best-effort revoke; crashed devices still expire server-side.
6. **Do not set Supabase user JWT into a shared WebView**; ordinary `index.html` needs a real user JWT, so the secure projection of full data requires a deliberately scoped shared backend proxy, not disabling RLS.
7. Changing 1800 -> 3600 in old pilot is not sufficient for the new architecture.

**Voice:**
- First user gesture activates pilot listening; confirm ASR, microphone permission and audio playback in real glasses.
- The same director AI360 conversation core resolves reads, entities, groups/SKU, dates and navigation; the client receives a schema-validated action (`navigate`, `filter`, `show_card`, `ask`, `draft_action`).
- Strict allowlist of routes grounded in existing CRM menu, not generated CSS selectors or unsafe arbitrary clicks.
- Navigation is a *UI action*, not an excuse to bypass server access control; no unauthorized fields/data are shipped to glasses.
- Real mutations (new task, pricing, payment, customer merges) require a reviewed summary, a second confirmation and server-side authorization with audit idempotency.
- System-level «Привет, IMO» takeover is not promised. Test activation through the **app's own** supported listening flow; evaluate optional native wake detector only after hardware evidence and privacy/power review.

**Full CRM view:**
- Not a copy of all business tables. Share the same validated CRM resources using device-scoped read endpoints and an adaptive wide/narrow renderer (large text, fit-to-eye cards, drill-down). No over-broad `SELECT *`.
- Start with sales, debt, VIP, triovist, routes, tasks, promotions; extend section-by-section until **all director-accessible sections** pass read/filter/navigation acceptance tests. Empty unsupported sections must be explicitly marked, not silently omitted.

**Big screen:**
- Route A, priority: MacBook logged into CRM renders a synchronized presentation view based on *validated presentation events* from glasses. No audio/video screen capture needed, supports proper public/private redaction for an audience.
- Route B: native `MediaProjection` + explicit system consent + an authenticated local stream to a Mac receiver, or tested USB/ADB `scrcpy`; no silent capture. Validate on hardware.
- Each start/stop of presentation is audited, viewer opt-in and enforced role boundaries. Never broadcast the CRM password or raw JWT.

## Staged acceptance

**Gate 0 — hardware test (this PR only).**
- Isolated Android package `by.resanta.air3probe`, no internet permission, no login, no access to CRM.
- Shows OS version, WebView version, Android speech service availability, MediaProjection API presence.
- On explicit tap asks for mic permission, uses on-device speech recognition when available and previews navigation intents **without executing them**.
- Does not intercept «Привет, IMO», run background recording, contact servers, or transmit projected image.
- Must compile in CI, install on the INMO AIR3, open and accept input on its actual controls. Supply hardware verdict.

**Gate 1 — secure real CRM access.**
- 60 minutes absolute, 10 minutes idle, instant revoke, no credentials on glasses.
- Auth and authorization tests: normal, expired, replayed, foreign, revoked, racing sessions. No Android APK for MPP changes.
- V2 backend reads existing CRM/AI360 shared APIs in the identity of the authorized director, with server-validated scope.

**Gate 2 — assistant + full navigation.**
- Real OpenAI/Yandex voice, native recorder support, verified director dialogue v4, 34-domain read coverage where supported, UI navigation/filter.
- At least 20 authentic spoken commands, 10 sequential topic switches, 10-minute continuous use, 60-minute session and failure recovery.

**Gate 3 — presentation.**
- First synced presentation to MacBook; then screen mirroring if device consent/SDK supported.
- Show/hide privacy sensitive sections explicitly, keep stream under owner control.

**Gate 4 — production rollout.**
- Pilot on shared glasses for director, then management-approved access to branch director/MПП with separate role tests and security review. Gradual rollout and rollback, no live full-company switch.

## Rollback and non-goals
- This PR is intentionally not connected to production URLs or Supabase and cannot change working CRM.
- If physical AIR3 cannot run native SpeechRecognizer, switch to native recording + existing OpenAI STT only **after** protected gateway and explicit permission are integrated.
- Never claim reverse screen casting or system wake-word interception works unless demonstrated on INMO AIR3.
- Keep old `air3.html` temporarily for emergency rollback; do not spend feature budget growing that separate pilot.
