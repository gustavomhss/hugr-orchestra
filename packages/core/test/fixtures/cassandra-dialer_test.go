package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
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
