/**
 * CSP nonce 生成工具
 * 用于 WebView 的 Content-Security-Policy 安全加固
 */

/**
 * 生成一个 32 位的随机 nonce 字符串
 * 用于 CSP 策略中的 script-src 和 style-src 指令
 */
export function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/**
 * 构建统一的 CSP meta 标签内容
 *
 * @param nonce - 由 getNonce() 生成的随机字符串
 * @param extraScriptSrc - 额外的 script-src 来源（如 webview.cspSource），可选
 * @returns CSP content 字符串
 *
 * 策略说明：
 * - default-src 'none'    : 默认禁止所有资源加载
 * - script-src nonce      : 仅允许携带正确 nonce 的内联脚本执行
 * - style-src nonce       : 仅允许携带正确 nonce 的内联样式加载
 * - img-src data:         : 允许 data: URI 的图片（用于图表库等）
 */
export function buildCspContent(nonce: string, extraScriptSrc?: string): string {
  const scriptSrc = extraScriptSrc
    ? `script-src 'nonce-${nonce}' ${extraScriptSrc};`
    : `script-src 'nonce-${nonce}';`;
  return `default-src 'none'; ${scriptSrc} style-src 'nonce-${nonce}'; img-src data:;`;
}
