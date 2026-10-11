//go:build linux

package main

import (
	"context"
	"encoding/hex"
	"errors"
	"net"
	"os"
	"syscall"
	"testing"
	"time"
)

// A Unix listener with backlog 0 and one unaccepted client refuses further connects; Linux reports that as EAGAIN.
func TestOrchestraDialFullBacklog(t *testing.T) {
	dir, err := os.MkdirTemp("", "odb")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	socket := dir + "/s"
	fd, err := syscall.Socket(syscall.AF_UNIX, syscall.SOCK_STREAM|syscall.SOCK_CLOEXEC, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.Close(fd)
	if err := syscall.Bind(fd, &syscall.SockaddrUnix{Name: socket}); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Listen(fd, 0); err != nil {
		t.Fatal(err)
	}
	d, err := newOrchestraGeneratorDialer("9042:"+hex.EncodeToString([]byte(socket)), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	var queued []net.Conn
	defer func() {
		for _, conn := range queued {
			conn.Close()
		}
	}()
	// Nobody accepts, so the backlog fills; the first refused dial proves it is full.
	var refused error
	for i := 0; i < 64 && refused == nil; i++ {
		conn, err := d.DialContext(context.Background(), "tcp", "127.0.0.1:9042")
		if err != nil {
			refused = err
			break
		}
		queued = append(queued, conn)
	}
	if refused == nil {
		t.Skip("kernel never filled the Unix backlog")
	}
	fds := func() int {
		entries, err := os.ReadDir("/proc/self/fd")
		if err != nil {
			t.Fatal(err)
		}
		return len(entries)
	}
	before := fds()
	for i := 0; i < 20; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		started := time.Now()
		conn, err := d.DialContext(ctx, "tcp", "127.0.0.1:9042")
		if conn != nil {
			conn.Close()
			t.Fatal("dial succeeded against a full backlog")
		}
		if err == nil || time.Since(started) > time.Second {
			t.Fatalf("dial against a full backlog was not refused promptly: %v after %v", err, time.Since(started))
		}
		cancel()
	}
	// A canceled context still wins over the refusal.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if conn, err := d.DialContext(ctx, "tcp", "127.0.0.1:9042"); conn != nil || !errors.Is(err, context.Canceled) {
		t.Fatal("canceled dial against a full backlog lost its cause", err)
	}
	if after := fds(); after > before {
		t.Fatalf("failed dials leaked descriptors: %d before, %d after", before, after)
	}
}
