# Unscripted validation with apps beyond VS Code

Goal: show that the Linux workspace works with any Linux app, not only VS Code. Three apps from other toolkits, each
with one open task in plain Portuguese (outcome only, no tool names) and an **external oracle** the lead runs with
`docker exec`, outside the agent. Every oracle below was changed by hand-driving the app once through the real native
helper (`test/native/apps/app_probe.py`) in a runtime-equivalent workspace on 2026-10-06; the before/after output is
recorded under each task.

## Setup

1. Build `orchestra-native-apps:20261006` (`test/native/apps/README.md`) and start the dev app on a fresh workspace
   with `APP_DOCK_LINUX_IMAGE=orchestra-native-apps:20261006`.
2. Open the app from **Apps > Linux workspace** and the Linux menu, so the Linux view (the Xpra client) is attached
   before the task starts. Menus, popups and keys need it.
3. Find the container and run the task's reset, then its oracle, before handing the task to the model:

```sh
c=$(docker ps --filter label=io.orchestra.app-dock.kind=workspace --format '{{.Names}}')
bus=DBUS_SESSION_BUS_ADDRESS=unix:path=/home/dock/.orchestra-runtime/run/session-bus   # only for writes
```

Reads need no session bus. Writes to dconf/xfconf go through the session's own daemons, hence `-e "$bus"`.

## 1. Mousepad (GTK 3)

**Task**

> No workspace Linux tem o Mousepad aberto. Ative a quebra automática de linhas pelo próprio programa, confirme que
> ficou ativa e depois desfaça, deixando como estava.

**Oracle** (Mousepad's own GSettings key; it changes the moment the option is toggled)

```sh
docker exec --user dock "$c" gsettings get org.xfce.mousepad.preferences.view word-wrap
```

`false` before, `true` after enabling, `false` after undoing.

**Reset** (Mousepad may stay open; it follows the change live)

```sh
docker exec --user dock -e "$bus" "$c" gsettings reset org.xfce.mousepad.preferences.view word-wrap
```

**Evidence** (helper actions on `Document > Word Wrap` and the Preferences check box)

```text
before: false
after enable (menu item "Word Wrap"): true      Preferences shows: check box "Wrap long lines" [checked]
after undo (check box "Wrap long lines"): false
enabled again: true
after reset: false                              Preferences shows: check box "Wrap long lines" [unchecked]
```

**What the model will meet**: GTK menu items act only while their menu is open (`ui_act` on `Document` first;
otherwise `menu-closed`). The `Document > Word Wrap` menu item exposes no checked state (Mousepad draws its own
check icon, and the item's name carries trailing padding: `"Word Wrap      "`). The only readable confirmation is
`Edit > Preferences... > View > "Wrap long lines"`, which is a real check box with a checked state. The Preferences
window is not modal and shows no Close button in the tree.

## 2. FeatherPad (Qt 5)

**Task**

> No workspace Linux tem o FeatherPad aberto. Faça o FeatherPad mostrar sempre os números de linha, como
> configuração permanente do programa (não só nesta janela). Confirme e depois desfaça, deixando como estava.

**Oracle** (FeatherPad writes `fp.conf` when its Preferences dialog closes, and on quit)

```sh
docker exec --user dock "$c" sh -c 'grep -s "^lineNumbers=" ~/.config/featherpad/fp.conf || echo "(no lineNumbers key)"'
```

Off is `(no lineNumbers key)` or `lineNumbers=false`; on is `lineNumbers=true`. A change shows only after the
Preferences dialog is closed.

**Reset** (FeatherPad keeps its settings in memory and rewrites the file, so it must be closed first)

```sh
docker exec --user dock "$c" sh -c 'pkill -x featherpad; while pgrep -x featherpad >/dev/null; do sleep 0.2; done; rm -f ~/.config/featherpad/fp.conf'
```

Then reopen FeatherPad from the Linux menu.

**Evidence** (`Options > Preferences`, check box `Always show line numbers`, the dialog's `Close`)

```text
before: (no lineNumbers key)
Preferences -> timeout (dialog opened anyway), check box -> acknowledged, Close -> acknowledged
after enable: lineNumbers=true
Preferences -> timeout, tree shows check box "Always show line numbers" [checked], uncheck, Close
after undo: lineNumbers=false
after reset + relaunch: (no lineNumbers key), Preferences shows the check box unchecked
```

**What the model will meet**: `Options > Line Numbers` is a per-window toggle and does not persist; the permanent
setting is only in Preferences. Opening Preferences through an action reports `timeout` (outcome unknown) although
the dialog opens: Qt answers the action only after its modal dialog closes. The app stays readable meanwhile, so a
fresh read shows the dialog. Qt names the action `Press` (capitalised). The tree also lists hidden Qt widgets (the
floating "Replacement" panel, every Preferences tab page at once) and 21 icon-only buttons without names.

## 3. Thunar (GTK 3 file manager)

**Task**

> No workspace Linux tem o gerenciador de arquivos Thunar aberto na pasta pessoal. Usando só o gerenciador de
> arquivos, crie uma pasta chamada relatorios e mova o arquivo notas.txt para dentro dela. Confirme e depois desfaça:
> o arquivo volta para a pasta pessoal e a pasta relatorios deixa de existir.

**Oracle** (the file system)

```sh
docker exec --user dock "$c" sh -c 'cd ~ && for p in relatorios relatorios/notas.txt notas.txt; do [ -e "$p" ] && echo "present $p" || echo "absent  $p"; done; cat ~/notas.txt 2>/dev/null'
```

Before and after undoing: `absent relatorios`, `absent relatorios/notas.txt`, `present notas.txt`, content
`linha 1`. After the task: `present relatorios`, `present relatorios/notas.txt`, `absent notas.txt`.

**Reset** (also returns Thunar to its default icon view, which is the honest product state; see below)

```sh
docker exec --user dock "$c" sh -c 'pkill -x thunar; while pgrep -x thunar >/dev/null; do sleep 0.2; done; rm -rf ~/relatorios; printf "linha 1\n" > ~/notas.txt'
docker exec --user dock -e "$bus" "$c" xfconf-query -c thunar -p /last-view -s ThunarIconView
```

Then reopen Thunar from the Linux menu.

**Evidence** (List View button; Create Folder by `ctrl+shift+n`, name typed into the dialog's field, `Create`;
move by `Down`, `ctrl+x`, `Up`, `Return`, `ctrl+v`; undo by `Open Parent`, `ctrl+z`, then `Delete` and the
confirmation's `Delete` button)

```text
before:      absent relatorios / absent relatorios/notas.txt / present notas.txt
after task:  present relatorios / present relatorios/notas.txt / absent notas.txt
after ctrl+z: present relatorios / absent relatorios/notas.txt / present notas.txt
after Delete + confirm: absent relatorios / absent relatorios/notas.txt / present notas.txt ("linha 1")
```

**What the model will meet**

- In the default **icon view the folder's files are invisible**: Thunar's icon view exports an empty panel
  (`directory pane "Icon view" > panel ""`, zero children on the raw bus, not a helper filter). The `List View`
  toolbar button switches to a table whose cells carry the file names. Thunar remembers the view, hence the
  reset.
- `File > Create Folder...` opens a modal dialog. Acting on it now goes out as a click and keeps Thunar answering
  (see "GTK modal dialogs" below); `ctrl+shift+n` opens the same dialog. The item must be on screen: acting on it
  with the File menu closed is refused with `menu-closed`, so open `File` first.
- There is no Trash (no gvfs), so deleting asks to delete permanently; `ctrl+z` after creating a folder raises the
  same confirmation. Two stacked confirmations can appear; only the top one reacts.
- File rows sit under a table (virtual ancestry): default-mode actions refuse them (`unstable-ref`); the hand
  run selected rows with arrow keys.

## Accessibility findings

Measured in a workspace started like the runtime does (same `docker create` flags and seccomp profile, current
`workspace.py`, native helper copied to `/opt/orchestra/app-dock-accessibility`, Xpra client attached), host load
about 5, one full `ui_find`-style scan (budget 500, maxText 0) per run, three runs each:

| App | Windows on the AT-SPI desktop | Items | Pages | Scan time | Wire calls | Actionable / typeable | Unnamed actionable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mousepad | yes, no env needed | 114 | 1 | 0.70-0.82 s | 978 | 49 / 1 | 0 |
| FeatherPad | yes, no env needed | 190 | 2 (call budget) | 1.35-1.46 s | 1582 | 94 / 4 | 21 |
| Thunar (details view, 4 entries) | yes, no env needed | 143 | 1 | 0.77-0.79 s | 1068 | 23 / 1 | 2 |

Menus, check boxes, buttons, combo boxes, spin buttons, page tabs and editable text are all present with names and
states, except where noted per app above. Toolkit enablement needed no change: the session's
`org.a11y.Status.IsEnabled=true` is enough for GTK 3 and for Qt 5 (no `QT_LINUX_ACCESSIBILITY_ALWAYS_ON`).

### GTK modal dialogs opened by an action (fixed on branch `gtk-dialog-freeze`)

Before the fix, acting on `File > Create Folder...` (Thunar) or `Search > Go to...` (Mousepad) left the app deaf
to AT-SPI, and every workspace-scope `ui_*` call then failed with `timeout` until the app was killed.

Root cause (gdb on the live Thunar, and on a minimal GTK 3 fixture): at-spi2-atk replies to `DoAction` first (the
helper saw `acknowledged` within 1 ms), then runs the handler inside its own D-Bus dispatch
(`g_main_context_dispatch > libatspi source > dbus_connection_dispatch > atk-bridge > gtk_menu_shell_activate_item
> handler > gtk_dialog_run`). The dialog's nested main loop cannot re-enter that source, so the app answers no
AT-SPI call while the dialog is open. The first key event then makes atk-bridge's key snooper spin its own loop
that calls `dbus_connection_dispatch` again and waits on the dispatch lock its outer frame holds: a permanent
futex deadlock. Without a key event the app recovers once the dialog closes (X input still reaches it). Waiting
or not waiting for the D-Bus reply changes nothing: the reply was never the blocker.

Fix: for GTK apps a `click` action goes out as a left click at the control's centre (the handler then runs from
GDK's event dispatch, as a person's click does), under the pointer guards plus a hit test that must name the
control. Items of a closed GTK menu are refused (`menu-closed`). When a click cannot stand in (no active window,
offscreen, hit elsewhere), `DoAction` runs as before and an app that then stops answering is reported as
`app-not-responding`. Discovery skips an app that does not answer and every read names it
(`app-not-responding:<process>`), so the others stay usable; `ui_look` prints it. Covered by
`test/native/test_modal_actions.py` (4 tests, 6 mutations). Qt modals never froze (Qt only delays the reply).

### Electron apps other than VS Code

The brief assumed Electron was handled. It was handled only for VS Code (the dev image's `code.desktop` passes
`--force-renderer-accessibility`, and the workspace seeds `editor.accessibilitySupport: "on"`). A Chromium app
launched without that switch exports an empty frame (2 nodes), and neither `ACCESSIBILITY_ENABLED=1` nor
`org.a11y.Status.ScreenReaderEnabled=true` changes that. `workspace.py launch` now adds the switch to any app whose
executable sits next to Chromium's own files (Slack, Discord, Chrome, Electron apps), keeping the rest of the
desktop entry: the same VS Code build launched through a plain desktop entry went from 2 to 381 nodes. Covered by
`test/native/test_app_launch.py` (4 tests, 4 mutations).
