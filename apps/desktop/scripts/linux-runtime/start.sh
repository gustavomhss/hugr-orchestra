#!/bin/sh
set -eu

mkdir -p "$HOME/.runtime/run"
chmod 0700 "$HOME/.runtime"
chmod 0700 "$HOME/.runtime/run"
export XDG_RUNTIME_DIR="$HOME/.runtime/run"
if [ ! -f "$HOME/.runtime/cert.pem" ]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -keyout "$HOME/.runtime/key.pem" -out "$HOME/.runtime/cert.pem" \
    -days 30 -subj /CN=localhost -addext 'subjectAltName=IP:127.0.0.1,DNS:localhost'
fi
printf '%s' "$APP_DOCK_RUNTIME_PASSWORD" > "$HOME/.runtime/password"
chmod 0600 "$HOME/.runtime/key.pem" "$HOME/.runtime/password"

exec dbus-run-session -- xpra start :100 --daemon=no \
  --bind-ssl=0.0.0.0:14500,auth=file:filename=/home/dock/.runtime/password \
  --ssl-cert="$HOME/.runtime/cert.pem" --ssl-key="$HOME/.runtime/key.pem" \
  --html=on --mdns=no --printing=no --webcam=no --notifications=no \
  --pulseaudio=no --speaker=disabled --microphone=disabled \
  --start-child=xterm --start=mousepad --start=featherpad \
  --start='python3 /opt/orchestra/probe.py' \
  --exit-with-client=no --exit-with-children=no
