export * as BackendToolkitCassandraDialer from "./cassandra-dialer"

import { createHash } from "crypto"
import { PinnedArtifact } from "../pinned-artifact"

// Command-only overlay for the Apache-2.0 gocqlx v3.0.4 source. The pinned Scylla v1.15.3 Dialer API stays unchanged.
export const BEFORE = "614ecf03874e6ad19f6ba7878998cffc00e9bd85ddd6f3b03cd3d8ced22b15a7"
export const AFTER = "d6c16409427c85c28da69d2f86290ba9874db908ade094334571d150f5e3c50e"

export const HOOK = String.raw`	// Orchestra cassandra2: host-owned Unix routes use the driver's public Dialer API.
	if routes, present := os.LookupEnv("ORCHESTRA_TCP_PROXY_ROUTES"); present {
		dialer, err := newOrchestraGeneratorDialer(routes, cluster.ConnectTimeout)
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
// Orchestra cassandra2: private generator transport; no library or driver API modification.
type orchestraGeneratorDialer struct {
	routes map[string]string
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
		if err != nil || !utf8.Valid(decoded) || strings.ContainsRune(socket, 0) || !path.IsAbs(socket) || path.Clean(socket) != socket || len(decoded) >= 104 {
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
	conn, err := d.dialer.DialContext(ctx, "unix", socket)
	if err != nil {
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
    .replace('\t"bytes"\n', '\t"bytes"\n\t"context"\n\t"encoding/hex"\n')
    .replace('\t"os"\n', '\t"net"\n\t"os"\n')
    .replace('\t"strings"\n', '\t"strconv"\n\t"strings"\n\t"time"\n\t"unicode/utf8"\n')
    .replace('\treturn gocqlx.WrapSession(cluster.CreateSession())\n', `${HOOK}\treturn gocqlx.WrapSession(cluster.CreateSession())\n`) + SOURCE)
  const hash = createHash("sha256").update(patched).digest("hex")
  if (hash !== AFTER)
    throw new PinnedArtifact.Failed({ cause: "compatibility:cassandra-dialer:patched-generator-source-hash-mismatch" })
  return patched
}
