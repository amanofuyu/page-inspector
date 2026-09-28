// 使用回调签名，兼容目标浏览器中尚未提供 Promise 的 DevTools API。
chrome.devtools.panels.create('Page Inspector', 'icon/16.png', 'inspector-panel.html', () => {})
