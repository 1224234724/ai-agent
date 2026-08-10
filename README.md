# ai-agent

企业级 AI Agent 平台（Next.js 16 + JWT 角色登录 + RAG 知识库 + Docker / GitHub Actions 部署）。

## 本地开发

```bash
cp .env.example .env.local
# 填写 OPENAI_* 与 JWT_SECRET

npm ci
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，未登录会进入 `/login`。

演示账号见登录页（默认 `admin` / `admin123`，哈希依赖 `JWT_SECRET`）。

## Docker 本地运行

```bash
cp .env.example .env
# 填写密钥；本地构建可不设置 IMAGE_NAME

docker compose up -d --build
```

应用监听 `http://localhost:3000`，`./data` 挂载到容器持久化。

## 双仓推送（GitHub + Gitee）

```bash
git remote add origin https://github.com/<org>/<repo>.git
git remote add gitee https://gitee.com/<org>/<repo>.git
```

Windows：

```powershell
.\scripts\push-both.ps1
```

Linux / macOS：

```bash
bash scripts/push-both.sh
```

推送到 GitHub `main` 后，Actions 还会尝试同步到 Gitee（需配置 Secrets）。

## GitHub Actions 自动部署

流水线文件：[`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml)

| Job | 说明 |
|-----|------|
| Lint and Build | `npm ci` + lint + `next build` |
| Build and Push Image | 推送镜像到 `ghcr.io/<owner>/<repo>` |
| Deploy over SSH | 同步 `docker-compose.yml`，服务器 `pull` + `up -d` |
| Mirror to Gitee | 将 `main` 推到 Gitee |

### GitHub Secrets

| Secret | 用途 |
|--------|------|
| `DEPLOY_HOST` | 服务器 IP / 域名 |
| `DEPLOY_USER` | SSH 用户 |
| `DEPLOY_SSH_KEY` | 私钥全文 |
| `DEPLOY_PATH` | 服务器项目目录，如 `/opt/ai-agent` |
| `DEPLOY_PORT` | SSH 端口（默认留空则用 action 默认 22） |
| `GHCR_USER` | 有 `read:packages` 的 GitHub 用户名 |
| `GHCR_TOKEN` | PAT（`read:packages`），供服务器拉私有镜像 |
| `GITEE_TOKEN` | Gitee 私人令牌（`projects` 权限） |
| `GITEE_OWNER` | Gitee 用户名或组织 |
| `GITEE_REPO` | Gitee 仓库名 |

仓库需开启 Actions 写 Packages：Settings → Actions → 允许读写。

### 服务器首次准备

1. 安装 Docker 与 Compose 插件  
2. 创建目录并放入环境文件：

```bash
sudo mkdir -p /opt/ai-agent && cd /opt/ai-agent
# 上传或 scp .env（从 .env.example 复制并填写）
# IMAGE_NAME 可由流水线自动写入
mkdir -p data/knowledge data/conversations
```

3. 配置 SSH 公钥到部署用户，并把私钥写入 GitHub `DEPLOY_SSH_KEY`  
4. 推送 `main` 触发流水线；首次若 GHCR 包为 private，确保 `GHCR_*` 已配置  

### 回滚

```bash
cd /opt/ai-agent
# 将 IMAGE_NAME 改为历史 sha 标签，例如：
# IMAGE_NAME=ghcr.io/owner/repo:sha-abcdef0
docker compose pull app
docker compose up -d
```

### 更换 JWT_SECRET

密码哈希绑定 `JWT_SECRET`。生产更换后需按新密钥重算 `data/users.json` 中的 `passwordHash`，或恢复旧 secret。

## 主要环境变量

见 [`.env.example`](.env.example)：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`JWT_SECRET`。
