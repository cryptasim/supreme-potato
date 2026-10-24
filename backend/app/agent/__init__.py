"""WindSight analyst agent: a Claude tool-use loop over the same service layer the UI reads.

- ``tools``   - the tool registry: pydantic-validated inputs, compact JSON outputs, no I/O.
- ``prompts`` - the system prompt and the briefing task.
- ``runner``  - the agentic loop, emitting typed events (text, tool calls, briefing, done).
- ``gateway`` - the only module that talks to the Anthropic API; swapped for a fake in tests.
- ``guard``   - per-client rate limiting and request caps for the public endpoints.
"""
