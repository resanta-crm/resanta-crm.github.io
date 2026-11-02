package by.resanta.air3probe;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.WebView;
import android.content.pm.PackageInfo;
import android.media.projection.MediaProjectionManager;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.ArrayList;

/**
 * INMO AIR3 standalone capability probe. Not a CRM client.
 *
 * It NEVER authenticates, stores CRM secrets, records audio to files, calls a
 * server, changes CRM data or starts a display projection.
 */
public final class MainActivity extends Activity {
    private static final int REQUEST_MIC = 1001;
    private SpeechRecognizer recognizer;
    private TextView status;
    private boolean busy;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(7, 26, 53));
        getWindow().setNavigationBarColor(Color.rgb(7, 26, 53));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(25, 22, 25, 28);
        content.setBackgroundColor(Color.rgb(7, 26, 53));

        TextView title = text("РЕСАНТА AI · Проверка INMO AIR3", 24, true);
        content.addView(title);

        TextView caution = text(
            "Эта первая сборка проверяет совместимость очков. Она НЕ входит в CRM, " +
            "не хранит пароли, не передаёт звук в интернет и не запускает трансляцию.", 16, false);
        caution.setPadding(0, 12, 0, 10);
        content.addView(caution);

        status = text("Нажмите «Проверить устройство».", 18, false);
        status.setTextColor(Color.rgb(163, 216, 255));
        status.setPadding(0, 16, 0, 22);

        Button device = button("1. Проверить устройство");
        device.setOnClickListener(v -> checkHardware());
        content.addView(device);

        Button mic = button("2. Проверить микрофон и команду");
        mic.setOnClickListener(v -> requestVoice());
        content.addView(mic);

        Button screen = button("3. Проверить возможность трансляции");
        screen.setOnClickListener(v -> checkProjection());
        content.addView(screen);

        content.addView(status);

        TextView tip = text(
            "Примеры команд: «Открой продажи», «Перейди в ПДЗ», " +
            "«Покажи Триовист», «Включи трансляцию».\n" +
            "На этом этапе они только распознаются: никаких переходов или записей в CRM.", 15, false);
        tip.setPadding(0, 8, 0, 0);
        content.addView(tip);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.addView(content);
        setContentView(scroll);
    }

    private TextView text(String value, int sp, boolean strong) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(Color.WHITE);
        view.setGravity(Gravity.START);
        if (strong) view.setTypeface(null, android.graphics.Typeface.BOLD);
        return view;
    }

    private Button button(String caption) {
        Button button = new Button(this);
        button.setText(caption);
        button.setTextSize(17);
        button.setAllCaps(false);
        button.setMinHeight(64);
        return button;
    }

    private void checkHardware() {
        PackageInfo webView = WebView.getCurrentWebViewPackage();
        MediaProjectionManager projection =
            (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        String version = webView == null ? "отсутствует" : webView.versionName;
        status.setText("Android: " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")" +
            "\nWebView: " + version +
            "\nСлужба распознавания: " +
              (localRecognitionAvailable() ? "доступна" : "не найдена") +
            "\nMediaProjection API: " +
              (projection != null ? "есть" : "нет") +
            "\nДоступ к CRM: не запрашивался");
    }

    private void checkProjection() {
        MediaProjectionManager manager =
            (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        status.setText(manager == null ?
            "MediaProjection API недоступен: нужна проверка конкретной прошивки." :
            "MediaProjection API присутствует. Реальная передача изображения пока " +
            "НЕ включена: для неё нужны отдельное разрешение Android, канал передачи " +
            "и проверка на принимающем MacBook.");
    }

    private boolean localRecognitionAvailable() {
        // Never invoke an unknown system cloud STT provider without explicit user consent.
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            SpeechRecognizer.isOnDeviceRecognitionAvailable(this);
    }

    private void requestVoice() {
        if (busy) return;
        if (!localRecognitionAvailable()) {
            status.setText("Безопасное локальное распознавание речи недоступно. " +
                "Для полноценной Леры понадобится существующее защищённое OpenAI STT.");
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
            return;
        }
        startVoice();
    }

    private void startVoice() {
        if (busy) return;
        busy = true;
        status.setText("Слушаю одну команду…");
        recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {
                status.setText("Микрофон активен. Произнесите команду.");
            }
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {
                status.setText("Распознаю сказанное…");
            }
            @Override public void onError(int error) {
                busy = false;
                status.setText("Ошибка распознавания (" + error +
                    "). Возможна несовместимость системного голосового сервиса AIR3.");
                disposeRecognizer();
            }
            @Override public void onResults(Bundle results) {
                busy = false;
                ArrayList<String> values =
                    results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String said = values == null || values.isEmpty() ? "" : values.get(0);
                VoiceNavigation.Result resolved = VoiceNavigation.resolve(said);
                status.setText("Слышал: «" + said + "»\n" +
                    "Намерение: " + resolved.title + "\n" +
                    (resolved.requiresConfirmation ?
                        "Потребуется подтверждение. Сейчас ничего не выполнено." :
                        "Только проверка распознавания; CRM не открывалась."));
                disposeRecognizer();
            }
            @Override public void onPartialResults(Bundle partialResults) {}
            @Override public void onEvent(int eventType, Bundle params) {}
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try { recognizer.startListening(intent); }
        catch (RuntimeException ex) {
            busy = false;
            status.setText("Невозможно запустить распознавание: " + ex.getClass().getSimpleName());
            disposeRecognizer();
        }
    }

    private void disposeRecognizer() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
    }

    @Override public void onRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_MIC) {
            if (grantResults.length > 0 &&
                    grantResults[0] == PackageManager.PERMISSION_GRANTED) startVoice();
            else status.setText("Разрешение микрофона отклонено. Никакая запись не ведётся.");
        }
    }

    @Override protected void onPause() {
        super.onPause();
        // No listening in background, no hidden recording.
        if (recognizer != null) {
            recognizer.cancel();
            disposeRecognizer();
            busy = false;
        }
    }

    @Override protected void onDestroy() {
        disposeRecognizer();
        super.onDestroy();
    }
}
