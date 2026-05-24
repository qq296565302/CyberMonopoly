# 把收音机塞进 VSCode

v1.3.0，赛博大富翁多了个电台。

经济之声，中国之声，环球资讯广播。三个央广频道，Ctrl+Shift+R 打开，声音从编辑器里出来。

电台面板是个浮动窗口，不大，三个频道横排，圆形图标，点一下播放，再点一下暂停。音量条在下面，拖一下就行。播放的时候图标有脉冲动画，一收一缩，像心跳。切频道不用关面板，点另一个就行。切到别的标签页，声音不断，后台继续播。

经济之声 FM96.6，交易日 9:15 开播《交易实况》，一直讲到下午 4 点收盘。A股开盘的时段，经济之声也在播。分时图在左边跳，经济之声在耳朵里报板块轮动，代码停在屏幕中间，光标闪。

做这个功能用了三天。第一天写界面和播放逻辑，半天搞定。剩下两天全在跟 WebView 较劲。

VSCode 的 WebView 不是一个普通的浏览器标签页。它跑在一个受限的环境里，有自己的 Content Security Policy，有自己的 origin，几乎什么都不让碰。央广的直播流是 HLS 协议，m3u8 索引文件加一堆 ts 分片，挂在央广的 CDN 上。WebView 想去拉这个流，CSP 先拦一道，CORS 再拦一道。

第一个版本写完，点播放，报错：连接失败，请检查网络。网络没问题，浏览器里打开同样的地址能播。问题出在 CSP。WebView 的默认策略里没有 connect-src，fetch 请求直接被浏览器吞了。加上 connect-src 允许央广域名，再试，还是不行。这次是 CORS。央广的服务器没有给 vscode-webview:// 这个 origin 开跨域权限，响应头里没有 Access-Control-Allow-Origin，浏览器拿到响应一看，跨域，拒绝交给 JavaScript。

那就绕。在插件里用 Node.js 起了一个本地代理服务器，绑定 127.0.0.1，随机挑一个空闲端口。WebView 不直接请求央广，请求本地代理，代理再去请求央广的 CDN，拿到数据原样送回来。Node.js 发 HTTP 请求不存在 CORS 限制，浏览器管不到服务端。WebView 的 origin 是 127.0.0.1，代理的 origin 也是 127.0.0.1，同源，CORS 也不拦了。

代理写完，重新打包，点播放。

又报错：The element has no supported sources。

这次查了很久。hls.js 拿到 m3u8 索引文件，解析出 ts 分片列表，准备去拉分片。但 m3u8 里写的分片路径是相对路径，类似 `jjzs20250521/index0.ts` 这种。hls.js 拼完整 URL 的时候，拿的是当前请求的 base URL。之前代理用的是查询参数路由，请求长这样：`http://127.0.0.1:PORT/?host=ngcdn002.cnr.cn&path=/live/jjzs/index.m3u8`。hls.js 拿到这个 URL，base 是 `http://127.0.0.1:PORT/`，拼出来的分片地址变成了 `http://127.0.0.1:PORT/jjzs20250521/index0.ts`。代理服务器上根本没有这个路径，404。

改。把查询参数路由换成路径路由。请求变成 `http://127.0.0.1:PORT/ngcdn002.cnr.cn/live/jjzs/index.m3u8`。hls.js 拿到这个 URL，base 是 `http://127.0.0.1:PORT/ngcdn002.cnr.cn/live/jjzs/`，拼出来的分片地址是 `http://127.0.0.1:PORT/ngcdn002.cnr.cn/live/jjzs/jjzs20250521/index0.ts`。代理收到请求，从路径里拆出目标主机和远程路径，转发给央广 CDN。分片拉到了。

第三个版本，还是播不了。控制台一行红字：Loading media from 'blob:...' violates the following Content Security Policy directive: media-src。

hls.js 默认开 Worker。Worker 在后台线程里把 ts 分片下载、解密、拼接，拼完生成一个 blob URL——`blob:http://127.0.0.1:PORT/xxxx-xxxx`——交给主线程的 audio 元素播放。但 WebView 的 CSP 里 media-src 只写了 `http://127.0.0.1:PORT`，不认 blob 协议。音频数据已经下载完了，解码也完了，就差最后一步——浏览器看了一眼 CSP，说不符合策略，不让播。

在 media-src 后面加了 `blob:`。两个字。声音出来了。

经济之声，播的是当天上午的 A 股开盘情况。

VSCode 扩展商店搜「赛博大富翁」。
