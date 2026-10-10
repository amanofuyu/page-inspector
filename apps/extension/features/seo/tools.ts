/** 只生成外部查看入口，不改变被检查页面或浏览器设置。 */
export function seoToolLinks(url: string) {
  const page = new URL(url)
  const hostname = page.hostname
  const encoded = encodeURIComponent(url)
  return [
    { group: 'page', label: 'PageSpeed Insights', url: `https://pagespeed.web.dev/analysis?url=${encoded}` },
    { group: 'page', label: 'Google 富媒体结果测试', url: `https://search.google.com/test/rich-results?url=${encoded}` },
    { group: 'research', label: 'Ahrefs Site Explorer', url: `https://app.ahrefs.com/v2-site-explorer/overview?target=${encoded}&mode=exact` },
    { group: 'research', label: 'Moz Link Explorer', url: `https://analytics.moz.com/pro/link-explorer/overview?site=${encoded}` },
    { group: 'research', label: 'Majestic', url: `https://majestic.com/reports/site-explorer?folder=&q=${encoded}` },
    { group: 'research', label: 'Semrush', url: `https://www.semrush.com/analytics/overview/?searchType=domain&q=${encodeURIComponent(hostname)}` },
    { group: 'research', label: 'Similarweb', url: `https://www.similarweb.com/website/${encodeURIComponent(hostname.replace(/^www\./, ''))}/` },
    { group: 'site', label: 'Internet Archive', url: `https://web.archive.org/web/*/${url}` },
    { group: 'site', label: 'WHOIS', url: `https://www.whois.com/whois/${encodeURIComponent(hostname)}` },
    { group: 'search', label: 'Google 站内搜索', url: seoSearch(`site:${hostname}`) },
    { group: 'search', label: '查找非 HTTPS 收录地址', url: seoSearch(`site:${hostname} -inurl:https`) },
  ]
}
export function seoSearch(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}
