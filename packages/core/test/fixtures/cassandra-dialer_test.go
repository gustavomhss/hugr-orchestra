package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestOrchestraRoutes(t *testing.T) {
	encoded := hex.EncodeToString([]byte("/tmp/orchestra.sock"))
	d, err := newOrchestraGeneratorDialer("9042:"+encoded, time.Second)
	if err != nil || d.routes["9042"] != "/tmp/orchestra.sock" {
		t.Fatalf("valid route: %v", err)
	}
	entries := make([]string, 32)
	for i := range entries {
		entries[i] = fmt.Sprintf("%d:%s", 10000+i, hex.EncodeToString([]byte(fmt.Sprintf("/tmp/o%d.sock", i))))
	}
	if _, err := newOrchestraGeneratorDialer(strings.Join(entries, ";"), time.Second); err != nil {
		t.Fatal("32 valid routes must pass", err)
	}
	for _, text := range []string{
		"", "9042", "9042:", "0:" + encoded, "65536:" + encoded, "+9042:" + encoded, "09042:" + encoded,
		"9042:0", "9042:zz", "9042:ff", "9042:2f746d7000", "9042:" + hex.EncodeToString([]byte("relative.sock")),
		"9042:" + hex.EncodeToString([]byte("/tmp/../other.sock")), "9042:" + hex.EncodeToString([]byte("/"+strings.Repeat("a", 103))),
		"9042:" + encoded + ";", "9042:" + encoded + ";9042:" + encoded, "9042:" + encoded + ";9043:" + encoded,
		strings.Join(append(entries, "20000:"+hex.EncodeToString([]byte("/tmp/overflow.sock"))), ";"),
	} {
		if d, err := newOrchestraGeneratorDialer(text, time.Second); d != nil || err == nil || !strings.Contains(err.Error(), "invalid-routes") {
			t.Fatalf("malformed route %q admitted: %v", text, err)
		}
	}
}

func TestOrchestraDrivePaths(t *testing.T) {
	for socket, windows := range map[string]bool{`C:\o\orchestra.sock`: true, `C:\o\..\orchestra.sock`: false, `C:/o/orchestra.sock`: false, `o\orchestra.sock`: false, `\o\orchestra.sock`: false} {
		d, err := newOrchestraGeneratorDialer("9042:"+hex.EncodeToString([]byte(socket)), time.Second)
		if want := windows && runtime.GOOS == "windows"; (err == nil) != want || (d != nil) != want {
			t.Fatalf("drive path %q admitted=%v, want %v", socket, err == nil, want)
		}
	}
}

func TestOrchestraAddress(t *testing.T) {
	d, err := newOrchestraGeneratorDialer("9042:"+hex.EncodeToString([]byte("/tmp/orchestra.sock")), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if socket, port, err := d.address("tcp", "127.0.0.1:9042"); err != nil || socket != "/tmp/orchestra.sock" || port != 9042 {
		t.Fatalf("declared exact address failed: %v", err)
	}
	for _, addr := range []string{"localhost:9042", "127.0.0.2:9042", "192.168.1.1:9042", "[::1]:9042", "[::ffff:127.0.0.1]:9042", "127.0.0.1", "127.0.0.1:09042", "127.0.0.1:+9042", "127.0.0.1:0"} {
		if _, _, err := d.address("tcp", addr); err == nil || !strings.Contains(err.Error(), "invalid-address") {
			t.Fatalf("wrong endpoint %q admitted: %v", addr, err)
		}
	}
	for _, network := range []string{"tcp4", "tcp6", "unix", "udp", ""} {
		if _, _, err := d.address(network, "127.0.0.1:9042"); err == nil || !strings.Contains(err.Error(), "invalid-address") {
			t.Fatalf("wrong network %q admitted: %v", network, err)
		}
	}
	if _, _, err := d.address("tcp", "127.0.0.1:9043"); err == nil || !strings.Contains(err.Error(), "undeclared-port") {
		t.Fatal("undeclared port admitted", err)
	}
}

func TestOrchestraBroker(t *testing.T) {
	d, err := newOrchestraGeneratorDialer(os.Getenv("ORCHESTRA_TCP_PROXY_ROUTES"), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	addr := os.Getenv("ORCHESTRA_DIALER_TEST_ADDRESS")
	for _, rejected := range []string{os.Getenv("ORCHESTRA_DIALER_TEST_OTHER"), strings.Replace(addr, "127.0.0.1", "192.168.1.1", 1)} {
		conn, err := d.DialContext(context.Background(), "tcp", rejected)
		if conn != nil {
			conn.Close()
		}
		if err == nil || !strings.Contains(err.Error(), "orchestra-cassandra-dialer:") {
			t.Fatalf("wrong endpoint %q reached broker: %v", rejected, err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if conn, err := d.DialContext(ctx, "tcp", addr); conn != nil || !errors.Is(err, context.Canceled) {
		t.Fatal("dial cancellation lost", err)
	}
	conn, err := d.DialContext(context.Background(), "tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	remote, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok || remote.String() != addr || conn.LocalAddr().String() != "127.0.0.1:0" || conn.(*orchestraGeneratorConn).Conn.RemoteAddr().Network() != "unix" {
		t.Fatal("driver address view does not wrap a real Unix conn")
	}
	remote.IP[0] = 42
	remote.Port = 1
	if conn.RemoteAddr().String() != addr {
		t.Fatal("caller mutated frozen remote identity")
	}
	if err := conn.SetDeadline(time.Now().Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	payload := []byte("real Go net.Conn through fixed Node broker")
	if _, err := conn.Write(payload); err != nil {
		t.Fatal(err)
	}
	got := make([]byte, len(payload))
	if _, err := io.ReadFull(conn, got); err != nil || string(got) != string(payload) {
		t.Fatal("real read/write round trip failed", err)
	}
	if err := conn.SetReadDeadline(time.Now().Add(20 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Read(make([]byte, 1)); err == nil {
		t.Fatal("read deadline ignored")
	} else if timeout, ok := err.(net.Error); !ok || !timeout.Timeout() {
		t.Fatal("read deadline changed error", err)
	}
	conn.SetReadDeadline(time.Time{})
	read := make(chan error, 1)
	go func() { _, err := conn.Read(make([]byte, 1)); read <- err }()
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-read:
		if !errors.Is(err, net.ErrClosed) {
			t.Fatal("close did not cancel pending read", err)
		}
	case <-time.After(time.Second):
		t.Fatal("close leaked pending read")
	}
}

// stallServer accepts Unix connections and then neither reads nor writes, so every client call stays blocked.
func stallServer(t *testing.T) (*orchestraGeneratorDialer, chan net.Conn) {
	t.Helper()
	dir, err := os.MkdirTemp("", "ods")
	if err != nil {
		t.Fatal(err)
	}
	socket := dir + "/s"
	listener, err := net.Listen("unix", socket)
	if err != nil {
		os.RemoveAll(dir)
		t.Fatal(err)
	}
	accepted := make(chan net.Conn, 16)
	var held sync.WaitGroup
	held.Add(1)
	go func() {
		defer held.Done()
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			accepted <- conn
		}
	}()
	t.Cleanup(func() {
		listener.Close()
		held.Wait()
		close(accepted)
		for conn := range accepted {
			conn.Close()
		}
		os.RemoveAll(dir)
	})
	d, err := newOrchestraGeneratorDialer("9042:"+hex.EncodeToString([]byte(socket)), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	return d, accepted
}

func stalledPair(t *testing.T) (net.Conn, net.Conn) {
	t.Helper()
	d, accepted := stallServer(t)
	ctx, cancel := context.WithCancel(context.Background())
	conn, err := d.DialContext(ctx, "tcp", "127.0.0.1:9042")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	// The driver cancels its dial context once the connection exists; that must not tear the connection down.
	cancel()
	select {
	case peer := <-accepted:
		return conn, peer
	case <-time.After(2 * time.Second):
		t.Fatal("server never accepted")
		return nil, nil
	}
}

func within(t *testing.T, what string, result chan error) error {
	t.Helper()
	select {
	case err := <-result:
		return err
	case <-time.After(2 * time.Second):
		t.Fatalf("%s did not return promptly", what)
		return nil
	}
}

// Go connections cannot return a context error, so a driver abandons a blocked call by closing or by moving the deadline.
func TestOrchestraInflightReadCancel(t *testing.T) {
	conn, peer := stalledPair(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	read := make(chan error, 1)
	go func() { _, err := conn.Read(make([]byte, 1)); read <- err }()
	select {
	case err := <-read:
		t.Fatal("read returned before cancellation", err)
	case <-time.After(100 * time.Millisecond):
	}
	cancel()
	if err := within(t, "canceled read", read); !errors.Is(err, net.ErrClosed) || !errors.Is(ctx.Err(), context.Canceled) {
		t.Fatal("canceled read did not report a closed conn", err)
	}
	if _, err := conn.Write([]byte("x")); !errors.Is(err, net.ErrClosed) {
		t.Fatal("conn stayed writable after cancellation", err)
	}
	peer.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := peer.Read(make([]byte, 1)); err != io.EOF {
		t.Fatal("peer did not observe the closed Unix socket", err)
	}
}

func TestOrchestraInflightReadDeadlineMove(t *testing.T) {
	conn, _ := stalledPair(t)
	read := make(chan error, 1)
	go func() { _, err := conn.Read(make([]byte, 1)); read <- err }()
	time.Sleep(100 * time.Millisecond)
	if err := conn.SetReadDeadline(time.Unix(1, 0)); err != nil {
		t.Fatal(err)
	}
	if err, ok := within(t, "read after deadline moved", read).(net.Error); !ok || !err.Timeout() {
		t.Fatal("moved deadline did not wake the blocked read with a timeout")
	}
}

// fill writes until the Unix socket buffers are full and the peer's silence blocks the writer.
func fill(conn net.Conn, result chan error) {
	chunk := make([]byte, 64<<10)
	for {
		if _, err := conn.Write(chunk); err != nil {
			result <- err
			return
		}
	}
}

func TestOrchestraInflightWriteDeadline(t *testing.T) {
	conn, _ := stalledPair(t)
	if err := conn.SetWriteDeadline(time.Now().Add(300 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	write := make(chan error, 1)
	go fill(conn, write)
	err := within(t, "write against a silent peer", write)
	if timeout, ok := err.(net.Error); !ok || !timeout.Timeout() || !errors.Is(err, os.ErrDeadlineExceeded) {
		t.Fatal("write deadline did not produce a timeout", err)
	}
	if time.Since(started) < 250*time.Millisecond {
		t.Fatal("write failed before its deadline, so the buffer was never the blocker", err)
	}
}

func TestOrchestraInflightWriteCancel(t *testing.T) {
	conn, _ := stalledPair(t)
	write := make(chan error, 1)
	go fill(conn, write)
	select {
	case err := <-write:
		t.Fatal("write returned without a deadline or cancellation", err)
	case <-time.After(300 * time.Millisecond):
	}
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}
	if err := within(t, "canceled write", write); !errors.Is(err, net.ErrClosed) {
		t.Fatal("close did not cancel the blocked write", err)
	}
}

func TestOrchestraConnect(t *testing.T) {
	d, err := newOrchestraConnectDialer("9042;9043", "http://user%2Bx:token@localhost:3128", time.Second)
	if err != nil || d.proxy != "127.0.0.1:3128" || d.auth != "Proxy-Authorization: Basic dXNlcit4OnRva2Vu\r\n" || len(d.routes) != 2 {
		t.Fatalf("valid connect grant: %v", err)
	}
	if socket, port, err := d.address("tcp", "127.0.0.1:9043"); err != nil || socket != "" || port != 9043 {
		t.Fatalf("declared connect port failed: %v", err)
	}
	if _, _, err := d.address("tcp", "127.0.0.1:9044"); err == nil || !strings.Contains(err.Error(), "undeclared-port") {
		t.Fatal("undeclared connect port admitted", err)
	}
	if d, err := newOrchestraConnectDialer("9042", "http://127.0.0.1:3128/", time.Second); err != nil || d.auth != "" {
		t.Fatalf("anonymous loopback proxy: %v", err)
	}
	for _, text := range []string{"", ";", "9042;", "9042;9042", "0", "65536", "+9042", "09042", "9042:", "x", strings.Repeat("1;", 32) + "1"} {
		if d, err := newOrchestraConnectDialer(text, "http://localhost:3128", time.Second); d != nil || err == nil || !strings.Contains(err.Error(), "invalid-routes") {
			t.Fatalf("malformed ports %q admitted: %v", text, err)
		}
	}
	for _, proxy := range []string{"", "localhost:3128", "https://localhost:3128", "socks5h://localhost:1080", "http://localhost", "http://localhost:0",
		"http://localhost:03128", "http://10.0.0.1:3128", "http://[::1]:3128", "http://proxy.example:3128", "http://localhost:3128/path", "http://localhost:3128?x=1"} {
		if d, err := newOrchestraConnectDialer("9042", proxy, time.Second); d != nil || err == nil || !strings.Contains(err.Error(), "invalid-proxy") {
			t.Fatalf("foreign proxy %q admitted: %v", proxy, err)
		}
	}
}

// A local CONNECT peer stands in for the sandbox proxy; the real srt proxy is exercised by the hosted Linux proof.
func TestOrchestraTunnel(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	requests := make(chan string, 8)
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				header := make([]byte, 0, 256)
				next := make([]byte, 1)
				for !strings.HasSuffix(string(header), "\r\n\r\n") {
					if _, err := io.ReadFull(conn, next); err != nil {
						return
					}
					header = append(header, next[0])
				}
				requests <- string(header)
				switch {
				case strings.HasPrefix(string(header), "CONNECT 127.0.0.1:9042 "):
					io.WriteString(conn, "HTTP/1.1 200 Connection Established\r\n\r\n")
					io.Copy(conn, conn)
				case strings.HasPrefix(string(header), "CONNECT 127.0.0.1:9043 "):
					io.WriteString(conn, "HTTP/1.1 403 Forbidden\r\n\r\n")
				case strings.HasPrefix(string(header), "CONNECT 127.0.0.1:9044 "):
					io.WriteString(conn, "SSH-2.0-not-a-proxy\r\n\r\n")
				}
			}()
		}
	}()
	proxy := "http://user:token@localhost:" + strings.Split(listener.Addr().String(), ":")[1]
	d, err := newOrchestraConnectDialer("9042;9043;9044", proxy, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	conn, err := d.DialContext(context.Background(), "tcp", "127.0.0.1:9042")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if request := <-requests; request != "CONNECT 127.0.0.1:9042 HTTP/1.1\r\nHost: 127.0.0.1:9042\r\nProxy-Authorization: Basic dXNlcjp0b2tlbg==\r\n\r\n" {
		t.Fatalf("unexpected CONNECT request %q", request)
	}
	if conn.RemoteAddr().String() != "127.0.0.1:9042" || conn.LocalAddr().String() != "127.0.0.1:0" || conn.(*orchestraGeneratorConn).Conn.RemoteAddr().Network() != "tcp" {
		t.Fatal("driver address view does not wrap the tunnel")
	}
	payload := []byte("bytes after the CONNECT response")
	if _, err := conn.Write(payload); err != nil {
		t.Fatal(err)
	}
	got := make([]byte, len(payload))
	if _, err := io.ReadFull(conn, got); err != nil || string(got) != string(payload) {
		t.Fatal("tunnel round trip failed", err)
	}
	for addr, reason := range map[string]string{"127.0.0.1:9043": "proxy-refused:403", "127.0.0.1:9044": "proxy-invalid-response"} {
		conn, err := d.DialContext(context.Background(), "tcp", addr)
		if conn != nil || err == nil || !strings.Contains(err.Error(), "orchestra-cassandra-dialer:"+reason) {
			t.Fatalf("%s: expected %s, got %v", addr, reason, err)
		}
		<-requests
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if conn, err := d.DialContext(ctx, "tcp", "127.0.0.1:9042"); conn != nil || !errors.Is(err, context.Canceled) {
		t.Fatal("dial cancellation lost", err)
	}
}
