#!/usr/bin/env bash
set -euo pipefail

# Installs skill repositories used by current agent set.
# Run from workspace root.

repos=(
  "obra/superpowers"
  "better-auth/skills"
  "vercel-labs/agent-skills"
  "vercel-labs/next-skills"
  "anthropics/skills"
  "coreyhaines31/marketingskills"
  "alirezarezvani/claude-skills"
  "zxkane/aws-skills"
  "hashicorp/agent-skills"
  "wshobson/agents"
  "sickn33/antigravity-awesome-skills"
)

for r in "${repos[@]}"; do
  echo "Installing $r"
  npx skills add "$r" -g -y
done

echo "Done. See openclaw/workspace/AGENT_SKILLS_PLAN.md for per-agent mapping."
