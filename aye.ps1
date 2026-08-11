# aye.ps1 - 阿野IP工作流启动器
# 用法: aye workflow

param(
    [Parameter(Position=0)]
    [string]$Command
)

$WORKFLOW_DIR = "D:\CLAUDE\aye-workflow"

function Show-Help {
    Write-Host @"

🌿 阿野IP内容工作流

用法:
  aye workflow  拉取并列出待处理文章
  aye list      列出所有文章及处理状态
  aye migrate   迁移历史文章到阶段目录

"@
}

switch ($Command) {
    "workflow" {
        Set-Location $WORKFLOW_DIR
        node aye.js sync
        node aye.js list
    }
    "list" {
        Set-Location $WORKFLOW_DIR
        node aye.js list
    }
    "migrate" {
        Set-Location $WORKFLOW_DIR
        node aye.js migrate
    }
    default {
        Show-Help
    }
}
