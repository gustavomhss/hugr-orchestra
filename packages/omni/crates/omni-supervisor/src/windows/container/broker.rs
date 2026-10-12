//! The exact-endpoint broker: one AF_UNIX listener per granted port, in a folder only the profile may open, each
//! connected to the fixed upstream `127.0.0.1:<port>`. The destination never comes from client bytes. It runs in
//! this (unconfined) launcher and ends with it.

use std::io::{self, Read, Write};
use std::net::{Shutdown, TcpStream};
use std::os::windows::io::FromRawSocket;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use windows_sys::Win32::Networking::WinSock::{
    AF_UNIX, INVALID_SOCKET, SOCK_STREAM, SOCKADDR, SOCKADDR_UN, SOCKET, WSA_FLAG_NO_HANDLE_INHERIT,
    WSA_FLAG_OVERLAPPED, WSADATA, WSASocketW, WSAStartup, accept, bind, closesocket, listen,
};

/// Simultaneous connections per route; more are closed at accept.
const MAX_ACTIVE: usize = 64;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// One granted port and the socket the profile reaches it through.
#[derive(Debug)]
pub(super) struct Route {
    pub(super) port: u16,
    pub(super) socket: PathBuf,
}

/// Binds every route before returning, so the confined child never races a missing listener.
pub(super) fn start(routes: &[Route]) -> io::Result<()> {
    let mut data = WSADATA::default();
    // SAFETY: version 2.2 and an out structure.
    let error = unsafe { WSAStartup(0x0202, &mut data) };
    if error != 0 {
        return Err(io::Error::from_raw_os_error(error));
    }
    let listeners = routes
        .iter()
        .map(|route| Ok((listener(route)?, route.port)))
        .collect::<io::Result<Vec<_>>>()?;
    for (socket, port) in listeners {
        std::thread::Builder::new()
            .name("broker".into())
            .spawn(move || serve(socket, port))?;
    }
    Ok(())
}

fn listener(route: &Route) -> io::Result<SOCKET> {
    let path = route.socket.to_string_lossy();
    let mut address = SOCKADDR_UN {
        sun_family: AF_UNIX,
        sun_path: [0; 108],
    };
    if path.len() >= address.sun_path.len() || path.contains('\0') {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "socket path too long"));
    }
    for (slot, byte) in address.sun_path.iter_mut().zip(path.bytes()) {
        *slot = byte as i8;
    }
    // Not inheritable: the confined child gets only its standard handles. Overlapped, like std's sockets: on a
    // synchronous socket a blocked recv holds every other call on it, so the reverse direction's send would wait.
    // SAFETY: plain socket creation; the result is checked.
    let socket = unsafe {
        WSASocketW(
            i32::from(AF_UNIX),
            SOCK_STREAM,
            0,
            std::ptr::null(),
            0,
            WSA_FLAG_NO_HANDLE_INHERIT | WSA_FLAG_OVERLAPPED,
        )
    };
    if socket == INVALID_SOCKET {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: a fresh socket and a SOCKADDR_UN of its exact size.
    let bound = unsafe {
        bind(
            socket,
            (&raw const address).cast::<SOCKADDR>(),
            size_of::<SOCKADDR_UN>() as i32,
        )
    };
    // SAFETY: a bound socket.
    if bound != 0 || unsafe { listen(socket, 64) } != 0 {
        let error = io::Error::last_os_error();
        // SAFETY: our socket, closed once.
        unsafe { closesocket(socket) };
        return Err(error);
    }
    Ok(socket)
}

fn serve(listener: SOCKET, port: u16) {
    let active = Arc::new(AtomicUsize::new(0));
    loop {
        // SAFETY: a listening socket; the peer address is not wanted.
        let client = unsafe { accept(listener, std::ptr::null_mut(), std::ptr::null_mut()) };
        if client == INVALID_SOCKET {
            report(port, &io::Error::last_os_error());
            return;
        }
        // SAFETY: a fresh connected stream socket owned by nobody else; TcpStream only sends, receives and shuts down.
        let client = unsafe { TcpStream::from_raw_socket(client as u64) };
        if active.fetch_add(1, Ordering::SeqCst) >= MAX_ACTIVE {
            active.fetch_sub(1, Ordering::SeqCst);
            continue;
        }
        let active = active.clone();
        let _ = std::thread::Builder::new().name("broker-pair".into()).spawn(move || {
            if let Err(e) = pair(client, port) {
                report(port, &e);
            }
            active.fetch_sub(1, Ordering::SeqCst);
        });
    }
}

/// Pipes both ways until both directions end; each end's EOF is passed on as a half-close. The sockets are shared,
/// never duplicated: `WSADuplicateSocketW` is not promised for AF_UNIX.
fn pair(client: TcpStream, port: u16) -> io::Result<()> {
    let upstream = Arc::new(TcpStream::connect_timeout(
        &([127, 0, 0, 1], port).into(),
        CONNECT_TIMEOUT,
    )?);
    let client = Arc::new(client);
    let (from, to) = (client.clone(), upstream.clone());
    let forward = std::thread::Builder::new()
        .name("broker-up".into())
        .spawn(move || copy(&from, &to))?;
    copy(&upstream, &client);
    let _ = forward.join();
    Ok(())
}

fn copy(mut from: &TcpStream, mut to: &TcpStream) {
    let mut buffer = [0u8; 16 * 1024];
    loop {
        match from.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) if to.write_all(&buffer[..n]).is_ok() => {}
            _ => {
                let _ = from.shutdown(Shutdown::Both);
                let _ = to.shutdown(Shutdown::Both);
                return;
            }
        }
    }
    let _ = to.shutdown(Shutdown::Write);
}

/// One line on the launcher's stderr, which is the confined command's stderr.
fn report(port: u16, error: &io::Error) {
    let _ = writeln!(
        io::stderr().lock(),
        "hugr-omni-supervisor: appcontainer: broker {port}: {error}"
    );
}
