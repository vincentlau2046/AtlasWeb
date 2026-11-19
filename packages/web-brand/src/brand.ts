// T6-A Task 8: BrandFace provider（品牌系统 spec 为源——产品词 'Atlas'）。
import type { BrandFace } from './index.ts'

/**
 * Create the brand face. The product word is the brand system's product
 * title; build surfaces (boot wordmark, document title) read it exclusively.
 * @param options - explicit overrides (multi-product assembly passes the mode word).
 * @returns the frozen brand face.
 */
export function createBrandFace(options?: { productTitle?: string }): BrandFace {
  return Object.freeze({ productTitle: options?.productTitle ?? 'Atlas' })
}

/**
 * Provide the brand service over a client context. Layout/shell surfaces wait
 * on the service (inject face); the boot assembly calls this before the
 * layout plugin activates.
 * @param ctx - client cordis context.
 * @param face - optional explicit face (defaults to the Atlas brand).
 * @returns the provided face.
 */
export function provideBrand(ctx: { provide(name: 'brand', service: BrandFace): unknown }, face?: BrandFace): BrandFace {
  const brand = face ?? createBrandFace()
  ctx.provide('brand', brand)
  return brand
}
