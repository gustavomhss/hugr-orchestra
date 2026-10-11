# Desktop icons

Every channel folder holds the HuGR brand kit v1.0 app icon. `scripts/copy-icons.ts` copies the active
channel's folder to `resources/icons`, where electron-builder and the main process read it:

- `icon.icns`: macOS app and DMG. Kit `02-icons/app-icon.icns`, unchanged.
- `icon.ico`: Windows app, NSIS installer and window icon. Kit `02-icons/favicon.ico`, unchanged (16 to 256 px).
- `32x32.png` … `512x512.png`: the Linux icon set. electron-builder only collects names shaped `NxN.png`.
- `icon.png`: the Linux window icon in unpackaged runs (512 px).
- `dock.png`: the macOS Dock icon in unpackaged runs (256 px), so it matches the packaged app.

The PNGs are the renditions stored in the kit's `app-icon.icns`, extracted without resampling:

```sh
iconutil -c iconset "$KIT/02-icons/app-icon.icns" -o app-icon.iconset
cp app-icon.iconset/icon_16x16@2x.png    32x32.png
cp app-icon.iconset/icon_32x32@2x.png    64x64.png
cp app-icon.iconset/icon_128x128.png     128x128.png
cp app-icon.iconset/icon_128x128@2x.png  256x256.png
cp app-icon.iconset/icon_128x128@2x.png  dock.png
cp app-icon.iconset/icon_512x512.png     512x512.png
cp app-icon.iconset/icon_512x512.png     icon.png
```
