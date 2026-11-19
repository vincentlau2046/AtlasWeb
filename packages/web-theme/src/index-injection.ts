// Adapted from dsh@dsh-v0.2.2-rc.2 (T6-A Task 4): dsh-host-webserver `IndexInjection`
// 局部化副本（webserver 边剥离，R5）。形状逐字自 dsh@tag：index 渲染的 head style /
// body script 行；消费面 = shell boot（Task 7）与 vite 入口（Task 9）。
/** One injection row rendered into the served index document. */
export type IndexInjection =
  | { kind: 'style'; text: string }
  | { kind: 'script'; placement: 'body'; text: string }
