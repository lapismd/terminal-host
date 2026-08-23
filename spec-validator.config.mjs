import {
  defineConfig,
  singleIdVerification,
  tableRequirements,
} from "@lapismd/spec-validator";

export default defineConfig(tableRequirements(), {
  name: "terminal-host",
  idPattern: /^TH-[A-Z]+-\d{3}$/,
  tableSection: "Requirements",
  ruleIds: {
    summary: "TH-GOV-001",
    governance: "TH-GOV-003",
    verification: "TH-GOV-003",
    book: "TH-GOV-001",
    bookIgnore: "TH-GOV-001",
    specFirst: "TH-GOV-002",
    internal: "TH-GOV-003",
  },
  validators: {
    summary: true,
    governance: {
      extras: ["AGENTS.md", "README.md"],
      normative: true,
      proseLimits: false,
      acceptance: false,
      references: true,
      changeMap: true,
    },
    verification: singleIdVerification({
      headers: {
        ids: ["ID"],
        status: ["Status"],
        evidence: ["Evidence"],
        required: [],
      },
      statuses: ["Implemented", "Planned"],
    }),
    book: true,
    specFirst: {
      mode: "mapped",
      canonicalPattern:
        "^spec/src/(?:index|architecture|protocol|sessions|spec-governance)\\.md$",
      ignore: [
        "(^|/)node_modules/",
        "(^|/)(?:dist|build)/",
        "^spec/book/",
        "^spec/src/(?:SUMMARY|verification)\\.md$",
        "\\.(?:spec|test)\\.[cm]?[jt]sx?$",
      ],
      rules: [
        {
          pattern: "^src/(?:serve|parse-cli|cli|token)\\.ts$",
          chapters: ["spec/src/protocol.md"],
        },
        {
          pattern: "^src/(?:ws-server|protocol|client)\\.ts$",
          chapters: ["spec/src/protocol.md"],
        },
        {
          pattern: "^src/(?:pty-session|session-service|shell|cwd)\\.ts$",
          chapters: ["spec/src/sessions.md"],
        },
        {
          pattern: "^(?:src/(?:deno|deno-pty|native-library)\\.ts|native-artifacts\\.json)$",
          chapters: ["spec/src/sessions.md", "spec/src/architecture.md"],
        },
        {
          pattern: "^(?:package\\.json$|src/index\\.ts$|bin/|scripts/)",
          chapters: ["spec/src/architecture.md"],
        },
        {
          pattern:
            "^(?:spec-validator\\.config\\.mjs$|AGENTS\\.md$|pnpm-workspace\\.yaml$|spec/book\\.toml$)",
          chapters: ["spec/src/spec-governance.md"],
        },
      ],
      protected: [
        "^(?:src/|package\\.json$|bin/|scripts/|spec-validator\\.config\\.mjs$|AGENTS\\.md$|pnpm-workspace\\.yaml$)",
      ],
    },
  },
  check: {
    lanes: [{ name: "tests", command: "pnpm", args: ["test"] }],
    build: true,
    first: true,
  },
});
