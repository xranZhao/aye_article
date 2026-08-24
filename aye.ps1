# aye.ps1 - 阿野IP工作流启动器
# 用法: aye workflow

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
  aye workflow  拉取并列出待处理文章
  aye list      列出所有文章及处理状态
  aye migrate   迁移历史文章到阶段目录
  aye xiaoshu   同步并列出小树觉察记录

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
