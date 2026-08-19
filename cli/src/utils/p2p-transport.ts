/**
 * Berserk P2P Wave 1: Minimal P2P Transport Layer Skeleton
 * TCP + WebSocket multi-protocol peer dialing, connection pooling, peer ID.
 * Targets v1-p2p items 26-28. Working dial/listen primitives.
 */

import { randomUUID } from 'crypto';

export type Protocol = 'tcp' | 'ws';

export interface PeerId {
  id: string;
}

export interface Connection {
  id: string;
  peerId: string;
  protocol: Protocol;
  socket: any;
  connectedAt: number;
}

export class P2PTransport {
  private peerId: PeerId;
  private connections: Map<string, Connection> = new Map();
  private listeners: Map<Protocol, any> = new Map();

  constructor() {
    this.peerId = { id: randomUUID() };
  }

  getPeerId(): PeerId {
    return this.peerId;
  }

  // Connection pooling: reuse existing if available
  private getPooledConnection(peerAddr: string): Connection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.peerId === peerAddr) return conn;
    }
    return undefined;
  }

  // Multi-protocol dial
  async dial(address: string, protocol: Protocol = 'tcp'): Promise<Connection> {
    const pooled = this.getPooledConnection(address);
    if (pooled) return pooled;

    let socket: any;
    if (protocol === 'tcp') {
      // Bun TCP dial using connect
      socket = await Bun.connect({
        hostname: address.split(':')[0],
        port: parseInt(address.split(':')[1] || '8080'),
        socket: {
          data(socket, data) { /* handle */ },
          open(socket) { /* open */ },
          close(socket) { /* close */ },
          error(socket, error) { console.error(error); },
        },
      });
    } else {
      // WebSocket dial
      socket = new WebSocket(`ws://${address}`);
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
      });
    }

    const conn: Connection = {
      id: randomUUID(),
      peerId: address,
      protocol,
      socket,
      connectedAt: Date.now(),
    };
    this.connections.set(conn.id, conn);
    return conn;
  }

  // Listen primitive (start server for TCP or WS)
  async listen(port: number, protocol: Protocol = 'tcp', onConnection?: (conn: Connection) => void): Promise<void> {
    if (protocol === 'tcp') {
      const server = Bun.listen({
        hostname: '0.0.0.0',
        port,
        socket: {
          data(socket, data) {},
          open: (socket) => {
            const conn: Connection = {
              id: randomUUID(),
              peerId: socket.remoteAddress || 'unknown',
              protocol: 'tcp',
              socket,
              connectedAt: Date.now(),
            };
            this.connections.set(conn.id, conn);
            if (onConnection) onConnection(conn);
          },
          close() {},
          error(socket, error) { console.error(error); },
        },
      });
      this.listeners.set(protocol, server);
    } else {
      // Simple WS server via Bun.serve (minimal)
      const server = Bun.serve({
        port,
        fetch(req, server) {
          if (server.upgrade(req)) return;
          return new Response('P2P WS endpoint');
        },
        websocket: {
          open: (ws) => {
            const conn: Connection = {
              id: randomUUID(),
              peerId: 'ws-peer',
              protocol: 'ws',
              socket: ws,
              connectedAt: Date.now(),
            };
            this.connections.set(conn.id, conn);
            if (onConnection) onConnection(conn);
          },
          message(ws, message) {},
          close(ws) {},
        },
      });
      this.listeners.set(protocol, server);
    }
  }

  closeConnection(connId: string) {
    const conn = this.connections.get(connId);
    if (conn) {
      try { conn.socket.close?.(); } catch {}
      this.connections.delete(connId);
    }
  }

  closeAll() {
    for (const [id] of this.connections) this.closeConnection(id);
    for (const [, listener] of this.listeners) {
      try { listener.stop?.(); } catch {}
    }
    this.listeners.clear();
  }
}

// Export working primitives
export const createP2PTransport = () => new P2PTransport();
export default P2PTransport;
