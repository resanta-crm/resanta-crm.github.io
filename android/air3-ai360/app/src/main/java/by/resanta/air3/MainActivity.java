package by.resanta.air3;

import android.Manifest;
import android.app.Activity;
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
    private TextView state, answer;
    private EditText code, question;
    private Spinner section;
    private Button connect, confirm, listen, open, send, exit;
    private String pairId = "", pairSecret = "", token = "";
    private long expiresAt;
    private MediaRecorder recorder;
    private MediaPlayer player;
    private File clip, playback;
    private boolean busy, recording;
    private int generation = 0;
    private final Runnable endRecording = this::finishRecording;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.rgb(6,25,49));
        getWindow().setNavigationBarColor(Color.rgb(6,25,49));
        devicePrefs = getSharedPreferences("air3_device_identity", MODE_PRIVATE);
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

        listen = button("🎙 Говорить с Лерой (7 секунд)");
        listen.setOnClickListener(v -> requestVoice());
        root.addView(listen);

        answer = text("Здесь появятся реальные данные CRM и ответы Леры.",18,false);
        answer.setTextIsSelectable(true);
        answer.setPadding(0,15,0,15);
        root.addView(answer);

        exit = button("Завершить работу и отозвать доступ");
        exit.setOnClickListener(v -> close());
        root.addView(exit);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(root);
        setContentView(scroll);
        updateControls();
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
        section.setEnabled(active);exit.setEnabled(connected()&&!busy);
        code.setVisibility(connected()?View.GONE:View.VISIBLE);
        connect.setVisibility(connected()?View.GONE:View.VISIBLE);
        confirm.setVisibility(connected()?View.GONE:View.VISIBLE);
    }
    private void message(String text) {
        state.setText(text);
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
            answer.setText("Скажи «Лера, покажи продажи» или выбери раздел CRM.");
            // Register only the non-exportable device identity after the owner
            // explicitly approved this first pairing. Never retain a CRM token.
            if(devicePrefs.getString(PREF_DEVICE,"").isEmpty())
                enrollAfterOwnerApproval();
        });
    }
    private void openSection() {
        if(!connected()){message("Подключись заново с MacBook.");return;}
        final String domain=SECTION_IDS[section.getSelectedItemPosition()];
        perform("Открываю данные CRM…",()->remote("read",new JSONObject().put("domain",domain)),r->{
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
            show(r);
            speakBrief(r.optString("answer",""));
        });
    }
    private void show(JSONObject response) {
        String messageText=response.optString("answer","");
        if("section".equals(response.optString("kind"))) {
            JSONObject data=response.optJSONObject("data");
            if(data!=null)messageText+="\n\n"+data.toString();
        }else if(!response.optString("detail","").isEmpty()){
            messageText+="\n\n"+response.optString("detail","");
        }
        answer.setText(messageText.length()>3800?messageText.substring(0,3800)+"\n(часть данных)":messageText);
        message("Подключено к РЕСАНТА AI 360°. Ответ получен.");
    }
    private void requestVoice() {
        if(!connected()){message("Сеанс завершён.");return;}
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MIC_PERMISSION);
            return;
        }
        startVoice();
    }
    private void startVoice() {
        if(busy||recording||!connected())return;
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
            listen.setEnabled(false);
            message("Слушаю тебя в очках. Говори: «Лера, покажи продажи».");
            main.postDelayed(endRecording,7000);
        }catch(Exception e){
            cleanupRecorder();
            message("Микрофон: "+e.getClass().getSimpleName());
        }
    }
    private void finishRecording() {
        if(!recording)return;
        try{recorder.stop();recorder.release();recorder=null;}
        catch(Exception e){cleanupRecorder();message("Запись не удалась.");return;}
        recording=false;
        if(clip==null||clip.length()<900||clip.length()>512000){
            cleanupRecorder();message("Запись слишком короткая или длинная.");return;
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
            perform("Распознаю голос через OpenAI…",()->remote("stt",new JSONObject()
                .put("audio_base64",encoded).put("duration",7)),r->{
                String words=r.optString("text","").trim();
                if(words.isEmpty()){message("Речь не распознана. Повтори вопрос.");return;}
                answer.setText("Ты сказал: "+words);
                ask(words);
            });
        }catch(Exception e){cleanupRecorder();message("Ошибка чтения звука: "+e.getMessage());}
    }
    private void cleanupRecorder() {
        main.removeCallbacks(endRecording);recording=false;
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
                player.setOnCompletionListener(m->{stopPlayback();message("Лера готова к следующему вопросу.");});
                player.setOnErrorListener((m,w,e)->{stopPlayback();message("Не удалось воспроизвести звук.");return true;});
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
        cleanupRecorder();stopPlayback();updateControls();
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==MIC_PERMISSION){
            if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)startVoice();
            else message("Разрешение микрофона не предоставлено.");
        }
    }
    @Override protected void onPause(){
        super.onPause();
        cleanupRecorder();stopPlayback();
    }
    @Override protected void onDestroy(){
        resetSession();work.shutdownNow();
        super.onDestroy();
    }
    interface RemoteTask {JSONObject run() throws Exception;}
    interface RemoteDone {void done(JSONObject response);}
}
