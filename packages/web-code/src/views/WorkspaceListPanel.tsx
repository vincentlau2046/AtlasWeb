// B3 收尾波工单增量①——workspace 发现列表选择 UI（纯投影）。
// 数据 = 组合根经 discovery 端点（GET /execution/workspaces）预取的已授权集
// （launch 期冻结——workspaceAuth 授权仅在 host 启动参数授予）；空列表零渲染
// fail-closed。纪律：选择 ≠ 授权——选择只改客户端 binding 意图，服务端逐命令
// workspaceAuth（E1）对表不变，未授权 id 全命令 403。
export interface WorkspaceListPanelProps {
  workspaces: Array<{ workspaceId: string }>
  selectedId: string | null
  onSelect(workspaceId: string): void
}

export function WorkspaceListPanel({ workspaces, selectedId, onSelect }: WorkspaceListPanelProps) {
  if (workspaces.length === 0) return null
  return (
    <div className='web-code-workspaces' data-workspace-list>
      <div className='web-code-workspaces-title'>工作区</div>
      {workspaces.map(({ workspaceId }) => (
        <button
          key={workspaceId}
          type='button'
          className='web-code-workspaces-option'
          data-workspace-option={workspaceId}
          {...(selectedId === workspaceId ? { 'data-workspace-selected': workspaceId } : {})}
          onClick={() => onSelect(workspaceId)}
        >
          {workspaceId}
        </button>
      ))}
    </div>
  )
}
