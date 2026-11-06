/*
 * 首帧主题应用 —— 必须同步、必须外部文件。
 *
 * 为什么不能内联：CSP 是 `script-src 'self'`（见 vite.config.ts 的 inject-csp-meta），
 * 内联脚本会被直接拦掉，那个<meta>级别的防闪就完全失效了。
 *
 * 为什么不能用 React 设置：Dexie 是异步的，等 React 挂载再读设置，浅色用户会先看到
 * 一整屏深色再跳成浅色。所以主题存 localStorage（同步可读），且这个脚本必须在
 * <head> 里、在浏览器首次绘制之前跑完。
 *
 * 判断顺序：localStorage 显式值 > 系统偏好 > 深色兜底。
 * 没有 key 就等于「跟随系统」，而不是「没设置过所以用深色」——前者符合用户预期。
 */
(function () {
  var KEY = 'theme';
  var root = document.documentElement;
  var THEME_COLOR = { dark: '#0B0E14', light: '#EEF1F7' };
  var mq = window.matchMedia('(prefers-color-scheme: light)');

  function readPreference() {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch (error) {
      /* 隐私模式下 localStorage 可能抛异常，回落系统偏好即可 */
    }
    return 'system';
  }

  var preference = readPreference();

  function resolve() {
    if (preference === 'dark' || preference === 'light') return preference;
    return mq.matches ? 'light' : 'dark';
  }

  function apply() {
    var theme = resolve();
    root.setAttribute('data-theme', theme);

    /* 浏览器地址栏/状态栏颜色。这里是唯一必须写死色值的 JS 位置：
       meta content 不能引用 CSS 变量，值必须与 design-tokens 的 surface-0 一致 */
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[theme]);

    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme, preference: preference } }));
  }

  /* 供 src/platform/theme.ts 调用。分开暴露 get/set 而不是一个对象，
     是为了让最小化后的属性名不会被打包器改写 */
  window.__theme = {
    get: function () {
      return { theme: resolve(), preference: preference };
    },
    set: function (next) {
      if (next !== 'dark' && next !== 'light' && next !== 'system') return;
      preference = next;
      try {
        if (next === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
      } catch (error) {
        /* 存不进去也不影响本次会话 */
      }
      apply();
    },
  };

  apply();

  /* 跟随系统时要响应系统切换（日落自动转深色是这个功能的实际价值）。
     用 addEventListener 而不是 onchange，后者会被别处覆盖 */
  if (mq.addEventListener) mq.addEventListener('change', apply);
})();
