package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"time"
)

func main() {
	c, err := net.DialTimeout("tcp4", os.Args[1], time.Second)
	if err != nil {
		fmt.Println("DIAL", err)
		os.Exit(2)
	}
	defer c.Close()
	remote, ok := c.RemoteAddr().(*net.TCPAddr)
	if !ok || remote == nil || remote.IP.String() != "127.0.0.1" {
		panic("missing remote TCP address")
	}
	local, ok := c.LocalAddr().(*net.TCPAddr)
	if !ok || local == nil || local.IP.String() != "127.0.0.1" {
		panic("missing local TCP address")
	}
	fmt.Printf("REMOTE %s LOCAL %s\n", remote, local)
	if err := c.SetDeadline(time.Now().Add(time.Second)); err != nil {
		panic(err)
	}
	if _, err := c.Write([]byte("owned-echo")); err != nil {
		panic(err)
	}
	b := make([]byte, 10)
	if _, err := io.ReadFull(c, b); err != nil {
		panic(err)
	}
	if string(b) != "owned-echo" {
		panic("wrong echo")
	}
	fmt.Printf("ECHO %s\n", b)
}
