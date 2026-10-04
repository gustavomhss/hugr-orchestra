"""Direct AT-SPI 2.52 wire boundary; blocking callers never own the GLib loop."""

from collections import deque
from concurrent.futures import Future, TimeoutError
from threading import Lock, Thread, current_thread
import builtins

import gi

gi.require_version("Gio", "2.0")
gi.require_version("GLib", "2.0")
from gi.repository import Gio, GLib

DBUS = "org.freedesktop.DBus"
DBUS_PATH = "/org/freedesktop/DBus"
ACCESSIBLE = "org.a11y.atspi.Accessible"
ROOT = "/org/a11y/atspi/accessible/root"


class BusError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, str(message)[:1024]
        super().__init__(self.message)


def _error(error):
    if error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.CANCELLED):
        return BusError("cancelled", error.message)
    if error.matches(Gio.io_error_quark(), Gio.IOErrorEnum.TIMED_OUT):
        return BusError("timeout", error.message)
    code = Gio.DBusError.get_remote_error(error)
    return BusError("timeout" if code in (DBUS + ".NoReply", DBUS + ".Timeout", DBUS + ".TimedOut") else code or "provider-unavailable", error.message)


def _typed(signature, parameters, reply):
    parameters, reply = GLib.Variant(signature, parameters), GLib.VariantType.new(reply)
    return parameters, reply


class AtspiBus:
    """Tuple signatures include parentheses. Lifecycle callbacks must only mark dirty.

    Remote D-Bus error names are preserved in BusError.code. Local cancellation
    never proves that a remote mutation was cancelled. Trace excludes connection
    constructors' initial Hello, before a connection/filter exists.
    """

    def __init__(self, session_address: str, timeout_ms=1000):
        self.timeout_ms = self._timeout(timeout_ms)
        self._lock, self._pending = Lock(), {}
        self._connections, self._subscriptions = [], []
        self._active = set()
        self._trace, self.trace_total = deque(maxlen=4096), 0
        self._closed = False
        self._context = GLib.MainContext.new()
        self._loop = GLib.MainLoop.new(self._context, False)
        self._thread = Thread(target=self._run, name="atspi-wire", daemon=True)
        self._thread.start()
        try:
            self.connection = self._wait(lambda f, c: self._connect(session_address, f, c, True), self.timeout_ms)
        except BusError:
            self.close()
            raise

    @staticmethod
    def _timeout(value):
        if type(value) is not int or not 1 <= value <= 60000:
            raise BusError("protocol-error", "Timeout must be an integer from 1 to 60000 ms")
        return value

    def _run(self):
        self._context.push_thread_default()
        try:
            self._loop.run()
        finally:
            self._context.pop_thread_default()

    def _finish(self, future, value=None, error=None):
        with self._lock:
            pending = self._pending.pop(future, None)
            if pending is None:
                return False
            for source in pending[1:]:
                if source:
                    source.destroy()
            if error:
                pending[0].cancel()
                future.set_exception(error)
                return False
            future.set_result(value)
        return False

    def _wait(self, start, timeout_ms, closing=False):
        if current_thread() is self._thread:
            raise BusError("busy", "Blocking bus operations are forbidden on the GLib thread")
        future, cancel = Future(), Gio.Cancellable.new()
        timer, dispatch = GLib.timeout_source_new(timeout_ms), GLib.idle_source_new()

        def begin(*_):
            if not future.done():
                try:
                    start(future, cancel)
                except (GLib.Error, TypeError, ValueError) as error:
                    self._active.discard(future)
                    self._finish(future, error=_error(error) if isinstance(error, GLib.Error) else BusError("protocol-error", error))
            return False

        timer.set_callback(lambda *_: self._finish(future, error=BusError("timeout", "Wire deadline expired")))
        dispatch.set_callback(begin)
        with self._lock:
            self._admit(future, (cancel, timer, dispatch), closing)
            timer.attach(self._context)
            dispatch.attach(self._context)
        try:
            return future.result(timeout_ms / 1000 + 0.1)
        except TimeoutError:
            self._finish(future, error=BusError("timeout", "GLib dispatch deadline expired"))
            return future.result()

    def _admit(self, future, entry, closing=False):
        # Callers hold _lock. Async wire work and blocking provider calls share one pending bound.
        if self._closed and not closing:
            raise BusError("cancelled", "Bus is closed")
        if len(self._pending) >= 16:
            raise BusError("busy", "Pending wire operation limit reached")
        self._pending[future] = entry

    def _connect(self, address, future, cancel, session=False):
        def connected(_, result, *__):
            self._active.discard(future)
            try:
                connection = Gio.DBusConnection.new_for_address_finish(result)
            except GLib.Error as error:
                self._finish(future, error=_error(error))
                return
            connection.set_exit_on_close(False)
            if future.done():
                connection.close(None, None, None)
                return
            self._connections.append((connection, connection.add_filter(self._record, None)))
            if not session:
                self._finish(future, connection)
                return
            self._invoke(connection, "org.a11y.Bus", "/org/a11y/bus", "org.a11y.Bus", "GetAddress", "()", (), "(s)", self.timeout_ms,
                         future, cancel, lambda value: self._connect(value[0], future, cancel))

        self._active.add(future)
        Gio.DBusConnection.new_for_address(address, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
                                           None, cancel, connected, None)

    def _invoke(self, connection, owner, path, interface, method, signature, parameters, reply, timeout, future, cancel, then=None):
        def completed(connection, result, *_):
            self._active.discard(future)
            try:
                value = connection.call_finish(result).unpack()
            except GLib.Error as error:
                self._finish(future, error=_error(error))
                return
            if future.done():
                return
            if then:
                then(value)
                return
            self._finish(future, value)

        parameters, reply = _typed(signature, parameters, reply)
        self._active.add(future)
        connection.call(owner, path, interface, method, parameters, reply,
                        Gio.DBusCallFlags.NONE, timeout, cancel, completed, None)

    def call(self, owner, path, interface, method, parameters_signature, parameters, reply_signature, timeout_ms=None):
        if method in ("GetItems", "GetChildren", "GetAll") or interface == "org.a11y.atspi.Collection":
            raise BusError("unsupported-operation", "Bulk/cache/Collection calls are outside this boundary")
        timeout = self._timeout(self.timeout_ms if timeout_ms is None else timeout_ms)
        if not all(isinstance(signature, str) and GLib.VariantType.string_is_valid(signature)
                   and signature.startswith("(") and GLib.VariantType.new(signature).is_definite()
                   for signature in (parameters_signature, reply_signature)):
            raise BusError("protocol-error", "Parameters and reply must have definite tuple signatures")
        if current_thread() is self._thread:
            raise BusError("busy", "Blocking bus operations are forbidden on the GLib thread")
        try:
            parameters, reply = _typed(parameters_signature, parameters, reply_signature)
        except (TypeError, ValueError) as error:
            raise BusError("protocol-error", error) from error
        # Provider calls block only their caller. Skipping the wire-loop hop halves per-call
        # CPU under the helper's CPU quota; close() still cancels them through _pending.
        future, cancel = Future(), Gio.Cancellable.new()
        with self._lock:
            self._admit(future, (cancel, None, None))
        try:
            value = self.connection.call_sync(owner, path, interface, method, parameters, reply,
                                              Gio.DBusCallFlags.NONE, timeout, cancel).unpack()
        except GLib.Error as error:
            if future.done():
                raise future.exception() from None
            raise _error(error) from None
        finally:
            with self._lock:
                self._pending.pop(future, None)
        if future.done():
            raise future.exception()
        return value

    def property(self, owner, path, interface, name):
        return self.call(owner, path, "org.freedesktop.DBus.Properties", "Get", "(ss)", (interface, name), "(v)")[0]

    def owner(self, name):
        return self.call(DBUS, DBUS_PATH, DBUS, "GetNameOwner", "(s)", (name,), "(s)")[0]

    def process_id(self, owner):
        return self.call(DBUS, DBUS_PATH, DBUS, "GetConnectionUnixProcessID", "(s)", (owner,), "(u)")[0]

    def children(self, owner, path, limit):
        if type(limit) is not int or not 0 <= limit <= 512:
            raise BusError("protocol-error", "Child limit must be an integer from 0 to 512")
        owner = owner if owner.startswith(":") else self.owner(owner)
        count = self.property(owner, path, ACCESSIBLE, "ChildCount")
        if count < 0:
            raise BusError("defunct", "Negative ChildCount")
        children = []
        for index in range(min(count, limit)):
            ref = self.call(owner, path, ACCESSIBLE, "GetChildAtIndex", "(i)", (index,), "((so))")[0]
            if ref[1] == "/org/a11y/atspi/null":
                continue
            name = ref[0] or owner
            children.append((name if name.startswith(":") else self.owner(name), ref[1]))
        return children

    def _record(self, connection, message, incoming, *_):
        if not incoming and message.get_message_type() == Gio.DBusMessageType.METHOD_CALL:
            body = message.get_body()
            entry = {"bus": connection.get_unique_name(), "owner": message.get_destination(), "path": message.get_path(),
                     "interface": message.get_interface(), "method": message.get_member(), "signature": body.get_type_string() if body else "()"}
            if entry["method"] in ("GetChildAtIndex", "GetText", "GetName", "DoAction", "Get") and body and body.get_type_string() in ("(i)", "(ii)", "(ss)"):
                entry["parameters"] = tuple(value[:256] if isinstance(value, str) else value for value in body.unpack())
            with self._lock:
                self.trace_total += 1
                self._trace.append(entry)
        return message

    @builtins.property
    def trace(self):
        with self._lock:
            return list(self._trace)

    def subscribe_lifecycle(self, owner, callback):
        owner = self.owner(owner)
        subscriptions = []

        def install(future, _):
            if len(self._subscriptions) >= 48:
                self._finish(future, error=BusError("busy", "Lifecycle subscription limit reached"))
                return

            def event(connection, sender, path, interface, member, parameters, *_):
                # Read fixed prefixes only: Event.xml 2.52 explicitly warns about its suffix schemas.
                if self._closed:
                    return
                if member == "NameOwnerChanged" and parameters.get_child_value(2).unpack() == "":
                    callback("owner-loss", owner, ROOT)
                if member == "RemoveAccessible":
                    ref = parameters.get_child_value(0).unpack()
                    if ref[0] in ("", owner):
                        callback("cache-remove", owner, ref[1])
                if member == "StateChanged" and parameters.n_children() >= 2 and parameters.get_child_value(1).unpack():
                    callback("defunct", owner, path)

            for sender, path, interface, member, arg0 in (
                (DBUS, DBUS_PATH, DBUS, "NameOwnerChanged", owner),
                (owner, "/org/a11y/atspi/cache", "org.a11y.atspi.Cache", "RemoveAccessible", None),
                (owner, None, "org.a11y.atspi.Event.Object", "StateChanged", "defunct"),
            ):
                subscription = self.connection.signal_subscribe(sender, interface, member, path, arg0, Gio.DBusSignalFlags.NONE, event, None)
                self._subscriptions.append(subscription)
                subscriptions.append(subscription)
            self._finish(future)

        self._wait(install, self.timeout_ms)
        status = {"owner-loss": "subscribed", "cache-remove": "subscribed", "defunct": "unconfirmed", "subscriptions": subscriptions}
        try:
            self.call("org.a11y.atspi.Registry", "/org/a11y/atspi/registry", "org.a11y.atspi.Registry", "RegisterEvent",
                      "(sass)", ("object:state-changed:defunct", [], owner), "()")
            status["defunct"] = "registered; delivery requires empirical proof"
        except BusError as error:
            status["defunct"] = error.code
        return status

    def unsubscribe_lifecycle(self, status):
        if status.get("retired"):
            return
        status["retired"] = True

        def remove(*_):
            for subscription in status["subscriptions"]:
                if subscription in self._subscriptions:
                    self.connection.signal_unsubscribe(subscription)
                    self._subscriptions.remove(subscription)
            return False

        # Control admission must not wait behind a provider call on the wire loop.
        # Registry registrations live only until this helper disconnects; their
        # exporter history is capped by BindingStore for the entire helper epoch.
        source = GLib.idle_source_new()
        source.set_callback(remove)
        source.attach(self._context)

    def close(self):
        if current_thread() is self._thread:
            raise BusError("busy", "Close must run outside the GLib thread")
        with self._lock:
            if self._closed:
                return
            self._closed = True
            pending = tuple(self._pending)
        for future in pending:
            self._finish(future, error=BusError("cancelled", "Bus closed; remote mutation outcome may be unknown"))
        drain = GLib.timeout_source_new(5)

        def stop(future, cancel):
            for subscription in self._subscriptions:
                self.connection.signal_unsubscribe(subscription)
            self._subscriptions.clear()
            remaining = set(connection for connection, _ in self._connections)

            def closed(connection, result, *_):
                try:
                    connection.close_finish(result)
                except GLib.Error as error:
                    self._finish(future, error=_error(error))
                remaining.discard(connection)
            for connection in remaining.copy():
                connection.close(cancel, closed, None)

            def drained(*_):
                if future.done():
                    return False
                if not remaining and not self._active:
                    return self._finish(future)
                return True

            drain.set_callback(drained)
            drain.attach(self._context)

        try:
            self._wait(stop, self.timeout_ms, closing=True)
        finally:
            drain.destroy()
            self._loop.quit()
            self._thread.join(self.timeout_ms / 1000 + 0.1)
            if self._thread.is_alive():
                raise BusError("timeout", "GLib thread did not stop")
            for connection, filter_id in self._connections:
                connection.remove_filter(filter_id)
            self._connections.clear()
