"""Native GTK workload for input-to-canvas timing; not an app compatibility test."""

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gdk, GLib, Gtk


class Probe(Gtk.Window):
    def __init__(self):
        super().__init__(title="Orchestra GTK latency probe")
        self.state = 0
        self.animating = False
        self.set_default_size(256, 256)
        self.area = Gtk.DrawingArea()
        self.add(self.area)
        self.area.connect("draw", self.draw)
        self.connect("key-press-event", self.key)
        self.connect("destroy", Gtk.main_quit)
        self.show_all()

    def key(self, window, event):
        if event.keyval == Gdk.KEY_b:
            self.animating = not self.animating
            if self.animating:
                GLib.timeout_add(16, self.tick)
            return True
        if event.keyval != Gdk.KEY_a:
            return False
        self.state += 1
        self.area.queue_draw()
        return True

    def tick(self):
        if not self.animating:
            return False
        self.state += 1
        self.area.queue_draw()
        return True

    def draw(self, area, context):
        value = self.state % 2
        context.set_source_rgb(value, value, value)
        context.paint()


Probe()
Gtk.main()
