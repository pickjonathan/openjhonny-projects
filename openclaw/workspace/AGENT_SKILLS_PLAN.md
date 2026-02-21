# Agent Skills Plan (refreshed)

Generated after pulling latest `origin/main` and re-reading current `*-AGENTS.md` files.

## Install method
Use:

```bash
npx skillsadd <owner/repo>
```

Then enable/use specific skills by name in each agent's workflow.

---

## 1) orchestrator
**Needs:** planning, decomposition, execution control.

Recommended skills:
- `obra/superpowers/writing-plans`
- `obra/superpowers/executing-plans`
- `obra/superpowers/subagent-driven-development`
- `obra/superpowers/brainstorming`

## 2) backend-dev
**Needs:** robust implementation, root-cause debugging, TDD, auth quality.

Recommended skills:
- `obra/superpowers/systematic-debugging`
- `obra/superpowers/test-driven-development`
- `better-auth/skills/better-auth-best-practices`

## 3) frontend-dev
**Needs:** React/Next quality, performance, design consistency.

Recommended skills:
- `vercel-labs/agent-skills/vercel-react-best-practices`
- `vercel-labs/next-skills/next-best-practices`
- `anthropics/skills/frontend-design`

## 4) cicd-architect
**Needs:** pipeline reliability, release discipline, failure triage.

Recommended skills:
- `obra/superpowers/systematic-debugging`
- `obra/superpowers/test-driven-development`
- `obra/superpowers/requesting-code-review`

## 5) cloud-architect
**Needs:** cloud cost governance, observability, architecture validation.

Recommended skills:
- `alirezarezvani/claude-skills/aws-solution-architect`
- `sickn33/antigravity-awesome-skills/aws-serverless`
- `zxkane/aws-skills/aws-cdk-development`
- `hashicorp/agent-skills/terraform-style-guide`

## 6) infra-architect
**Needs:** platform reliability, diagnostics, IAM boundaries, ops maturity.

Recommended skills:
- `zxkane/aws-skills/aws-cdk-development`
- `hashicorp/agent-skills/terraform-style-guide`
- `hashicorp/agent-skills/terraform-test`
- `obra/superpowers/systematic-debugging`

## 7) product-manager
**Needs:** PRD rigor, roadmap decomposition, experiment planning.

Recommended skills:
- `obra/superpowers/writing-plans`
- `obra/superpowers/brainstorming`
- `obra/superpowers/executing-plans`

## 8) qa-reliability
**Needs:** failure analysis, regression control, test depth.

Recommended skills:
- `obra/superpowers/systematic-debugging`
- `obra/superpowers/test-driven-development`
- `anthropics/skills/webapp-testing`

## 9) security-compliance
**Needs:** security baseline enforcement, compliance mapping, access controls.

Recommended skills:
- `sickn33/antigravity-awesome-skills/aws-penetration-testing`
- `hashicorp/agent-skills/terraform-style-guide`
- `obra/superpowers/systematic-debugging`

## 10) seo-growth
**Needs:** technical SEO + content strategy + conversion growth.

Recommended skills:
- `coreyhaines31/marketingskills/seo-audit`
- `coreyhaines31/marketingskills/content-strategy`
- `coreyhaines31/marketingskills/copywriting`
- `coreyhaines31/marketingskills/programmatic-seo`
- `coreyhaines31/marketingskills/pricing-strategy`

---

## Source checks used
- `https://skills.sh/` leaderboard and catalog
- sampled pages for: `seo-audit`, `content-strategy`, `systematic-debugging`, `test-driven-development`, `writing-plans`, `vercel-react-best-practices`, `aws-solution-architect`

Notes:
- Some skills.sh routes 404 on fetch; selected entries are still taken from indexed leaderboard + available pages.
- Keep this file as recommendation inventory; install only what each agent actually uses often.
