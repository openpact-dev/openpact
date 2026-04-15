/**
 * preact-router routes children get a `path` prop (or `default`) read
 * by the Router but not the children themselves. Augment Preact's
 * IntrinsicAttributes so every JSX element accepts these without
 * complaint.
 */
import 'preact'

declare module 'preact' {
  namespace JSX {
    interface IntrinsicAttributes {
      path?: string
      default?: boolean
    }
  }
}
