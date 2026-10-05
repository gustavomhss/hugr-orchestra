FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY xpra.asc /usr/share/keyrings/xpra.asc
COPY xpra.sources /etc/apt/sources.list.d/xpra.sources
COPY xpra.pref /etc/apt/preferences.d/orchestra-xpra
RUN apt-get update && apt-get install -y --no-install-recommends \
       xpra-server=6.5.4-r0-1 xpra-x11=6.5.4-r0-1 xpra-html5=21-r1-1 \
       python3-gi gir1.2-gtk-3.0 xvfb xauth xfonts-base dbus-x11 at-spi2-core openssl sudo xterm xdg-utils \
    && useradd --create-home --uid 10001 dock \
    && printf 'dock ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/dock \
    && chmod 0440 /etc/sudoers.d/dock \
    && rm -rf /var/lib/apt/lists/*

COPY workspace.py /opt/orchestra/workspace.py
COPY browser-bridge.py /opt/orchestra/browser-bridge.py
ENV HOME=/home/dock
USER dock
WORKDIR /home/dock
EXPOSE 14500
ENTRYPOINT ["python3", "/opt/orchestra/workspace.py", "start"]
