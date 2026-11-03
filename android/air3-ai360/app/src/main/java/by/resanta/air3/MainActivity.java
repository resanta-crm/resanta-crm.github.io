package by.resanta.air3;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.view.WindowManager;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.os.Handler;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.content.SharedPreferences;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.PSSParameterSpec;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String ENDPOINT =
        "https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-ai360-air3-v2";
    private static final int MIC_PERMISSION = 344;
    private static final String KEY_ALIAS = "resanta_air3_device_sign_v1";
    private static final String PREF_DEVICE = "trusted_device_id";
    // Only an unprivileged random device ID is stored. The signing private key
    // is non-exportable Android Keystore hardware/OS material. No CRM tokens.
    private SharedPreferences devicePrefs;
    private boolean quickWaiting = false;
    private long quickStartedAt = 0;
    private final Runnable quickPoll = new Runnable() {
        @Override public void run() {
            if(!quickWaiting || isFinishing() || isDestroyed() || connected())return;
            if(System.currentTimeMillis()-quickStartedAt>570000){
                quickWaiting=false;
                message("Быстрый вход не подтверждён. Можно подключиться по коду.");
                return;
            }
            if(!busy)confirmPair();
            main.postDelayed(this,3500);
        }
    };
    private static final String[] SECTION_IDS = {
        "operations","sales","debt","triovist","vip","promotions",
        "clients","tasks","routes","gps","stock","payments","competitors",
        "cards_21vek","motivation","markdown","stands","cash","infographics","parser"
    };
    private static final String[] SECTION_NAMES = {
        "Сводка","Продажи","ПДЗ","Триовист / 21vek","ВИП","Акции",
        "Клиенты","Задачи ИИ","Маршруты","GPS","Остатки","Реестр оплат",
        "Конкуренты 21vek","Карточки 21vek","Мотивация","Уценка","Стенды",
        "Поступления","Инфографика","Парсер"
    };
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final SecureRandom random = new SecureRandom();
    private final JSONArray history = new JSONArray();
    private JSONObject memory = new JSONObject();
    private LinearLayout root;
    private ScrollView setupScreen;
    private RealCRMView actualCrm;
    private TextView state, answer;
    private EditText code, question;
    private Spinner section;
    private Button connect, confirm, listen, wake, demo, open, send, exit, openRealCrm;
    private String pairId = "", pairSecret = "", token = "";
    private long expiresAt;
    private MediaRecorder recorder;
    private MediaPlayer player;
    private File clip, playback;
    private boolean busy, recording, wakeWanted, wakePermissionPending, heardSpeech;
    // The cloud-wake demonstration is foreground only, explicitly consented,
    // time-limited, scoped to the already approved read-only AIR3 session.
    private boolean demoActive, demoAwaitingQuestion, recordingForDemo, demoPermissionPending;
    private int demoSpeechChecks;
    private long demoStartedAt;
    private static final int MAX_DEMO_SPEECH_CHECKS = 20;
    private static final long MAX_DEMO_DURATION_MS = 15*60*1000L;
    private long recordingStartedAt, lastSpeechAt;
    private WakePhraseListener wakeListener;
    private int generation = 0;
    private final Runnable recordingTick = new Runnable(){
        @Override public void run(){
            if(!recording || recorder==null)return;
            long now=SystemClock.elapsedRealtime();
            int amplitude=0;
            try{amplitude=recorder.getMaxAmplitude();}catch(Exception ignored){}
            if(amplitude>600){heardSpeech=true;lastSpeechAt=now;}
            // End the question on a natural pause; no fixed 7-second wait.
            if(heardSpeech && now-recordingStartedAt>=1200 && now-lastSpeechAt>=1200){
                finishRecording();return;
            }
            // On devices without usable amplitude reporting, keep a bounded
            // fallback recording, so the question still reaches the real STT.
            if(now-recordingStartedAt>=9000){finishRecording();return;}
            main.postDelayed(this,140);
        }
    };

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(6,25,49));
        getWindow().setNavigationBarColor(Color.rgb(6,25,49));
        devicePrefs = getSharedPreferences("air3_device_identity", MODE_PRIVATE);
        wakeWanted=devicePrefs.getBoolean("handsfree_foreground_optin",false);
        wakeListener=new WakePhraseListener(this,this::onWakePhrase);
        root = new LinearLayout(this);
        root.setPadding(23,18,23,26);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(6,25,49));

        root.addView(text("РЕСАНТА AI 360° · INMO AIR3",24,true));
        root.addView(text("Настоящая Лера · OpenAI + Яндекс · защищённый доступ к CRM",15,false));

        state = text("Для входа открой air3-control.html на MacBook в своей CRM. Код действителен 2 минуты.",16,false);
        state.setTextColor(Color.rgb(148,207,250));
        root.addView(state);

        code = new EditText(this);
        code.setTextSize(18); code.setSingleLine(true);
        code.setHint("Шестизначный код с MacBook");
        code.setTextColor(Color.WHITE);
        code.setHintTextColor(Color.rgb(150,162,179));
        code.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        root.addView(code);

        connect = button("1. Подключить очки по коду");
        connect.setOnClickListener(v -> pair());
        root.addView(connect);
        confirm = button("2. Проверить подтверждение владельца");
        confirm.setOnClickListener(v -> confirmPair());
        root.addView(confirm);

        section = new Spinner(this);
        ArrayAdapter<String> adapter = new ArrayAdapter<>(
            this,android.R.layout.simple_spinner_dropdown_item,SECTION_NAMES);
        section.setAdapter(adapter);
        root.addView(section);
        open = button("Открыть раздел CRM");
        open.setOnClickListener(v -> openSection());
        root.addView(open);

        question = new EditText(this);
        question.setTextSize(17);
        question.setHint("Вопрос Лере, если не хочешь говорить");
        question.setTextColor(Color.WHITE);
        question.setHintTextColor(Color.rgb(150,162,179));
        question.setMinHeight(60);
        root.addView(question);
        send = button("Спросить Леру текстом");
        send.setOnClickListener(v -> ask(question.getText().toString()));
        root.addView(send);

        listen = button("🎙 Говорить с Лерой");
        listen.setOnClickListener(v -> requestVoice());
        root.addView(listen);
        wake=button("«Привет, Ресанта» — голосовая активация");
        wake.setOnClickListener(v->toggleWake());
        root.addView(wake);
        demo=button("🎙 Демонстрация: «Привет, Лера»");
        demo.setOnClickListener(v->toggleDemo());
        root.addView(demo);
        openRealCrm=button("🌐 Открыть НАСТОЯЩУЮ РЕСАНТА CRM");
        openRealCrm.setOnClickListener(v->showOriginalCrm());
        root.addView(openRealCrm);

        answer = text("Здесь появятся реальные данные CRM и ответы Леры.",18,false);
        answer.setTextIsSelectable(true);
        answer.setPadding(0,15,0,15);
        root.addView(answer);

        exit = button("Завершить работу и отозвать доступ");
        exit.setOnClickListener(v -> close());
        root.addView(exit);

        setupScreen = new ScrollView(this);
        setupScreen.setFillViewport(true);
        setupScreen.addView(root);
        setContentView(setupScreen);
        updateControls();
        // CRM-FIRST: website viewing is distinct from the delegated AI360 voice
        // token. Never gate the real CRM login behind the six-digit glasses pair.
        showOriginalCrm();
        if(!devicePrefs.getString(PREF_DEVICE,"").isEmpty())
            main.postDelayed(this::beginFastSignIn,350);
    }
    private TextView text(String content,int size,boolean heavy) {
        TextView t = new TextView(this);
        t.setText(content);
        t.setTextSize(size);
        t.setTextColor(Color.WHITE);
        t.setPadding(0,8,0,9);
        if(heavy)t.setTypeface(null,android.graphics.Typeface.BOLD);
        return t;
    }
    private Button button(String title) {
        Button b = new Button(this);
        b.setText(title);
        b.setAllCaps(false);
        b.setTextSize(16);
        b.setMinHeight(62);
        return b;
    }
    private boolean connected() {
        return !token.isEmpty() && System.currentTimeMillis() < expiresAt;
    }
    private void updateControls() {
        boolean active = connected()&&!busy;
        connect.setEnabled(!busy&&!connected());
        confirm.setEnabled(!busy&&!pairId.isEmpty()&&!connected());
        open.setEnabled(active);send.setEnabled(active);listen.setEnabled(active);
        wake.setEnabled(connected()&&!demoActive);
        wake.setText(wakeWanted?"■ Выключить «Привет, Ресанта»":"◉ Включить «Привет, Ресанта»");
        demo.setEnabled(connected()&&!busy);
        demo.setText(demoActive?"■ Завершить голосовой показ":"🎙 Демонстрация: «Привет, Лера»");
        openRealCrm.setEnabled(true);
        section.setEnabled(active);exit.setEnabled(connected()&&!busy);
        // Director prepares the session; the boss sees a clean voice-only
        // experience rather than technical CRM setup controls.
        int setupVisibility=demoActive?View.GONE:View.VISIBLE;
        section.setVisibility(setupVisibility);open.setVisibility(setupVisibility);
        question.setVisibility(setupVisibility);send.setVisibility(setupVisibility);
        listen.setVisibility(setupVisibility);wake.setVisibility(setupVisibility);
        code.setVisibility(connected()?View.GONE:View.VISIBLE);
        connect.setVisibility(connected()?View.GONE:View.VISIBLE);
        confirm.setVisibility(connected()?View.GONE:View.VISIBLE);
    }
    private void message(String text) {
        state.setText(text);
        if(actualCrm!=null)actualCrm.showStatus(text);
    }
    // Native voice runs over the unmodified production CRM website, which
    // retains its own authenticated session and original Uni I/Uni X views.
    // A delegated AIR3 voice token NEVER authenticates the browser page.
    private void showOriginalCrm() {
        // Opening the ORIGINAL website needs only its own normal CRM login.
        // AI360 voice still requires independent temporary Mac approval.
        if(isFinishing()||isDestroyed())return;
        if(actualCrm==null)
            actualCrm=new RealCRMView(this,this::openVoiceOrDemo,this::close);
        actualCrm.setVoiceConnected(connected());
        setContentView(actualCrm);
    }
    private void openVoiceOrDemo() {
        if(!connected()){
            // Only the owner ever sees the one-time AI pairing controls;
            // existing CRM is not destroyed, and the boss gets no bypass.
            setContentView(setupScreen);
            message("Настоящая CRM открыта. Для голосовой Леры подключи очки через пульт MacBook.");
            return;
        }
        toggleDemo();
    }
    private void navigateOriginalCrm(String domain) {
        if(actualCrm!=null&&domain!=null)actualCrm.navigate(domain);
    }
    private void closeOriginalCrm() {
        if(actualCrm==null)return;
        actualCrm.closePrivateWebsite();
        actualCrm=null;
        if(!isFinishing()&&!isDestroyed())setContentView(setupScreen);
    }
    private void perform(String label, RemoteTask task, RemoteDone done) {
        if(busy)return;
        busy=true;message(label);updateControls();
        final int epoch=generation;
        work.execute(() -> {
            JSONObject value=null;String error=null;
            try{value=task.run();}catch(Exception e){error=e.getMessage();}
            final JSONObject out=value;final String why=error;
            main.post(() -> {
                if(isFinishing()||isDestroyed()||epoch!=generation)return;
                busy=false;
                if(why!=null){
                    message("Сервис: "+why);
                    if(why.contains("session_")||why.contains("pair_revoked")||
                        why.contains("owner_scope_revoked"))resetSession();
                } else if(out!=null)done.done(out);
                updateControls();
                main.postDelayed(this::resumeWakeIfIdle,100);
            });
        });
    }
    private JSONObject remote(String action,JSONObject body) throws Exception {
        JSONObject data = body==null?new JSONObject():body;
        data.put("action",action);
        if(!token.isEmpty()&&!data.has("token"))data.put("token",token);
        HttpURLConnection conn = (HttpURLConnection)new URL(ENDPOINT).openConnection();
        try{
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(75000);
            conn.setUseCaches(false);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type","application/json");
            conn.setRequestProperty("Accept","application/json");
            byte[] bytes=data.toString().getBytes(StandardCharsets.UTF_8);
            if(bytes.length>750000)throw new Exception("Слишком большой запрос");
            conn.getOutputStream().write(bytes);
            int status=conn.getResponseCode();
            InputStream input=status<400?conn.getInputStream():conn.getErrorStream();
            if(input==null)throw new Exception("Нет ответа сервера");
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            byte[] chunk=new byte[8192];int n;
            while((n=input.read(chunk))!=-1){
                out.write(chunk,0,n);
                if(out.size()>2800000)throw new Exception("Слишком большой ответ");
            }
            JSONObject result=new JSONObject(out.toString("UTF-8"));
            if(status>=400||result.has("error"))
                throw new Exception(result.optString("error","Ошибка "+status));
            return result;
        }finally{conn.disconnect();}
    }
    private void pair() {
        String input=code.getText().toString().trim();
        if(!input.matches("\\d{6}")){
            message("Введи 6 цифр кода, созданного на MacBook.");return;
        }
        byte[] secret=new byte[40];random.nextBytes(secret);
        pairSecret=Base64.encodeToString(secret,Base64.URL_SAFE|Base64.NO_PADDING|Base64.NO_WRAP);
        JSONObject args=new JSONObject();
        try{args.put("code",input).put("secret",pairSecret);}catch(Exception ignored){}
        perform("Подключаю очки…",()->remote("pair",args),r->{
            pairId=r.optString("id","");
            message("Запрос отправлен. Теперь на MacBook нажми «Разрешить вход», затем здесь проверь подтверждение.");
        });
    }
    private void confirmPair() {
        if(pairId.isEmpty()||pairSecret.isEmpty())return;
        final String id=pairId,secret=pairSecret;
        perform("Проверяю разрешение директора…",()->{
            JSONObject args=new JSONObject().put("id",id).put("secret",secret);
            JSONObject status=remote("status",args);
            if(!"approved".equals(status.optString("status")))
                throw new Exception("Пока ожидаю подтверждения на MacBook.");
            return remote("redeem",args);
        },r->{
            token=r.optString("token","");
            if(token.length()<40){resetSession();message("Не удалось получить безопасную сессию.");return;}
            expiresAt=System.currentTimeMillis()+r.optInt("expires_in",0)*1000L;
            pairSecret="";pairId="";code.setText("");
            quickWaiting=false;
            main.removeCallbacks(quickPoll);
            message("Лера подключена на 60 минут. 10 минут без действий — завершение.");
            // Show the real CRM immediately. Owner signs into that website
            // separately before handing over the glasses, never using AI token.
            main.postDelayed(this::showOriginalCrm,250);
            main.postDelayed(this::resumeWakeIfIdle,300);
            answer.setText("Скажи «Лера, покажи продажи» или выбери раздел CRM.");
            // Register only the non-exportable device identity after the owner
            // explicitly approved this first pairing. Never retain a CRM token.
            if(devicePrefs.getString(PREF_DEVICE,"").isEmpty())
                enrollAfterOwnerApproval();
        });
    }
    // Register a one-time proof of device identity in the Android OS Keystore.
    // This is NOT a user identity; Mac approval is still required every session.
    private KeyStore.PrivateKeyEntry signingEntry() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if(!store.containsAlias(KEY_ALIAS)){
            KeyPairGenerator gen=KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_RSA,"AndroidKeyStore");
            KeyGenParameterSpec spec=new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN|KeyProperties.PURPOSE_VERIFY)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PSS)
                .build();
            gen.initialize(spec);
            gen.generateKeyPair();
        }
        KeyStore.Entry entry=store.getEntry(KEY_ALIAS,null);
        if(!(entry instanceof KeyStore.PrivateKeyEntry))
            throw new Exception("Ключ очков недоступен");
        return (KeyStore.PrivateKeyEntry)entry;
    }
    private byte[] signChallenge(String payload) throws Exception {
        Signature signer=Signature.getInstance("SHA256withRSA/PSS");
        signer.initSign(signingEntry().getPrivateKey());
        signer.setParameter(new PSSParameterSpec(
            "SHA-256","MGF1",MGF1ParameterSpec.SHA256,32,1));
        signer.update(payload.getBytes(StandardCharsets.UTF_8));
        return signer.sign();
    }
    private void enrollAfterOwnerApproval() {
        if(!connected()||busy)return;
        perform("Сохраняю доверие к очкам для быстрого следующего входа…",()->{
            String spki=Base64.encodeToString(
                signingEntry().getCertificate().getPublicKey().getEncoded(),
                Base64.NO_WRAP);
            return remote("enroll",new JSONObject().put("public_key_spki",spki));
        },r->{
            String id=r.optString("device_id","");
            if(!id.isEmpty()){
                devicePrefs.edit().putString(PREF_DEVICE,id).apply();
                message("Очки привязаны! В следующий раз достаточно одного разрешения на MacBook.");
            }else{
                message("Лера подключена. Быстрый повторный вход пока недоступен.");
            }
        });
    }
    private void beginFastSignIn() {
        String deviceId=devicePrefs.getString(PREF_DEVICE,"");
        if(deviceId.isEmpty()||connected()||busy||quickWaiting)return;
        byte[] entropy=new byte[40];random.nextBytes(entropy);
        final String newSecret=Base64.encodeToString(entropy,
            Base64.URL_SAFE|Base64.NO_PADDING|Base64.NO_WRAP);
        perform("Быстрый вход: проверяю зарегистрированные очки…",()->{
            JSONObject c=remote("fast_challenge",new JSONObject()
                .put("device_id",deviceId));
            String challengeId=c.getString("challenge_id");
            byte[] signature=signChallenge(challengeId+":"+c.getString("nonce"));
            return remote("fast_request",new JSONObject()
                .put("device_id",deviceId)
                .put("challenge_id",challengeId)
                .put("signature_base64",Base64.encodeToString(signature,Base64.NO_WRAP))
                .put("secret",newSecret));
        },r->{
            pairId=r.optString("id","");
            pairSecret=newSecret;
            if(pairId.isEmpty()){
                message("Не удалось создать запрос. Подключись по коду.");return;
            }
            quickWaiting=true;quickStartedAt=System.currentTimeMillis();
            message("Это твои очки. На MacBook нажми «Разрешить вход» — код вводить не нужно.");
            main.postDelayed(quickPoll,3000);
        });
    }
    private void openSection() {
        if(!connected()){message("Подключись заново с MacBook.");return;}
        final String domain=SECTION_IDS[section.getSelectedItemPosition()];
        perform("Открываю данные CRM…",()->remote("read",new JSONObject().put("domain",domain)),r->{
            navigateOriginalCrm(domain);
            show(r);
            speakBrief(r.optString("answer","Раздел открыт."));
        });
    }
    private void ask(String phrase) {
        if(!connected()){message("Сессия закончилась, подключись заново.");return;}
        String q=phrase.trim();
        if(q.length()<2){message("Скажи вопрос Лере.");return;}
        question.setText("");
        perform("Лера анализирует CRM…",()->remote("ask",new JSONObject()
            .put("message",q).put("history",history).put("memory",memory)),r->{
            if("answer".equals(r.optString("kind"))) {
                try {
                    history.put(new JSONObject().put("role","user").put("content",q));
                    history.put(new JSONObject().put("role","assistant").put("content",r.optString("answer","")));
                } catch (org.json.JSONException ignored) {
                    // An invalid history item must never abort a valid user response.
                }
                while(history.length()>6)history.remove(0);
                memory=r.optJSONObject("memory")!=null?r.optJSONObject("memory"):new JSONObject();
            }
            String domain=memory.optString("domain","");
            if(domain.isEmpty()){
                String normalized=q.toLowerCase(java.util.Locale.forLanguageTag("ru-RU"));
                if(normalized.contains("продаж")||normalized.contains("план"))domain="sales";
                else if(normalized.contains("задолж")||normalized.contains("долг")
                        ||normalized.contains("пдз"))domain="debt";
            }
            navigateOriginalCrm(domain);
            show(r);
            speakBrief(r.optString("answer",""));
        });
    }
    private void show(JSONObject response) {
        String messageText=response.optString("answer","");
        if("section".equals(response.optString("kind"))) {
            // The full original Uni I / Uni X CRM is on the projector.
            // NEVER dump raw server JSON on the glasses or conference display.
            JSONObject data=response.optJSONObject("data");
            String domain=response.optString("section","");
            java.text.NumberFormat fmt=java.text.NumberFormat
                .getNumberInstance(java.util.Locale.forLanguageTag("ru-RU"));
            if(data!=null&&"sales".equals(domain)&&data.has("network_revenue")&&
                    !data.isNull("network_revenue")){
                messageText+="\n\nПродажи сети: "+
                    fmt.format(data.optDouble("network_revenue"))+" белорусских рублей.";
            }else if(data!=null&&"triovist".equals(domain)&&data.has("revenue")&&
                    !data.isNull("revenue")){
                messageText+="\n\nТриовист: "+
                    fmt.format(data.optDouble("revenue"))+" белорусских рублей.";
            }else{
                messageText+="\n\nДанные раздела доступны для голосового разбора. "+
                    "Задай голосовой вопрос, чтобы получить разбор.";
            }
        }else if(!response.optString("detail","").isEmpty()){
            messageText+="\n\n"+response.optString("detail","");
        }
        answer.setText(messageText.length()>3800?messageText.substring(0,3800)+"\n(часть данных)":messageText);
        message("Подключено к РЕСАНТА AI 360°. Ответ получен.");
        if(actualCrm!=null)actualCrm.showStatus(messageText);
    }
    private void toggleWake(){
        if(wakeWanted){
            wakeWanted=false;
            devicePrefs.edit().putBoolean("handsfree_foreground_optin",false).apply();
            wakeListener.stop();
            message("Активация фразой выключена.");
            updateControls();return;
        }
        if(!connected()){message("Сначала подключи очки к CRM.");return;}
        if(!wakeListener.available()){
            message("В прошивке INMO пока нет доступного локального распознавания. Кнопка микрофона работает.");
            return;
        }
        wakeWanted=true;
        devicePrefs.edit().putBoolean("handsfree_foreground_optin",true).apply();
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            wakePermissionPending=true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MIC_PERMISSION);
        }else resumeWakeIfIdle();
        updateControls();
    }
    private void onWakePhrase(String questionAfterWake){
        if(!wakeWanted||!connected()||busy)return;
        message("Лера слушает.");
        if(questionAfterWake==null||questionAfterWake.isEmpty())requestVoice();
        else ask(questionAfterWake);
    }
    private void endDemo(String status){
        demoActive=false;
        demoAwaitingQuestion=false;
        recordingForDemo=false;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if(recording)cleanupRecorder();
        if(status!=null&&!status.isEmpty())message(status);
        if(actualCrm!=null)actualCrm.setVoiceActive(false);
        updateControls();
    }
    private void toggleDemo(){
        if(demoActive){endDemo("Показ завершён. Микрофон выключен.");return;}
        if(!connected()){message("Сначала разреши подключение очков на MacBook.");return;}
        if(actualCrm==null||!actualCrm.isSiteReady()){
            message("Сначала войди в настоящую РЕСАНТА CRM на очках.");
            return;
        }
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            demoPermissionPending=true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MIC_PERMISSION);
            return;
        }
        new AlertDialog.Builder(this).setTitle("Голосовая демонстрация для руководителя")
          .setMessage("После включения в открытом приложении микрофон будет ждать обращение «Привет, Лера». " +
           "Фрагменты услышанной речи отправляются на защищённый сервер OpenAI для распознавания; " +
           "фрагменты без обращения игнорируются. Максимум 15 минут и 20 фрагментов речи. " +
           "Ответы CRM только для чтения, доступ разрешён с вашего MacBook. " +
           "При сворачивании приложения запись прекращается. Включить?")
          .setNegativeButton("Отмена",null)
          .setPositiveButton("Включить", (d,which)->{
              if(!connected()||busy)return;
              wakeListener.stop();
              wakeWanted=false;
              devicePrefs.edit().putBoolean("handsfree_foreground_optin",false).apply();
              demoActive=true;
              demoAwaitingQuestion=false;
              demoSpeechChecks=0;
              demoStartedAt=SystemClock.elapsedRealtime();
              getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
              message("Режим показа включён. Надень очки и скажи: «Привет, Лера, какие продажи по Витебску?»");
              if(actualCrm!=null)actualCrm.setVoiceActive(true);
              updateControls();
              main.postDelayed(this::resumeWakeIfIdle,200);
          }).show();
    }
    private void acceptDemoSpeech(String words){
        if(!demoActive||!connected())return;
        String spoken=words==null?"":words.trim();
        if(spoken.isEmpty()){message("Не расслышала. Жду «Привет, Лера».");return;}
        if(demoAwaitingQuestion){
            demoAwaitingQuestion=false;
            String rest=DemoWakePhrase.questionAfterWake(spoken);
            ask(rest==null?spoken:rest);
            return;
        }
        String question=DemoWakePhrase.questionAfterWake(spoken);
        if(question==null){message("Ожидаю обращение «Привет, Лера»…");return;}
        // Visible proof of real STT in the glasses; not a scripted response.
        answer.setText("Распознано: "+spoken);
        if(actualCrm!=null)actualCrm.showStatus("Распознано: "+spoken);
        if(question.isEmpty()){
            demoAwaitingQuestion=true;
            speakBrief("Слушаю вас.");
        }else{
            ask(question);
        }
    }
    private void resumeWakeIfIdle(){
        if(!connected()||busy||recording||player!=null
            ||isFinishing()||isDestroyed()||!hasWindowFocus())return;
        if(demoActive){
            if(SystemClock.elapsedRealtime()-demoStartedAt>MAX_DEMO_DURATION_MS ||
               demoSpeechChecks>=MAX_DEMO_SPEECH_CHECKS){
                endDemo("Демонстрация завершена по лимиту. Микрофон выключен.");
                return;
            }
            startVoice(true);
            return;
        }
        if(!wakeWanted)return;
        if(!wakeListener.start()){
            message("Голосовая активация недоступна на этой прошивке. Нажми микрофон.");
        }
    }
    private void requestVoice() {
        if(!connected()){message("Сеанс завершён.");return;}
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MIC_PERMISSION);
            return;
        }
        startVoice();
    }
    private void startVoice() {startVoice(false);}
    private void startVoice(boolean forDemo) {
        if(busy||recording||!connected())return;
        wakeListener.stop();
        recordingForDemo=forDemo;
        stopPlayback();
        try{
            clip=File.createTempFile("air3-question-",".m4a",getCacheDir());
            recorder=new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(64000);
            recorder.setAudioSamplingRate(16000);
            recorder.setOutputFile(clip.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            recording=true;
            heardSpeech=false;
            recordingStartedAt=SystemClock.elapsedRealtime();
            lastSpeechAt=recordingStartedAt;
            listen.setEnabled(false);
            message(forDemo?(demoAwaitingQuestion?"Лера слушает вопрос…":"Ожидаю «Привет, Лера»…"):
                "Слушаю тебя в очках. Закончу запись, когда ты перестанешь говорить.");
            main.postDelayed(recordingTick,140);
        }catch(Exception e){
            cleanupRecorder();
            message("Микрофон: "+e.getClass().getSimpleName());
        }
    }
    private void finishRecording() {
        if(!recording)return;
        main.removeCallbacks(recordingTick);
        final boolean wasDemo=recordingForDemo;
        recordingForDemo=false;
        final boolean speechDetected=heardSpeech;
        final double seconds=Math.max(0.5,Math.min(10.5,
            (SystemClock.elapsedRealtime()-recordingStartedAt)/1000.0));
        try{recorder.stop();recorder.release();recorder=null;}
        catch(Exception e){cleanupRecorder();message("Запись не удалась.");resumeWakeIfIdle();return;}
        recording=false;
        if(wasDemo&&!speechDetected){
            cleanupRecorder();
            main.postDelayed(this::resumeWakeIfIdle,180);
            return; // Never send silence to STT or spend the AI360 speech budget.
        }
        if(clip==null||clip.length()<900||clip.length()>512000){
            cleanupRecorder();message("Запись слишком короткая или длинная.");
            main.postDelayed(this::resumeWakeIfIdle,200);return;
        }
        final File input=clip;
        try{
            byte[] bytes=new byte[(int)input.length()];
            try(FileInputStream fis=new FileInputStream(input)){
                int read=0,n;
                while(read<bytes.length&&(n=fis.read(bytes,read,bytes.length-read))>0)read+=n;
                if(read!=bytes.length)throw new Exception("Неполная запись");
            }
            input.delete();clip=null;
            final String encoded=Base64.encodeToString(bytes,Base64.NO_WRAP);
            if(wasDemo)demoSpeechChecks++;
            perform("Распознаю голос через OpenAI…",()->remote("stt",new JSONObject()
                .put("audio_base64",encoded).put("duration",seconds)),r->{
                String words=r.optString("text","").trim();
                if(wasDemo){
                    if(!demoActive)return;
                    acceptDemoSpeech(words);
                    return;
                }
                if(words.isEmpty()){message("Речь не распознана. Повтори вопрос.");return;}
                answer.setText("Ты сказал: "+words);
                ask(words);
            });
        }catch(Exception e){cleanupRecorder();message("Ошибка чтения звука: "+e.getMessage());}
    }
    private void cleanupRecorder() {
        main.removeCallbacks(recordingTick);recording=false;recordingForDemo=false;
        if(recorder!=null){
            try{recorder.stop();}catch(Exception ignored){}
            try{recorder.release();}catch(Exception ignored){}
            recorder=null;
        }
        if(clip!=null){clip.delete();clip=null;}
        if(listen!=null)listen.setEnabled(connected()&&!busy);
    }
    private void speakBrief(String words) {
        if(!connected()||words.isEmpty())return;
        String phrase=words.replaceAll("<[^>]*>","").replaceAll("\\s+"," ").trim();
        if(phrase.length()>205){
            int cut=phrase.lastIndexOf(' ',205);
            phrase=phrase.substring(0,cut>100?cut:205);
        }
        final String t=phrase;
        perform("Лера отвечает в динамиках INMO AIR3…",()->remote("tts",new JSONObject().put("text",t)),r->{
            try{
                byte[] wav=Base64.decode(r.optString("audio_base64",""),Base64.DEFAULT);
                if(wav.length<256||wav.length>1800000)throw new Exception("Некорректный звук");
                playback=File.createTempFile("air3-lera-",".wav",getCacheDir());
                try(FileOutputStream output=new FileOutputStream(playback)){output.write(wav);}
                player=new MediaPlayer();
                player.setDataSource(playback.getAbsolutePath());
                player.setOnCompletionListener(m->{stopPlayback();message("Лера готова к следующему вопросу.");resumeWakeIfIdle();});
                player.setOnErrorListener((m,w,e)->{stopPlayback();message("Не удалось воспроизвести звук.");resumeWakeIfIdle();return true;});
                player.prepare();
                player.start();
                message("Лера говорит в очках…");
            }catch(Exception e){stopPlayback();message("Озвучка: "+e.getMessage());}
        });
    }
    private void stopPlayback() {
        if(player!=null){
            try{player.stop();}catch(Exception ignored){}
            try{player.release();}catch(Exception ignored){}
            player=null;
        }
        if(playback!=null){playback.delete();playback=null;}
    }
    private void close() {
        final String t=token;
        // Remove credentials immediately from memory. The server revocation is best effort.
        resetSession();
        if(!t.isEmpty())work.execute(()->{
            try{remote("close",new JSONObject().put("token",t));}catch(Exception ignored){}
        });
        message("Локальный доступ завершён. Подтверждение на MacBook можно отозвать немедленно.");
    }
    private void resetSession() {
        generation++;
        token="";pairSecret="";pairId="";expiresAt=0;
        memory=new JSONObject();
        while(history.length()>0)history.remove(0);
        demoActive=false;demoAwaitingQuestion=false;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        wakeListener.stop();cleanupRecorder();stopPlayback();
        closeOriginalCrm();updateControls();
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==MIC_PERMISSION){
            boolean forWake=wakePermissionPending;
            boolean forDemo=demoPermissionPending;
            wakePermissionPending=false;demoPermissionPending=false;
            if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED){
                if(forDemo)toggleDemo();
                else if(forWake)resumeWakeIfIdle();
                else startVoice();
            }else{
                if(forWake){wakeWanted=false;devicePrefs.edit().putBoolean("handsfree_foreground_optin",false).apply();}
                message("Разрешение микрофона не предоставлено.");
                updateControls();
            }
        }
    }
    @Override protected void onPause(){
        endDemo(""); // Mic stops instantly on focus loss.
        wakeListener.stop();
        cleanupRecorder();stopPlayback();
        // Permission dialogs can temporarily pause Activity; do not clear
        // CRM login while the page is still visible beneath such a dialog.
        super.onPause();
    }
    @Override protected void onStop(){
        // The full login is private to the glasses and may not remain visible
        // after app leaves the foreground. Reopen with a fresh site login.
        closeOriginalCrm();
        super.onStop();
    }
    @Override protected void onResume(){
        super.onResume();
        if(actualCrm==null && setupScreen!=null)
            main.post(this::showOriginalCrm); // Never resume to old pairing UI.
        main.postDelayed(this::resumeWakeIfIdle,300);
    }
    @Override public void onBackPressed(){
        if(actualCrm!=null){close();return;}
        super.onBackPressed();
    }
    @Override protected void onDestroy(){
        resetSession();work.shutdownNow();
        super.onDestroy();
    }
    interface RemoteTask {JSONObject run() throws Exception;}
    interface RemoteDone {void done(JSONObject response);}
}
