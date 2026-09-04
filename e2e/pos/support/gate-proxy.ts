import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Kapatılabilir HTTP vekili.
 *
 * POS'un "internet gitti" davranışını gerçekten sınamanın tek dürüst yolu isteğin
 * hedefe VARMAMASI. Kasa uygulamasını doğrudan API'ye değil bu vekile bağlıyoruz;
 * `close()` çağrıldığında bağlantılar reddedilir, `open()` ile geri gelir.
 */
export class GateProxy {
  private server: http.Server | null = null;
  private passing = true;

  constructor(private readonly upstream: string) {}

  get url(): string {
    const address = this.server?.address() as AddressInfo | null;
    if (!address) throw new Error('Vekil başlatılmadı.');
    return `http://127.0.0.1:${String(address.port)}`;
  }

  async start(): Promise<string> {
    this.server = http.createServer((request, response) => {
      if (!this.passing) {
        // Sunucu kapalıymış gibi: bağlantı düşürülür (zaman aşımı beklenmez).
        request.socket.destroy();
        return;
      }
      void this.forward(request, response);
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(0, '127.0.0.1', resolve);
    });
    return this.url;
  }

  private async forward(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value !== 'string') continue;
      if (key === 'host' || key === 'content-length' || key === 'connection') continue;
      headers.set(key, value);
    }

    try {
      const upstreamResponse = await fetch(`${this.upstream}${request.url ?? '/'}`, {
        method: request.method ?? 'GET',
        headers,
        ...(chunks.length > 0 ? { body: Buffer.concat(chunks) } : {}),
      });
      const body = Buffer.from(await upstreamResponse.arrayBuffer());
      response.writeHead(upstreamResponse.status, {
        'content-type': upstreamResponse.headers.get('content-type') ?? 'application/json',
      });
      response.end(body);
    } catch {
      response.writeHead(502).end();
    }
  }

  /** Ağı kes. */
  close(): void {
    this.passing = false;
  }

  /** Ağı geri ver. */
  open(): void {
    this.passing = true;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  }
}
