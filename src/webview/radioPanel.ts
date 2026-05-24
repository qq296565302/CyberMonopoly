import * as vscode from 'vscode';
import * as path from 'path';
import { getNonce, buildCspContent } from '../utils/nonce';

interface RadioStation {
  name: string;
  url: string;
  freq: string;
  desc: string;
}

const RADIO_STATIONS: RadioStation[] = [
  {
    name: '经济之声',
    url: 'https://ngcdn002.cnr.cn/live/jjzs/index.m3u8',
    freq: 'FM96.6',
    desc: '唯一覆盖全国的财经专业广播，交易日9:15-16:00《交易实况》',
  },
  {
    name: '中国之声',
    url: 'https://ngcdn001.cnr.cn/live/zgzs/index.m3u8',
    freq: 'FM106.1',
    desc: '中央人民广播电台第一套新闻综合广播',
  },
  {
    name: '环球资讯广播',
    url: 'http://satellitepull.cnr.cn/live/wxhqzx01/playlist.m3u8',
    freq: 'FM90.5',
    desc: '环球资讯，轻松掌握天下事',
  },
];

export class RadioPanel {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext | undefined;
  private proxyPort: number = 0;
  private currentStation: number = 0;
  private isPlaying: boolean = false;
  private volume: number = 80;

  setContext(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  setProxyPort(port: number): void {
    this.proxyPort = port;
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cyberMonopolyRadio',
      '📻 电台',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.context
          ? [vscode.Uri.file(path.join(this.context.extensionPath, 'assets'))]
          : [],
      }
    );

    this.panel.iconPath = vscode.Uri.parse('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text y="14" font-size="14">📻</text></svg>');

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    this.panel.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'play':
          this.isPlaying = true;
          break;
        case 'pause':
          this.isPlaying = false;
          break;
        case 'station':
          this.currentStation = msg.index;
          break;
        case 'volume':
          this.volume = msg.value;
          break;
      }
    });
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const nonce = getNonce();
    const hlsScriptUri = this.context
      ? webview.asWebviewUri(
          vscode.Uri.file(path.join(this.context.extensionPath, 'assets', 'hls.min.js'))
        )
      : '';

    const stationsJson = JSON.stringify(RADIO_STATIONS);
    const initStation = this.currentStation;
    const initVolume = this.volume;
    const proxyPort = this.proxyPort;

    return /*html*/ `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${buildCspContent(nonce, webview.cspSource)}; media-src http://127.0.0.1:${proxyPort} blob:; connect-src http://127.0.0.1:${proxyPort};">
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-foreground); }
    body { display: flex; flex-direction: column; align-items: center; padding: 24px 16px; overflow-y: auto; }

    .now-playing {
      text-align: center; margin-bottom: 28px; width: 100%;
    }
    .now-playing .station-name {
      font-size: 22px; font-weight: 600; margin-bottom: 4px;
    }
    .now-playing .station-freq {
      font-size: 13px; color: var(--vscode-descriptionForeground); margin-bottom: 6px;
    }
    .now-playing .station-desc {
      font-size: 12px; color: var(--vscode-descriptionForeground); max-width: 360px; margin: 0 auto;
    }

    .visualizer {
      width: 180px; height: 180px; border-radius: 50%;
      background: var(--vscode-editor-background);
      border: 3px solid var(--vscode-panel-border);
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 20px; position: relative;
      transition: border-color 0.3s, box-shadow 0.3s;
    }
    .visualizer.playing {
      border-color: #3b82f6;
      box-shadow: 0 0 24px rgba(59,130,246,0.25);
      animation: pulse 2s ease-in-out infinite;
    }
    .visualizer .icon {
      font-size: 56px; opacity: 0.7;
    }
    .visualizer.playing .icon {
      opacity: 1;
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 24px rgba(59,130,246,0.25); }
      50% { box-shadow: 0 0 40px rgba(59,130,246,0.4); }
    }

    .controls {
      display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
    }
    .btn-play {
      width: 52px; height: 52px; border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; cursor: pointer; font-size: 22px;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, transform 0.1s;
    }
    .btn-play:hover { background: var(--vscode-button-hoverBackground); }
    .btn-play:active { transform: scale(0.95); }
    .btn-play.playing { background: #ef4444; }

    .volume-wrap {
      display: flex; align-items: center; gap: 6px;
    }
    .volume-wrap .vol-icon { font-size: 14px; opacity: 0.7; }
    .volume-slider {
      -webkit-appearance: none; width: 100px; height: 4px;
      background: var(--vscode-panel-border); border-radius: 2px; outline: none;
    }
    .volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none; width: 14px; height: 14px;
      background: var(--vscode-button-background); border-radius: 50%; cursor: pointer;
    }

    .status {
      font-size: 12px; color: var(--vscode-descriptionForeground);
      margin-bottom: 24px; min-height: 18px;
    }
    .status.error { color: #ef4444; }

    .station-list {
      width: 100%; max-width: 400px;
    }
    .station-list .list-title {
      font-size: 13px; font-weight: 600; color: var(--vscode-descriptionForeground);
      margin-bottom: 8px; padding-left: 4px;
    }
    .station-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 6px; cursor: pointer;
      transition: background 0.15s; margin-bottom: 4px;
      border: 1px solid transparent;
    }
    .station-item:hover { background: var(--vscode-list-hoverBackground); }
    .station-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }
    .station-item .s-icon { font-size: 20px; flex-shrink: 0; }
    .station-item .s-info { flex: 1; min-width: 0; }
    .station-item .s-name { font-size: 14px; font-weight: 500; }
    .station-item .s-meta { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .station-item .s-freq {
      font-size: 11px; color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
      padding: 1px 6px; border-radius: 3px; flex-shrink: 0;
    }

    .footer {
      margin-top: auto; padding-top: 20px;
      font-size: 11px; color: var(--vscode-descriptionForeground);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="now-playing">
    <div class="station-name" id="station-name">经济之声</div>
    <div class="station-freq" id="station-freq">FM96.6</div>
    <div class="station-desc" id="station-desc">唯一覆盖全国的财经专业广播，交易日9:15-16:00《交易实况》</div>
  </div>

  <div class="visualizer" id="visualizer">
    <span class="icon">📻</span>
  </div>

  <div class="controls">
    <div class="volume-wrap">
      <span class="vol-icon">🔈</span>
      <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="${initVolume}">
    </div>
    <button class="btn-play" id="btn-play" title="播放/暂停">▶</button>
  </div>

  <div class="status" id="status">点击播放按钮开始收听</div>

  <div class="station-list">
    <div class="list-title">电台列表</div>
    <div id="station-list-container"></div>
  </div>

  <div class="footer">直播源来自央广 CDN · 仅供个人学习使用</div>

  <audio id="audio" style="display:none;"></audio>
  <script src="${hlsScriptUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const stations = ${stationsJson};
    const proxyPort = ${proxyPort};
    let currentIndex = ${initStation};
    let hls = null;
    const audio = document.getElementById('audio');
    const btnPlay = document.getElementById('btn-play');
    const visualizer = document.getElementById('visualizer');
    const statusEl = document.getElementById('status');
    const volumeSlider = document.getElementById('volume-slider');
    const stationNameEl = document.getElementById('station-name');
    const stationFreqEl = document.getElementById('station-freq');
    const stationDescEl = document.getElementById('station-desc');

    audio.volume = ${initVolume} / 100;

    function proxyUrl(originalUrl) {
      try {
        var u = new URL(originalUrl);
        // 如果已经是代理URL，直接返回
        if (u.hostname === '127.0.0.1' && u.port === String(proxyPort)) {
          return originalUrl;
        }
        // 检查是否是允许的主机或IP
        var allowedHosts = ['ngcdn001.cnr.cn', 'ngcdn002.cnr.cn', 'cnlive.cnr.cn', 'satellitepull.cnr.cn', 'www.cnr.cn'];
        var allowedIps = ['27.222.17.232', '27.222.17.233', '27.222.17.234', '27.222.17.235'];
        if (allowedHosts.indexOf(u.hostname) >= 0 || allowedIps.indexOf(u.hostname) >= 0) {
          return 'http://127.0.0.1:' + proxyPort + '/' + u.hostname + u.pathname + u.search;
        }
        return originalUrl;
      } catch(e) {
        return originalUrl;
      }
    }

    function renderStationList() {
      const container = document.getElementById('station-list-container');
      container.innerHTML = stations.map(function(s, i) {
        return '<div class="station-item' + (i === currentIndex ? ' active' : '') + '" data-index="' + i + '">' +
          '<span class="s-icon">📻</span>' +
          '<div class="s-info">' +
            '<div class="s-name">' + s.name + '</div>' +
            '<div class="s-meta">' + s.desc + '</div>' +
          '</div>' +
          '<span class="s-freq">' + s.freq + '</span>' +
        '</div>';
      }).join('');

      container.querySelectorAll('.station-item').forEach(function(el) {
        el.addEventListener('click', function() {
          var idx = parseInt(el.getAttribute('data-index'));
          if (idx !== currentIndex) {
            currentIndex = idx;
            updateStationInfo();
            renderStationList();
            startPlay();
          }
        });
      });
    }

    function updateStationInfo() {
      var s = stations[currentIndex];
      stationNameEl.textContent = s.name;
      stationFreqEl.textContent = s.freq;
      stationDescEl.textContent = s.desc;
    }

    function startPlay() {
      var originalUrl = stations[currentIndex].url;
      var url = proxyUrl(originalUrl);
      statusEl.textContent = '正在连接...';
      statusEl.className = 'status';

      if (hls) {
        hls.destroy();
        hls = null;
      }
      audio.pause();
      audio.removeAttribute('src');
      audio.load();

      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 10,
          maxMaxBufferLength: 30,
          xhrSetup: function(xhr, reqUrl) {
            // 拦截所有请求，将IP地址的URL转换为代理URL
            var proxiedUrl = proxyUrl(reqUrl);
            if (proxiedUrl !== reqUrl) {
              xhr.open('GET', proxiedUrl, true);
            }
          },
        });
        hls.loadSource(url);
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          audio.play().then(function() {
            setPlayingUI(true);
            statusEl.textContent = '正在播放';
            statusEl.className = 'status';
            vscode.postMessage({ type: 'play' });
            vscode.postMessage({ type: 'station', index: currentIndex });
          }).catch(function(e) {
            statusEl.textContent = '播放失败: ' + e.message;
            statusEl.className = 'status error';
            setPlayingUI(false);
          });
        });
        hls.on(Hls.Events.ERROR, function(event, data) {
          if (data.fatal) {
            var errMsg = '连接失败';
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              errMsg = '网络错误，请检查连接';
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              errMsg = '媒体解码错误';
            }
            statusEl.textContent = errMsg + ' (详情: ' + (data.details || 'unknown') + ')';
            statusEl.className = 'status error';
            setPlayingUI(false);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              setTimeout(function() { hls.startLoad(); }, 3000);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              hls.destroy();
              hls = null;
            }
          }
        });
      } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audio.src = url;
        audio.addEventListener('loadedmetadata', function onMeta() {
          audio.removeEventListener('loadedmetadata', onMeta);
          audio.play().then(function() {
            setPlayingUI(true);
            statusEl.textContent = '正在播放';
            statusEl.className = 'status';
            vscode.postMessage({ type: 'play' });
          }).catch(function(e) {
            statusEl.textContent = '播放失败: ' + e.message;
            statusEl.className = 'status error';
            setPlayingUI(false);
          });
        });
      } else {
        statusEl.textContent = '浏览器不支持 HLS 播放';
        statusEl.className = 'status error';
      }
    }

    function stopPlay() {
      if (hls) {
        hls.destroy();
        hls = null;
      }
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      setPlayingUI(false);
      statusEl.textContent = '已暂停';
      statusEl.className = 'status';
      vscode.postMessage({ type: 'pause' });
    }

    function setPlayingUI(playing) {
      if (playing) {
        btnPlay.textContent = '⏸';
        btnPlay.classList.add('playing');
        visualizer.classList.add('playing');
      } else {
        btnPlay.textContent = '▶';
        btnPlay.classList.remove('playing');
        visualizer.classList.remove('playing');
      }
    }

    btnPlay.addEventListener('click', function() {
      if (audio.paused || audio.ended || !audio.src) {
        startPlay();
      } else {
        stopPlay();
      }
    });

    volumeSlider.addEventListener('input', function() {
      var val = parseInt(volumeSlider.value);
      audio.volume = val / 100;
      var volIcon = document.querySelector('.vol-icon');
      if (val === 0) volIcon.textContent = '🔇';
      else if (val < 50) volIcon.textContent = '🔉';
      else volIcon.textContent = '🔊';
      vscode.postMessage({ type: 'volume', value: val });
    });

    audio.addEventListener('waiting', function() {
      statusEl.textContent = '缓冲中...';
    });
    audio.addEventListener('playing', function() {
      statusEl.textContent = '正在播放';
      statusEl.className = 'status';
    });

    renderStationList();
    updateStationInfo();
  </script>
</body>
</html>`;
  }
}
