# syntax=docker/dockerfile:1
# Development/validation image only, never shipped: the VS Code workspace image plus one app per desktop toolkit,
# so unscripted runs can prove the Linux workspace with apps other than VS Code. Build and use: README.md here.
#
# The base is the local dev image the lead validates VS Code with (runtime image from resources/linux-runtime +
# VS Code 1.140.0 from test/native/Dockerfile + code.desktop). It exists only on the lead's machine, so it is pinned
# by its image ID rather than a registry digest; the build fails if that exact image is missing.
ARG BASE=orchestra-native-code:20261004@sha256:4ca83d080f31f2e242b1f40934c156d11e5f68ebca7a1324df7a89372ff3290d
FROM ${BASE}

LABEL orchestra.a11y.owner="workspace-apps"
USER root
# mousepad: GTK3 text editor (settings in GSettings/dconf). featherpad: Qt5 text editor (settings in an INI file).
# thunar: GTK3 file manager (settings in xfconf). libglib2.0-bin: gsettings, for the external oracles only.
# Ubuntu's archive stays live; /opt/orchestra-apps/versions.txt records what this build resolved.
RUN apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        mousepad featherpad thunar adwaita-icon-theme libglib2.0-bin \
    && rm -rf /var/lib/apt/lists/* \
    && install -d /opt/orchestra-apps \
    && dpkg-query -W -f='${binary:Package}\t${Version}\n' mousepad featherpad thunar libgtk-3-0t64 \
        libqt5core5t64 xfconf dconf-service > /opt/orchestra-apps/versions.txt
USER dock
