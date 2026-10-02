export const en = {
  brand: 'Shared Memory',
  tagline: 'A little context. Everywhere.',
  memories: 'Memories',
  tokens: 'API tokens',
  usage: 'Usage',
  connect: 'Connect',
  workspace: 'Personal workspace',
  private: 'Private to your account',
  heading: 'Your context, carried forward.',
  intro:
    'Keep the preferences, decisions, and lessons your agents should remember.',
  search: 'Search your memories',
  searchHint: 'Try a topic, a phrase, or a question…',
  project: 'Project',
  global: 'global',
  newMemory: 'New memory',
  refresh: 'Refresh',
  empty: 'Make room for what matters.',
  emptyBody:
    'Save your first memory, or connect an agent to start building context together.',
  title: 'Title',
  content: 'Memory',
  kind: 'Type',
  tags: 'Tags (comma separated)',
  source: 'Source / evidence',
  preference: 'Preference',
  fact: 'Fact',
  decision: 'Decision',
  experience: 'Experience',
  save: 'Save memory',
  cancel: 'Cancel',
  edit: 'Edit',
  forget: 'Forget',
  history: 'History',
  forgetConfirm:
    'Forget this memory? Its text and history will be removed. This cannot be undone.',
  sourceHint: 'Where was this confirmed? Include a date or reference.',
  saved: 'Memory saved.',
  deleted: 'Memory forgotten.',
  working: 'Working…',
  setup: 'Connect your identity provider',
  setupBody:
    'The app is running. Configure Cloudflare Access to sign in and start saving private memories.',
  setupHelp:
    'See docs/SETUP.md for the environment variables and setup instructions.',
  signIn: 'Sign in',
  signOut: 'Sign out',
  signInBody:
    'Your memories belong to you. Sign in through Cloudflare Access to use them across your agents.',
  loadError: 'Something went wrong. Please try again.',
  tokensHeading: 'A key for each connection.',
  tokensIntro:
    'Give each agent its own token. Choose its permissions and revoke access at any time.',
  tokenName: 'Token name',
  tokenScope: 'Access',
  tokenProject: 'Project restriction (empty = all)',
  days: 'Expires in days',
  createToken: 'Create token',
  revoke: 'Revoke',
  revoked: 'Revoked',
  revokeConfirm:
    'Revoke this token? Connected clients will lose access immediately.',
  copy: 'Copy',
  copied: 'Copied',
  tokenSecret: 'Copy this token now. It will only be shown once.',
  dismiss: 'Dismiss',
  read: 'Read',
  write: 'Write',
  deletePermission: 'Delete',
  noTokens: 'No tokens yet. Create one to connect your first agent.',
  expires: 'Expires',
  lastUsed: 'Last used',
  never: 'Never',
  usageHeading: 'Understand your connections.',
  usageIntro:
    'Requests from the last 30 days. No memory content or search text is stored in usage logs.',
  operation: 'Operation',
  calls: 'Calls',
  errors: 'Errors',
  latency: 'Average latency',
  day: 'Date',
  noUsage: 'Your API activity will appear here.',
  usageNote:
    'These metrics describe this service, not your agents’ model token consumption. Up to 500 daily groups are shown.',
  oauthClient: 'Connected app',
  webSession: 'Web',
  connectHeading: 'One memory. Every agent.',
  connectIntro:
    'Install the combined plugin where supported. Other local agents connect to MCP and share the same portable skill.',
  endpoint: 'MCP endpoint',
  chatgpt: 'ChatGPT',
  chatgptBody:
    ('Turn on developer mode under Settings → Security and login, then add this '
      + 'MCP endpoint at chatgpt.com/plugins. ChatGPT completes Cloudflare Access '
      + 'Managed OAuth; no token is copied. The same account shares one library with '
      + 'this page.'),
  oauthConnectBody:
    ('Add this MCP URL in the client and complete the Cloudflare Access login '
      + 'when prompted. Production MCP uses Access OAuth, not a pasted personal token.'),
  plugin: 'Plugin package',
  pluginBody:
    ('The one-install path for ChatGPT and Codex bundles this skill with the '
      + 'remote MCP server and authenticates over Access OAuth. Run pnpm '
      + 'plugin:build for local testing, then publish the same package through the '
      + 'Plugins Directory.'),
  skill: 'Companion skill',
  skillBody:
    ('Install it globally for every detected compatible agent. Remote MCP still '
      + 'authenticates through Access OAuth; configure.mjs can store a personal '
      + 'mem_* token only for local or direct REST use.'),
  deepseek: 'DeepSeek / HTTP',
  deepseekBody:
    ('Use an MCP-capable host or the API adapter in examples/deepseek.py. The '
      + 'model requests tools; your application executes them.'),
  tokenSafety:
    ('Personal mem_* tokens remain for local development and direct REST. '
      + 'Production MCP behind Access uses OAuth instead. Do not commit tokens or '
      + 'paste them into a conversation.'),
  keyword: 'Keyword search · semantic indexing unavailable',
  hybrid: 'Hybrid search',
  previous: 'Previous',
  next: 'Next',
  close: 'Close',
  revisions: 'Recent revisions',
  noRevisions: 'No earlier revisions yet.',
  loadRevisions: 'Load revision history',
  expand: 'Show full content',
  collapse: 'Show less',
  viewDetails: 'View details',
  version: 'Version',
  created: 'Created',
  tagList: 'Tags',
  missingMemory: 'This memory is no longer available.',
  notifications: 'Notifications',
  tokenCreated: 'Token created.',
  tokenRevoked: 'Token revoked.',
  copyFailed: 'Copy failed. Select the text manually.',
  pending: 'Pending index jobs',
  retrying: 'Retrying',
  updated: 'Updated',
  scopeNote:
    'Search global and a project separately to retrieve both kinds of context.',
  overview: 'YOUR LIBRARY',
  tools: 'CONNECTIONS',
  secureNote: 'Your context stays in your account.',
  footer: 'Built for continuity.',
  back: 'Back to memories',
  language: 'Language',
  catalog: 'Catalog',
  catalogHeading: 'Keep the library organised.',
  catalogIntro:
    ('A scheduled agent sorts your memories into a two-level catalog. Every '
      + 'action it takes is recorded, and any run can be undone.'),
  categories: 'Categories',
  assigned: 'Classified',
  unclassified: 'Unclassified',
  noCategories: 'No categories yet.',
  notConfigured:
    ('Configure a model endpoint below to let the agent organise this library. '
      + 'The key is encrypted, shown back only as a hint, and the platform never '
      + 'pays for inference.'),
  proposals: 'Suggestions',
  noProposals: 'No suggestions waiting.',
  evidence: 'Runs supporting this',
  approve: 'Approve',
  reject: 'Reject',
  runs: 'Runs',
  noRuns: 'No runs yet.',
  runStatus: 'Status',
  trigger: 'Trigger',
  turns: 'Turns',
  toolCalls: 'Tool calls',
  rejectedCalls: 'Refused',
  actionsApplied: 'Applied',
  timeline: 'What happened',
  revertRun: 'Undo this run',
  revertConfirm:
    'Undo every change this run applied? Memories return to the categories they had before it.',
  metrics: 'Measured trends',
  metricsNote:
    'Daily totals for the last 90 days. Raw turns and tool calls are pruned after 90 days; these numbers are not.',
  catalogSettings: 'Catalog settings',
  showSettings: 'Configure',
  hideSettings: 'Done',
  settingsDescription:
    ('The agent calls a model endpoint you supply. This service never pays for '
      + 'inference, and the key is encrypted at rest.'),
  providerHint:
    'The endpoint must implement the Responses API and function calling. Run the connection test before enabling.',
  provider: 'Model provider',
  providerNone: 'Not configured',
  providerResponses: 'Responses API endpoint',
  providerWorkersAi: 'Workers AI',
  baseUrl: 'Endpoint URL',
  model: 'Model',
  apiKey: 'API key',
  storedKey: 'Stored, ending',
  keyUnavailable:
    ('This deployment has no AGENT_SETTINGS_KEY, so a model credential cannot be '
      + 'stored. Runs stay disabled until the operator sets it.'),
  lastProbe: 'Last connection test',
  interval: 'Interval (minutes)',
  maxBatch: 'Memories per batch',
  maxTurns: 'Turns per batch',
  maxToolCalls: 'Tool calls per turn',
  dailyTokenBudget: 'Daily model token budget',
  modelTokens: 'Model tokens',
  usageIncomplete: 'usage incomplete',
  awaitingReview: 'Scheduled dry run paused',
  awaitingReviewDescription:
    ('The first scheduled preview is complete. Manual dry runs still work; '
      + 'disable or re-enable the review gate to resume automatic runs.'),
  failureBackoff: 'Automatic retry delayed',
  failureBackoffDescription: 'Consecutive scheduled failures:',
  manualBudgetWarning:
    'Today\'s model-token budget has been reached. This manual run will continue and still counts toward usage.',
  enableCatalog: 'Run the catalog agent on a schedule',
  includeContent: 'Share memory bodies with the model',
  includeContentHint:
    'Off by default: the agent sees titles, types, tags and projects, never the text of a memory.',
  autoApply: 'Apply new categories without asking me',
  dryRunUntilReviewed: 'Keep runs as dry runs until I have reviewed one',
  providerNeedsPaid:
    ('Workers AI hosts tool-capable models, but the larger ones need a paid plan; '
      + 'bringing your own endpoint works on the Free plan.'),
  saveSettings: 'Save settings',
  testConnection: 'Test connection',
  runNow: 'Run now',
  dryRun: 'Dry run',
  budgetNote:
    ('Workers Free allows 3,000 Workflow steps a day and each turn costs two, so '
      + 'accounts take turns instead of all running at once.'),
  settingsSaved: 'Catalog settings saved.',
  runStarted: 'Run started.',
  revertDone: 'Run undone.',
  proposalDone: 'Decision recorded.',
  categoryBoundary: 'Not here',
  categoryAxis: 'Axis',
  childCategories: 'Subcategories',
  membersHere: 'Memories here',
  backToCatalog: 'Back to catalog',
  categoryMissing: 'That category is not in this catalog.',
  acceptPackage: 'Accept all',
  rejectPackage: 'Reject all',
  rejectWithAdvice: 'Reject with advice',
  splitProposals: 'Decide one by one',
  joinProposals: 'Group as a package',
  packageHint: ('These pending suggestions are reviewed together. Accept applies them in a '
    + 'safe order; reject with advice feeds your note into the next run.'),
  adviceLabel: 'Advice for the next run',
  advicePlaceholder: 'Tell the agent what to do differently next time…',
  pendingAdviceHint: 'The next run will include your pending advice.',
  runPromptTitle: 'Start a catalog run',
  runPromptHint: 'Optional notes for this run only. They are trusted instructions from you, not from memory text.',
  runPromptPlaceholder: 'Optional guidance for this run…',
  startRun: 'Start',
  viewSteps: 'Steps',
  primaryBadge: 'Primary',
  noMemoriesInCategory: 'No memories assigned here yet.',
  openCategory: 'Open',
}
