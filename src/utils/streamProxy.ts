import * as http from 'http';
import * as https from 'https';

const ALLOWED_HOSTS = [
  'ngcdn001.cnr.cn',
  'ngcdn002.cnr.cn',
  'cnlive.cnr.cn',
  'satellitepull.cnr.cn',
  'www.cnr.cn',
];

export class StreamProxy {
  private server: http.Server | null = null;
  private port: number = 0;

  async start(): Promise<number> {
    if (this.server) {
      return this.port;
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server port'));
        }
      });
      this.server!.on('error', reject);
    });
  }

  getPort(): number {
    return this.port;
  }

  dispose(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.port = 0;
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    const urlStr = req.url || '/';
    const urlObj = new URL(urlStr, `http://127.0.0.1:${this.port}`);
    const pathParts = urlObj.pathname.replace(/^\//, '').split('/');

    if (pathParts.length < 2) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid proxy path');
      return;
    }

    const hostname = pathParts[0];
    const remotePath = '/' + pathParts.slice(1).join('/') + urlObj.search;

    if (!ALLOWED_HOSTS.includes(hostname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Host not allowed: ' + hostname);
      return;
    }

    this.proxyRequest(hostname, remotePath, res);
  }

  private proxyRequest(hostname: string, remotePath: string, res: http.ServerResponse): void {
    const isHttps = true;
    const lib = https;

    const options: https.RequestOptions = {
      hostname: hostname,
      port: 443,
      path: remotePath,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://www.cnr.cn/',
        'Accept': '*/*',
        'Host': hostname,
      },
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const redirectUrl = proxyRes.headers.location;
        try {
          const parsed = new URL(redirectUrl);
          if (ALLOWED_HOSTS.includes(parsed.hostname)) {
            this.proxyRequest(parsed.hostname, parsed.pathname + parsed.search, res);
          } else {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Redirect to disallowed host');
          }
        } catch {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Invalid redirect URL');
        }
        return;
      }

      const headers: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      };

      const contentType = proxyRes.headers['content-type'];
      if (contentType) {
        headers['Content-Type'] = contentType;
      }

      const contentLength = proxyRes.headers['content-length'];
      if (contentLength) {
        headers['Content-Length'] = contentLength;
      }

      res.writeHead(proxyRes.statusCode || 200, headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy error: ' + err.message);
    });

    proxyReq.setTimeout(15000, () => {
      proxyReq.destroy();
      res.writeHead(504, { 'Content-Type': 'text/plain' });
      res.end('Proxy timeout');
    });

    proxyReq.end();
  }
}
