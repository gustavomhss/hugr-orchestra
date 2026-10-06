# Workspace apps image (dev/validation only)

`orchestra-native-apps:20261006` is the VS Code workspace image plus one app per desktop toolkit, so unscripted
runs can prove the Linux workspace with apps other than VS Code. It is never shipped; the production runtime image
stays `resources/linux-runtime/Dockerfile`. Tasks, oracles and resets: `docs/plans/linux-workspace/VALIDATION-APPS.md`.

| App | Toolkit | Desktop ID in the Linux menu | Settings backend |
| --- | --- | --- | --- |
| Mousepad 0.6.1 | GTK 3.24 | `org.xfce.mousepad.desktop` | GSettings/dconf (`~/.config/dconf/user`) |
| FeatherPad 1.4.1 | Qt 5.15 | `featherpad.desktop` | INI file `~/.config/featherpad/fp.conf` |
| Thunar 4.18.8 | GTK 3.24 | `thunar.desktop` | xfconf (`~/.config/xfce4/xfconf/xfce-perchannel-xml/thunar.xml`) |
| VS Code 1.140.0 | Electron | `code.desktop` | `~/.config/Code/User/settings.json` (from the base image) |

The menu also lists the apps' own helper entries (Bulk Rename, File Manager Settings, Text Editor Settings).

## Build

```sh
cd packages/desktop/test/native/apps
docker build --provenance=false --tag orchestra-native-apps:20261006 .
```

The base is the local `orchestra-native-code:20261004` image (runtime image + VS Code), pinned by image ID
`sha256:4ca83d08…`; it exists only on the lead's machine, so the build fails anywhere else instead of resolving a
different base. Ubuntu's archive stays live; `/opt/orchestra-apps/versions.txt` records what a build resolved.
Built 2026-10-06: image ID `sha256:0439991370f4a5e79ccd6697caf087afd6d9392f75c825bf2e81e2acad243905`.

## Use in the dev app

Start the unpackaged app with `APP_DOCK_LINUX_IMAGE=orchestra-native-apps:20261006`. The image is read only when
the workspace container is created: an existing workspace keeps its old image, so start from a fresh dev workspace
(the same way the switch to `orchestra-native-code` was made). The app copies the current `workspace.py` and the
native helper into the container itself.

No extra environment is needed for accessibility: the runtime's session sets `org.a11y.Status.IsEnabled`, which
GTK 3 and Qt 5 honour (Qt without `QT_LINUX_ACCESSIBILITY_ALWAYS_ON`). Chromium-family apps get
`--force-renderer-accessibility` from `workspace.py launch` (see `test/native/test_app_launch.py`).

## Probe an app with the real native helper

`app_probe.py` binds an app's windows exactly as the host does and scans, acts, types or sends keys. It is the
generic sibling of `large_tree_probe.py`, which needs the W0 session and VS Code Settings.

```sh
c=$(docker ps --filter label=io.orchestra.app-dock.kind=workspace --format '{{.Names}}')
docker cp app_probe.py "$c":/tmp/app_probe.py
docker exec --user dock "$c" python3 /tmp/app_probe.py scan mousepad            # timings, counts, outline
docker exec --user dock "$c" python3 /tmp/app_probe.py act mousepad --role "menu item" --name "Word Wrap"
docker exec --user dock "$c" python3 /tmp/app_probe.py type thunar --role text --name "" --nth 2 --text relatorios
docker exec --user dock "$c" python3 /tmp/app_probe.py keys thunar --name "dock - Thunar" --keys ctrl+shift+n
```

Menus, popups and `keys` need mapped, focused windows, which only exist while an Xpra client is attached (the
app's Linux view). Without it GTK menus stay empty and `keys` fails with `focus-unconfirmed`.
