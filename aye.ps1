# aye.ps1 - 阿野IP工作流启动器
# 用法: aye start

param(
    [Parameter(Position=0)]
    [string]$Command,
    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$CommandArgs
)

$WORKFLOW_DIR = $PSScriptRoot

function Show-Help {
    Write-Host @"

🌿 阿野IP内容工作流

用法:
  aye download  下载云端新增稿件
  aye review    生成并打开未发布稿件的审阅页
  aye edit      列出可写、正在修改的文章
  aye materials 按标签查找关联素材
  aye start     兼容旧命令：下载后打开审阅页
  aye overview  更新并打开文章总览
  aye open <ID> 直接打开这篇文章当前应编辑的稿件
  aye list      列出所有文章及处理状态
  aye migrate   迁移历史文章到阶段目录
  aye xiaoshu   同步并列出小树觉察记录

"@
}

switch ($Command) {
    "start" {
        Set-Location $WORKFLOW_DIR
        node aye.js download
        node aye.js review
        Start-Process -FilePath (Join-Path $WORKFLOW_DIR 'articles\选题审阅.md')
    }
    "workflow" {
        Set-Location $WORKFLOW_DIR
        node aye.js download
        node aye.js review
        Start-Process -FilePath (Join-Path $WORKFLOW_DIR 'articles\选题审阅.md')
    }
    "download" {
        Set-Location $WORKFLOW_DIR
        node aye.js download
    }
    "review" {
        Set-Location $WORKFLOW_DIR
        node aye.js review @CommandArgs
        Start-Process -FilePath (Join-Path $WORKFLOW_DIR 'articles\选题审阅.md')
    }
    "edit" {
        Set-Location $WORKFLOW_DIR
        node aye.js edit @CommandArgs
    }
    "materials" {
        Set-Location $WORKFLOW_DIR
        node aye.js materials @CommandArgs
    }
    "list" {
        Set-Location $WORKFLOW_DIR
        node aye.js list
    }
    "overview" {
        Set-Location $WORKFLOW_DIR
        node aye.js overview
        Start-Process -FilePath (Join-Path $WORKFLOW_DIR 'articles\文章总览.md')
    }
    "open" {
        Set-Location $WORKFLOW_DIR
        node aye.js open @CommandArgs
    }
    "migrate" {
        Set-Location $WORKFLOW_DIR
        node aye.js migrate
    }
    "xiaoshu" {
        Set-Location $WORKFLOW_DIR
        if ($CommandArgs.Count -gt 0) {
            node aye.js xiaoshu @CommandArgs
        } else {
            node aye.js xiaoshu sync
        }
    }
    default {
        Show-Help
    }
}
