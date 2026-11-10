# Changelog

## Unreleased

### Bug fixes
- Setup AGENTS.md instructions for backlog
- **change-axi:** Keep leading space of first porcelain line in commit-plan
- **change-axi:** Cap generated commit headers at 100 characters
- **change-axi:** Drop dead run hint from enter multi-ready listing


### Documentation
- Quick start in README, CONTRIBUTING for developers
- Dogfood the docs layout (architecture, glossary, CLI reference, 5 ADRs)
- **skills:** Ask for conventional commits with a Change trailer
- Describe the commit convention
- **docs-axi:** Document adr subcommands and search --all
- Migrate ADR refs to ADR-NNNN-slug
- Document ADR-NNNN-slug refs, fix-refs and renumber
- Agent profiles, tiers and guidance
- Clarify docs never reference changes in ADR-0002
- Document change-axi config
- **change-axi:** Document bare enter step resolution
- **change-axi:** Document enter profile preflight
- **skills:** Add write/append cheat-sheet and branch lookup note
- **skills:** Pick plan-apply mode from change-axi output
- **plan-axi:** Document multi-repo changes
- **change-axi:** Describe config --verify validation and checker layout


### Features
- **change-axi:** Conventional commit subjects and Change trailer
- **change-axi:** Add commit-plan command
- **docs-axi:** Shared list/search core with matched column and --all
- **docs-axi:** Dashboard home without index rows
- **docs-axi:** Adr list, search and add subcommands
- **docs-axi:** Check ADR refs resolve and are not bare
- **docs-axi:** Add adr renumber
- **docs-axi:** Add adr fix-refs migration
- **docs-axi:** Make adr fix-refs reviewable and safer
- **change-axi:** Guard ADR number clashes in commit-plan and finish
- **change-axi:** Include slug in chore(plan) commit subjects
- **change-axi:** Agent profiles and enter --agent
- **change-axi:** Step Tier header and tier-to-profile resolution
- **change-axi:** Guidance command and tier-aware plan-propose
- **change-axi:** Show full model setup in guidance help
- **change-axi:** Plan config model and validation
- **change-axi:** Add config command
- **change-axi:** Add idea and backlog commands
- **change-axi:** Adopt unplanned items in new, guard start
- **change-axi:** Resolve step on bare enter and list parallel-ready steps
- **change-axi:** Verify agent profile before enter launches
- **change-axi:** Hint valid write/append form and show branch and worktree in home
- **change-axi:** Show branch and checkout in status, hint agents to skip git branch
- **change-axi:** Resolve repos from config with platform runtime
- **change-axi:** Parse Repos header and validate Owns repo prefixes
- **change-axi:** Lease a worktree per repo on start and enter
- **change-axi:** Show and check per-repo state in home, status and done
- **change-axi:** Finish merges every repo in the change
- **change-axi:** Rename herdr tab to slug on enter
- **change-axi:** Offer to close herdr tab after finish
- **change-axi:** Add per-file and merged config checker
- **docs-axi:** Export docsConfigProblems for collected [docs] validation
- **change-axi:** Validate all config in config --verify
- **change-axi:** Add proposal set --repos and new --repos for the Repos header


### Refactor
- **docs-axi:** Extract shared TOML writer


### Tests
- **change-axi:** Use docs-axi adr add

