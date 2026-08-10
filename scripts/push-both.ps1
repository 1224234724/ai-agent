# 同时推送到 GitHub(origin) 与 Gitee(gitee)
param(
  [string]$Branch = ""
)

$ErrorActionPreference = "Stop"

if (-not $Branch) {
  $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
}

$remotes = git remote
if ($remotes -notcontains "origin") {
  Write-Error "缺少 remote: origin（GitHub）。例如：git remote add origin https://github.com/<org>/<repo>.git"
}
if ($remotes -notcontains "gitee") {
  Write-Error "缺少 remote: gitee。例如：git remote add gitee https://gitee.com/<org>/<repo>.git"
}

Write-Host ">> push origin $Branch"
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ">> push gitee $Branch"
git push -u gitee $Branch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "完成：已推送到 GitHub 与 Gitee"
