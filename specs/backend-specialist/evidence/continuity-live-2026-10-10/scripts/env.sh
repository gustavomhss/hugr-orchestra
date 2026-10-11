W=<worktree>
H=<host>
for v in $(env | grep -oE '^(ORCHESTRA|OPENCODE)_[A-Z_]+'); do unset $v; done
export XDG_CONFIG_HOME=$H/xdg/config XDG_DATA_HOME=$H/xdg/data XDG_STATE_HOME=$H/xdg/state XDG_CACHE_HOME=$H/xdg/cache
export ORCHESTRA_CONFIG=$H/orchestra.json ORCHESTRA_DISABLE_CLAUDE_CODE=1 ORCHESTRA_DISABLE_EXTERNAL_SKILLS=1 ORCHESTRA_DISABLE_AUTOUPDATE=1 ORCHESTRA_DISABLE_LSP_DOWNLOAD=1 ORCHESTRA_INHERIT_CREDENTIALS=0 ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=0
export BACKEND_TOOLKIT_ROOT=~/Documents/HuGR/_worktrees/backend-bench/.cache/backend-toolkit
orc() { bun run --define 'ORCHESTRA_VERSION:"1.18.27"' $W/packages/orchestra/src/index.ts "$@"; }
