// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 5): 边局部化——
// `@deepseek-ai/dsh-util-file-drag` 的 DragFileName verbatim 副本
// （file-drag-actions.ts 唯一消费点，type-only；其余导出不入闭包）。

/** Caller-supplied export naming, shared by Web and Desktop. */
export interface DragFileName {
  readonly name?: string | undefined
  readonly mediaType: string
  readonly outputExtension?: string | undefined
}
