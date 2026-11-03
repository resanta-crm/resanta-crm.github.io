#!/bin/bash
# RESANTA INMO AIR3 / macOS USB onboarding. Requires authorized ADB cable.
set -euo pipefail
ADB="$HOME/Downloads/platform-tools/adb"
if [ ! -x "$ADB" ]; then
  ADB="$(command -v adb || true)"
fi
if [ -z "$ADB" ] || [ ! -x "$ADB" ]; then
  echo 'Не найден adb. Скопируйте platform-tools в ~/Downloads/platform-tools.'
  read -r -p 'Enter для закрытия... ' _
  exit 1
fi
SERIALS="$("$ADB" devices | awk '$2 == "device" {print $1}')"
COUNT="$(printf '%s\n' "$SERIALS" | grep -c '[^[:space:]]' || true)"
if [ "$COUNT" != 1 ]; then
  echo 'Нужно подключить ровно одни очки INMO AIR3 по USB и разрешить отладку на них.'
  "$ADB" devices
  read -r -p 'Enter для закрытия... ' _
  exit 1
fi
SERIAL="$SERIALS"
DIR="$(cd "$(dirname "$0")" && pwd)"
APK="$DIR/Resanta_Lera_AIR3_Real_CRM_USB_v1.5.apk"
if [ ! -f "$APK" ]; then
  echo 'В комплекте нет APK v1.5. Распакуйте весь архив в одну папку.'
  read -r -p 'Enter для закрытия... ' _
  exit 1
fi
echo 'Подключены очки. Проверяю версию приложения РЕСАНТА AI360...'
INSTALLED="$("$ADB" -s "$SERIAL" shell dumpsys package by.resanta.air3 2>/dev/null | grep 'versionCode=' | head -n 1 || true)"
if [[ "$INSTALLED" != *'versionCode=6 '* ]]; then
  echo 'Устанавливаю v1.5 только для очков. Вход в CRM внутри очков может потребовать повторной авторизации.'
  if ! "$ADB" -s "$SERIAL" install -r "$APK"; then
    echo 'Старая APK имеет другую тестовую подпись. Удаляю только by.resanta.air3.'
    "$ADB" -s "$SERIAL" uninstall by.resanta.air3
    "$ADB" -s "$SERIAL" install "$APK"
  fi
fi
echo 'Открываю настоящий сайт CRM в очках...'
"$ADB" -s "$SERIAL" shell am start --activity-single-top -n by.resanta.air3/.MainActivity >/dev/null
echo 'В браузере MacBook откроется пульт подключения.'
echo 'Нажмите кнопку «🔌 Подключить очки по USB · без ввода кода».'
open 'https://resanta-crm.by/air3-control.html'
# Only consume an exact short-lived marker copied by the authenticated owner page.
# Never print, store or log its six digits.
PAIR=''
for ((i=0; i<150; i++)); do
  VALUE="$(pbpaste 2>/dev/null | tr -d '\r\n' || true)"
  if [[ "$VALUE" =~ ^AIR3USB:[0-9]{6}$ ]]; then
    PAIR="${VALUE#AIR3USB:}"
    printf '' | pbcopy
    break
  fi
  sleep 1
done
if [ -z "$PAIR" ]; then
  echo 'Не получено USB-подтверждение. Проверьте пульт CRM и попробуйте ещё раз.'
  read -r -p 'Enter для закрытия... ' _
  exit 1
fi
if ! "$ADB" -s "$SERIAL" shell am start --activity-single-top -n by.resanta.air3/.MainActivity --es resanta_usb_pair "$PAIR" >/dev/null; then
  PAIR=''
  echo 'Не удалось передать подтверждение на очки по USB.'
  read -r -p 'Enter для закрытия... ' _
  exit 1
fi
PAIR=''
echo
echo 'USB-подключение отправлено. Теперь на MacBook нажмите «Разрешить вход».'
echo 'Очки сами проверят разрешение. После подключения кабель можно снять.'
echo 'Чтобы завершить работу, позже используйте AIR3-USB-Disconnect.command.'
read -r -p 'Enter для закрытия этого окна... ' _
