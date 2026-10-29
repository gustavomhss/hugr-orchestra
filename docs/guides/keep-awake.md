# Keep the computer awake

Long agent runs stop when the computer goes to sleep. The desktop app has a coffee cup switch in the title bar, next
to the light/dark button.

- Click the cup to keep the computer awake. The cup turns red and its steam pulses while it is on.
- Click it again to let the computer sleep as usual.

It works like `caffeinate -i` on macOS: the system does not idle-sleep, but the display can still turn off. The switch
covers every Orchestra window and lasts only while the app runs. Quitting Orchestra, or a crash, turns it off; it is
off again the next time you open the app.

The switch is only in the desktop app, not in the browser or on a phone-sized window.
