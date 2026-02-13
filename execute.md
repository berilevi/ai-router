Execute the implementation plan at /home/ble15/.claude/plans/ethereal-bouncing-lamport.md

  This plan implements a multi-provider AI router that exposes an Anthropic Messages API endpoint (POST /v1/messages) and
  routes requests to multiple backend providers (GitHub Copilot, Gemini, OpenAI, Anthropic) based on model name.

  Working directory: /home/ble15/tools/ai-router

  Instructions:
  1. Read the plan file first to understand all requirements
  2. Execute all phases (1-6) in order
  3. Follow the code patterns specified in the "Critical Implementation Details" section
  4. Create all files listed in "Files to Create"
  5. Modify all files listed in "Files to Modify"
  6. After implementation, run all test scenarios (1a-1e, 2-6)
  7. If any tests fail, fix the issues and re-run tests
  8. Repeat until ALL tests pass (100% success)
  9. Update the verification checklist as you complete each item

  Key files to reference:
  - Existing providers: src/providers/anthropic.ts, src/providers/base.ts
  - Existing routing: src/utils/modelRouter.ts, src/utils/config.ts
  - Existing types: src/types/index.ts

  Do not stop until all tests pass and the verification checklist is complete.

  ---
