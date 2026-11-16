import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTheme } from '../../hooks/useTheme.js';
import { BRAND_TITLE, brandAsset } from '../../utils/brandAssets.js';

/** Origin comes from the running app, so local/staging/production never share a hard-coded domain. */
export default function BrandMetadata() {
  const { theme } = useTheme();
  const image = new URL(brandAsset('social/zeplao-og-light.png'), window.location.origin).href;

  useEffect(() => {
    // React 19 hoists Helmet tags without deduplicating the static HTML fallbacks.
    // Only manage our fallback nodes; route titles, descriptions, canonical and
    // robots remain owned by their existing page components.
    const head = document.head;
    const title = head.querySelector('title[data-zl-fallback]') || document.createElement('title');
    title.dataset.zlFallback = 'title';
    title.textContent = BRAND_TITLE;
    const description = head.querySelector('meta[data-zl-fallback]') || document.createElement('meta');
    description.dataset.zlFallback = 'description';
    description.name = 'description';
    description.content = 'ZepLao Tools Suite — bộ công cụ báo giá, xử lý hình ảnh và chuyển đổi file.';
    const sync = () => {
      for (const [selector, fallback] of [['title', title], ['meta[name="description"]', description]]) {
        const hasPageTag = head.querySelector(`${selector}:not([data-zl-fallback])`);
        if (hasPageTag && fallback.parentNode === head) fallback.remove();
        else if (!hasPageTag && fallback.parentNode !== head) head.append(fallback);
      }
    };
    const observer = new window.MutationObserver(sync);
    observer.observe(head, { childList: true });
    sync();
    return () => observer.disconnect();
  }, []);

  return <Helmet>
    <meta name="theme-color" content={theme === 'dark' ? '#0D0B2E' : '#6558F5'} />
    <meta property="og:site_name" content={BRAND_TITLE} />
    <meta property="og:image" content={image} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="ZepLao Tools Suite" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content={image} />
  </Helmet>;
}
