// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 5): 边局部化——
// `@deepseek-ai/dsh-util-workspace-path` 的 pathPartsOf verbatim 副本
// （PathLabel.tsx 唯一消费点；其余导出不入闭包）。

/**
 * Split a path for display: the directories through their last separator, and
 * the final segment after it. Both `/` and `\` separate, so a Windows path
 * splits where its own segments end; trailing separators are dropped first, so
 * a directory path names its own last segment. A path with no separator, or a
 * separator-only path, is all name.
 * @param path - file or directory path using POSIX or Windows separators.
 * @returns the directory prefix (possibly empty) and the final segment.
 */
export function pathPartsOf(path: string): { readonly directory: string; readonly name: string } {
  const trimmed = path.replace(/[/\\]+$/, '')
  if (trimmed === '') return { directory: '', name: path }
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\')) + 1
  return { directory: trimmed.slice(0, cut), name: trimmed.slice(cut) }
}
