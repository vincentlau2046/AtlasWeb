// Adapted from dsh@dsh-v0.2.2-rc.2 packages/client/web/src/seed.ts (MIT).
// Adaptation: Atlas module registrations — product package rows re-pointed to
// @atlasweb/* (store/slots/primitives) and the layout host word becomes
// @atlasweb/web-layout; zod / react-virtual rows dropped with their platform
// words. MIT license; original dsh header below.
/**
 * Platform-singleton module-table. These are the ONLY entities the shell
 * shares into the frozen module table — fetch bundles resolve their externals
 * against exactly this set through the loader's require. Keys come from the
 * platform constant module ({@link ./platform.ts}, the single source
 * of truth with the bundler client externals); values stay shell-static
 * imports so every bundle sees the same instance.
 */
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import * as Cordis from '@deepseek-ai/cordis'
import * as ClientStore from '@atlasweb/web-store'
import * as UiSlots from '@atlasweb/web-slots'
import * as UiPrimitives from '@atlasweb/web-primitives'
import * as WebLayout from '@atlasweb/web-layout'
import type { PlatformModule } from './platform.ts'

/**
 * Build the static table handed to the module loader at boot.
 * @returns module specifier → exported entity (one entry per platform word).
 */
export function getStaticModules(): Record<string, unknown> {
  // The satisfies pin is the projection contract: a word added to
  // PLATFORM_MODULES without a static import here (or vice versa) fails to
  // compile instead of drifting into a runtime require miss.
  return {
    'react': React,
    'react/jsx-runtime': ReactJsxRuntime,
    'react-dom': ReactDom,
    'react-dom/client': ReactDomClient,
    '@deepseek-ai/cordis': Cordis,
    '@atlasweb/web-store': ClientStore,
    '@atlasweb/web-slots': UiSlots,
    '@atlasweb/web-primitives': UiPrimitives,
    '@atlasweb/web-layout': WebLayout,
  } satisfies Record<PlatformModule, unknown>
}
