/* Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 4): verbatim。 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css'

declare module '*.css?inline' {
  const css: string
  export default css
}
