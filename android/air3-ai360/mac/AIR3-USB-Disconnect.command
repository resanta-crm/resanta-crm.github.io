#!/bin/bash
# RESANTA INMO AIR3 / macOS USB disconnect and local erasure.
set -euo pipefail
ADB="$HOME/Downloads/platform-tools/adb"
if [ ! -x "$ADB" ]; then ADB="$(command -v adb || true)"; fi
if [ -z "$ADB" ] || [ ! -x "$ADB" ]; then
  echo 'Не найден adb. Проверьте папку platform-tools.'
  read -r -p 'Enter для закрытия... ' _
  exit 1
fi
SERIALS="$("$ADB" devices | awk '$2 == "device" {print $1}')"
COUNT="$(printf '%s\n' "$SERIALS" | grep -c '[^[:space:]]' || true)"
if [ "$COUNT" != 1 ]; then
  echo 'Подключите ровно одни очки AIR3 по USB и разрешите отладку.'
  "$ADB" devices
  read -r -p 'Enter для закрытия... ' _
  exit 1
fi
SERIAL="$SERIALS"
NONCE="$(openssl rand -hex 12)"
echo 'Запрашиваю закрытие голосовой сессии и очистку CRM на очках...'
"$ADB" -s "$SERIAL" shell am start --activity-single-top -n by.resanta.air3/.MainActivity \
  --ez resanta_usb_disconnect true --es resanta_usb_disconnect_nonce "$NONCE" >/dev/null
RESULT=''
for ((i=0; i<12; i++)); do
  LINES="$("$ADB" -s "$SERIAL" logcat -d -t 400 -s RESANTA_AIR3_USB:I '*:S' 2>/dev/null || true)"
  if printf '%s' "$LINES" | grep -Fq "usb_revoke_confirmed:$NONCE"; then
    RESULT='remote-confirmed'
    break
  fi
  if printf '%s' "$LINES" | grep -Fq "usb_revoke_no_active_session:$NONCE"; then
    RESULT='no-active-token'
    break
  fi
  if printf '%s' "$LINES" | grep -Fq "usb_revoke_unconfirmed:$NONCE"; then
    RESULT='remote-unconfirmed'
    break
  fi
  sleep 1
done
# Guarantee logout of browser and Keystore access even if network is down.
"$ADB" -s "$SERIAL" shell pm clear by.resanta.air3 >/dev/null
echo 'Локальные данные CRM, микрофон и приложение Леры в очках очищены.'
if [ "$RESULT" = 'remote-confirmed' ]; then
  echo 'Сервер подтвердил отзыв голосового сеанса.'
elif [ "$RESULT" = 'no-active-token' ]; then
  echo 'В приложении уже не было активного голосового токена.'
else
  echo 'Не удалось подтвердить отзыв на сервере.'
  echo 'В пульте CRM на MacBook нажмите «Отключить» для всех активных сеансов AIR3.'
  open 'https://resanta-crm.by/air3-control.html'
fi
echo 'До следующего показа кода вводить не нужно: подключение снова через этот USB-комплект.'
read -r -p 'Enter для закрытия... ' _
