export * as BackendToolkitCassandraDialer from "./cassandra-dialer"

import { createHash } from "crypto"
import { PinnedArtifact } from "../pinned-artifact"

// Command-only overlay for the Apache-2.0 gocqlx v3.0.4 source. The pinned Scylla v1.15.3 Dialer API stays unchanged.
export const BEFORE = "614ecf03874e6ad19f6ba7878998cffc00e9bd85ddd6f3b03cd3d8ced22b15a7"
export const AFTER = "a60679b063cac909587c6d84c0cc6524e113f995fdb61684aca70f24df201fde"

// Darwin and Windows hand over fixed-target Unix broker routes; Linux hands over the granted ports, reached through the
// srt sandbox's own strict-allowlist HTTP CONNECT proxy. Exactly one mode may be present.
export const HOOK = String.raw`	// Orchestra cassandra4: host-owned exact routes use the driver's public Dialer API.
	routes, unix := os.LookupEnv("ORCHESTRA_TCP_PROXY_ROUTES")
	ports, connect := os.LookupEnv("ORCHESTRA_TCP_PROXY_CONNECT")
	if unix || connect {
		var dialer *orchestraGeneratorDialer
		err := fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
		switch {
		case unix && !connect:
			dialer, err = newOrchestraGeneratorDialer(routes, cluster.ConnectTimeout)
		case connect && !unix:
			dialer, err = newOrchestraConnectDialer(ports, os.Getenv("HTTP_PROXY"), cluster.ConnectTimeout)
		}
		if err != nil {
			return gocqlx.Session{}, err
		}
		for _, addr := range clusterHosts() {
			if _, _, err := dialer.address("tcp", addr); err != nil {
				return gocqlx.Session{}, err
			}
		}
		cluster.Dialer = dialer
		cluster.WriteCoalesceWaitTime = 0
	}

`

export const SOURCE = String.raw`
// Orchestra cassandra4: private generator transport; no library or driver API modification.
type orchestraGeneratorDialer struct {
	routes map[string]string
	proxy  string
	auth   string
	dialer net.Dialer
}

var _ gocql.Dialer = (*orchestraGeneratorDialer)(nil)

func newOrchestraGeneratorDialer(text string, timeout time.Duration) (*orchestraGeneratorDialer, error) {
	entries := strings.Split(text, ";")
	if len(text) == 0 || len(text) > 32*213 || len(entries) > 32 {
		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
	}
	routes := make(map[string]string, len(entries))
	paths := make(map[string]bool, len(entries))
	for _, entry := range entries {
		port, encoded, ok := strings.Cut(entry, ":")
		n, err := strconv.Atoi(port)
		if !ok || err != nil || n < 1 || n > 65535 || strconv.Itoa(n) != port || len(encoded) == 0 || len(encoded) > 206 {
			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
		}
		decoded, err := hex.DecodeString(encoded)
		socket := string(decoded)
		if err != nil || !utf8.Valid(decoded) || strings.ContainsRune(socket, 0) || !orchestraAbsolute(socket) || len(decoded) >= 104 {
			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
		}
		if _, duplicate := routes[port]; duplicate || paths[socket] {
			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
		}
		routes[port] = socket
		paths[socket] = true
	}
	return &orchestraGeneratorDialer{routes: routes, dialer: net.Dialer{Timeout: timeout}}, nil
}

// Darwin routes are slash paths; Windows broker routes are drive-qualified (a drive-less path would resolve against
// the dialer's current drive, not the broker's).
func orchestraAbsolute(socket string) bool {
	if runtime.GOOS == "windows" && filepath.IsAbs(socket) && filepath.Clean(socket) == socket {
		return true
	}
	return path.IsAbs(socket) && path.Clean(socket) == socket
}

// The proxy is the sandbox's own loopback listener; its strict allowlist, not this parser, enforces the grant.
func newOrchestraConnectDialer(text, proxy string, timeout time.Duration) (*orchestraGeneratorDialer, error) {
	entries := strings.Split(text, ";")
	if len(text) == 0 || len(text) > 32*6 || len(entries) > 32 {
		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
	}
	routes := make(map[string]string, len(entries))
	for _, port := range entries {
		n, err := strconv.Atoi(port)
		if _, duplicate := routes[port]; err != nil || n < 1 || n > 65535 || strconv.Itoa(n) != port || duplicate {
			return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-routes")
		}
		routes[port] = ""
	}
	parsed, err := url.Parse(proxy)
	if err != nil || parsed.Scheme != "http" || parsed.Opaque != "" || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" ||
		(parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1") {
		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-proxy")
	}
	n, err := strconv.Atoi(parsed.Port())
	if err != nil || n < 1 || n > 65535 || strconv.Itoa(n) != parsed.Port() {
		return nil, fmt.Errorf("orchestra-cassandra-dialer:invalid-proxy")
	}
	auth := ""
	if parsed.User != nil {
		password, _ := parsed.User.Password()
		auth = "Proxy-Authorization: Basic " + base64.StdEncoding.EncodeToString([]byte(parsed.User.Username()+":"+password)) + "\r\n"
	}
	return &orchestraGeneratorDialer{routes: routes, proxy: "127.0.0.1:" + parsed.Port(), auth: auth, dialer: net.Dialer{Timeout: timeout}}, nil
}

func (d *orchestraGeneratorDialer) address(network, addr string) (string, int, error) {
	host, port, err := net.SplitHostPort(addr)
	n, numberErr := strconv.Atoi(port)
	if network != "tcp" || err != nil || host != "127.0.0.1" || numberErr != nil || n < 1 || n > 65535 || strconv.Itoa(n) != port {
		return "", 0, fmt.Errorf("orchestra-cassandra-dialer:invalid-address")
	}
	socket, declared := d.routes[port]
	if !declared {
		return "", 0, fmt.Errorf("orchestra-cassandra-dialer:undeclared-port")
	}
	return socket, n, nil
}

func (d *orchestraGeneratorDialer) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	socket, port, err := d.address(network, addr)
	if err != nil {
		return nil, err
	}
	if d.proxy != "" {
		return d.tunnel(ctx, port)
	}
	conn, err := d.dialer.DialContext(ctx, "unix", socket)
	if err != nil {
		return nil, err
	}
	return &orchestraGeneratorConn{Conn: conn, port: port}, nil
}

// One CONNECT per driver connection. Headers are read byte by byte so no tunneled byte is buffered here.
func (d *orchestraGeneratorDialer) tunnel(ctx context.Context, port int) (net.Conn, error) {
	conn, err := d.dialer.DialContext(ctx, "tcp", d.proxy)
	if err != nil {
		return nil, err
	}
	deadline, bounded := ctx.Deadline()
	if !bounded && d.dialer.Timeout > 0 {
		deadline = time.Now().Add(d.dialer.Timeout)
	}
	conn.SetDeadline(deadline)
	stop := context.AfterFunc(ctx, func() { conn.SetDeadline(time.Unix(1, 0)) })
	target := "127.0.0.1:" + strconv.Itoa(port)
	_, err = io.WriteString(conn, "CONNECT "+target+" HTTP/1.1\r\nHost: "+target+"\r\n"+d.auth+"\r\n")
	header := make([]byte, 0, 512)
	next := make([]byte, 1)
	for err == nil && !bytes.HasSuffix(header, []byte("\r\n\r\n")) && len(header) < 8192 {
		_, err = io.ReadFull(conn, next)
		header = append(header, next[0])
	}
	if !stop() && ctx.Err() != nil {
		err = ctx.Err()
	}
	status := ""
	if fields := strings.Fields(strings.SplitN(string(header), "\r\n", 2)[0]); len(fields) >= 2 && bytes.HasSuffix(header, []byte("\r\n\r\n")) &&
		(fields[0] == "HTTP/1.1" || fields[0] == "HTTP/1.0") {
		status = fields[1]
	}
	if err == nil && status == "" {
		err = fmt.Errorf("orchestra-cassandra-dialer:proxy-invalid-response")
	}
	if code, _ := strconv.Atoi(status); err == nil && status != "200" {
		err = fmt.Errorf("orchestra-cassandra-dialer:proxy-refused:%d", code)
	}
	if err == nil {
		err = conn.SetDeadline(time.Time{})
	}
	if err != nil {
		conn.Close()
		return nil, err
	}
	return &orchestraGeneratorConn{Conn: conn, port: port}, nil
}

type orchestraGeneratorConn struct {
	net.Conn
	port int
}

func (c *orchestraGeneratorConn) RemoteAddr() net.Addr {
	return &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: c.port}
}

func (c *orchestraGeneratorConn) LocalAddr() net.Addr {
	return &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: 0}
}
`

export function patch(source: Uint8Array) {
  if (createHash("sha256").update(source).digest("hex") !== BEFORE)
    throw new PinnedArtifact.Failed({ cause: "compatibility:cassandra-dialer:generator-source-hash-mismatch" })
  const patched = Buffer.from(Buffer.from(source).toString("utf8")
    .replace('\t"bytes"\n', '\t"bytes"\n\t"context"\n\t"encoding/base64"\n\t"encoding/hex"\n')
    .replace('\t"io/fs"\n', '\t"io"\n\t"io/fs"\n')
    .replace('\t"os"\n', '\t"net"\n\t"net/url"\n\t"os"\n')
    .replace('\t"path"\n', '\t"path"\n\t"path/filepath"\n')
    .replace('\t"regexp"\n', '\t"regexp"\n\t"runtime"\n')
    .replace('\t"strings"\n', '\t"strconv"\n\t"strings"\n\t"time"\n\t"unicode/utf8"\n')
    .replace('\treturn gocqlx.WrapSession(cluster.CreateSession())\n', `${HOOK}\treturn gocqlx.WrapSession(cluster.CreateSession())\n`) + SOURCE)
  const hash = createHash("sha256").update(patched).digest("hex")
  if (hash !== AFTER)
    throw new PinnedArtifact.Failed({ cause: "compatibility:cassandra-dialer:patched-generator-source-hash-mismatch" })
  return patched
}
