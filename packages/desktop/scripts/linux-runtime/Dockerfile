FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl --fail --silent --show-error https://xpra.org/xpra.asc -o /usr/share/keyrings/xpra.asc \
    && curl --fail --silent --show-error https://raw.githubusercontent.com/Xpra-org/xpra/master/packaging/repos/noble/xpra.sources -o /etc/apt/sources.list.d/xpra.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
       xpra-server xpra-x11 xpra-html5 python3-pillow python3-gi python3-cairo python3-gi-cairo gir1.2-gtk-3.0 \
       xvfb xauth dbus-x11 openssl sudo xterm mousepad featherpad \
    && useradd --create-home --uid 10001 dock \
    && printf 'dock ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/dock \
    && chmod 0440 /etc/sudoers.d/dock \
    && rm -rf /var/lib/apt/lists/*

COPY start.sh probe.py /opt/orchestra/
ENV HOME=/home/dock DISPLAY=:100 QT_QPA_PLATFORM=xcb
USER dock
WORKDIR /home/dock
EXPOSE 14500
ENTRYPOINT ["sh", "/opt/orchestra/start.sh"]
