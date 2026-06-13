# Thrive — working agreements

Standing rules for Claude Code on this project. These override default behaviour.

## Process

- **Read-only / diagnosis prompts must not write code, create branches, or modify the database or storage without explicit approval.** When a task is framed as a diagnosis / "map & plan" / read-only, produce a findings report + a proposed plan (with migration SQL for review) and STOP for the go before building or applying anything.

## Product boundary

- **Thrive is a recruitment product, not HR/onboarding software.** Do not build visa/right-to-work compliance logic (visa types, hours-limited conditions, document acceptance, DBS levels, a rules engine, etc.) beyond a simple confirmation flag the employer ticks once they've verified through their own proper channel. Deeper compliance is integration territory (dedicated HR systems / a future integration), not something we model or store here — no candidate documents, no special-category data.
