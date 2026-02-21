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
  "microsoft/github-copilot-for-azure"
  "coreyhaines31/marketingskills"
)

for r in "${repos[@]}"; do
  echo "Installing $r"
  npx skillsadd "$r"
done

echo "Done. See openclaw/workspace/AGENT_SKILLS_PLAN.md for per-agent mapping."
