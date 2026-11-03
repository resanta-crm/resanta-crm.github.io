package by.resanta.air3;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import java.util.Locale;

/**
 * Foreground-only, ON-DEVICE wake-phrase adapter. Never sends ambient audio
 * to a server, never uses the system default cloud recognizer as fallback.
 * The Android service availability MUST be verified on the physical AIR3.
 */
final class WakePhraseListener implements RecognitionListener {
    interface Command { void received(String followingQuestion); }
    private final Activity activity;
    private final Command callback;
    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private boolean enabled;
    private int errors;
    private final Runnable restart = this::listen;

    WakePhraseListener(Activity activity, Command callback) {
        this.activity=activity;
        this.callback=callback;
    }

    boolean available() {
        return Build.VERSION.SDK_INT>=31 &&
            SpeechRecognizer.isOnDeviceRecognitionAvailable(activity);
    }

    boolean start() {
        if (enabled) return true;
        if (!available()) return false;
        if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) return false;
        try {
            recognizer=SpeechRecognizer.createOnDeviceSpeechRecognizer(activity);
            recognizer.setRecognitionListener(this);
            enabled=true;
            errors=0;
            listen();
            return true;
        } catch (Exception e) {
            stop();
            return false;
        }
    }

    void stop() {
        enabled=false;
        main.removeCallbacks(restart);
        SpeechRecognizer old=recognizer;
        recognizer=null;
        if(old!=null){
            try { old.cancel(); } catch (Exception ignored) {}
            try { old.destroy(); } catch (Exception ignored) {}
        }
    }

    private void listen() {
        if(!enabled || recognizer==null) return;
        Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        try { recognizer.startListening(i); }
        catch(Exception e) { retry(); }
    }

    private void retry() {
        if(!enabled) return;
        errors++;
        if(errors>=8){ stop(); return; }
        main.removeCallbacks(restart);
        main.postDelayed(restart,Math.min(5000,900*errors));
    }

    static String commandAfterWake(String raw) {
        if(raw==null) return null;
        String value=raw.toLowerCase(Locale.ROOT).replace('ё','е')
                .replaceAll("[,!.?;:]+"," ").replaceAll("\\s+"," ").trim();
        String[] prefixes={"привет ресанта","привет рессанта","привет лера",
                "эй ресанта","эй рессанта","эй лера"};
        for(String prefix:prefixes)
            if(value.equals(prefix))return "";
            else if(value.startsWith(prefix+" "))return value.substring(prefix.length()).trim();
        return null;
    }

    @Override public void onResults(Bundle results) {
        if(!enabled) return;
        ArrayList<String> alternatives=results.getStringArrayList(
                SpeechRecognizer.RESULTS_RECOGNITION);
        if(alternatives!=null)for(String utterance:alternatives) {
            String question=commandAfterWake(utterance);
            if(question!=null) {
                stop();
                main.postDelayed(()->callback.received(question),200);
                return;
            }
        }
        errors=0;
        main.postDelayed(restart,450);
    }
    @Override public void onError(int error) { retry(); }
    @Override public void onReadyForSpeech(Bundle b) {}
    @Override public void onBeginningOfSpeech() {}
    @Override public void onRmsChanged(float rms) {}
    @Override public void onBufferReceived(byte[] buffer) {}
    @Override public void onEndOfSpeech() {}
    @Override public void onPartialResults(Bundle b) {}
    @Override public void onEvent(int eventType,Bundle params) {}
}
