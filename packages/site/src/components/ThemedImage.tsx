import type { JSX } from 'preact'

interface Props {
  /** Path to the light-mode image, e.g. `/screenshots/dashboard-overview-light.png`. */
  light: string
  /** Path to the dark-mode image. Must have identical intrinsic dimensions. */
  dark: string
  /** Alt text applied to both <img> tags. */
  alt: string
  /** Optional extra classes applied to both images (layout / rounding / shadow). */
  class?: string
  /** Native width/height for CLS. */
  width?: number | string
  height?: number | string
  /** eager for above-the-fold, lazy otherwise. Defaults to lazy. */
  loading?: JSX.HTMLAttributes<HTMLImageElement>['loading']
}

/**
 * Renders two images that swap based on the site's theme. Follows the
 * `.dark` class on <html> that the ThemeDial sets, so it stays in
 * sync whether the user's preference comes from system media or from
 * an explicit dial override. Both tags always exist in the DOM; CSS
 * hides the one that does not match the current theme — no JS needed,
 * no swap flicker when the theme toggles.
 */
export function ThemedImage({
  light,
  dark,
  alt,
  class: className = '',
  width,
  height,
  loading = 'lazy',
}: Props) {
  const base = `block dark:hidden ${className}`.trim()
  const inv = `hidden dark:block ${className}`.trim()
  return (
    <>
      <img
        src={light}
        alt={alt}
        class={base}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
      />
      <img
        src={dark}
        alt=""
        aria-hidden="true"
        class={inv}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
      />
    </>
  )
}
