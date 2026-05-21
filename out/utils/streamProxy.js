"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamProxy = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const ALLOWED_HOSTS = [
    'ngcdn001.cnr.cn',
    'ngcdn002.cnr.cn',
    'cnlive.cnr.cn',
    'satellitepull.cnr.cn',
    'www.cnr.cn',
];
class StreamProxy {
    constructor() {
        this.server = null;
        this.port = 0;
    }
    async start() {
        if (this.server) {
            return this.port;
        }
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });
        return new Promise((resolve, reject) => {
            this.server.listen(0, '127.0.0.1', () => {
                const addr = this.server.address();
                if (addr && typeof addr === 'object') {
                    this.port = addr.port;
                    resolve(this.port);
                }
                else {
                    reject(new Error('Failed to get server port'));
                }
            });
            this.server.on('error', reject);
        });
    }
    getPort() {
        return this.port;
    }
    dispose() {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.port = 0;
        }
    }
    handleRequest(req, res) {
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
    proxyRequest(hostname, remotePath, res) {
        const isHttps = true;
        const lib = https;
        const options = {
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
                    }
                    else {
                        res.writeHead(403, { 'Content-Type': 'text/plain' });
                        res.end('Redirect to disallowed host');
                    }
                }
                catch {
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end('Invalid redirect URL');
                }
                return;
            }
            const headers = {
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
exports.StreamProxy = StreamProxy;
//# sourceMappingURL=streamProxy.js.map