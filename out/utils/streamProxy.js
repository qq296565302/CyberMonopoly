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
const HTTP_HOSTS = [
    'satellitepull.cnr.cn',
];
const ALLOWED_HOSTS = [
    'ngcdn001.cnr.cn',
    'ngcdn002.cnr.cn',
    'cnlive.cnr.cn',
    'satellitepull.cnr.cn',
    'www.cnr.cn',
];
// 央广CDN的IP地址段（用于环球资讯等广播）
const ALLOWED_IPS = [
    '27.222.17.232',
    '27.222.17.233',
    '27.222.17.234',
    '27.222.17.235',
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
        // 检查是否是允许的主机或IP
        const isAllowedHost = ALLOWED_HOSTS.includes(hostname);
        const isAllowedIp = ALLOWED_IPS.includes(hostname);
        if (!isAllowedHost && !isAllowedIp) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Host not allowed: ' + hostname);
            return;
        }
        // IP地址使用HTTP，域名根据HTTP_HOSTS判断
        const useHttps = isAllowedHost ? !HTTP_HOSTS.includes(hostname) : false;
        this.proxyRequest(hostname, remotePath, res, useHttps);
    }
    proxyRequest(hostname, remotePath, res, useHttps = true) {
        const lib = useHttps ? https : http;
        const options = {
            hostname: hostname,
            port: useHttps ? 443 : 80,
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
                    // 检查重定向目标是否是允许的主机或IP
                    const isAllowedRedirectHost = ALLOWED_HOSTS.includes(parsed.hostname);
                    const isAllowedRedirectIp = ALLOWED_IPS.includes(parsed.hostname);
                    if (isAllowedRedirectHost || isAllowedRedirectIp) {
                        const useHttps = isAllowedRedirectHost ? parsed.protocol === 'https:' : false;
                        this.proxyRequest(parsed.hostname, parsed.pathname + parsed.search, res, useHttps);
                    }
                    else {
                        res.writeHead(403, { 'Content-Type': 'text/plain' });
                        res.end('Redirect to disallowed host: ' + parsed.hostname);
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