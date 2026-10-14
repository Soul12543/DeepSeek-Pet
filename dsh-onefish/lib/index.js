/**
 * dsh-onefish —— 宿主半侧。
 *
 * 「一条鱼」的实质是客户端浮层容器（见 lib/client.js），宿主侧只需要一条
 * 合法的 cordis 插件行，让包进入 profile 的 bundle 层，并让模块系统把本包
 * 扫描为浏览器插件、把 lib/client.js 提供给页面。
 *
 * 这里可以后续挂宿主能力（例如把扑克/塔罗的宿主状态推给容器），目前保持零副作用。
 */

export const name = 'dsh-onefish';

/** 不依赖任何宿主服务；纯粹为了获得一条 bundle 行。 */
export const inject = [];

export function apply(ctx) {
  ctx.logger?.info?.('[onefish] host loaded');
  console.log('[onefish] host loaded');
}
