---
title: Unplanned backlog items use their own kinds and are promoted by change-axi new
summary: Why ideas, bugs and chores are separate backlog kinds, adopted into kind change by new, and how deprioritized and rejected work is handled
status: accepted
---

# Unplanned backlog items use their own kinds and are promoted by change-axi new

## Context

Agents capture work in the backlog before it is planned, but change-axi new rejected a slug already in the backlog and kind change did not mean a plan existed. A kind-based marker keeps ideas visible in plain tasks-axi listings, unlike a hold.

## Decision

Unplanned items use kind idea, bug or chore. change-axi new adopts one into kind change, optionally under a new slug with --from. Slug checks cover active, archived and every backlog item. Deprioritized work stays queued with a lower priority. Work decided against is recorded as an accepted ADR and the item removed.

## Consequences

kind change always means a plan folder exists, so start, archive and where can rely on it. No new ADR status or tasks-axi change is needed. Abandoning an in-progress plan still has no dedicated command.
