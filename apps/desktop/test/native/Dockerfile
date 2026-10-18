FROM ubuntu:24.04@sha256:008173c23f95b170204355c12626cb5a965d779a7e1283b09e9cffbb1bf33ca3

LABEL orchestra.a11y.owner="dock-accessibility"
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Development/test closure, not the production helper's dependency list.
RUN apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        at-spi2-core ca-certificates curl dbus-bin dbus-daemon \
        featherpad fonts-dejavu-core gir1.2-atspi-2.0 gir1.2-glib-2.0 \
        gir1.2-gtk-3.0 gir1.2-gtk-4.0 gsettings-desktop-schemas \
        libasound2t64 libgbm1 libglib2.0-bin libnss3 libsecret-1-0 \
        libxkbfile1 libxss1 mousepad procps python3 python3-gi \
        tini x11-utils xauth xdotool xvfb \
    && rm -rf /var/lib/apt/lists/*

# Official stable update API receipts, checked 2026-09-30:
# https://update.code.visualstudio.com/api/update/linux-x64/stable/latest
# https://update.code.visualstudio.com/api/update/linux-arm64/stable/latest
RUN <<'SH'
set -eu
arch="$(dpkg --print-architecture)"
case "$arch" in
    amd64)
        url='https://vscode.download.prss.microsoft.com/dbazure/download/stable/07f806f999227108933c2e30515b26eecc1fda74/code-stable-x64-1790759436.tar.gz'
        sha='d32031e9e213d59532af3cf32fcb8b357a1cdd10417967b4f5b5ba30436dc0dc'
        ;;
    arm64)
        url='https://vscode.download.prss.microsoft.com/dbazure/download/stable/07f806f999227108933c2e30515b26eecc1fda74/code-stable-arm64-1790759311.tar.gz'
        sha='9609a7655c4bc2a101b343ff22aa91f6678b46d9565b914c0608bd7f2e577fa6'
        ;;
    *) printf 'Unsupported guest architecture: %s\n' "$arch" >&2; exit 1 ;;
esac
curl --fail --location --proto '=https' --tlsv1.2 --retry 2 \
    --connect-timeout 15 --max-time 300 "$url" -o /tmp/vscode.tar.gz
printf '%s  /tmp/vscode.tar.gz\n' "$sha" | sha256sum --check --strict -
install -d /opt/vscode /opt/orchestra-a11y
tar -xzf /tmp/vscode.tar.gz --strip-components=1 -C /opt/vscode
VSCODE_URL="$url" VSCODE_SHA256="$sha" GUEST_ARCH="$arch" python3 - <<'PY'
import json
import hashlib
import os
import platform
import subprocess
from pathlib import Path
import gi
from gi.repository import GLib

package = json.loads(Path('/opt/vscode/resources/app/package.json').read_text())
product = json.loads(Path('/opt/vscode/resources/app/product.json').read_text())
assert package['version'] == '1.140.0'
assert product['commit'] == '07f806f999227108933c2e30515b26eecc1fda74'
runtime = json.loads(subprocess.check_output(
    ['/opt/vscode/code', '-p', 'JSON.stringify(process.versions)'],
    env={**os.environ, 'ELECTRON_RUN_AS_NODE': '1'}, text=True))
packages = subprocess.check_output(
    ['dpkg-query', '-W', '-f=${binary:Package}\t${Version}\n'], text=True)
Path('/opt/orchestra-a11y/versions.json').write_text(json.dumps({
    'baseImage': 'ubuntu:24.04@sha256:008173c23f95b170204355c12626cb5a965d779a7e1283b09e9cffbb1bf33ca3',
    'guestArchitecture': os.environ['GUEST_ARCH'],
    'python': platform.python_version(), 'pygobject': gi.__version__,
    'glib': f'{GLib.MAJOR_VERSION}.{GLib.MINOR_VERSION}.{GLib.MICRO_VERSION}',
    'vscode': {'version': package['version'], 'commit': product['commit'],
                'url': os.environ['VSCODE_URL'], 'sha256': os.environ['VSCODE_SHA256'],
                'binaryBytes': Path('/opt/vscode/code').stat().st_size,
                'binarySha256': hashlib.sha256(Path('/opt/vscode/code').read_bytes()).hexdigest(),
                'runtime': runtime},
    'packages': dict(line.split('\t', 1) for line in packages.splitlines()),
}, indent=2) + '\n')
PY
rm /tmp/vscode.tar.gz
SH

# The pinned official Ubuntu image supplies ubuntu at UID/GID 1000.
RUN usermod --login proof --home /home/proof --move-home ubuntu \
    && groupmod --new-name proof ubuntu \
    && python3 -c 'import pwd,grp; assert pwd.getpwuid(1000).pw_name == "proof"; assert grp.getgrgid(1000).gr_name == "proof"' \
    && install -d -o proof -g proof -m 0700 /session \
    && install -d -m 1777 /tmp/.X11-unix \
    && install -d /bridge /proof
COPY --chmod=0755 session.sh /usr/local/bin/orchestra-a11y-session
RUN bash -n /usr/local/bin/orchestra-a11y-session \
    && python3 -c 'import ast; from pathlib import Path; ast.parse(Path("/usr/local/bin/orchestra-a11y-session").read_text().split("3<<\x27PY\x27\n", 1)[1].rsplit("\nPY\n", 1)[0])'

ENV HOME=/home/proof LANG=C.UTF-8
USER 1000:1000
WORKDIR /home/proof
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/bin/tini", "-s", "--", "/usr/local/bin/orchestra-a11y-session"]
