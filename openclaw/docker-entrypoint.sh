#!/bin/bash
set -e

# OpenClaw Docker Entrypoint Script
# Automatically configures auth profiles and settings from environment variables

echo "🦞 OpenClaw Docker Entrypoint - Automatic Configuration"

# Configuration paths
OPENCLAW_DIR="/home/node/.openclaw"
AGENT_DIR="$OPENCLAW_DIR/agents/main/agent"
AUTH_PROFILES="$AGENT_DIR/auth-profiles.json"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"

# Create necessary directories
mkdir -p "$AGENT_DIR"
mkdir -p "$OPENCLAW_DIR/workspace"

# Function to generate auth profiles from environment variables
generate_auth_profiles() {
    echo "🔑 Generating auth profiles from environment variables..."

    local profiles=()
    local default_profile=""

    # Check for OpenAI API key
    if [ -n "$OPENAI_API_KEY" ]; then
        echo "  ✓ Found OPENAI_API_KEY"
        profiles+=('{"id":"openai-default","provider":"openai-codex","apiKey":"'"$OPENAI_API_KEY"'","enabled":true}')
        if [ -z "$default_profile" ]; then
            default_profile="openai-default"
        fi
    fi

    # Check for Anthropic API key
    if [ -n "$ANTHROPIC_API_KEY" ]; then
        echo "  ✓ Found ANTHROPIC_API_KEY"
        profiles+=('{"id":"anthropic-default","provider":"anthropic","apiKey":"'"$ANTHROPIC_API_KEY"'","enabled":true}')
        if [ -z "$default_profile" ]; then
            default_profile="anthropic-default"
        fi
    fi

    # Check for Gemini API key
    if [ -n "$GEMINI_API_KEY" ]; then
        echo "  ✓ Found GEMINI_API_KEY"
        profiles+=('{"id":"gemini-default","provider":"gemini","apiKey":"'"$GEMINI_API_KEY"'","enabled":true}')
        if [ -z "$default_profile" ]; then
            default_profile="gemini-default"
        fi
    fi

    # Check for OpenRouter API key
    if [ -n "$OPENROUTER_API_KEY" ]; then
        echo "  ✓ Found OPENROUTER_API_KEY"
        profiles+=('{"id":"openrouter-default","provider":"openrouter","apiKey":"'"$OPENROUTER_API_KEY"'","enabled":true}')
        if [ -z "$default_profile" ]; then
            default_profile="openrouter-default"
        fi
    fi

    # Generate auth profiles JSON
    if [ ${#profiles[@]} -gt 0 ]; then
        echo "  ✓ Creating auth profiles with ${#profiles[@]} provider(s)"

        # Join profiles with commas
        local profiles_json=$(IFS=,; echo "${profiles[*]}")

        cat > "$AUTH_PROFILES" <<EOF
{
  "profiles": [
    $profiles_json
  ],
  "default": "$default_profile"
}
EOF
        echo "  ✓ Auth profiles created: $AUTH_PROFILES"
        echo "  ✓ Default provider: $default_profile"
    else
        echo "  ⚠️  No API keys found in environment variables"
        echo "  ⚠️  Please set at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY"
    fi
}

# Check if auth profiles already exist
if [ ! -f "$AUTH_PROFILES" ]; then
    echo "📝 Auth profiles not found, generating..."
    generate_auth_profiles
else
    echo "✓ Auth profiles already exist: $AUTH_PROFILES"

    # Optionally update if FORCE_REGENERATE is set
    if [ "$FORCE_REGENERATE_AUTH" = "true" ]; then
        echo "🔄 FORCE_REGENERATE_AUTH=true, regenerating auth profiles..."
        generate_auth_profiles
    fi
fi

# Sync OPENCLAW_GATEWAY_TOKEN env var into openclaw.json so the CLI and gateway
# always share the same token and avoid "device token mismatch" errors.
if [ -n "$OPENCLAW_GATEWAY_TOKEN" ] && [ -f "$CONFIG_FILE" ] && command -v node >/dev/null 2>&1; then
    echo "🔑 Syncing gateway token into openclaw.json..."
    node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
cfg.gateway = cfg.gateway || {};
cfg.gateway.auth = cfg.gateway.auth || {};
cfg.gateway.auth.mode = 'token';
cfg.gateway.auth.token = process.env.OPENCLAW_GATEWAY_TOKEN;
fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2));
console.log('  ✓ Gateway token synced');
" || echo "  ⚠️  Token sync failed (non-fatal)"
fi

# Clear Chrome singleton lock files left over from unclean shutdowns.
# Without this, Chrome refuses to start a new instance on the same profile dir.
find /home/node/.openclaw/browser -name "SingletonLock" -o -name "SingletonCookie" -o -name "SingletonSocket" 2>/dev/null | xargs rm -f 2>/dev/null || true

# Configure the browser for headless operation inside Docker.
# headless=true avoids needing a real display; noSandbox=true is required
# because Docker containers run without user namespaces by default.
if [ -f "$CONFIG_FILE" ] && command -v node >/dev/null 2>&1; then
    BROWSER_READY=$(node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
const b = cfg.browser || {};
console.log((b.headless === true && b.noSandbox === true && b.defaultProfile === 'openclaw' && b.executablePath) ? 'yes' : 'no');
" 2>/dev/null || echo "no")
    if [ "$BROWSER_READY" != "yes" ]; then
        echo "🌐 Configuring browser for headless Docker operation..."
        CHROMIUM_PATH=$(command -v chromium chromium-browser google-chrome 2>/dev/null | head -1 || true)
        node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
cfg.browser = cfg.browser || {};
cfg.browser.headless = true;
cfg.browser.noSandbox = true;
cfg.browser.defaultProfile = 'openclaw';
const chromiumPath = '$CHROMIUM_PATH';
if (chromiumPath) cfg.browser.executablePath = chromiumPath;
fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2));
console.log('  ✓ browser.headless=true, browser.noSandbox=true, defaultProfile=openclaw' + (chromiumPath ? ', executablePath=' + chromiumPath : ''));
" || echo "  ⚠️  Browser config failed (non-fatal)"
    fi
fi

# Apply recommended agent/command/gateway defaults every start.
# Idempotent: only writes if the desired state is not already present.
if [ -f "$CONFIG_FILE" ] && command -v node >/dev/null 2>&1; then
    node << JSEOF
const fs = require('fs');
const path = '$CONFIG_FILE';
const cfg = JSON.parse(fs.readFileSync(path, 'utf8'));
let changed = false;

// --- tools.elevated: enable + allow all providers so pip/sudo commands work ---
cfg.tools = cfg.tools || {};
cfg.tools.elevated = cfg.tools.elevated || {};
if (cfg.tools.elevated.enabled !== true) {
  cfg.tools.elevated.enabled = true; changed = true;
}
// allowFrom["*"] = ["*"] means any provider, any sender — appropriate for an
// agent container where the operator controls who can message it.
cfg.tools.elevated.allowFrom = cfg.tools.elevated.allowFrom || {};
if (!cfg.tools.elevated.allowFrom['*'] ||
    !cfg.tools.elevated.allowFrom['*'].includes('*')) {
  cfg.tools.elevated.allowFrom['*'] = ['*']; changed = true;
}

// --- agents.list: fix misplaced list + ensure main can spawn any sub-agent ---
const misplacedList = cfg.agents && cfg.agents.defaults && cfg.agents.defaults.subagents
  ? cfg.agents.defaults.subagents.list : undefined;
if (misplacedList) {
  delete cfg.agents.defaults.subagents.list;
  changed = true;
}
const list = cfg.agents.list || [];
cfg.agents.list = list;
const incoming = misplacedList || [];
const ids = new Set(list.map(function(a) { return a.id; }));
for (var i = 0; i < incoming.length; i++) {
  const e = incoming[i];
  if (!ids.has(e.id)) { list.push(e); changed = true; }
  else {
    const idx = list.findIndex(function(a) { return a.id === e.id; });
    list[idx] = Object.assign({}, list[idx], e); changed = true;
  }
}
let main = list.find(function(a) { return a.id === 'main'; });
if (!main) { main = { id: 'main' }; list.push(main); changed = true; }

// --- main.subagents.allowAgents: explicit list of all specialist agents ---
const specialistIds = [
  'orchestrator', 'infra-architect', 'cicd-architect', 'cloud-architect',
  'backend-dev', 'frontend-dev', 'product-manager',
  'seo-growth', 'qa-reliability', 'security-compliance'
];
main.subagents = main.subagents || {};
const currentAllow = main.subagents.allowAgents || [];
const missingAgents = specialistIds.filter(function(id) { return !currentAllow.includes(id); });
if (missingAgents.length > 0) {
  main.subagents.allowAgents = specialistIds;
  changed = true;
}

// --- main.tools.alsoAllow: ensure sessions_spawn is included ---
main.tools = main.tools || {};
main.tools.alsoAllow = main.tools.alsoAllow || [];
if (!main.tools.alsoAllow.includes('sessions_spawn')) {
  main.tools.alsoAllow.push('sessions_spawn');
  changed = true;
}

// --- commands: enable restart, bash, config ---
cfg.commands = cfg.commands || {};
const cmdFixes = { restart: true, bash: true, config: true };
for (const [k, v] of Object.entries(cmdFixes)) {
  if (cfg.commands[k] !== v) { cfg.commands[k] = v; changed = true; }
}
// Remove duplicates by reconstructing
cfg.commands = Object.assign({}, cfg.commands);

// --- gateway.reload: hybrid mode for hot config reload ---
cfg.gateway = cfg.gateway || {};
if (!cfg.gateway.reload || cfg.gateway.reload.mode !== 'hybrid') {
  cfg.gateway.reload = { mode: 'hybrid' }; changed = true;
}

if (changed) {
  fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
  console.log('  ✓ Agent spawn allowlist, commands, and gateway reload configured');
} else {
  console.log('  ✓ Agent/command/gateway defaults already correct');
}
JSEOF
fi

# Bootstrap exec-approvals so the agent can write code and create projects
# without requiring manual approval on every shell command.
EXEC_APPROVALS="$OPENCLAW_DIR/exec-approvals.json"
if [ ! -f "$EXEC_APPROVALS" ]; then
    echo "🔓 Creating exec-approvals.json (full access, no prompts)..."
    cat > "$EXEC_APPROVALS" <<'EOJSON'
{
  "version": 1,
  "defaults": {
    "security": "full",
    "ask": "off",
    "autoAllowSkills": true
  },
  "agents": {
    "*": {
      "security": "full",
      "ask": "off",
      "autoAllowSkills": true
    }
  }
}
EOJSON
    echo "  ✓ exec-approvals.json created: $EXEC_APPROVALS"
fi

# Provision auth-profiles for every specialist agent defined in openclaw.json.
# Each agent needs its own agents/<id>/agent/auth-profiles.json to be callable
# as an independent session. We copy from main's auth-profiles (same credentials).
if [ -f "$AUTH_PROFILES" ] && [ -f "$CONFIG_FILE" ] && command -v node >/dev/null 2>&1; then
    node -e "
const fs = require('fs');
const path = require('path');
const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
const mainAuth = '$AUTH_PROFILES';
const agentsBase = '$OPENCLAW_DIR/agents';
const skip = new Set(['main', 'openai-whisper-api']);
let provisioned = 0;
for (const agent of (cfg.agents && cfg.agents.list) || []) {
  if (skip.has(agent.id)) continue;
  const dir = path.join(agentsBase, agent.id, 'agent');
  const dest = path.join(dir, 'auth-profiles.json');
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(mainAuth, dest);
    provisioned++;
  }
}
if (provisioned > 0) {
  console.log('  ✓ Provisioned auth-profiles for ' + provisioned + ' specialist agent(s)');
} else {
  console.log('  ✓ All specialist agent auth-profiles already exist');
}
" || echo "  ⚠️  Specialist agent auth provisioning failed (non-fatal)"
fi

# Ensure all paired devices have operator.write scope so sub-agent spawning works
# without requiring manual scope-upgrade pairing on every restart.
PAIRED_DEVICES="$OPENCLAW_DIR/devices/paired.json"
if [ -f "$PAIRED_DEVICES" ] && command -v node >/dev/null 2>&1; then
    node -e "
const fs = require('fs');
const path = '$PAIRED_DEVICES';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
let changed = false;
const requiredScopes = ['operator.write'];
for (const [id, device] of Object.entries(data)) {
  const scopes = Array.isArray(device.scopes) ? device.scopes : [];
  for (const s of requiredScopes) {
    if (!scopes.includes(s)) { scopes.push(s); changed = true; }
  }
  device.scopes = scopes;
  for (const [role, tok] of Object.entries(device.tokens || {})) {
    const ts = Array.isArray(tok.scopes) ? tok.scopes : [];
    for (const s of requiredScopes) {
      if (!ts.includes(s)) { ts.push(s); changed = true; }
    }
    tok.scopes = ts;
  }
}
if (changed) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
  console.log('  ✓ Added operator.write to paired device scopes (enables sub-agent spawning)');
} else {
  console.log('  ✓ Paired device scopes already include operator.write');
}
" || echo "  ⚠️  Paired device scope patch failed (non-fatal)"
fi

# Set proper permissions
chown -R node:node "$OPENCLAW_DIR" 2>/dev/null || true
chmod 700 "$OPENCLAW_DIR" 2>/dev/null || true

echo "✅ Configuration complete!"
echo ""
echo "📊 Status:"
echo "  Config dir: $OPENCLAW_DIR"
echo "  Auth profiles: $AUTH_PROFILES"
echo "  Workspace: $OPENCLAW_DIR/workspace"
echo ""
echo "🚀 Starting OpenClaw Gateway..."
echo ""

# Execute the main command
exec "$@"
