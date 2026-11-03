#!/usr/bin/env bash
set -euo pipefail
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
mkdir -p "$TEMP_DIR/by/resanta/air3" "$TEMP_DIR/bin"
cp android/air3-ai360/app/src/main/java/by/resanta/air3/DemoWakePhrase.java "$TEMP_DIR/by/resanta/air3/"
cat > "$TEMP_DIR/by/resanta/air3/WakePhraseTest.java" <<'JAVA'
package by.resanta.air3;
public final class WakePhraseTest {
 private static void eq(String actual, String expected) {
   if(expected==null?actual!=null:!expected.equals(actual))
      throw new AssertionError("expected="+expected+" actual="+actual);
 }
 public static void main(String[] args) {
  eq(DemoWakePhrase.questionAfterWake("Привет, Лера"), "");
  eq(DemoWakePhrase.questionAfterWake("Привет, Лера, какие продажи по Витебску?"), "какие продажи по Витебску?");
  eq(DemoWakePhrase.questionAfterWake("Привет, Ресанта! Сколько просроченной ПДЗ?"), "Сколько просроченной ПДЗ?");
  eq(DemoWakePhrase.questionAfterWake("Лера, какая задолженность?"), "какая задолженность?");
  eq(DemoWakePhrase.questionAfterWake("Привет, Лена"), null);
  eq(DemoWakePhrase.questionAfterWake("Сколько продаж?"), null);
  eq(DemoWakePhrase.questionAfterWake("Встреча с Лерой"), null);
  System.out.println("AIR3 Russian demo wake phrase: 7/7 PASS");
 }
}
JAVA
javac -encoding UTF-8 -d "$TEMP_DIR/bin" "$TEMP_DIR/by/resanta/air3/DemoWakePhrase.java" "$TEMP_DIR/by/resanta/air3/WakePhraseTest.java"
java -cp "$TEMP_DIR/bin" by.resanta.air3.WakePhraseTest
python3 - <<'PY'
from pathlib import Path
s=Path('android/air3-ai360/app/src/main/java/by/resanta/air3/MainActivity.java').read_text()
m=Path('android/air3-ai360/app/src/main/AndroidManifest.xml').read_text()
assert 'new AlertDialog.Builder(this)' in s
assert 'demoActive=false;' in s and 'onPause()' in s
assert 'MAX_DEMO_SPEECH_CHECKS = 20' in s
assert 'MAX_DEMO_DURATION_MS = 15*60*1000L' in s
assert 'if(wasDemo&&!speechDetected)' in s
assert 'if(!demoActive)return;' in s
assert 'if(!connected())' in s
assert 'endDemo("")' in s
assert 'crm-ai360-air3-v2' in s
assert 'ACCESS_FINE_LOCATION' not in m and 'FOREGROUND_SERVICE_MICROPHONE' not in m
assert 'SERVICE_ROLE_KEY' not in s and 'SUPABASE_SERVICE_ROLE_KEY' not in s
print('AIR3 demo opt-in / session / finite-mic boundary PASS')
PY
