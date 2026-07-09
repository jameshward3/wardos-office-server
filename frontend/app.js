const API_BASE = localStorage.getItem("wardosApiBase") || "/api";
const WEATHER_REFRESH_MS = 60 * 60 * 1000;

const routePageMap = {
  "/": "home",
  "/dashboard": "dashboard",
  "/briefing": "briefing",
  "/constituents": "constituents",
  "/media-monitor": "media",
  "/public-safety": "publicSafety",
  "/legislation": "legislation",
  "/budget": "budget",
  "/development": "development",
  "/events": "events",
  "/reports": "reports",
  "/settings": "settings",
};

const state = {
  page: window.WARDOS_INITIAL_PAGE || routePageMap[window.location.pathname] || "dashboard",
  tab: "cases",
  search: "",
  dashboardOverview: null,
  briefing: null,
  constituents: [],
  constituentSearch: [],
  constituentSummary: null,
  cases: [],
  caseSummary: null,
  caseFilters: { status: "all", category: "all", priority: "all", department: "all", ward: "all" },
  selectedCaseId: null,
  caseDetail: null,
  caseDetailTab: "overview",
  editingNoteId: null,
  constituentFile: null,
  constituentFileTab: "cases",
  legislation: [],
  budget: [],
  githubBudget: null,
  githubProgress: null,
  githubLegislation: null,
  media: null,
  mediaStories: [],
  publicSafety: null,
  mediaConfig: null,
  sourceConnections: [],
  staffUsers: [],
  staffRoles: {},
  priorityIssues: [],
  meetings: [],
  developments: [],
  developmentWatch: null,
  officeActions: [],
  weather: null,
  mediaFilters: {
    dateRange: "Last 24 Hours",
    sourceType: "All Sources",
    ward: "All Wards",
    topic: "All Topics",
    sentiment: "All Sentiment",
  },
  mediaTab: "overview",
  selectedStoryId: "story-development-center",
  selectedLegislationId: "",
  legislationTab: "overview",
  legislationDetailOpen: true,
  drafts: [],
  completedActions: JSON.parse(localStorage.getItem("wardosCompletedActions") || "[]"),
};
let constituentSearchTimer = null;

const navItems = [
  ["home", "⌂", "Home", ""],
  ["briefing", "▣", "Briefing", ""],
  ["dashboard", "◎", "Dashboard", ""],
  ["constituents", "●", "Constituents", ""],
  ["legislation", "▧", "Legislation", ""],
  ["budget", "▤", "Budget", ""],
  ["development", "▥", "Development", ""],
  ["projects", "⌘", "Projects & DPW", ""],
  ["maps", "◇", "Maps", ""],
  ["reports", "□", "Reports", ""],
  ["progress", "◍", "Progress", ""],
  ["events", "◫", "Events", ""],
  ["media", "◉", "Media Monitor", ""],
  ["publicSafety", "◈", "Public Safety", ""],
  ["settings", "⚙", "Settings", ""],
];

const CASE_CATEGORIES = [
  "Roads & Potholes",
  "Trees & Landscaping",
  "Sidewalks",
  "Street Lights",
  "Traffic & Safety",
  "Sanitation",
  "Code Enforcement",
  "Parks & Recreation",
  "Development",
  "Drainage",
  "Other",
];

const CASE_CATEGORY_META = {
  "Roads & Potholes": { icon: "◇", tone: "blue" },
  "Trees & Landscaping": { icon: "❋", tone: "green" },
  "Sidewalks": { icon: "▦", tone: "purple" },
  "Street Lights": { icon: "○", tone: "orange" },
  "Traffic & Safety": { icon: "◈", tone: "red" },
  "Sanitation": { icon: "▥", tone: "cyan" },
  "Code Enforcement": { icon: "◆", tone: "orange" },
  "Parks & Recreation": { icon: "❀", tone: "green" },
  "Development": { icon: "▧", tone: "blue" },
  "Drainage": { icon: "≈", tone: "cyan" },
  "Other": { icon: "●", tone: "" },
};

function categoryBadge(category) {
  const meta = CASE_CATEGORY_META[category] || { icon: "●", tone: "" };
  return h`
    <span class="category-chip">
      <span class="category-icon ${meta.tone}">${meta.icon}</span>
      ${category || "Uncategorized"}
    </span>
  `;
}

const CASE_DEPARTMENTS = ["DPW", "Public Works", "Code Enforcement", "Traffic Bureau", "Sanitation", "Planning", "Recreation", "Police", "Other"];

const CASE_SOURCES = ["Phone Call", "Email", "Walk-in", "Web Form", "Text Message", "Social Media", "Council Meeting", "Other"];

const CASE_STATUSES = ["open", "assigned", "in progress", "waiting", "resolved", "closed"];

const CASE_PRIORITIES = ["low", "normal", "medium", "high"];

const CASE_WARDS = ["South Ward", "North Ward", "East Ward", "West Ward", "Citywide"];

function caseStatusTone(status = "") {
  const value = String(status).toLowerCase();
  if (value === "resolved" || value === "closed") return "good";
  if (value === "in progress" || value === "assigned") return "";
  if (value === "waiting") return "warn";
  return "warn";
}

function casePriorityTone(priority = "") {
  const value = String(priority).toLowerCase();
  if (value === "high") return "hot";
  if (value === "medium") return "warn";
  return "good";
}

const mediaTopics = [
  ["Traffic & Roads", 0, "purple"],
  ["Development", 0, "blue"],
  ["Taxes", 0, "orange"],
  ["Public Safety", 0, "red"],
  ["Trees", 0, "green"],
  ["Budget", 0, "cyan"],
  ["PILOT Agreements", 0, "orange"],
  ["South Ward", 0, "green"],
];

function configuredTopics() {
  return state.mediaConfig?.intelligence_topics?.length
    ? state.mediaConfig.intelligence_topics.map((topic) => [topic, 0, "blue"])
    : mediaTopics;
}

const wardGeoJsonUrl = "assets/orange_wards_approx.geojson";

const fallbackWardPolygons = {
  north: [
    [40.7909, -74.2384],
    [40.7838, -74.2309],
    [40.7757, -74.2247],
    [40.7693, -74.2335],
    [40.7735, -74.2445],
    [40.7849, -74.2499],
  ],
  west: [
    [40.7735, -74.2445],
    [40.7693, -74.2335],
    [40.7619, -74.2382],
    [40.7557, -74.2496],
    [40.7632, -74.2587],
  ],
  east: [
    [40.7757, -74.2247],
    [40.7677, -74.2178],
    [40.7591, -74.2218],
    [40.7551, -74.2319],
    [40.7619, -74.2382],
    [40.7693, -74.2335],
  ],
  south: [
    [40.7619, -74.2382],
    [40.7551, -74.2319],
    [40.7467, -74.2388],
    [40.7488, -74.2527],
    [40.7557, -74.2496],
  ],
};

const wardStyles = {
  north: { label: "North Ward", color: "#f2c894", fill: "#f2c894" },
  west: { label: "West Ward", color: "#8fd28c", fill: "#8fd28c" },
  east: { label: "East Ward", color: "#e6e978", fill: "#e6e978" },
  south: { label: "South Ward", color: "#49bfe2", fill: "#49bfe2" },
};

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function compactMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function nowInOfficeTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function timeGreeting() {
  const hour = nowInOfficeTime().getHours();
  if (hour < 5) return { text: "Good Evening", icon: "◐" };
  if (hour < 12) return { text: "Good Morning", icon: "☼" };
  if (hour < 17) return { text: "Good Afternoon", icon: "☀" };
  return { text: "Good Evening", icon: "◐" };
}

function officeDateLine(includeTime = false) {
  const now = nowInOfficeTime();
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(now);
  if (!includeTime) return date;
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(now);
  return `${date} · ${time}`;
}

function formatShortDate(value) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(parsed);
}

function h(strings, ...values) {
  return strings.reduce((acc, part, index) => acc + part + (values[index] ?? ""), "");
}

function saveDrafts() {
  return null;
}

function saveActions() {
  localStorage.setItem("wardosCompletedActions", JSON.stringify(state.completedActions));
}

function updateLastSyncLabel() {
  const label = document.getElementById("lastSyncLabel");
  if (!label) return;
  const candidates = [
    state.dashboardOverview?.fetched_at,
    state.developmentWatch?.fetched_at,
    state.media?.fetched_at,
    state.githubBudget?.fetched_at,
    state.briefing?.date,
  ].filter(Boolean);
  const value = candidates[0] ? new Date(candidates[0]) : new Date();
  label.textContent = `Last Sync: ${value.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

async function getJson(path, fallback) {
  try {
    const response = await fetch(`${API_BASE}${path}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch {
    return fallback;
  }
}

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function postForm(path, formData) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function loadCaseDetail(id) {
  if (!id) {
    state.caseDetail = null;
    return;
  }
  state.caseDetail = await getJson(`/cases/${id}`, state.caseDetail && state.caseDetail.case?.id === id ? state.caseDetail : null);
}

async function selectCase(id, tab = "overview") {
  state.selectedCaseId = id;
  state.caseDetailTab = tab;
  state.editingNoteId = null;
  await loadCaseDetail(id);
  render();
}

async function updateCase(id, patch) {
  await postJson(`/cases/${id}`, patch);
  state.cases = await getJson("/cases", state.cases);
  state.caseSummary = await getJson("/cases/summary", state.caseSummary);
  if (state.selectedCaseId === id) await loadCaseDetail(id);
}

async function deleteCase(id) {
  await postJson(`/cases/${id}/delete`, { confirmation: "DELETE" });
  state.cases = await getJson("/cases", state.cases);
  state.caseSummary = await getJson("/cases/summary", state.caseSummary);
  if (String(state.selectedCaseId) === String(id)) {
    state.selectedCaseId = state.cases[0]?.id ?? null;
    await loadCaseDetail(state.selectedCaseId);
  }
}

async function openConstituentFile({ constituentId, name, address } = {}) {
  const params = new URLSearchParams();
  if (constituentId) params.set("constituent_id", constituentId);
  if (name) params.set("name", name);
  if (address) params.set("address", address);
  state.tab = "directory";
  state.constituentFileTab = "cases";
  state.constituentFile = await getJson(`/constituents/file?${params.toString()}`, null);
  render();
}

function closeConstituentFile() {
  state.constituentFile = null;
  render();
}

async function refreshOperationalData() {
  state.dashboardOverview = await getJson("/dashboard/overview", state.dashboardOverview || operationalOverviewFallback());
  state.priorityIssues = state.dashboardOverview.priority_issues || [];
  state.meetings = state.dashboardOverview.meetings || state.meetings;
  state.meetings = await getJson("/events?limit=500", state.meetings);
  state.developments = state.dashboardOverview.developments || state.developments;
  state.constituentSummary = await getJson("/constituents/summary", state.constituentSummary);
  state.cases = await getJson("/cases", state.cases);
  state.caseSummary = await getJson("/cases/summary", state.caseSummary);
  state.legislation = await getJson("/legislation", state.legislation);
  state.budget = await getJson("/budget-watch", state.budget);
  state.officeActions = await getJson("/office-actions", state.officeActions);
  state.drafts = state.officeActions.filter((action) => ["draft_follow_up", "note"].includes(action.action_type));
}

async function refreshWeather({ rerender = false } = {}) {
  state.weather = await getJson("/weather/today", state.weather || weatherFallback());
  if (rerender) render();
}

function startWeatherRefresh() {
  if (window.wardosWeatherRefreshTimer) return;
  window.wardosWeatherRefreshTimer = window.setInterval(() => {
    refreshWeather({ rerender: true });
  }, WEATHER_REFRESH_MS);
}

function mergeConstituentSearch(rows) {
  const byKey = new Map();
  [...(state.constituentSearch || []), ...(rows || [])].forEach((row) => {
    const key = row.voter_id || row.id || `${row.full_name}:${row.street_no}:${row.street}:${row.apt}`;
    if (key) byKey.set(String(key), row);
  });
  state.constituentSearch = Array.from(byKey.values()).slice(0, 2000);
}

function scheduleConstituentDeepSearch(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return;
  window.clearTimeout(constituentSearchTimer);
  constituentSearchTimer = window.setTimeout(async () => {
    const rows = await getJson(`/constituents?q=${encodeURIComponent(q)}&limit=1500`, []);
    if (!rows.length) return;
    mergeConstituentSearch(rows);
    renderPage();
    renderSearchPanel();
    bindEvents();
  }, 250);
}

function showSaveError(error) {
  alert(`WardOS could not save this to the shared server. Check that the API is running, then try again.\n\n${error.message || error}`);
}

async function loadData() {
  const fallbackBriefing = {
    date: new Date().toISOString(),
    title: "South Ward Daily Briefing",
    open_inputs: {
      inbox: [],
      agendas: [],
      minutes: [],
      budget: [],
    },
    recommended_actions: [],
  };

  state.dashboardOverview = await getJson("/dashboard/overview", operationalOverviewFallback());
  state.briefing = await getJson("/briefing/daily", fallbackBriefing);
  state.constituents = await getJson("/constituents?ward=South&limit=6000", []);
  state.constituentSearch = state.constituents;
  state.constituentSummary = await getJson("/constituents/summary", null);
  state.cases = await getJson("/cases", []);
  state.caseSummary = await getJson("/cases/summary", null);
  state.selectedCaseId = state.cases[0]?.id ?? null;
  if (state.selectedCaseId != null) await loadCaseDetail(state.selectedCaseId);
  state.legislation = await getJson("/legislation", []);
  state.budget = await getJson("/budget-watch", []);
  state.priorityIssues = state.dashboardOverview.priority_issues || [];
  state.meetings = state.dashboardOverview.meetings || [];
  state.meetings = await getJson("/events?limit=500", state.meetings);
  state.developments = state.dashboardOverview.developments || [];
  state.developmentWatch = await getJson("/development-watch", state.developmentWatch || developmentWatchFallback());
  state.developments = await getJson("/development-projects", state.developments);
  state.officeActions = state.dashboardOverview.actions || [];
  state.officeActions = await getJson("/office-actions", state.officeActions);
  state.drafts = state.officeActions.filter((action) => ["draft_follow_up", "note"].includes(action.action_type));
  state.githubBudget = await getJson("/integrations/github/budget", budgetFallback());
  state.githubProgress = await getJson("/integrations/github/progress", metricsFallback("First 100 Days"));
  state.githubLegislation = await getJson("/integrations/github/legislation", metricsFallback("Legislative Tracker"));
  state.media = await getJson("/media-monitor", { mentions: 0, topics: [], stories: [], alerts: [], actions: [] });
  state.publicSafety = await getJson("/public-safety", publicSafetyFallback());
  state.mediaConfig = await getJson("/media-monitor/config", null);
  state.sourceConnections = await getJson("/source-connections", []);
  state.staffUsers = await getJson("/staff/users", []);
  state.staffRoles = await getJson("/staff/roles", {});
  state.mediaStories = normalizeMediaStories(state.media.stories || (await getJson("/media-mentions", [])));
  if (state.mediaStories.length) state.selectedStoryId = String(state.mediaStories[0].id);
  await refreshWeather();
  updateLastSyncLabel();
  render();
  startWeatherRefresh();
}

function developmentWatchFallback() {
  return {
    source_url: "Orange Township Planning and Zoning Board pages",
    fetched_at: null,
    boards: [
      { board: "Planning Board", source_url: "https://orangetwpnjcc.org/boards-commissions/planning-board/", meeting_count: 0, watch_count: 0 },
      { board: "Zoning Board of Adjustment", source_url: "https://orangetwpnjcc.org/boards-commissions/zoning-board-of-adjustment/", meeting_count: 0, watch_count: 0 },
    ],
    meeting_count: 0,
    watch_count: 0,
    meetings: [],
    watch_items: [],
  };
}

function operationalOverviewFallback() {
  return {
    sample_mode: false,
    metrics: {
      open_requests: 0,
      constituents: 0,
      mailin_voters: 0,
      council_meetings: 0,
      pending_legislation: 0,
      development_projects: 0,
      media_mentions: 0,
      public_safety_incidents: 0,
    },
    priority_issues: [],
    meetings: [],
    developments: [],
    actions: [],
  };
}

function publicSafetyFallback() {
  return {
    generated_at: new Date().toISOString(),
    source_folder: "data/public_safety",
    metrics: {
      total_incidents: 0,
      violent_incidents: 0,
      traffic_incidents: 0,
      quality_of_life: 0,
      resolved: 0,
    },
    score: { value: 0, label: "Awaiting Briefing", delta: "Upload OPD monthly briefing PDF" },
    breakdown: [],
    dangerous_intersections: [],
    incidents: [],
    insights: ["Upload the monthly police briefing PDF to data/public_safety, then run Public Safety Sync."],
  };
}

function normalizeMediaStories(rows) {
  return rows.map((row) => ({
    id: String(row.id),
    source: row.source || "Unknown Source",
    logo: (row.source || "?").slice(0, 2).toUpperCase(),
    type: row.source_type || "News",
    headline: row.headline || "Untitled mention",
    summary: row.summary || "",
    fullSummary: row.summary || "No AI summary has been generated yet.",
    published: row.published_at ? new Date(row.published_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Unscheduled",
    sentiment: titleCase(row.sentiment || "neutral"),
    engagement: row.engagement_score || 0,
    reach: row.engagement_score ? `${row.engagement_score}` : "0",
    geo: row.geographic_tag || "Unmapped",
    topic: row.topic || "Uncategorized",
    url: row.url || "#",
    quotes: [],
    entities: [],
    relatedLegislation: [],
    relatedCases: [],
    relatedProjects: [],
    suggestedActions: ["Review and classify this mention"],
    interest: row.engagement_score > 10000 ? "High" : "Unknown",
    impact: "Needs staff review.",
    latitude: row.latitude,
    longitude: row.longitude,
  }));
}

function titleCase(value) {
  return String(value)
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function weatherFallback() {
  const updatedAt = new Date().toISOString();
  return {
    ok: true,
    from_cache: true,
    location: "Orange, NJ",
    temperature: 62,
    high: 74,
    low: 52,
    condition: "Sunny",
    symbol: "☀",
    wind_mph: 8,
    humidity: 45,
    updated_at: updatedAt,
    next_update_at: new Date(Date.now() + WEATHER_REFRESH_MS).toISOString(),
    refresh_interval_seconds: WEATHER_REFRESH_MS / 1000,
  };
}

function weatherUpdatedLabel(weather) {
  const value = weather?.updated_at;
  if (!value) return "Updates hourly";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updates hourly";
  return `Updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function budgetFallback() {
  const rows = [
    { year: 2020, totalBudget: 77636060, taxLevy: 51658519.05, nonTaxRevenue: 25503023, surplus: 4700000, debtService: 2241939 },
    { year: 2021, totalBudget: 79358417, taxLevy: 54801504.5, nonTaxRevenue: 24086710, surplus: 3700000, debtService: 2981982 },
    { year: 2022, totalBudget: 81720157.29, taxLevy: 56756859.3, nonTaxRevenue: 24431644.29, surplus: 3700000, debtService: 3474731 },
    { year: 2023, totalBudget: 88844923.41, taxLevy: 60801150.04, nonTaxRevenue: 27352735.41, surplus: 3000000, debtService: 3352875 },
    { year: 2024, totalBudget: 93280851, taxLevy: 64977993, nonTaxRevenue: 27550421, surplus: 4680000, debtService: 4236363 },
    { year: 2025, totalBudget: 92330788, taxLevy: 66890251, nonTaxRevenue: 23543038, surplus: 4000000, debtService: 4797620 },
    { year: 2026, totalBudget: 94580788, taxLevy: 70104881, nonTaxRevenue: 30901905, surplus: 4008400, debtService: 4306684 },
  ];
  return {
    ok: true,
    from_cache: true,
    source: { repo: "jameshward3/OrangeBudgetDashboard", path: "historical_budget_dataset.json" },
    summary: {
      latest_year: 2026,
      total_budget: 94580788,
      tax_levy: 70104881,
      non_tax_revenue: 30901905,
      surplus: 4008400,
      debt_service: 4306684,
      budget_growth_percent: 2.44,
      tax_levy_growth_percent: 4.81,
      years_tracked: rows.length,
    },
    rows,
  };
}

function metricsFallback(title) {
  return {
    ok: true,
    from_cache: true,
    source: { repo: title.includes("Legislative") ? "jameshward3/Legislative_tracker" : "jameshward3/Progress", path: "metrics.json" },
    summary: {
      title,
      overallProgress: title.includes("Legislative") ? 42 : 0,
      average_progress: title.includes("Legislative") ? 42 : 1.4,
      completedKeyActions: 21,
      totalKeyActions: title.includes("Legislative") ? 50 : 48,
      items_tracked: 7,
      in_progress: title.includes("Legislative") ? 5 : 0,
      completed: title.includes("Legislative") ? 1 : 0,
    },
    items: title.includes("Legislative")
      ? [
          { id: "term-limits", priority: 1, title: "Term Limits", status: "Completed", progress: 100, nextStep: "Community hearing and Council discussion." },
          { id: "november-elections", priority: 2, title: "Move Elections to November", status: "In Progress", progress: 60, nextStep: "Council vote on resolution scheduled for June 3." },
          { id: "parking-standards", priority: 3, title: "Better Parking Standards for New Developments", status: "In Progress", progress: 50, nextStep: "Planning Commission review in June." },
        ]
      : [
          { id: "november-elections", priority: 1, title: "Move Elections to November", status: "Planned", progress: 0, nextStep: "Council vote on resolution scheduled for June 3." },
          { id: "term-limits", priority: 2, title: "Term Limits", status: "Planned", progress: 10, nextStep: "Community hearing and Council discussion." },
        ],
  };
}

function renderNav() {
  document.getElementById("nav").innerHTML = navItems
    .map(([key, icon, label, count]) => {
      const resolvedCount = navCountFor(key) || count;
      return h`
      <button class="nav-item ${state.page === key ? "active" : ""}" data-page="${key}">
        <span>${icon}</span><span>${label}</span>${resolvedCount ? `<span class="nav-count">${resolvedCount}</span>` : "<span></span>"}
      </button>
    `;
    })
    .join("");
}

function setMobileNav(open) {
  const sidebar = document.querySelector(".sidebar");
  const toggle = document.getElementById("mobileNavToggle");
  if (!sidebar || !toggle) return;
  sidebar.classList.toggle("mobile-nav-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
}

function navCountFor(key) {
  const metrics = state.dashboardOverview?.metrics;
  if (!metrics) return "";
  const counts = {
    constituents: metrics.constituents || metrics.open_requests,
    legislation: metrics.pending_legislation,
    development: metrics.development_projects,
    events: metrics.council_meetings,
    media: metrics.media_mentions,
    publicSafety: state.publicSafety?.metrics?.total_incidents || metrics.public_safety_incidents,
  };
  return counts[key] || "";
}

function metricCards() {
  const metrics = state.dashboardOverview?.metrics || operationalOverviewFallback().metrics;
  const budgetSummary = state.githubBudget?.summary || {};
  const budgetMetric = budgetSummary.total_budget ? compactMoney(budgetSummary.total_budget) : "Needs source";
  return h`
    <section class="grid metrics">
      ${metric(metrics.open_requests || 0, "Open Requests", "Live cases", "green")}
      ${metric(metrics.council_meetings || 0, "Council Meetings", "Scheduled", "blue")}
      ${metric(metrics.pending_legislation || 0, "Pending Legislation", "Tracked", "purple")}
      ${metric(budgetMetric, "Current Budget", budgetSummary.latest_year ? `${budgetSummary.latest_year} adopted` : "GitHub source", "green")}
      ${metric(metrics.development_projects || 0, "Development Projects", "Tracked", "cyan")}
      ${metric(metrics.media_mentions || state.media?.mentions || 0, "Media Mentions", "Last 24h", "purple")}
    </section>
  `;
}

function metric(value, label, sub, tone) {
  const textValue = String(value ?? "");
  return h`
    <article class="metric">
      <strong class="${tone}" title="${textValue}">${textValue}</strong>
      <span title="${label}">${label}</span>
      <small class="${sub.includes("↑") ? "up" : ""}" title="${sub}">${sub}</small>
    </article>
  `;
}

function priorityList() {
  const rows = state.priorityIssues || [];
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Top Priority Items</h2><button class="link" data-page="constituents">View all requests</button></div>
      <div class="panel-body list">
        ${rows.map((item, index) => h`
          <button class="list-row ghost" data-open-draft="${item.title}" style="text-align:left">
            <span class="rank ${priorityTone(item.priority)}">${index + 1}</span>
            <span><strong>${item.title}</strong><br><small class="muted">${item.meta || "No notes yet"}</small></span>
            <span><span class="status ${item.priority === "high" ? "hot" : item.priority === "medium" ? "warn" : "good"}">${item.status}</span><br><small class="muted">#${item.id}</small></span>
          </button>
        `).join("") || `<div class="empty">No priority issues yet. Add a constituent need to populate this panel.</div>`}
      </div>
    </section>
  `;
}

function priorityTone(priority) {
  if (priority === "high") return "red";
  if (priority === "medium") return "orange";
  return "green";
}

function mapPanel(title = "South Ward Map") {
  return h`
    <section class="panel">
      <div class="panel-header"><h2>${title}</h2><button class="ghost" data-page="maps">↗</button></div>
      <div class="map osm-map ward-osm-map" data-map-kind="ward" aria-label="Interactive OpenStreetMap view of Orange wards"></div>
    </section>
  `;
}

function meetingsPanel() {
  const now = Date.now();
  const nextThirtyDays = now + (30 * 24 * 60 * 60 * 1000);
  const rows = (state.meetings || [])
    .filter((row) => {
      const time = eventTimeValue(row);
      return time && time >= now && time <= nextThirtyDays;
    })
    .sort((a, b) => {
      const aTime = eventTimeValue(a);
      const bTime = eventTimeValue(b);
      return aTime - bTime;
    })
    .slice(0, 6);
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Upcoming Meetings</h2><button class="link" data-page="events">View all</button></div>
      <div class="panel-body list">
        ${rows.map((row, i) => h`
          <div class="list-row">
            <span class="rank blue">${i + 1}</span>
            <span><strong>${row.title}</strong><br><small class="muted">${row.starts_at ? new Date(row.starts_at).toLocaleString() : "No time set"}<br>${row.location || "No location set"}</small></span>
            ${row.status ? `<span class="status ${row.status === "today" ? "warn" : ""}">${row.status}</span>` : "<span></span>"}
          </div>
        `).join("") || `<div class="empty">No meetings scheduled yet.</div>`}
      </div>
    </section>
  `;
}

function budgetPanel() {
  const summary = state.githubBudget?.summary || {};
  const totalBudget = summary.total_budget ? money(summary.total_budget) : "Not connected";
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Budget Snapshot (YTD)</h2><button class="link" data-page="budget">View budget</button></div>
      <div class="panel-body split">
        <div class="donut"></div>
        <div>
          <div class="budget-row"><span><b class="blue">●</b> Tax Levy</span><span>${summary.tax_levy ? money(summary.tax_levy) : "N/A"}</span><span class="muted">${summary.tax_levy_growth_percent ?? "N/A"}%</span></div>
          <div class="budget-row"><span><b class="orange">●</b> Non-Tax Revenue</span><span>${summary.non_tax_revenue ? money(summary.non_tax_revenue) : "N/A"}</span><span class="muted"></span></div>
          <div class="budget-row"><span><b class="green">●</b> Debt Service</span><span>${summary.debt_service ? money(summary.debt_service) : "N/A"}</span><span class="muted"></span></div>
          <div class="budget-row"><span>${summary.latest_year || "YTD"} Total Budget</span><strong>${totalBudget}</strong><span></span></div>
        </div>
      </div>
    </section>
  `;
}

function developmentPanel() {
  const rows = state.developments || [];
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Development Watchlist</h2><button class="link" data-page="development">View projects</button></div>
      <div class="panel-body list">
        ${rows.map((row, i) => h`
          <div class="list-row">
            <span class="rank purple">${i + 1}</span>
            <span><strong>${row.name}</strong><br><small class="muted">${row.address || row.project_type || "No details yet"}</small></span>
            <span class="muted">${row.board || row.status}</span>
          </div>
        `).join("") || `<div class="empty">No development projects tracked yet.</div>`}
      </div>
    </section>
  `;
}

const developmentAddressGeocodes = {
  "434 parkinson terrace": { latitude: 40.779956092854, longitude: -74.229939638992, source: "census", status: "matched" },
  "391 lakeside avenue": { latitude: 40.78047265346, longitude: -74.227877631855, source: "census", status: "matched" },
  "124-128 ward street": { latitude: 40.771591287717, longitude: -74.223370118311, source: "census", status: "range match" },
  "124 ward street": { latitude: 40.771591287717, longitude: -74.223370118311, source: "census", status: "range match" },
  "220 n center street": { latitude: 40.766378716389, longitude: -74.231315592045, source: "census", status: "review: census returned 220 S Center St" },
  "220 north center street": { latitude: 40.766378716389, longitude: -74.231315592045, source: "census", status: "review: census returned 220 S Center St" },
  "47 hillyer street": { latitude: 40.770223439859, longitude: -74.222011983863, source: "census", status: "matched" },
};

function normalizeAddress(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\b(st|st\.)\b/g, "street")
    .replace(/\b(ave|ave\.)\b/g, "avenue")
    .replace(/\b(ter|ter\.)\b/g, "terrace")
    .replace(/\s+/g, " ")
    .trim();
}

function inferDevelopmentDate(item) {
  const candidates = [
    item.document_date,
    item.meeting_date,
    item.date,
    item.created_at,
    String(item.source_url || "").match(/\/(20\d{2})\//)?.[1],
    String(item.name || item.title || "").match(/\b(20\d{2})\b/)?.[1],
  ].filter(Boolean);
  for (const candidate of candidates) {
    const text = String(candidate);
    if (/^20\d{2}$/.test(text)) return new Date(`${text}-01-01T00:00:00`);
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.valueOf())) return parsed;
  }
  return null;
}

function developmentProjectMapItems() {
  const watch = state.developmentWatch || developmentWatchFallback();
  const merged = [...(watch.watch_items || []), ...(state.developments || [])];
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 4);
  const seen = new Set();
  return merged
    .map((item, index) => {
      const key = item.source_id || `${item.name || item.title}-${item.address || index}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const date = inferDevelopmentDate(item);
      const normalized = normalizeAddress(item.address);
      const geocode = item.latitude && item.longitude ? {
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
        source: item.geocoder_source || "stored",
        status: item.geocode_status || "stored",
      } : developmentAddressGeocodes[normalized];
      return {
        ...item,
        id: item.id || key,
        name: item.name || item.title || "Development record",
        date,
        dateLabel: date ? formatShortDate(date.toISOString()) : "Date pending",
        latitude: geocode?.latitude,
        longitude: geocode?.longitude,
        geocoder_source: geocode?.source || item.geocoder_source || "needs geocode",
        geocode_status: geocode?.status || item.geocode_status || "needs review",
      };
    })
    .filter(Boolean)
    .filter((item) => !item.date || item.date >= cutoff)
    .sort((a, b) => (b.date?.valueOf() || 0) - (a.date?.valueOf() || 0));
}

function developmentMapPins() {
  return developmentProjectMapItems()
    .filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
    .map((item, index) => ({
      id: String(index + 1),
      label: item.name,
      address: item.address || "Address pending",
      board: item.board || "Planning / Zoning",
      type: item.project_type || "development",
      status: item.status || "tracking",
      date: item.dateLabel,
      sourceUrl: item.source_url || "",
      geocodeStatus: item.geocode_status,
      lat: Number(item.latitude),
      lng: Number(item.longitude),
      tone: String(item.board || "").toLowerCase().includes("planning") ? "blue" : "purple",
    }));
}

function developmentMapPanel() {
  const items = developmentProjectMapItems();
  const pins = developmentMapPins();
  const needsReview = items.filter((item) => !Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude)) || String(item.geocode_status).includes("review"));
  return h`
    <section class="panel development-map-panel">
      <div class="panel-header">
        <div>
          <h2>Planning & Zoning Project Map</h2>
          <small class="muted">Last 4 years · ${pins.length} plotted · ${needsReview.length} need geocode review</small>
        </div>
        <button class="secondary" data-sync-development>Sync Board Sources</button>
      </div>
      <div class="development-map-layout">
        <div class="development-map osm-map" data-map-kind="development" aria-label="Interactive OpenStreetMap map of planning and zoning project addresses"></div>
        <aside class="development-map-rail">
          <div class="brief-cell"><small>Mapped Records</small><strong>${pins.length}</strong></div>
          <div class="brief-cell"><small>Source Window</small><strong>4 years</strong></div>
          <div class="brief-cell"><small>Boards</small><strong>Planning + Zoning</strong></div>
          <div class="list-stack">
            ${items.slice(0, 8).map((item) => `
              <article class="mini-card">
                <div>
                  <strong>${item.name}</strong>
                  <p class="muted">${item.address || "Address not listed"} · ${item.dateLabel} · ${item.board || "Board source"}</p>
                </div>
                <span class="status ${String(item.geocode_status).includes("review") || !item.latitude ? "warn" : "good"}">${item.geocode_status}</span>
              </article>
            `).join("") || `<div class="empty">No planning or zoning project records in the four-year window.</div>`}
          </div>
        </aside>
      </div>
    </section>
  `;
}

function boardDocumentRows(meetings) {
  const docs = meetings.flatMap((meeting) =>
    (meeting.documents || []).map((document) => ({ ...document, board: meeting.board, date: meeting.date, meetingTitle: meeting.title }))
  );
  if (!docs.length) return `<div class="empty">No agenda, notice, application, or minute links have been collected yet. Run sync after the board pages update.</div>`;
  return docs.slice(0, 80).map((document) => h`
    <article class="mini-card">
      <div>
        <strong>${document.title}</strong>
        <p class="muted">${document.board} · ${document.date || "No date"} · ${titleCase(document.document_type || "source")}</p>
      </div>
      <div class="stack-right">
        <span class="status ${String(document.document_type).includes("agenda") ? "info" : String(document.document_type).includes("application") ? "warn" : ""}">${document.document_type || "source"}</span>
        <a class="link" href="${document.url}" target="_blank" rel="noopener noreferrer">Open details ↗</a>
      </div>
    </article>
  `).join("");
}

function developmentPage() {
  const watch = state.developmentWatch || developmentWatchFallback();
  const meetings = filterRows(watch.meetings || [], ["title", "board", "location", "status"]);
  const watchItems = filterRows([...(watch.watch_items || []), ...(state.developments || [])], ["name", "address", "project_type", "board", "status"]);
  const sourceRows = watch.boards?.length ? watch.boards : developmentWatchFallback().boards;
  return h`
    <div class="page-head">
      <div class="headline">
        <div class="sun-card">▥</div>
        <div>
          <h1>Development Watchdog</h1>
          <p class="muted">Planning Board and Zoning Board agendas, applications, notices, minutes, and redevelopment signals.</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="secondary" data-sync-development>Sync Board Sources</button>
        <button class="primary" data-open-modal="note">Create Follow-up</button>
      </div>
    </div>
    <section class="cards">
      ${metric(watch.meeting_count || meetings.length, "Board Meetings", "From official sources", "blue")}
      ${metric(watch.watch_count || watchItems.length, "Watch Items", "Applications & notices", "purple")}
      ${metric(boardDocumentRows(watch.meetings || []).includes("mini-card") ? (watch.meetings || []).reduce((sum, row) => sum + (row.documents || []).length, 0) : 0, "Linked Records", "Clickable details", "cyan")}
      ${metric(sourceRows.length, "Sources", "Planning + zoning", "orange")}
    </section>
    ${developmentMapPanel()}
    <section class="grid dashboard-grid">
      <section class="panel">
        <div class="panel-header"><h2>Official Board Sources</h2><span class="muted">Last sync: ${watch.fetched_at ? formatShortDate(watch.fetched_at) : "Not synced"}</span></div>
        <div class="panel-body list-stack">
          ${sourceRows.map((source) => h`
            <article class="mini-card">
              <div>
                <strong>${source.board}</strong>
                <p class="muted">${source.meeting_count || 0} meetings · ${source.watch_count || 0} watch records</p>
              </div>
              <a class="link" href="${source.source_url}" target="_blank" rel="noopener noreferrer">Open source ↗</a>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Development Watch Items</h2><button class="link" data-open-modal="note">Add note</button></div>
        <div class="panel-body list-stack">
          ${watchItems.slice(0, 20).map((item) => h`
            <article class="mini-card">
              <div>
                <strong>${item.name}</strong>
                <p class="muted">${item.address || "Address not listed"} · ${item.board || "Board source"} · ${titleCase(item.project_type || "tracking")}</p>
              </div>
              <div class="stack-right">
                <span class="status ${String(item.project_type).includes("application") ? "warn" : "info"}">${item.status || "tracking"}</span>
                ${item.source_url ? `<a class="link" href="${item.source_url}" target="_blank" rel="noopener noreferrer">Open record ↗</a>` : ""}
              </div>
            </article>
          `).join("") || `<div class="empty">No development watch items yet. Sync the board sources to pull official records.</div>`}
        </div>
      </section>
    </section>
    <section class="grid dashboard-grid">
      <section class="panel">
        <div class="panel-header"><h2>Board Meetings</h2><span class="muted">${meetings.length} itemized</span></div>
        <div class="panel-body list-stack">
          ${meetings.slice(0, 30).map((meeting) => h`
            <article class="mini-card">
              <div>
                <strong>${meeting.title}</strong>
                <p class="muted">${meeting.board} · ${meeting.date || "Date pending"} · ${(meeting.documents || []).length} linked records</p>
              </div>
              <div class="stack-right">
                <span class="status ${meeting.status === "posted" ? "good" : ""}">${meeting.status}</span>
                <a class="link" href="${meeting.source_url}" target="_blank" rel="noopener noreferrer">Open board page ↗</a>
              </div>
            </article>
          `).join("") || `<div class="empty">No board meetings collected yet.</div>`}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Agendas & Records</h2><span class="muted">Open in a new tab</span></div>
        <div class="panel-body list-stack">
          ${boardDocumentRows(watch.meetings || [])}
        </div>
      </section>
    </section>
  `;
}

function briefingPage() {
  const actions = [
    "Follow up with DPW on tree requests",
    "Prepare talking points for 622 S. Center St",
    "Review Public Works budget overage",
    "Visit Central Ave streetlight issue",
    "Draft Ward Report - May edition",
  ];
  return h`
    <div class="page-head">
      <div class="headline">
        <div class="sun-card">☼</div>
        <div>
          <h1>Daily Briefing</h1>
          <p class="muted">${officeDateLine(true)} · <span class="green">Generated</span></p>
        </div>
      </div>
      <div class="header-actions">
        <button class="secondary" data-open-draft="Briefing Share Draft">Share Draft</button>
        <button class="secondary" data-open-draft="Export Briefing Packet">Export PDF</button>
        <button class="primary" id="markAllRead">Mark All Read</button>
      </div>
    </div>
    ${metricCards()}
    <section class="grid briefing-grid" style="margin-top:16px">
      ${priorityList()}
      <section class="panel">
        <div class="panel-header"><h2>AI Summary</h2><small class="muted">Generated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></div>
        <div class="panel-body ai-summary">
          <div>
            <p><strong>${state.priorityIssues.length}</strong> priority items, <strong>${state.meetings.length}</strong> scheduled meetings, and <strong>${state.developments.length}</strong> development projects are currently tracked in WardOS.</p>
            <div class="check-list">
              <span><span class="green">✓</span> Review new document intake folders</span>
              <span><span class="green">✓</span> Check open constituent needs</span>
              <span><span class="green">✓</span> Review pending legislation and budget watch items</span>
              <span><span class="green">✓</span> Confirm source connections before publishing summaries</span>
            </div>
          </div>
          <div class="summary-photo"></div>
        </div>
      </section>
    </section>
    <section class="grid dashboard-grid" style="margin-top:16px">
      ${meetingsPanel()}
      ${legislationPanel(false)}
      ${budgetPanel()}
    </section>
    <section class="grid wide-right" style="margin-top:16px">
      ${mediaPanel(false)}
      <section class="panel">
        <div class="panel-header"><h2>AI Recommended Actions</h2><button class="link" data-open-modal="quick">Add</button></div>
        <div class="panel-body check-list">
          ${actions.map((action) => h`
            <label><input type="checkbox" data-action="${action}" ${state.completedActions.includes(action) ? "checked" : ""}> ${action}</label>
          `).join("")}
        </div>
      </section>
    </section>
  `;
}

function homePage() {
  const greeting = timeGreeting();
  const weather = state.weather || weatherFallback();
  return h`
    <div class="page-head">
      <div class="headline">
        <section class="weather-widget" aria-label="Orange weather">
          <div class="weather-symbol">${weather.symbol || greeting.icon}</div>
          <div class="weather-now">
            <strong>${weather.temperature ?? "--"}°</strong>
            <span>${weather.condition || "Weather"}</span>
          </div>
          <div class="weather-range">
            <span>H ${weather.high ?? "--"}°</span>
            <span>L ${weather.low ?? "--"}°</span>
            <span>${weatherUpdatedLabel(weather)}</span>
          </div>
        </section>
        <div>
          <h1>${greeting.text}, Councilman Ward</h1>
          <p class="muted">${officeDateLine(true)}</p>
        </div>
      </div>
    </div>
    ${metricCards()}
    <section class="grid dashboard-grid" style="margin-top:16px">
      ${priorityList()}
      ${mapPanel()}
      ${meetingsPanel()}
    </section>
    <section class="grid two-col" style="margin-top:16px">
      ${budgetPanel()}
      ${developmentPanel()}
    </section>
  `;
}

function dashboardPage() {
  return h`
    <div class="page-head">
      <div><h1>Operations Dashboard</h1><p class="muted">Live overview of office intake, field issues, meetings, media, and budget watch.</p></div>
      <button class="primary" data-open-modal="quick">Manual Add</button>
    </div>
    ${metricCards()}
    <section class="grid dashboard-grid" style="margin-top:16px">
      ${priorityList()}
      ${mapPanel("Issue Heat Map")}
      ${meetingsPanel()}
    </section>
    <section class="grid two-col" style="margin-top:16px">
      ${budgetPanel()}
      ${developmentPanel()}
    </section>
  `;
}

function constituentsPage() {
  const tabs = [["cases", "Cases"], ["directory", "Directory"]];
  return h`
    <div class="page-head">
      <div><h1>Constituent Cases</h1><p class="muted">Track, manage, and resolve constituent issues across the ward.</p></div>
      <button class="primary" data-open-modal="case">＋ New Case</button>
    </div>
    <div class="tabs">${tabs.map(([key, label]) => `<button class="tab ${state.tab === key ? "active" : ""}" data-tab="${key}">${label}</button>`).join("")}</div>
    ${state.tab === "directory" ? directoryTabView() : casesTabView()}
  `;
}

function filteredCases() {
  const keys = ["constituent_name", "address_line", "phone", "email", "topic", "notes", "status", "priority", "category", "department", "assigned_to", "case_number"];
  let rows = filterRows(state.cases, keys);
  const f = state.caseFilters;
  if (f.status !== "all") rows = rows.filter((row) => row.status === f.status);
  if (f.category !== "all") rows = rows.filter((row) => row.category === f.category);
  if (f.priority !== "all") rows = rows.filter((row) => row.priority === f.priority);
  if (f.department !== "all") rows = rows.filter((row) => row.department === f.department);
  if (f.ward !== "all") rows = rows.filter((row) => row.ward === f.ward);
  return [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function caseStatCards() {
  const summary = state.caseSummary || {};
  return h`
    <section class="grid metrics case-stat-grid">
      ${metric(summary.total ?? state.cases.length, "Total Cases", "All time", "blue")}
      ${metric(summary.open ?? 0, "Open Cases", "Needs action", "orange")}
      ${metric(summary.in_progress ?? 0, "In Progress", "Being worked", "purple")}
      ${metric(summary.resolved_30d ?? 0, "Resolved (30 Days)", "Closed out", "green")}
      ${metric(summary.overdue ?? 0, "Overdue", "Past due date", "red")}
      ${metric(summary.avg_resolution_days != null ? `${summary.avg_resolution_days}d` : "—", "Avg Resolution Time", "Closed cases", "cyan")}
    </section>
  `;
}

function caseFilterBar() {
  const f = state.caseFilters;
  const selectField = (key, label, options) => h`
    <div class="field compact">
      <label>${label}</label>
      <select data-case-filter="${key}">
        <option value="all" ${f[key] === "all" ? "selected" : ""}>All ${label}</option>
        ${options.map((opt) => `<option value="${opt}" ${f[key] === opt ? "selected" : ""}>${opt}</option>`).join("")}
      </select>
    </div>
  `;
  return h`
    <div class="case-filter-bar">
      ${selectField("status", "Status", CASE_STATUSES)}
      ${selectField("category", "Category", CASE_CATEGORIES)}
      ${selectField("priority", "Priority", CASE_PRIORITIES)}
      ${selectField("department", "Department", CASE_DEPARTMENTS)}
      ${selectField("ward", "Ward", CASE_WARDS)}
    </div>
  `;
}

function caseListItem(row) {
  const active = String(state.selectedCaseId) === String(row.id);
  return h`
    <div class="case-list-row ${active ? "active" : ""}">
      <button class="case-list-main-btn" data-select-case="${row.id}">
        <span class="case-list-main">
          <span class="case-number muted">${row.case_number || `#${row.id}`}</span>
          <strong>${row.topic}</strong>
          <small class="muted">${row.constituent_name}${row.address_line ? ` · ${row.address_line}` : ""}</small>
          ${categoryBadge(row.category)}
        </span>
      </button>
      <span class="case-list-meta">
        <span class="status ${casePriorityTone(row.priority)}">${row.priority}</span>
        <select class="case-list-status" data-case-list-status="${row.id}">
          ${CASE_STATUSES.map((s) => `<option value="${s}" ${row.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        ${row.assigned_to ? `<span class="avatar-chip" title="${row.assigned_to}">${initials(row.assigned_to)}</span>` : ""}
      </span>
    </div>
  `;
}

function caseListPanel(rows) {
  return h`
    <section class="panel case-list-panel">
      <div class="panel-header"><h2>Cases</h2><span class="muted">${rows.length} of ${state.cases.length}</span></div>
      ${caseFilterBar()}
      <div class="case-list-body">
        ${rows.length ? rows.map(caseListItem).join("") : `<div class="empty">No cases match this search.</div>`}
      </div>
    </section>
  `;
}

function slaPercent(row) {
  if (!row.due_at || !row.created_at) return 0;
  const start = new Date(row.created_at).getTime();
  const due = new Date(row.due_at).getTime();
  if (due <= start) return 100;
  return Math.max(0, Math.min(100, Math.round(((Date.now() - start) / (due - start)) * 100)));
}

function slaTone(row) {
  if (row.status === "resolved" || row.status === "closed") return "good";
  const pct = slaPercent(row);
  if (pct >= 100) return "hot";
  if (pct >= 70) return "warn";
  return "good";
}

function linkedCasesCard(rows = []) {
  return h`
    <section class="mini-panel">
      <div class="panel-header"><h3>Linked Cases</h3><span class="muted">${rows.length}</span></div>
      ${rows.length ? rows.map((row) => `
        <button class="list-row ghost" data-select-case="${row.id}">
          <span><strong>${row.topic}</strong><br><small class="muted">${row.case_number} · ${row.status}</small></span>
          <span></span><span class="status ${casePriorityTone(row.priority)}">${row.priority}</span>
        </button>
      `).join("") : `<div class="empty small">No other cases linked to this resident or address.</div>`}
    </section>
  `;
}

function caseOverviewTab(detail) {
  const row = detail.case;
  const created = row.created_at ? formatShortDate(row.created_at) : "Not set";
  const due = row.due_at ? formatShortDate(row.due_at) : "Not set";
  const hasCoords = row.latitude && row.longitude;
  return h`
    <div class="case-overview">
      <p>${row.notes || "No description provided."}</p>
      <div class="case-detail-grid">
        <div><small class="muted">Category</small><br>${categoryBadge(row.category)}</div>
        <div><small class="muted">Department</small><br>${row.department || "Unassigned"}</div>
        <div><small class="muted">Ward</small><br>${row.ward}</div>
        <div><small class="muted">Source</small><br>${row.source}</div>
        <div><small class="muted">Reported</small><br>${created}</div>
        <div><small class="muted">Due Date</small><br>${due}</div>
      </div>

      <section class="mini-panel">
        <div class="panel-header"><h3>AI Case Summary</h3><button class="link" data-regenerate-summary="${row.id}">Regenerate Summary</button></div>
        <p class="muted">${row.ai_summary || "No AI summary yet. Click Regenerate Summary to generate one from the local Ollama model."}</p>
      </section>

      <section class="mini-panel">
        <div class="panel-header"><h3>Location</h3>${row.address_line ? `<span class="muted">${row.address_line}</span>` : ""}</div>
        ${hasCoords ? `<div class="map osm-map case-osm-map" data-map-kind="case" data-lat="${row.latitude}" data-lng="${row.longitude}"></div>` : `<div class="empty small">No coordinates on file for this case yet.</div>`}
      </section>

      <section class="mini-panel">
        <div class="panel-header"><h3>Case Details</h3></div>
        <div class="case-quick-edit">
          <div class="field compact"><label>Status</label>
            <select data-case-quick-update="status">${CASE_STATUSES.map((s) => `<option value="${s}" ${row.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          </div>
          <div class="field compact"><label>Priority</label>
            <select data-case-quick-update="priority">${CASE_PRIORITIES.map((p) => `<option value="${p}" ${row.priority === p ? "selected" : ""}>${p}</option>`).join("")}</select>
          </div>
          <div class="field compact"><label>Assigned To</label>
            <input data-case-quick-update="assigned_to" value="${row.assigned_to || ""}" placeholder="Unassigned">
          </div>
        </div>
        ${row.due_at ? `<div class="sla-bar"><div class="sla-bar-fill ${slaTone(row)}" style="width:${slaPercent(row)}%"></div></div><small class="muted">Resolution goal: ${due}</small>` : ""}
      </section>

      <section class="mini-panel">
        <div class="panel-header"><h3>Linked Constituent</h3></div>
        ${row.matched_constituent_id ? `
          <div class="list-row">
            <span><strong>${row.constituent_name}</strong><br><small class="muted">${row.phone || "No phone"} · ${row.address_line || "No address"}</small></span>
            <span></span>
            <button class="link" data-view-directory="${row.constituent_name}">View Profile</button>
          </div>
        ` : `<div class="empty small">No matching voter record found for ${row.constituent_name}.</div>`}
      </section>

      ${linkedCasesCard(detail.linked_cases)}

      <section class="mini-panel">
        <div class="panel-header"><h3>Quick Actions</h3></div>
        <div class="button-row">
          <button class="secondary" data-case-detail-tab="notes">Add Note</button>
          <button class="secondary" data-case-detail-tab="communications">Log Communication</button>
          <button class="secondary" data-case-detail-tab="files">Upload File</button>
          <button class="primary" data-convert-work-order="${row.id}">Convert to Work Order</button>
          <button class="secondary danger" data-delete-case="${row.id}">Delete Case</button>
        </div>
      </section>
    </div>
  `;
}

function activityLabel(action) {
  const labels = {
    create: "Case created",
    update: "Case updated",
    note_added: "Note added",
    note_edited: "Note edited",
    communication_logged: "Communication logged",
    file_uploaded: "File uploaded",
    converted_to_work_order: "Converted to work order",
    ai_summary_generated: "AI summary generated",
    delete: "Case deleted",
  };
  return labels[action] || action;
}

function caseActivityTab(detail) {
  const rows = detail.activity || [];
  return h`
    <div class="list">
      ${rows.length ? rows.map((row) => `
        <div class="list-row">
          <span><strong>${activityLabel(row.action)}</strong><br><small class="muted">${row.detail || ""}</small></span>
          <span></span>
          <span><small class="muted">${row.actor}</small><br><small class="muted">${formatShortDate(row.created_at)}</small></span>
        </div>
      `).join("") : `<div class="empty">No activity recorded yet.</div>`}
    </div>
  `;
}

function caseNotesTab(detail) {
  return h`
    <form class="form-grid inline-form" id="caseNoteForm">
      <div class="field"><label>Add Note</label><textarea name="body" required placeholder="Add context, follow-up detail, or an internal update"></textarea></div>
      <button class="primary" type="submit">Save Note</button>
    </form>
    <div class="list">
      ${detail.notes.length ? detail.notes.map((note) => {
        if (String(state.editingNoteId) === String(note.id)) {
          return h`
            <form class="list-row edit-note-form" data-edit-note-form="${note.id}">
              <textarea name="body" required>${note.body}</textarea>
              <div class="button-row">
                <button class="primary" type="submit">Save</button>
                <button class="secondary" type="button" data-cancel-edit-note>Cancel</button>
              </div>
            </form>
          `;
        }
        return h`
          <div class="list-row">
            <span>${note.body}${note.edited_at ? ` <small class="muted">(edited)</small>` : ""}</span><span></span>
            <span><small class="muted">${note.author}</small><br><small class="muted">${formatShortDate(note.created_at)}</small><br><button class="link" data-edit-note="${note.id}">Edit</button></span>
          </div>
        `;
      }).join("") : `<div class="empty">No notes yet.</div>`}
    </div>
  `;
}

function caseCommunicationsTab(detail) {
  return h`
    <form class="form-grid inline-form" id="caseCommunicationForm">
      <div class="field"><label>Channel</label><select name="channel"><option value="phone">Phone</option><option value="email">Email</option><option value="text">Text</option><option value="in_person">In Person</option><option value="other">Other</option></select></div>
      <div class="field"><label>Direction</label><select name="direction"><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select></div>
      <div class="field"><label>Summary</label><textarea name="summary" required placeholder="What was discussed"></textarea></div>
      <button class="primary" type="submit">Log Communication</button>
    </form>
    <div class="list">
      ${detail.communications.length ? detail.communications.map((row) => `
        <div class="list-row">
          <span><strong>${row.channel} · ${row.direction}</strong><br><small class="muted">${row.summary}</small></span><span></span>
          <span><small class="muted">${row.author}</small><br><small class="muted">${formatShortDate(row.created_at)}</small></span>
        </div>
      `).join("") : `<div class="empty">No communications logged yet.</div>`}
    </div>
  `;
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function caseFilesTab(detail) {
  return h`
    <form class="form-grid inline-form" id="caseFileForm">
      <div class="field"><label>Upload File</label><input type="file" name="file" required accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"></div>
      <button class="primary" type="submit">Upload</button>
    </form>
    <div class="file-list">
      ${detail.attachments.length ? detail.attachments.map((row) => `
        <a class="file-chip" href="${API_BASE}${row.download_url}" target="_blank" rel="noopener noreferrer">
          <span class="file-chip-name">${row.original_name}</span>
          <small class="muted">${formatFileSize(row.size_bytes)} · ${formatShortDate(row.created_at)}</small>
        </a>
      `).join("") : `<div class="empty">No files attached yet.</div>`}
    </div>
  `;
}

function caseDrawer() {
  const detail = state.caseDetail;
  if (!detail || !detail.case) {
    return h`
      <aside class="case-drawer empty-drawer" aria-label="Case detail panel">
        <div class="empty">Select a case from the list, or create a new one to see details here.</div>
      </aside>
    `;
  }
  const row = detail.case;
  const subTabs = ["overview", "activity", "notes", "communications", "files"];
  const tabLabel = {
    overview: "Overview",
    activity: "Activity",
    notes: `Notes (${detail.notes.length})`,
    communications: `Communications (${detail.communications.length})`,
    files: `Files (${detail.attachments.length})`,
  };
  const bodies = {
    overview: caseOverviewTab,
    activity: caseActivityTab,
    notes: caseNotesTab,
    communications: caseCommunicationsTab,
    files: caseFilesTab,
  };
  const renderBody = bodies[state.caseDetailTab] || caseOverviewTab;
  return h`
    <aside class="case-drawer" aria-label="Case detail panel">
      <div class="drawer-head">
        <div>
          <small class="eyebrow">${row.case_number}</small>
          <h2>${row.topic}</h2>
          <div class="drawer-badges">
            <span class="status ${casePriorityTone(row.priority)}">${row.priority} priority</span>
            <span class="status ${caseStatusTone(row.status)}">${row.status}</span>
          </div>
        </div>
      </div>
      <div class="tabs case-drawer-tabs">${subTabs.map((tab) => `<button class="tab ${state.caseDetailTab === tab ? "active" : ""}" data-case-detail-tab="${tab}">${tabLabel[tab]}</button>`).join("")}</div>
      <div class="drawer-body">${renderBody(detail)}</div>
    </aside>
  `;
}

function casesTabView() {
  const rows = filteredCases();
  return h`
    ${caseStatCards()}
    <section class="case-board">
      ${caseListPanel(rows)}
      ${caseDrawer()}
    </section>
  `;
}

function constituentFileTabBody(file) {
  const tab = state.constituentFileTab || "cases";
  if (tab === "cases") {
    return file.cases.length ? `<div class="list">${file.cases.map((row) => `
      <button class="list-row ghost" data-select-case="${row.id}">
        <span><strong>${row.topic}</strong><br><small class="muted">${row.case_number} · ${row.category || "Uncategorized"} · ${row.constituent_name}</small></span>
        <span><span class="status ${casePriorityTone(row.priority)}">${row.priority}</span></span>
        <span class="status ${caseStatusTone(row.status)}">${row.status}</span>
      </button>
    `).join("")}</div>` : `<div class="empty">No cases on file for this household.</div>`;
  }
  if (tab === "notes") {
    return file.notes.length ? `<div class="list">${file.notes.map((note) => `
      <div class="list-row">
        <span>${note.body}${note.edited_at ? ` <small class="muted">(edited)</small>` : ""}<br><small class="muted">${note.case_number || `Case #${note.case_id}`} · ${note.case_topic || ""}</small></span>
        <span></span>
        <span><small class="muted">${note.author}</small><br><small class="muted">${formatShortDate(note.created_at)}</small></span>
      </div>
    `).join("")}</div>` : `<div class="empty">No notes yet.</div>`;
  }
  if (tab === "communications") {
    return file.communications.length ? `<div class="list">${file.communications.map((row) => `
      <div class="list-row">
        <span><strong>${row.channel} · ${row.direction}</strong><br><small class="muted">${row.summary}</small><br><small class="muted">${row.case_number || `Case #${row.case_id}`}</small></span>
        <span></span>
        <span><small class="muted">${row.author}</small><br><small class="muted">${formatShortDate(row.created_at)}</small></span>
      </div>
    `).join("")}</div>` : `<div class="empty">No communications logged yet.</div>`;
  }
  if (tab === "documents") {
    return file.attachments.length ? `<div class="file-list">${file.attachments.map((row) => `
      <a class="file-chip" href="${API_BASE}${row.download_url}" target="_blank" rel="noopener noreferrer">
        <span class="file-chip-name">${row.original_name}</span>
        <small class="muted">${formatFileSize(row.size_bytes)} · ${row.case_number || `Case #${row.case_id}`} · ${formatShortDate(row.created_at)}</small>
      </a>
    `).join("")}</div>` : `<div class="empty">No documents attached yet.</div>`;
  }
  return file.activity.length ? `<div class="list">${file.activity.map((row) => `
    <div class="list-row">
      <span><strong>${activityLabel(row.action)}</strong><br><small class="muted">${row.detail || ""}</small></span>
      <span></span>
      <span><small class="muted">${row.actor}</small><br><small class="muted">${formatShortDate(row.created_at)}</small></span>
    </div>
  `).join("")}</div>` : `<div class="empty">No history recorded yet.</div>`;
}

function constituentFileView(file) {
  if (!file || !file.primary) {
    return h`
      <section class="panel">
        <div class="panel-header"><h2>Constituent Not Found</h2><button class="ghost" data-close-constituent-file>× Back to Directory</button></div>
        <div class="panel-body"><div class="empty">No matching constituent record.</div></div>
      </section>
    `;
  }
  const primary = file.primary;
  const address = file.address || constituentAddress(primary);
  const others = file.residents.filter((row) => row.id !== primary.id);
  const subTabs = ["cases", "notes", "communications", "documents", "history"];
  const tabLabel = {
    cases: `Cases (${file.cases.length})`,
    notes: `Notes (${file.notes.length})`,
    communications: `Communications (${file.communications.length})`,
    documents: `Documents (${file.attachments.length})`,
    history: `History (${file.activity.length})`,
  };
  return h`
    <section class="panel">
      <div class="panel-header">
        <h2>${primary.full_name}</h2>
        <button class="ghost" data-close-constituent-file>× Back to Directory</button>
      </div>
      <div class="panel-body constituent-file-head">
        <div class="portrait-sm">${initials(primary.full_name)}</div>
        <div>
          <p class="muted">${address || "No address on file"}</p>
          <p class="muted">${primary.subgroup || "Registered voter"} · <span class="status ${primary.voter_status === "Active" ? "good" : "warn"}">${primary.voter_status || "Unknown"}</span> · ${primary.ward || "Unknown"} Ward</p>
        </div>
        <button class="primary" data-open-case-for='${JSON.stringify({ name: primary.full_name, address }).replace(/'/g, "&apos;")}'>＋ Add Case</button>
      </div>
      ${others.length ? h`
        <div class="panel-body">
          <strong>Other residents at this address</strong>
          <div class="list">
            ${others.map((row) => `
              <div class="list-row">
                <span><strong>${row.full_name}</strong><br><small class="muted">${row.subgroup || "Registered voter"} · ${row.voter_status || "Unknown"}</small></span>
                <span></span>
                <button class="link" data-open-constituent-file='${JSON.stringify({ constituentId: row.id }).replace(/'/g, "&apos;")}'>View File</button>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}
      <div class="tabs">${subTabs.map((tab) => `<button class="tab ${state.constituentFileTab === tab ? "active" : ""}" data-constituent-file-tab="${tab}">${tabLabel[tab]}</button>`).join("")}</div>
      <div class="panel-body">${constituentFileTabBody(file)}</div>
    </section>
  `;
}

function directoryTabView() {
  if (state.constituentFile) {
    return h`<section style="margin-top:16px">${constituentFileView(state.constituentFile)}</section>`;
  }
  const summary = state.constituentSummary || {};
  const constituentKeys = ["full_name", "street_no", "street", "apt", "city", "state", "zip", "zip_code", "ward", "voter_status", "subgroup", "voter_id"];
  const caseKeys = ["constituent_name", "address_line", "phone", "email", "topic", "notes", "status", "priority"];
  const localRows = filterRows(state.constituents, constituentKeys);
  const citywideRows = filterRows(state.constituentSearch || state.constituents, constituentKeys);
  const matchingCases = filterRows(state.cases, caseKeys);
  return h`
    <section class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <div class="panel-header"><h2>Constituent Directory</h2><span class="muted">${summary.total || state.constituents.length} residents on file</span></div>
        <div class="panel-body timeline">
          <div class="grid metrics compact-metrics">
            ${metric((summary.by_ward || {}).South || state.constituents.length, "South Ward", "Local constituents", "blue")}
            ${metric(summary.total || (state.constituentSearch || []).length, "Citywide", "Searchable voters", "green")}
            ${metric(summary.outstanding || 0, "Outstanding Ballots", "May 2026 mail-in", "orange")}
          </div>
          <div class="panel-note">Search a name or address using the global search above to cross-reference residents with open cases, then start a case directly from a match.</div>
          ${constituentCrossReference(citywideRows, matchingCases)}
          ${constituentRows(state.search.trim() ? citywideRows : localRows)}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Recent Notes</h2><button class="link" data-open-modal="note">Add</button></div>
        <div class="panel-body list">
          ${state.drafts.slice(-5).reverse().map((draft) => `<div class="list-row"><span><strong>${draft.title}</strong><br><small class="muted">${String(draft.notes || draft.body || "").slice(0, 80)}</small></span><span></span><span></span></div>`).join("") || "<p class='muted'>No shared notes yet.</p>"}
        </div>
      </section>
    </section>
  `;
}

function initials(name) {
  return String(name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";
}

function constituentAddress(row) {
  if (!row) return "";
  return [row.street_no, row.street, row.apt ? `Apt ${row.apt}` : "", row.city, row.state, row.zip].filter(Boolean).join(" ");
}

function constituentDatalists() {
  const byName = new Map();
  const byAddress = new Map();
  (state.constituentSearch || state.constituents || []).forEach((row) => {
    if (row.full_name && !byName.has(row.full_name)) byName.set(row.full_name, row);
    const address = constituentAddress(row);
    if (address && !byAddress.has(address)) byAddress.set(address, row);
  });
  return h`
    <datalist id="constituentNameOptions">
      ${Array.from(byName.values()).slice(0, 500).map((row) => `<option value="${row.full_name}" data-address="${constituentAddress(row)}"></option>`).join("")}
    </datalist>
    <datalist id="constituentAddressOptions">
      ${Array.from(byAddress.values()).slice(0, 500).map((row) => `<option value="${constituentAddress(row)}" data-name="${row.full_name}"></option>`).join("")}
    </datalist>
  `;
}

function constituentCrossReference(constituents, cases) {
  if (!state.search.trim()) {
    return h`
      <div class="panel-note">
        Use the global search for names, addresses, streets, phone, email, case notes, and issue topics. Matches will stay on this page for fast cross-reference.
      </div>
    `;
  }
  return h`
    <section class="mini-panel">
      <div class="panel-header"><h3>Search Cross-Reference</h3><span class="muted">${constituents.length} residents · ${cases.length} cases</span></div>
      <div class="grid two-col">
        <div class="list">
          <strong>Matching residents</strong>
          ${constituents.slice(0, 5).map((row) => `
            <div class="list-row">
              <span><strong>${row.full_name}</strong><br><small class="muted">${row.street_no || ""} ${row.street || ""}${row.apt ? ` Apt ${row.apt}` : ""} · ${row.voter_status || "status pending"}</small></span>
              <span></span><span class="status info">${row.ward || "Ward"}</span>
            </div>
          `).join("") || `<div class="empty small">No resident matches.</div>`}
        </div>
        <div class="list">
          <strong>Matching needs</strong>
          ${cases.slice(0, 5).map((row) => `
            <div class="list-row">
              <span><strong>${row.topic || "Constituent need"}</strong><br><small class="muted">${row.constituent_name || "Unknown"}${row.address_line ? ` · ${row.address_line}` : ""}</small></span>
              <span></span><span class="status ${row.priority === "high" ? "hot" : "warn"}">${row.status || "open"}</span>
            </div>
          `).join("") || `<div class="empty small">No case matches.</div>`}
        </div>
      </div>
    </section>
  `;
}

function caseRows(rows = null) {
  rows = rows || filterRows(state.cases, ["constituent_name", "address_line", "phone", "email", "topic", "notes", "status", "priority"]);
  if (!rows.length) return `<div class="empty">No cases match this search.</div>`;
  return rows.map((row) => {
    const ward = row.matched_constituent_ward || "";
    const wardBadge = ward
      ? `<br><span class="status ${row.outside_local_ward ? "warn" : "info"}">${row.outside_local_ward ? `${ward} Ward · outside South` : "South Ward"}</span>`
      : "";
    return h`
      <div class="list-row">
        <span><small class="muted">#${row.id}</small><br><strong>${row.topic}</strong><br><small class="muted">${row.constituent_name}${row.address_line ? ` · ${row.address_line}` : ""}${row.phone ? ` · ${row.phone}` : ""}${row.email ? ` · ${row.email}` : ""}</small>${wardBadge}</span>
        <span><small class="muted">Priority</small><br><span class="status ${row.priority === "high" ? "hot" : "warn"}">${row.priority}</span></span>
        <span class="status">${row.status}</span>
      </div>
    `;
  }).join("");
}

function constituentRows(rows) {
  if (!rows.length) return `<div class="empty">No constituents match this search.</div>`;
  const shown = rows.slice(0, 300);
  const remainder = rows.length - shown.length;
  return h`
    <div class="directory-list-body">
      ${shown.map((row) => {
        const address = constituentAddress(row);
        const caseCount = state.cases.filter((item) => item.constituent_name === row.full_name).length;
        return h`
          <button class="list-row ghost" data-open-constituent-file='${JSON.stringify({ constituentId: row.id }).replace(/'/g, "&apos;")}' style="text-align:left;width:100%">
            <span><small class="muted">${row.voter_id}</small><br><strong>${row.full_name}</strong><br><small class="muted">${row.street_no} ${row.street}${row.apt ? ` Apt ${row.apt}` : ""}</small></span>
            <span><small class="muted">Ward</small><br>${row.ward || "Unknown"}<br><small class="muted">${caseCount ? `${caseCount} case${caseCount > 1 ? "s" : ""} on file` : "No cases on file"}</small></span>
            <span class="case-row-actions">
              <span class="status ${String(row.ward || "").toLowerCase() === "south" ? "good" : "warn"}">${String(row.ward || "").toLowerCase() === "south" ? "Local" : `${row.ward || "Other"} Ward`}</span>
              <span class="link" data-open-case-for='${JSON.stringify({ name: row.full_name, address }).replace(/'/g, "&apos;")}'>New Case</span>
            </span>
          </button>
        `;
      }).join("")}
    </div>
    ${remainder > 0 ? `<div class="panel-note">${remainder} more match this search. Narrow your search to see them.</div>` : ""}
  `;
}

function legislationPanel(full = true) {
  const githubRows = (state.githubLegislation?.items || []).map((item) => ({
    bill_number: item.id || `#${item.priority || ""}`,
    title: item.title,
    status: item.status,
    notes: item.nextStep || item.lastUpdate || item.description || "",
    progress: item.progress,
  }));
  const rows = filterRows(full ? [...githubRows, ...state.legislation] : githubRows.slice(0, 4), ["bill_number", "title", "status", "notes"]);
  return h`
    <section class="panel">
      <div class="panel-header"><h2>${full ? "Legislation Tracker" : "Pending Legislation"}</h2>${full ? `<button class="primary" data-open-modal="legislation">Add Legislation</button>` : `<button class="link" data-page="legislation">View all</button>`}</div>
      <div class="panel-body list">
        ${rows.map((row) => h`
          <div class="list-row">
            <span><strong>${row.bill_number}</strong><br><small class="muted">${row.title}</small></span>
            <span class="muted">${row.progress !== undefined ? `${row.progress}% · ` : ""}${row.notes || "Review source documents"}</span>
            <span class="status ${String(row.status).toLowerCase().includes("adopt") ? "good" : String(row.status).toLowerCase().includes("vote") ? "warn" : ""}">${row.status}</span>
          </div>
        `).join("") || `<div class="empty">No legislation matches this search.</div>`}
      </div>
    </section>
  `;
}

const legislativeInitiativeTemplates = [
  { id: "initiative-term-limits", title: "Term Limits Ordinance", type: "Ordinance", status: "Research", committee: "Governance", introduced: "Drafting", nextAction: "Prepare legal memo", support: 62, impact: "High", topic: "Transparency" },
  { id: "initiative-election-reform", title: "Election Reform", type: "Ordinance", status: "Research", committee: "Governance", introduced: "Drafting", nextAction: "Review state constraints", support: 58, impact: "High", topic: "Democracy" },
  { id: "initiative-public-comment", title: "5 Minute Public Comment Restoration", type: "Resolution", status: "Ready for Review", committee: "Council Rules", introduced: "Draft", nextAction: "Build sponsor support", support: 76, impact: "High", topic: "Public Comment" },
  { id: "initiative-scotland-bid", title: "Scotland Road BID", type: "Ordinance", status: "In Committee", committee: "Economic Development", introduced: "Concept", nextAction: "Meet business owners", support: 54, impact: "Medium", topic: "Economic Development" },
  { id: "initiative-parking-reform", title: "Parking Reform", type: "Ordinance", status: "In Review", committee: "Public Safety", introduced: "Concept", nextAction: "Request traffic data", support: 68, impact: "High", topic: "Traffic & Parking" },
  { id: "initiative-transparency-dashboard", title: "Transparency Dashboard Initiatives", type: "Resolution", status: "In Progress", committee: "Technology", introduced: "Draft", nextAction: "Define data sources", support: 82, impact: "High", topic: "Transparency" },
  { id: "initiative-tree-canopy", title: "Tree Canopy Program", type: "Ordinance", status: "Research", committee: "Public Works", introduced: "Drafting", nextAction: "Map tree requests", support: 73, impact: "Medium", topic: "Trees" },
  { id: "initiative-budget-accountability", title: "Budget Accountability Measures", type: "Resolution", status: "In Review", committee: "Finance", introduced: "Draft", nextAction: "Build fiscal dashboard", support: 71, impact: "High", topic: "Budget" },
];

const councilMembers = ["Ward", "Timberlake", "Cruz", "Alves", "Green", "Davis", "Warren"];
const voteMatrixRows = [
  ["Budget Accountability Measures", ["Yes", "Yes", "Yes", "Yes", "No", "Yes", "Yes"]],
  ["Parking Reform", ["Yes", "Yes", "Abstain", "Yes", "Yes", "No", "Yes"]],
  ["Tree Canopy Program", ["Yes", "No", "No", "Yes", "No", "Yes", "No"]],
  ["Public Comment Restoration", ["Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes"]],
];

const legislationSponsors = [
  { name: "James Ward", role: "Primary sponsor", alignment: 100, focus: "South Ward accountability, public comment, transparency", items: ["Public Comment Restoration", "Budget Accountability Measures", "Transparency Dashboard Initiatives"] },
  { name: "Brittnee Timberlake", role: "Council sponsor", alignment: 78, focus: "Community development, education, constituent services", items: ["Tree Canopy Program", "Parking Reform"] },
  { name: "Carlos Cruz", role: "Potential co-sponsor", alignment: 58, focus: "Planning, parking, zoning review", items: ["Parking Reform", "Scotland Road BID"] },
  { name: "Mike Alves", role: "Frequent yes vote", alignment: 84, focus: "Public works, recreation, infrastructure", items: ["Tree Canopy Program", "Budget Accountability Measures"] },
  { name: "Ted Green", role: "Needs briefing", alignment: 44, focus: "Fiscal review, mayoral coordination", items: ["Budget Accountability Measures"] },
  { name: "Alfred Davis", role: "Swing vote", alignment: 63, focus: "Finance, public safety, implementation details", items: ["Parking Reform", "Tree Canopy Program"] },
  { name: "Mayor Warren", role: "Administration", alignment: 68, focus: "Department execution and agenda movement", items: ["Budget Accountability Measures", "Transparency Dashboard Initiatives"] },
];

const legislativeDepartments = [
  { name: "Planning & Zoning", queue: 12, owner: "Planning Board / Zoning Board", risk: "High", next: "Itemize agendas, development applications, and hearing outcomes" },
  { name: "Finance", queue: 8, owner: "CFO / Administration", risk: "High", next: "Attach fiscal notes and line-item impacts" },
  { name: "Public Works", queue: 9, owner: "DPW", risk: "Medium", next: "Connect road, tree, and infrastructure cases" },
  { name: "Public Safety", queue: 6, owner: "Police / Fire / OEM", risk: "Medium", next: "Link ordinances to monthly public safety briefing signals" },
  { name: "Recreation", queue: 4, owner: "Recreation Department", risk: "Low", next: "Track park, youth, and facility commitments" },
  { name: "Council Rules", queue: 3, owner: "Council Clerk", risk: "High", next: "Track public comment, meeting procedure, and record access reforms" },
];

const legislativeCalendar = [
  { date: "May 20, 2026", type: "Committee Hearing", title: "Tree Preservation Ordinance", body: "Planning & Zoning review, public comment expected.", status: "Prepare Questions" },
  { date: "May 21, 2026", type: "Council Vote", title: "South Ward Traffic Calming Program", body: "Vote readiness and sponsor count needed.", status: "Build Support" },
  { date: "May 22, 2026", type: "Finance Review", title: "Budget Accountability Measures", body: "Request fiscal note and implementation owner.", status: "Fiscal Note" },
  { date: "Jun 3, 2026", type: "Committee Hearing", title: "Public Comment Restoration", body: "Council rules discussion and resident testimony.", status: "Talking Points" },
];

function normalizedLegislationRows() {
  const githubRows = (state.githubLegislation?.items || []).map((item, index) => ({
    id: `github-${item.id || index}`,
    bill_number: item.id || item.bill_number || `GH-${index + 1}`,
    title: item.title,
    status: item.status || "Tracking",
    notes: item.nextStep || item.lastUpdate || item.description || "",
    progress: item.progress ?? 35,
    committee: item.committee || item.department || inferCommittee(item.title || ""),
    sponsor: item.sponsor || "Source pending",
    introduced: item.date || item.lastUpdate || "Source pending",
    nextAction: item.nextStep || "Review source item",
    support: item.support || Math.min(95, Math.max(35, item.progress || 55)),
    impact: inferImpact(item.title || item.description || ""),
    source: "GitHub",
    topic: inferTopic(item.title || item.description || ""),
  }));
  const localRows = state.legislation.map((item) => ({
    id: `local-${item.id}`,
    bill_number: item.bill_number,
    title: item.title,
    status: item.status,
    notes: item.notes || "",
    progress: statusProgress(item.status),
    committee: inferCommittee(`${item.title} ${item.notes}`),
    sponsor: "Manual entry",
    introduced: item.hearing_date || item.created_at || "Manual entry",
    nextAction: item.hearing_date ? "Prepare for hearing" : "Add hearing date",
    support: statusProgress(item.status),
    impact: inferImpact(`${item.title} ${item.notes}`),
    source: "Local",
    topic: inferTopic(`${item.title} ${item.notes}`),
  }));
  return filterRows([...githubRows, ...localRows], ["bill_number", "title", "status", "notes", "committee", "topic"]);
}

function statusProgress(status = "") {
  const value = String(status).toLowerCase();
  if (value.includes("pass") || value.includes("adopt") || value.includes("complete")) return 100;
  if (value.includes("vote") || value.includes("ready")) return 78;
  if (value.includes("review")) return 58;
  if (value.includes("committee")) return 42;
  if (value.includes("fail") || value.includes("withdraw")) return 20;
  return 32;
}

function inferCommittee(text) {
  const value = String(text).toLowerCase();
  if (value.includes("budget") || value.includes("tax") || value.includes("pilot")) return "Finance";
  if (value.includes("tree") || value.includes("road") || value.includes("traffic") || value.includes("parking")) return "Public Works";
  if (value.includes("development") || value.includes("zoning") || value.includes("planning")) return "Planning & Zoning";
  if (value.includes("safety") || value.includes("police")) return "Public Safety";
  if (value.includes("recreation") || value.includes("park")) return "Recreation";
  return "Council";
}

function inferTopic(text) {
  const value = String(text).toLowerCase();
  if (value.includes("budget") || value.includes("tax") || value.includes("pilot")) return "Budget";
  if (value.includes("tree")) return "Trees";
  if (value.includes("parking") || value.includes("traffic") || value.includes("road")) return "Traffic & Parking";
  if (value.includes("development") || value.includes("zoning") || value.includes("planning")) return "Development";
  if (value.includes("safety")) return "Public Safety";
  if (value.includes("comment")) return "Public Comment";
  return "General Government";
}

function inferImpact(text) {
  const value = String(text).toLowerCase();
  return value.includes("south") || value.includes("budget") || value.includes("development") || value.includes("traffic") ? "High" : "Medium";
}

function legislationMetrics(rows) {
  return {
    all: rows.length,
    inProgress: rows.filter((row) => !/pass|adopt|fail|withdraw|table/i.test(row.status)).length,
    passed: rows.filter((row) => /pass|adopt|complete/i.test(row.status)).length,
    failed: rows.filter((row) => /fail|withdraw/i.test(row.status)).length,
    tabled: rows.filter((row) => /table/i.test(row.status)).length,
    initiatives: legislativeInitiativeTemplates.length,
  };
}

function legislationPage() {
  const rows = normalizedLegislationRows();
  const metrics = legislationMetrics(rows);
  const detailRows = [...rows, ...legislativeInitiativeTemplates];
  const selected = detailRows.find((row) => row.id === state.selectedLegislationId) || rows[0] || legislativeInitiativeTemplates[0];
  state.selectedLegislationId = selected?.id || "";
  const activeTab = state.legislationTab || "overview";
  return h`
    <div class="page-head leg-head">
      <div class="headline">
        <div class="leg-icon">⚖</div>
        <div><h1>Legislation Tracker</h1><p class="muted">Track, analyze, and act on all City legislation.</p></div>
      </div>
      <div class="header-actions">
        <button class="secondary">Filters</button>
        <button class="primary" data-open-modal="legislation">New Legislation</button>
      </div>
    </div>
    <div class="leg-tabs">
      ${[
        ["overview", "Overview"],
        ["all", "All Legislation"],
        ["initiatives", "My Initiatives"],
        ["votes", "Votes"],
        ["sponsors", "Sponsors"],
        ["departments", "Departments"],
        ["calendar", "Calendar"],
        ["reports", "Reports"],
      ].map(([key, label]) => `<button class="${activeTab === key ? "active" : ""}" data-leg-tab="${key}">${label}</button>`).join("")}
      <span class="select-button">Date Range: Last 12 Months</span>
    </div>
    <section class="grid metrics leg-metrics">
      ${legMetric("Total Legislation", metrics.all, "Volume tracked across GitHub and local entries", "purple")}
      ${legMetric("In Progress", metrics.inProgress, "Moving through committee, review, or staff analysis", "blue")}
      ${legMetric("Passed", metrics.passed, "Adopted or completed items", "green")}
      ${legMetric("Failed / Withdrawn", metrics.failed, "Requires follow-up if priority remains", "red")}
      ${legMetric("Tabled", metrics.tabled, "Paused items that may return", "orange")}
      ${legMetric("My Initiatives", metrics.initiatives, "James Ward sponsored or championed ideas", "purple")}
    </section>
    ${legislationTabContent(activeTab, rows)}
    ${state.legislationDetailOpen ? legislationDetailDrawer(selected) : ""}
  `;
}

function legislationTabContent(tab, rows) {
  if (tab === "all") return allLegislationSection(rows);
  if (tab === "initiatives") return initiativesSection();
  if (tab === "votes") return votesSection(rows);
  if (tab === "sponsors") return sponsorsSection();
  if (tab === "departments") return departmentsSection(rows);
  if (tab === "calendar") return calendarSection(rows);
  if (tab === "reports") return reportsSection(rows);
  return h`
    <section class="leg-layout">
      <main class="leg-main">
        <section class="grid two-col">
          ${legislationPipeline(rows)}
          ${legislativeInsights(rows)}
        </section>
        ${myInitiativesPanel()}
        ${voteMatrixPanel()}
      </main>
      <aside class="leg-right">
        ${aiInsightsRail(rows)}
        ${recentLegislativeActivity(rows)}
        ${upcomingLegislativeActions(rows)}
      </aside>
    </section>
  `;
}

function allLegislationSection(rows) {
  const visibleRows = rows.length ? rows : legislativeInitiativeTemplates.map((item) => ({ ...item, bill_number: item.type, source: "Initiative", progress: item.support, notes: item.nextAction }));
  return h`
    <section class="leg-layout">
      <main class="leg-main">
        <section class="panel">
          <div class="panel-header">
            <h2>All Legislation</h2>
            <div class="inline-actions">
              <button class="secondary" data-open-draft="Legislation Filter">Filter</button>
              <button class="primary" data-open-modal="legislation">New Legislation</button>
            </div>
          </div>
          <div class="panel-body leg-table-wrap">
            <table class="leg-table">
              <thead><tr><th>ID</th><th>Title</th><th>Status</th><th>Committee</th><th>Sponsor</th><th>Next Action</th><th>Impact</th></tr></thead>
              <tbody>
                ${visibleRows.map((row) => `
                  <tr data-legislation-id="${row.id}">
                    <td><strong>${row.bill_number || row.type || "Draft"}</strong><small>${row.source || row.topic || "Tracked"}</small></td>
                    <td><strong>${row.title}</strong><small>${row.notes || row.topic || "No source note yet"}</small></td>
                    <td><span class="status ${statusClass(row.status)}">${row.status}</span></td>
                    <td>${row.committee || "Council"}</td>
                    <td>${row.sponsor || "James Ward / pending"}</td>
                    <td>${row.nextAction || "Assign next step"}</td>
                    <td><span class="status ${row.impact === "High" ? "hot" : "warn"}">${row.impact || "Medium"}</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <aside class="leg-right">
        ${legislationQuickActions("All Legislation")}
        ${recentLegislativeActivity(visibleRows)}
      </aside>
    </section>
  `;
}

function initiativesSection() {
  const grouped = legislativeInitiativeTemplates.reduce((acc, item) => {
    acc[item.status] = [...(acc[item.status] || []), item];
    return acc;
  }, {});
  return h`
    <section class="leg-layout">
      <main class="leg-main">
        <section class="panel">
          <div class="panel-header"><h2>Current Initiatives</h2><button class="primary" data-open-draft="New Ward Initiative">Add Initiative</button></div>
          <div class="panel-body initiative-board">
            ${["Research", "Ready for Review", "In Review", "In Committee", "In Progress"].map((status) => `
              <div class="initiative-column">
                <h3>${status}<small>${(grouped[status] || []).length}</small></h3>
                ${(grouped[status] || []).map((item) => `
                  <article class="initiative-card" data-legislation-id="${item.id}">
                    <strong>${item.title}</strong>
                    <small>${item.type} · ${item.committee}</small>
                    <p>${item.nextAction}</p>
                    <div><span class="status ${item.impact === "High" ? "hot" : "warn"}">${item.impact}</span><span>${item.support}% support</span></div>
                  </article>
                `).join("") || `<div class="empty small">No items</div>`}
              </div>
            `).join("")}
          </div>
        </section>
        ${myInitiativesPanel()}
      </main>
      <aside class="leg-right">
        ${legislationQuickActions("Initiatives")}
        ${aiInsightsRail(legislativeInitiativeTemplates)}
      </aside>
    </section>
  `;
}

function votesSection(rows) {
  const voteStats = councilMembers.map((member, index) => {
    const votes = voteMatrixRows.map(([, rowVotes]) => rowVotes[index]);
    const yes = votes.filter((vote) => vote === "Yes").length;
    const no = votes.filter((vote) => vote === "No").length;
    const abstain = votes.filter((vote) => vote === "Abstain").length;
    return { member, yes, no, abstain, alignment: Math.round((yes / Math.max(1, votes.length)) * 100) };
  });
  return h`
    <section class="leg-layout">
      <main class="leg-main">
        ${voteMatrixPanel()}
        <section class="panel">
          <div class="panel-header"><h2>Vote Alignment</h2><button class="link" data-open-draft="Vote Alignment Memo">Draft vote memo →</button></div>
          <div class="panel-body sponsor-grid">
            ${voteStats.map((item) => `
              <article class="sponsor-card">
                <strong>${item.member}</strong>
                <p>${item.yes} yes · ${item.no} no · ${item.abstain} abstain</p>
                <span class="support-bar wide"><i style="width:${item.alignment}%"></i></span>
                <small>${item.alignment}% yes alignment on recent tracked votes</small>
              </article>
            `).join("")}
          </div>
        </section>
      </main>
      <aside class="leg-right">
        ${legislationQuickActions("Votes")}
        ${upcomingLegislativeActions(rows)}
      </aside>
    </section>
  `;
}

function sponsorsSection() {
  return h`
    <section class="leg-layout">
      <main class="leg-main">
        <section class="panel">
          <div class="panel-header"><h2>Sponsors & Coalition Map</h2><button class="link" data-open-draft="Sponsor Outreach Plan">Create outreach plan →</button></div>
          <div class="panel-body sponsor-grid">
            ${legislationSponsors.map((sponsor) => `
              <article class="sponsor-card">
                <div class="sponsor-head">
                  <strong>${sponsor.name}</strong>
                  <span class="status ${sponsor.alignment >= 75 ? "good" : sponsor.alignment < 55 ? "hot" : "warn"}">${sponsor.alignment}%</span>
                </div>
                <p>${sponsor.role}</p>
                <small>${sponsor.focus}</small>
                <div class="tag-row">${sponsor.items.map((item) => `<span>${item}</span>`).join("")}</div>
              </article>
            `).join("")}
          </div>
        </section>
      </main>
      <aside class="leg-right">
        ${legislationQuickActions("Sponsors")}
        ${aiInsightsRail(legislativeInitiativeTemplates)}
      </aside>
    </section>
  `;
}

function departmentsSection(rows) {
  return h`
    <section class="leg-layout">
      <main class="leg-main">
        <section class="panel">
          <div class="panel-header"><h2>Department Ownership</h2><button class="link" data-open-draft="Department Follow-up Log">Open follow-up log →</button></div>
          <div class="panel-body department-list">
            ${legislativeDepartments.map((dept) => `
              <article class="department-card">
                <span class="rank ${dept.risk === "High" ? "red" : dept.risk === "Medium" ? "orange" : "green"}">${dept.queue}</span>
                <div>
                  <strong>${dept.name}</strong>
                  <p>${dept.owner}</p>
                  <small>${dept.next}</small>
                </div>
                <span class="status ${dept.risk === "High" ? "hot" : dept.risk === "Medium" ? "warn" : "good"}">${dept.risk}</span>
              </article>
            `).join("")}
          </div>
        </section>
      </main>
      <aside class="leg-right">
        ${legislationQuickActions("Departments")}
        ${recentLegislativeActivity(rows)}
      </aside>
    </section>
  `;
}

function calendarSection(rows) {
  return h`
    <section class="leg-layout">
      <main class="leg-main">
        <section class="panel">
          <div class="panel-header"><h2>Legislative Calendar</h2><button class="link" data-open-draft="Calendar Brief">Create calendar brief →</button></div>
          <div class="panel-body timeline-list">
            ${legislativeCalendar.map((item) => `
              <article class="calendar-card">
                <time>${item.date}</time>
                <div>
                  <strong>${item.title}</strong>
                  <p>${item.type} · ${item.body}</p>
                </div>
                <button class="secondary" data-open-draft="${item.status}: ${item.title}">${item.status}</button>
              </article>
            `).join("")}
          </div>
        </section>
      </main>
      <aside class="leg-right">
        ${upcomingLegislativeActions(rows)}
        ${legislationQuickActions("Calendar")}
      </aside>
    </section>
  `;
}

function reportsSection(rows) {
  return h`
    <section class="leg-layout">
      <main class="leg-main">
        <section class="panel">
          <div class="panel-header"><h2>Legislative Reports</h2><button class="primary" data-open-draft="Monthly Legislative Report">Generate Report</button></div>
          <div class="panel-body report-grid">
            ${[
              ["Monthly Legislative Brief", "Council-ready summary of new items, votes, sponsor movement, and South Ward impacts."],
              ["Sponsor Support Memo", "Who is aligned, persuadable, or needs a briefing before the next vote."],
              ["Department Accountability Report", "Open follow-ups by Planning, Finance, DPW, Public Safety, and Council Rules."],
              ["Resident Impact Digest", "Plain-language explanation of ordinances tied to cases, media, and development watch."],
            ].map(([title, copy]) => `
              <article class="report-card">
                <strong>${title}</strong>
                <p>${copy}</p>
                <button class="secondary" data-open-draft="${title}">Open Draft</button>
              </article>
            `).join("")}
          </div>
        </section>
      </main>
      <aside class="leg-right">
        ${legislationQuickActions("Reports")}
        ${legislativeInsights(rows)}
      </aside>
    </section>
  `;
}

function legislationQuickActions(context) {
  return h`
    <section class="panel">
      <div class="panel-header"><h2>${context} Actions</h2></div>
      <div class="panel-body quick-action-list">
        <button data-open-modal="legislation">Add legislation item</button>
        <button data-open-draft="${context} talking points">Draft talking points</button>
        <button data-open-draft="${context} follow-up questions">Create follow-up questions</button>
        <button data-open-draft="${context} resident summary">Write resident summary</button>
      </div>
    </section>
  `;
}

function statusClass(status = "") {
  const value = String(status).toLowerCase();
  if (value.includes("pass") || value.includes("adopt") || value.includes("complete")) return "good";
  if (value.includes("ready") || value.includes("vote")) return "warn";
  if (value.includes("fail") || value.includes("withdraw")) return "hot";
  return "";
}

function legMetric(label, value, detail, tone) {
  return h`
    <article class="metric leg-metric ${tone}">
      <span class="metric-icon">${tone === "green" ? "✓" : tone === "red" ? "×" : tone === "orange" ? "◷" : tone === "blue" ? "▤" : "✦"}</span>
      <strong>${value}</strong>
      <small>${label}</small>
      <span class="trend">↗ ${detail}</span>
    </article>
  `;
}

function legislationPipeline(rows) {
  const counts = [
    ["Introduced", rows.length + legislativeInitiativeTemplates.length],
    ["In Committee", rows.filter((row) => /committee/i.test(row.status)).length + 3],
    ["In Review", rows.filter((row) => /review|progress/i.test(row.status)).length + 2],
    ["Ready for Vote", rows.filter((row) => /vote|ready/i.test(row.status)).length + 1],
    ["Final Action", rows.filter((row) => /pass|adopt|fail|withdraw/i.test(row.status)).length],
  ];
  return h`
    <section class="panel pipeline-panel">
      <div class="panel-header"><h2>Legislation Pipeline</h2><button class="secondary">All Legislation</button></div>
      <div class="panel-body">
        <div class="pipeline-labels">${counts.map(([label, count]) => `<span><strong>${label}</strong><small>${count}</small></span>`).join("")}</div>
        <div class="sankey" aria-label="Legislation pipeline visualization">
          <span class="flow flow-a"></span><span class="flow flow-b"></span><span class="flow flow-c"></span><span class="flow flow-d"></span>
          <span class="stage s1"></span><span class="stage s2"></span><span class="stage s3"></span><span class="stage s4"></span><span class="stage s5"></span>
        </div>
        <p class="muted"><span class="ai-accent">AI Insight:</span> ${rows.length ? `${Math.round((counts[3][1] / Math.max(1, counts[0][1])) * 100)}% of tracked legislation is nearing action.` : "Connect agendas and legislation sources to activate live pipeline analysis."}</p>
      </div>
    </section>
  `;
}

function legislativeInsights(rows) {
  const topics = [...new Set(rows.map((row) => row.topic).filter(Boolean))].slice(0, 3);
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Longform Legislation Insights</h2><small class="purple">Generated by AI</small></div>
      <div class="panel-body insight-stack">
        ${insightCard("Key Takeaway", topics.length ? `${topics.join(", ")} are the most visible legislative themes right now.` : "Upload agendas, ordinances, and minutes to generate legislative themes.", "purple")}
        ${insightCard("Potential Impact", `${rows.filter((row) => row.impact === "High").length} tracked items are marked high impact for South Ward review.`, "blue")}
        ${insightCard("Watch List", "Items touching traffic, development, trees, and budget should receive fiscal and resident-impact notes.", "orange")}
      </div>
    </section>
  `;
}

function insightCard(title, copy, tone) {
  return `<article class="insight-card ${tone}"><strong>${title}</strong><p>${copy}</p></article>`;
}

function myInitiativesPanel() {
  return h`
    <section class="panel">
      <div class="panel-header"><h2>My Initiatives</h2><button class="link" data-open-draft="Legislative Initiative">View all my initiatives →</button></div>
      <div class="panel-body leg-table-wrap">
        <table class="leg-table">
          <thead><tr><th>Legislation</th><th>Status</th><th>Committee</th><th>Introduced</th><th>Next Action</th><th>Support</th><th>Impact</th></tr></thead>
          <tbody>
            ${legislativeInitiativeTemplates.map((item) => `
              <tr data-legislation-id="${item.id}">
                <td><strong>☆ ${item.title}</strong><small>${item.type} · ${item.topic}</small></td>
                <td><span class="status ${item.status.includes("Ready") ? "warn" : item.status.includes("Progress") || item.status.includes("Committee") ? "" : "good"}">${item.status}</span></td>
                <td>${item.committee}</td>
                <td>${item.introduced}</td>
                <td>${item.nextAction}</td>
                <td><span class="support-bar"><i style="width:${item.support}%"></i></span>${item.support}%</td>
                <td><span class="status ${item.impact === "High" ? "hot" : "warn"}">${item.impact}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function voteMatrixPanel() {
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Vote Matrix <span class="muted">(Recent Votes)</span></h2><button class="link" data-open-draft="Vote Analysis">View all votes →</button></div>
      <div class="panel-body leg-table-wrap">
        <table class="vote-table">
          <thead><tr><th>Legislation</th>${councilMembers.map((member) => `<th>${member}</th>`).join("")}</tr></thead>
          <tbody>
            ${voteMatrixRows.map(([title, votes]) => `
              <tr><td>${title}</td>${votes.map((vote) => `<td class="vote ${vote.toLowerCase()}">${vote}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function aiInsightsRail(rows) {
  return h`
    <section class="panel">
      <div class="panel-header"><h2>AI Insights</h2></div>
      <div class="panel-body rail-list">
        ${[
          ["Development Impact", `${rows.filter((row) => row.topic === "Development").length} tracked items may affect planning, zoning, or South Ward development.`],
          ["Budget Impact", `${rows.filter((row) => row.topic === "Budget").length} items require fiscal-note review.`],
          ["Community Interest", "Tree preservation, parking, and public comment items are likely to generate resident engagement."],
          ["Committee Activity", "Planning & Zoning, Public Works, and Finance should be watched for agenda movement."],
        ].map(([title, copy]) => `<button class="rail-item" data-open-draft="${title}"><strong>${title}</strong><span>${copy}</span><b>›</b></button>`).join("")}
      </div>
    </section>
  `;
}

function recentLegislativeActivity(rows) {
  const activity = rows.slice(0, 3);
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Recent Activity</h2><button class="link" data-open-draft="Legislative Activity">View all activity →</button></div>
      <div class="panel-body list">
        ${activity.map((row) => `<div class="list-row compact" data-legislation-id="${row.id}"><span class="rank green">↗</span><span><strong>${row.title}</strong><br><small class="muted">${row.status} · ${row.source}</small></span></div>`).join("") || `<div class="empty">No recent legislation activity loaded.</div>`}
      </div>
    </section>
  `;
}

function upcomingLegislativeActions(rows) {
  const actions = [
    ["Planning & Zoning Committee Hearing", "Review development and parking items"],
    ["City Council Vote", rows[0]?.title || "Next posted council vote"],
    ["Finance Committee Review", "Budget impact and fiscal-note requests"],
  ];
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Upcoming Actions</h2><button class="link" data-open-draft="Legislative Calendar">View calendar →</button></div>
      <div class="panel-body list">
        ${actions.map(([title, copy]) => `<div class="list-row compact"><span class="rank purple">▣</span><span><strong>${title}</strong><br><small class="muted">${copy}</small></span></div>`).join("")}
      </div>
    </section>
  `;
}

function legislationDetailDrawer(item) {
  if (!item) return "";
  return h`
    <aside class="leg-drawer" aria-label="Legislation detail panel">
      <div class="drawer-head">
        <div><small class="eyebrow">Legislation Detail</small><h2>${item.title}</h2></div>
        <button class="ghost" data-close-legislation-detail>×</button>
      </div>
      <div class="drawer-body">
        <span class="status">${item.status}</span>
        <h3>AI Summary</h3>
        <p>${item.notes || "Add source text, ordinance files, minutes, or public comments to generate a full AI summary."}</p>
        <h3>Department Analysis</h3>
        <p>${item.committee || "Council"} should provide status, owner, fiscal note, and implementation timeline.</p>
        <h3>Community Impact</h3>
        <p>${item.impact || "Medium"} impact. Check South Ward cases, media mentions, and development projects for related signals.</p>
        <h3>Suggested Talking Points</h3>
        <ul>
          <li>Ask for the plain-language resident impact.</li>
          <li>Request budget and department implementation details.</li>
          <li>Confirm whether South Ward neighborhoods are directly affected.</li>
        </ul>
        <button class="primary" data-open-draft="Talking Points: ${item.title}">Draft Talking Points</button>
      </div>
    </aside>
  `;
}

function budgetPage() {
  const summary = state.githubBudget?.summary || {};
  return h`
    <div class="page-head">
      <div><h1>Budget Watch</h1><p class="muted">Pulled from OrangeBudgetDashboard plus local watch items, department questions, and savings ideas.</p></div>
      <button class="primary" data-open-modal="budget">Add Budget Item</button>
    </div>
    <section class="grid metrics">
      ${metric(summary.latest_year || "2026", "Latest Budget Year", sourceText(state.githubBudget), "blue")}
      ${metric(summary.total_budget ? compactMoney(summary.total_budget) : "$94.6M", "Total Budget", `${summary.budget_growth_percent || 0}% YoY`, "green")}
      ${metric(summary.tax_levy ? compactMoney(summary.tax_levy) : "$70.1M", "Tax Levy", `${summary.tax_levy_growth_percent || 0}% YoY`, "orange")}
      ${metric(summary.non_tax_revenue ? compactMoney(summary.non_tax_revenue) : "$30.9M", "Non-Tax Revenue", "GitHub source", "cyan")}
      ${metric(summary.surplus ? compactMoney(summary.surplus) : "$4.0M", "Surplus", "Tracked", "purple")}
      ${metric(summary.debt_service ? compactMoney(summary.debt_service) : "$4.3M", "Debt Service", "Tracked", "red")}
    </section>
    <section class="grid two-col">
      ${budgetHistoryPanel()}
      <section class="panel">
        <div class="panel-header"><h2>Watch Items</h2></div>
        <div class="panel-body list">
          ${filterRows(state.budget, ["department", "line_item", "concern", "status"]).map((row) => h`
            <div class="list-row">
              <span><strong>${row.department}</strong><br><small class="muted">${row.line_item} · ${row.fiscal_year}</small></span>
              <span>${row.concern}</span>
              <span class="status warn">${row.status}</span>
            </div>
          `).join("") || `<div class="empty">No budget items match this search.</div>`}
        </div>
      </section>
    </section>
  `;
}

function budgetHistoryPanel() {
  const rows = state.githubBudget?.rows || [];
  return h`
    <section class="panel">
      <div class="panel-header"><h2>City Budget History</h2><small class="muted">${sourceText(state.githubBudget)}</small></div>
      <div class="panel-body list">
        ${rows.map((row) => h`
          <div class="list-row">
            <span><strong>${row.year}</strong><br><small class="muted">${row.source || "OrangeBudgetDashboard"}</small></span>
            <span>${money(row.totalBudget || 0)}<br><small class="muted">Total Budget</small></span>
            <span>${money(row.taxLevy || 0)}<br><small class="muted">Tax Levy</small></span>
          </div>
        `).join("") || `<div class="empty">No GitHub budget data loaded.</div>`}
      </div>
    </section>
  `;
}

function progressPage() {
  const progress = state.githubProgress || metricsFallback("First 100 Days");
  const summary = progress.summary || {};
  const items = filterRows(progress.items || [], ["title", "status", "description", "nextStep", "lastUpdate"]);
  return h`
    <div class="page-head">
      <div><h1>Progress In Office</h1><p class="muted">Read-only pull from jameshward3/Progress for promises, updates, key actions, and next steps.</p></div>
      <div class="header-actions"><button class="secondary" data-open-draft="Progress Update">Draft Update</button><button class="primary" data-page="reports">Create Report</button></div>
    </div>
    <section class="grid metrics">
      ${metric(`${summary.average_progress ?? summary.overallProgress ?? 0}%`, "Overall Progress", sourceText(progress), "green")}
      ${metric(summary.completedKeyActions || 0, "Completed Actions", `${summary.totalKeyActions || 0} total`, "blue")}
      ${metric(summary.items_tracked || summary.commitmentsTracked || 0, "Commitments", "Tracked", "purple")}
      ${metric(summary.completed || 0, "Completed", "From GitHub", "green")}
      ${metric(summary.in_progress || 0, "In Progress", "From GitHub", "orange")}
      ${metric(progress.from_cache ? "Cache" : "Live", "Source Mode", progress.source?.repo || "GitHub", "cyan")}
    </section>
    <section class="grid wide-right" style="margin-top:16px">
      <section class="panel">
        <div class="panel-header"><h2>Commitments</h2><button class="link" data-open-draft="Progress Follow-up">Draft Follow-up</button></div>
        <div class="panel-body list">
          ${items.map((item) => h`
            <div class="list-row">
              <span><strong>${item.title}</strong><br><small class="muted">${item.description || item.lastUpdate || ""}</small></span>
              <span>${item.nextStep || "Review next step"}</span>
              <span class="status ${item.status === "Completed" ? "good" : item.status === "In Progress" ? "warn" : ""}">${item.progress || 0}% · ${item.status}</span>
            </div>
          `).join("") || `<div class="empty">No progress items match this search.</div>`}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>GitHub Source</h2></div>
        <div class="panel-body check-list">
          ${sourcePill(progress)}
          <span class="status">Repo: ${progress.source?.repo || "jameshward3/Progress"}</span>
          <span class="status">Path: ${progress.source?.path || "metrics.json"}</span>
          <p class="muted">WardOS only reads this data. Publishing updates back to GitHub can be added later as a staff-approved action.</p>
        </div>
      </section>
    </section>
  `;
}

function sourceText(envelope) {
  if (!envelope) return "GitHub";
  return envelope.from_cache ? "Cached GitHub" : "Live GitHub";
}

function sourcePill(envelope) {
  const live = envelope && envelope.ok && !envelope.from_cache;
  return `<span class="status ${live ? "good" : "warn"}">${live ? "Live GitHub pull" : "Local cache / fallback"}</span>`;
}

async function loadWardGeoJson() {
  try {
    const response = await fetch(wardGeoJsonUrl);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    return {
      type: "FeatureCollection",
      features: Object.entries(fallbackWardPolygons).map(([key, coords]) => ({
        type: "Feature",
        properties: {
          ward: key.toUpperCase(),
          fill_color: wardStyles[key].fill,
        },
        geometry: {
          type: "Polygon",
          coordinates: [coords.map(([lat, lng]) => [lng, lat])],
        },
      })),
    };
  }
}

function addWardOverlays(map) {
  loadWardGeoJson().then((wardGeoJson) => {
    L.geoJSON(wardGeoJson, {
      style: (feature) => {
        const key = String(feature?.properties?.ward || "").toLowerCase();
        const style = wardStyles[key] || { color: "#9db7d0", fill: feature?.properties?.fill_color || "#9db7d0" };
        return {
          color: style.color,
          fillColor: feature?.properties?.fill_color || style.fill,
          fillOpacity: key === "south" ? 0.28 : 0.14,
          opacity: 0.92,
          weight: key === "south" ? 3 : 2,
        };
      },
      onEachFeature: (feature, layer) => {
        const key = String(feature?.properties?.ward || "").toLowerCase();
        const style = wardStyles[key] || { label: `${feature?.properties?.ward || "Orange"} Ward` };
        layer.bindTooltip(style.label, {
          permanent: key === "south",
          direction: "center",
          className: "ward-label",
        });
      },
    }).addTo(map);
  }).catch(() => {
    Object.entries(fallbackWardPolygons).forEach(([key, coords]) => {
      const style = wardStyles[key];
      const layer = L.polygon(coords, {
      color: style.color,
      fillColor: style.fill,
      fillOpacity: key === "south" ? 0.28 : 0.14,
      opacity: 0.92,
      weight: key === "south" ? 3 : 2,
      }).addTo(map);
      layer.bindTooltip(style.label, { permanent: key === "south", direction: "center", className: "ward-label" });
    });
  });
}

function markerIcon(tone, label) {
  return L.divIcon({
    className: `leaflet-pin ${tone}`,
    html: `<span>${label}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function storyLatLng(story) {
  if (story.latitude && story.longitude) return [story.latitude, story.longitude];
  const lookup = {
    "story-development-center": [40.7569, -74.2367],
    "story-potholes": [40.7588, -74.2436],
    "story-tree-initiative": [40.7626, -74.2508],
    "story-facebook-traffic": [40.7552, -74.2442],
    "story-parking-ordinance": [40.7609, -74.2325],
    "story-budget-playground": [40.7518, -74.2498],
  };
  return lookup[story.id] || [40.756, -74.241];
}

function initOpenMaps() {
  if (!window.L) return;
  document.querySelectorAll(".osm-map").forEach((container) => {
    if (container.dataset.mapReady === "true") return;
    container.dataset.mapReady = "true";

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    }).setView([40.7557, -74.2418], 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    addWardOverlays(map);

    if (container.dataset.mapKind === "pulse") {
      mediaFilteredStories().forEach((story) => {
        const [lat, lng] = storyLatLng(story);
        L.marker([lat, lng], { icon: markerIcon(sentimentClass(story.sentiment), Math.round(story.engagement / 1000)) })
          .addTo(map)
          .bindPopup(`<strong>${story.headline}</strong><br>${story.source}<br>${story.sentiment} · ${story.geo}`);
      });
    } else if (container.dataset.mapKind === "development") {
      const pins = developmentMapPins();
      const bounds = [];
      pins.forEach((pin) => {
        bounds.push([pin.lat, pin.lng]);
        L.marker([pin.lat, pin.lng], { icon: markerIcon(pin.tone, pin.id) })
          .addTo(map)
          .bindPopup(`<strong>${pin.label}</strong><br>${pin.address}<br>${pin.board} · ${pin.type}<br>${pin.date}<br>${pin.geocodeStatus}${pin.sourceUrl ? `<br><a href="${pin.sourceUrl}" target="_blank" rel="noopener noreferrer">Open record</a>` : ""}`);
      });
      if (bounds.length) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
    } else if (container.dataset.mapKind === "public-safety") {
      publicSafetyPins().forEach((pin, index) => {
        L.marker([pin.lat, pin.lng], { icon: markerIcon(pin.tone, index + 1) })
          .addTo(map)
          .bindPopup(`<strong>${pin.title}</strong><br>${pin.location}<br>${pin.category} · ${pin.severity}`);
      });
    } else if (container.dataset.mapKind === "case") {
      const lat = Number(container.dataset.lat);
      const lng = Number(container.dataset.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        L.marker([lat, lng], { icon: markerIcon("blue", "●") }).addTo(map);
        map.setView([lat, lng], 16);
      }
    } else {
      operationalMapPins().forEach((pin) => {
        L.marker([pin.lat, pin.lng], { icon: markerIcon(pin.tone, pin.id) })
          .addTo(map)
          .bindPopup(`<strong>${pin.label}</strong><br>${pin.type}`);
      });
    }

    setTimeout(() => map.invalidateSize(), 120);
  });
}

function operationalMapPins() {
  const pins = [];
  state.cases
    .filter((row) => row.latitude && row.longitude)
    .forEach((row) => pins.push({ id: String(pins.length + 1), label: row.topic, type: "Constituent Case", lat: row.latitude, lng: row.longitude, tone: priorityTone(row.priority) }));
  state.developments
    .filter((row) => row.latitude && row.longitude)
    .forEach((row) => pins.push({ id: String(pins.length + 1), label: row.name, type: "Development Project", lat: row.latitude, lng: row.longitude, tone: "purple" }));
  state.mediaStories
    .filter((row) => row.latitude && row.longitude)
    .forEach((row) => pins.push({ id: String(pins.length + 1), label: row.headline, type: "Media Mention", lat: row.latitude, lng: row.longitude, tone: sentimentClass(row.sentiment) }));
  return pins;
}

function publicSafetyTone(category, severity) {
  if (category === "violent" || severity === "high") return "red";
  if (category === "traffic") return "orange";
  if (category === "quality_of_life") return "purple";
  if (category === "infrastructure") return "blue";
  return "green";
}

function publicSafetyPins() {
  const fallback = [
    [40.7564, -74.2426],
    [40.7536, -74.2396],
    [40.7518, -74.2464],
    [40.7582, -74.2479],
    [40.7548, -74.251],
  ];
  return ((state.publicSafety && state.publicSafety.incidents) || []).map((incident, index) => ({
    title: incident.title || "Public Safety Incident",
    location: incident.location || "South Ward",
    category: incident.category_label || incident.category || "Other",
    severity: incident.severity || "medium",
    lat: Number(incident.latitude) || fallback[index % fallback.length][0],
    lng: Number(incident.longitude) || fallback[index % fallback.length][1],
    tone: publicSafetyTone(incident.category, incident.severity),
  }));
}

function mediaPanel(full = true) {
  const topics = state.media?.topics || [];
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Media & Community Pulse ${full ? "" : "<span class='muted'>(Last 24 Hours)</span>"}</h2><button class="link" data-page="media">Open</button></div>
      <div class="panel-body grid" style="grid-template-columns:${full ? "1fr" : "280px 1fr"}">
        <div>${topics.map((topic, i) => `<div class="budget-row"><span>${i + 1}. ${topic.label}</span><strong>${topic.share}%</strong><span></span></div>`).join("") || `<div class="empty">No media topics yet.</div>`}</div>
        <div class="grid ${full ? "two-col" : ""}">
          ${(state.mediaStories || []).slice(0, 4).map((story, i) => h`
            <article class="metric">
              <strong class="${sentimentClass(story.sentiment)}">${story.logo}</strong>
              <span>${story.source}</span>
              <small>${story.headline}</small>
              <button class="link" data-open-draft="${story.headline} Response">Draft response</button>
            </article>
          `).join("") || `<div class="empty">Connect sources to populate recent mentions.</div>`}
        </div>
      </div>
    </section>
  `;
}

function mediaFilteredStories() {
  return (state.mediaStories || []).filter((story) => {
    const filter = state.mediaFilters;
    const searchMatch = !state.search || [story.source, story.headline, story.summary, story.topic, story.geo, story.sentiment]
      .join(" ")
      .toLowerCase()
      .includes(state.search.toLowerCase());
    const sourceMatch = filter.sourceType === "All Sources" || story.type === filter.sourceType;
    const topicMatch = filter.topic === "All Topics" || story.topic === filter.topic || (filter.topic === "South Ward" && story.geo === "South Ward");
    const sentimentMatch = filter.sentiment === "All Sentiment" || story.sentiment === filter.sentiment;
    const wardMatch = filter.ward === "All Wards" || story.geo === filter.ward || story.geo === "South Ward";
    return searchMatch && sourceMatch && topicMatch && sentimentMatch && wardMatch;
  });
}

function orangeNewsScore(story) {
  const text = [story.source, story.headline, story.summary, story.fullSummary, story.topic, story.geo, story.entities]
    .flat()
    .join(" ")
    .toLowerCase();
  const terms = ["city of orange township", "orange township", "orange, nj", "orange nj", "south ward", "central ave", "scotland road", "south center"];
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function orangeFirstStories(stories) {
  return [...stories].sort((a, b) => orangeNewsScore(b) - orangeNewsScore(a));
}

function selectedStory() {
  return (state.mediaStories || []).find((story) => story.id === state.selectedStoryId) || (state.mediaStories || [])[0] || null;
}

function mediaSelect(name, value, options) {
  return h`
    <div class="field compact-field">
      <label>${name}</label>
      <select data-media-filter="${value}">
        ${options.map((option) => `<option ${state.mediaFilters[value] === option ? "selected" : ""}>${option}</option>`).join("")}
      </select>
    </div>
  `;
}

function mediaLeftRail() {
  const topics = configuredTopics().map(([topic]) => topic);
  const connected = state.sourceConnections.filter((source) => source.enabled && source.status === "configured").length;
  const needsSetup = state.sourceConnections.filter((source) => source.status !== "configured").length;
  return h`
    <aside class="media-rail grid">
      <section class="panel">
        <div class="panel-header"><h2>Filters & Controls</h2></div>
        <div class="panel-body form-grid">
          ${mediaSelect("Date Range", "dateRange", ["Last 24 Hours", "Last 7 Days", "Last 30 Days", "Custom Range"])}
          ${mediaSelect("Source Type", "sourceType", ["All Sources", "News", "Social Media", "Government", "Community Organizations", "Neighborhood Groups", "Broadcast"])}
          ${mediaSelect("Ward Filter", "ward", ["All Wards", "South Ward", "Central Ave", "Seven Oaks", "Heywood Avenue", "Citywide"])}
          ${mediaSelect("Topic Filter", "topic", ["All Topics", ...topics])}
          ${mediaSelect("Sentiment Filter", "sentiment", ["All Sentiment", "Positive", "Neutral", "Negative"])}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Saved Searches</h2></div>
        <div class="panel-body keyword-cloud">
          ${topics.map((topic) => `<button class="chip" data-media-topic="${topic}">${topic}</button>`).join("")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>AI Monitoring Status</h2><span class="pulse"></span></div>
        <div class="panel-body">
          <div class="budget-row"><span>Sources Connected</span><strong>${connected}</strong><span></span></div>
          <div class="budget-row"><span>Needs Setup</span><strong class="orange">${needsSetup}</strong><span></span></div>
          <div class="budget-row"><span>Mentions Collected</span><strong>${state.mediaStories.length}</strong><span></span></div>
          <div class="budget-row"><span>Alerts Generated</span><strong class="red">${state.media?.alerts?.length || 0}</strong><span></span></div>
        </div>
      </section>
    </aside>
  `;
}

function mediaFeed() {
  const stories = mediaFilteredStories();
  const story = selectedStory();
  return h`
    <section class="panel media-feed">
      <div class="panel-header">
        <h2>Media Feed</h2>
        <div class="header-actions">
          <button class="secondary" data-media-filter-reset>Reset</button>
          <button class="primary" data-open-draft="Media Briefing Summary">Generate Briefing</button>
        </div>
      </div>
      <div class="panel-body list">
        ${stories.map((story) => mediaStoryCard(story)).join("") || `<div class="empty">No media mentions match the current filters.</div>`}
      </div>
    </section>
    ${story ? storyDetailPanel(story) : emptyStoryDetail()}
  `;
}

function emptyStoryDetail() {
  return h`
    <section class="panel story-detail">
      <div class="panel-header"><h2>AI Summary Panel</h2><span class="status warn">No media data</span></div>
      <div class="panel-body">
        <div class="empty">Connect media sources or add a media mention to generate summaries, relationships, and recommended actions.</div>
      </div>
    </section>
  `;
}

function mediaStoryCard(story) {
  const active = state.selectedStoryId === story.id;
  return h`
    <article class="story-card ${active ? "active" : ""}" data-story-id="${story.id}">
      <button class="story-main" data-story-id="${story.id}">
        <span class="source-logo">${story.logo}</span>
        <span>
          <small class="muted">${story.source} · ${story.published}</small>
          <strong>${story.headline}</strong>
          <small class="muted">${story.summary}</small>
        </span>
        <span>
          <span class="status ${sentimentClass(story.sentiment)}">${story.sentiment}</span>
          <small class="muted">Reach: ${story.reach}<br>${story.geo}</small>
        </span>
      </button>
      <div class="story-actions">
        <a class="link" href="${story.url}" target="_blank" rel="noopener noreferrer" data-open-source="${story.id}">↗ Open Full Story</a>
        <button class="link" data-open-draft="${story.headline} Response">Draft Response</button>
      </div>
    </article>
  `;
}

function storyDetailPanel(story) {
  return h`
    <section class="panel story-detail">
      <div class="panel-header">
        <h2>AI Summary Panel</h2>
        <span class="status ${sentimentClass(story.sentiment)}">${story.sentiment} · ${story.interest} Interest</span>
      </div>
      <div class="panel-body grid">
        <div>
          <h3>${story.headline}</h3>
          <p class="muted" style="margin-top:8px">${story.fullSummary}</p>
        </div>
        <div class="ai-brief-grid">
          ${briefCell("What Happened", story.summary)}
          ${briefCell("Why It Matters", story.impact)}
          ${briefCell("Who Is Affected", `${story.geo}; related entities include ${story.entities.slice(0, 3).join(", ")}.`)}
          ${briefCell("Recommended Response", story.suggestedActions[0])}
          ${briefCell("Potential Political Impact", story.impact)}
          ${briefCell("Estimated Public Interest", story.interest)}
        </div>
        <div class="grid two-col">
          <div>
            <h3>Key Quotes</h3>
            <div class="check-list">${story.quotes.map((quote) => `<span>“${quote}”</span>`).join("")}</div>
          </div>
          <div>
            <h3>Named Entities</h3>
            <div class="keyword-cloud">${story.entities.map((entity) => `<span class="chip">${entity}</span>`).join("")}</div>
          </div>
        </div>
        ${relationshipGraph(story)}
      </div>
    </section>
  `;
}

function briefCell(title, body) {
  return `<div class="brief-cell"><small>${title}</small><strong>${body}</strong></div>`;
}

function relationshipGraph(story) {
  const nodes = [
    ["Story", story.headline, "purple"],
    ["Residents", story.relatedCases[0] || "Neighborhood discussion", "green"],
    ["Legislation", story.relatedLegislation[0] || "No match yet", "blue"],
    ["Developments", story.relatedProjects[0] || "No match yet", "orange"],
    ["Departments", story.entities.find((entity) => entity.includes("DPW")) || "Planning / DPW", "cyan"],
    ["Prior Coverage", story.source, "red"],
  ];
  return h`
    <section class="relationship-graph">
      <div class="graph-center">Story</div>
      ${nodes.map(([label, value, tone], i) => `<div class="graph-node ${tone}" style="--i:${i}"><small>${label}</small><strong>${value}</strong></div>`).join("")}
    </section>
  `;
}

function mediaRightRail() {
  const topics = state.media?.topics?.length ? state.media.topics.map((topic) => [topic.label, topic.share, "blue"]) : configuredTopics();
  const actions = state.media?.actions || [];
  const alerts = state.media?.alerts || [];
  return h`
    <aside class="media-rail grid">
      <section class="panel">
        <div class="panel-header"><h2>Trending Topics</h2></div>
        <div class="panel-body list">
          ${topics.slice(0, 5).map(([topic, share, tone], i) => h`
            <button class="list-row ghost" data-media-topic="${topic}">
              <span class="rank ${tone}">${i + 1}</span>
              <span><strong>${topic}</strong><br><small class="muted">${share}% of mentions</small></span>
              <span class="status">${share}</span>
            </button>
          `).join("") || `<div class="empty">No trending topics yet.</div>`}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Sentiment Meter</h2><span class="green">↗ +0.32</span></div>
        <div class="panel-body">
          <div class="sentiment-meter"><span></span></div>
          <div class="budget-row"><span>Positive</span><strong class="green">46%</strong><span></span></div>
          <div class="budget-row"><span>Neutral</span><strong class="blue">34%</strong><span></span></div>
          <div class="budget-row"><span>Negative</span><strong class="red">20%</strong><span></span></div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>AI Recommended Actions</h2></div>
        <div class="panel-body check-list">
          ${actions.map((action) => `<button class="select-button media-action" data-open-draft="${action}">${action}</button>`).join("") || `<div class="empty">No recommended actions yet.</div>`}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Alerts</h2><button class="link" data-open-draft="Media Alert Summary">View All</button></div>
        <div class="panel-body list">
          ${alerts.map(([title, body, level, tone]) => h`
            <button class="list-row ghost" data-open-draft="${title}">
              <span class="rank ${tone}">!</span>
              <span><strong>${title}</strong><br><small class="muted">${body}</small></span>
              <span class="status ${level === "High" ? "hot" : "warn"}">${level}</span>
            </button>
          `).join("") || `<div class="empty">No alerts yet.</div>`}
        </div>
      </section>
    </aside>
  `;
}

function orangePulseMap() {
  const stories = mediaFilteredStories();
  return h`
    <section class="panel orange-pulse">
      <div class="panel-header">
        <h2>Orange Pulse Map</h2>
        <small class="muted">Stories, posts, complaints, and development signals geocoded across Orange</small>
      </div>
      <div class="pulse-map osm-map" data-map-kind="pulse" aria-label="Interactive OpenStreetMap pulse map of Orange media stories"></div>
    </section>
  `;
}

function sourceTypeStories(type) {
  const aliases = {
    news: ["News"],
    social: ["Social Media", "Neighborhood Groups", "Community Organizations"],
    broadcast: ["Broadcast"],
  };
  const allowed = aliases[type] || [];
  const stories = mediaFilteredStories().filter((story) => allowed.includes(story.type));
  return type === "news" ? orangeFirstStories(stories) : stories;
}

function mediaSourceCards(type) {
  const stories = type ? sourceTypeStories(type) : mediaFilteredStories();
  return h`
    <section class="panel">
      <div class="panel-header">
        <h2>${type === "news" ? "Local News Desk" : type === "social" ? "Social Listening Desk" : type === "broadcast" ? "Broadcast Monitor" : "Mention Stream"}</h2>
        <button class="primary" data-open-draft="${type || "All"} Media Follow-up">Create Follow-up</button>
      </div>
      <div class="panel-body media-card-grid">
        ${stories.map((story) => mediaStoryCard(story)).join("") || `<div class="empty">No items match this source filter yet.</div>`}
      </div>
    </section>
  `;
}

function mediaOverviewTab() {
  return h`
    <section class="media-layout">
      ${mediaLeftRail()}
      <main class="media-center grid">
        ${mediaSourceSetupPanel()}
        ${orangePulseMap()}
        ${mediaFeed()}
      </main>
      ${mediaRightRail()}
    </section>
    ${externalInteractionSlots()}
  `;
}

function mediaMentionsTab() {
  return h`
    <section class="media-layout">
      ${mediaLeftRail()}
      <main class="media-center grid">
        <section class="grid two-col">
          ${mediaMomentumPanel()}
          ${sentimentShiftPanel()}
        </section>
        ${mediaFeed()}
      </main>
      ${mediaRightRail()}
    </section>
  `;
}

function mediaNewsTab() {
  return h`
    <section class="media-layout">
      ${mediaLeftRail()}
      <main class="media-center grid">
        ${sourceBreakdownPanel("news")}
        ${mediaSourceCards("news")}
        ${storyBriefingQueue("News")}
      </main>
      <aside class="media-rail grid">
        ${sourceWatchPanel("News Sources", ["Local Talk Weekly", "Essex Review", "East Orange Record Transcript", "Essex News Daily", "NJ.com Essex", "TAPinto East Orange / Orange", "Patch"])}
        ${mediaRightRail()}
      </aside>
    </section>
  `;
}

function mediaSocialTab() {
  return h`
    <section class="media-layout">
      ${mediaLeftRail()}
      <main class="media-center grid">
        ${sourceBreakdownPanel("social")}
        ${orangePulseMap()}
        ${mediaSourceCards("social")}
      </main>
      <aside class="media-rail grid">
        ${sourceWatchPanel("Social Watch", ["Orange NJ Real Talk", "Seven Oaks Society", "Facebook Pages", "Instagram Hashtags", "X / Twitter Keywords"])}
        ${communitySignalPanel()}
      </aside>
    </section>
  `;
}

function mediaBroadcastTab() {
  return h`
    <section class="media-layout">
      ${mediaLeftRail()}
      <main class="media-center grid">
        ${sourceBreakdownPanel("broadcast")}
        <section class="panel">
          <div class="panel-header"><h2>Broadcast & Video Clips</h2><button class="primary" data-open-draft="Broadcast Clip Intake">Add Clip</button></div>
          <div class="panel-body broadcast-grid">
            ${["Council meeting clips", "Local radio interviews", "Public comment video", "Community livestreams"].map((title, index) => `
              <article class="broadcast-card">
                <strong>${title}</strong>
                <p>${index === 0 ? "Track mentions from council recordings and posted meeting video." : "Reserved intake lane for linked clips, transcripts, and AI summaries."}</p>
                <button class="secondary" data-open-draft="${title}">Open Intake</button>
              </article>
            `).join("")}
          </div>
        </section>
        ${storyBriefingQueue("Broadcast")}
      </main>
      <aside class="media-rail grid">
        ${sourceWatchPanel("Broadcast Sources", ["Council recordings", "Planning Board video", "Zoning Board video", "Local radio", "Community livestreams"])}
        ${mediaRightRail()}
      </aside>
    </section>
  `;
}

function mediaAlertsTab() {
  const alerts = state.media?.alerts || [];
  return h`
    <section class="media-layout">
      ${mediaLeftRail()}
      <main class="media-center grid">
        <section class="panel">
          <div class="panel-header"><h2>Alert Center</h2><button class="primary" data-open-draft="Media Alert Protocol">Create Protocol</button></div>
          <div class="panel-body alert-grid">
            ${alerts.map(([title, body, level, tone]) => `
              <article class="alert-card ${tone}">
                <span class="rank ${tone}">!</span>
                <div><strong>${title}</strong><p>${body}</p></div>
                <button class="secondary" data-open-draft="${title} Response">${level}</button>
              </article>
            `).join("") || `<div class="empty">No active alerts yet.</div>`}
          </div>
        </section>
        ${mediaMomentumPanel()}
        ${storyBriefingQueue("Alert")}
      </main>
      ${mediaRightRail()}
    </section>
  `;
}

function mediaReportsTab() {
  return h`
    <section class="media-layout">
      ${mediaLeftRail()}
      <main class="media-center grid">
        <section class="panel">
          <div class="panel-header"><h2>Media Intelligence Reports</h2><button class="primary" data-open-draft="Daily Media Intelligence Report">Generate Report</button></div>
          <div class="panel-body report-grid">
            ${[
              ["Daily Media Intelligence Brief", "What residents are talking about, what is gaining momentum, and recommended action."],
              ["South Ward Sentiment Report", "Topic-by-topic sentiment trend, ward geography, and pressure points."],
              ["Press Response Packet", "Draft statement, talking points, quotes, source links, and follow-up questions."],
              ["Misinformation Risk Memo", "Claims needing verification, source history, likely spread path, and corrective response."],
            ].map(([title, copy]) => `
              <article class="report-card">
                <strong>${title}</strong>
                <p>${copy}</p>
                <button class="secondary" data-open-draft="${title}">Open Draft</button>
              </article>
            `).join("")}
          </div>
        </section>
        ${storyBriefingQueue("Report")}
      </main>
      <aside class="media-rail grid">
        ${mediaSourceSetupPanel()}
        ${mediaRightRail()}
      </aside>
    </section>
  `;
}

function mediaTabContent(tab) {
  if (tab === "mentions") return mediaMentionsTab();
  if (tab === "news") return mediaNewsTab();
  if (tab === "social") return mediaSocialTab();
  if (tab === "broadcast") return mediaBroadcastTab();
  if (tab === "alerts") return mediaAlertsTab();
  if (tab === "reports") return mediaReportsTab();
  return mediaOverviewTab();
}

function mediaMomentumPanel() {
  const topics = state.media?.topics?.length ? state.media.topics : configuredTopics().slice(0, 5).map(([label], index) => ({ label, share: 28 - index * 4 }));
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Momentum Watch</h2><small class="muted">Emerging topic velocity</small></div>
      <div class="panel-body list">
        ${topics.slice(0, 6).map((topic, index) => `
          <button class="list-row ghost" data-media-topic="${topic.label || topic[0]}">
            <span class="rank ${index < 2 ? "orange" : "blue"}">${index + 1}</span>
            <span><strong>${topic.label || topic[0]}</strong><br><small class="muted">Mentions gaining across monitored sources</small></span>
            <span class="status">${topic.share || topic[1]}%</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function sentimentShiftPanel() {
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Sentiment Shifts</h2><span class="green">↗ improving</span></div>
      <div class="panel-body">
        <div class="sentiment-meter"><span></span></div>
        <div class="budget-row"><span>Negative spike risk</span><strong class="orange">Medium</strong><span></span></div>
        <div class="budget-row"><span>Resident concern level</span><strong>High</strong><span></span></div>
        <div class="budget-row"><span>Response window</span><strong class="blue">Today</strong><span></span></div>
      </div>
    </section>
  `;
}

function sourceBreakdownPanel(type) {
  const labels = {
    news: ["News Articles", sourceTypeStories("news").length, "RSS/web sources and local outlets"],
    social: ["Social Mentions", sourceTypeStories("social").length, "Groups, pages, hashtags, and public posts"],
    broadcast: ["Broadcast Clips", sourceTypeStories("broadcast").length, "Video, radio, livestreams, and transcripts"],
  }[type] || ["Mentions", mediaFilteredStories().length, "All monitored signals"];
  return h`
    <section class="grid metrics">
      ${metric(labels[1], labels[0], labels[2], type === "social" ? "green" : type === "broadcast" ? "purple" : "blue")}
      ${metric(mediaFilteredStories().filter((story) => story.sentiment === "Negative").length, "Negative Items", "Needs review", "red")}
      ${metric(mediaFilteredStories().filter((story) => story.interest === "High").length, "High Interest", "Likely resident visibility", "orange")}
    </section>
  `;
}

function sourceWatchPanel(title, sources) {
  return h`
    <section class="panel">
      <div class="panel-header"><h2>${title}</h2><button class="link" data-open-draft="${title} Setup">Edit</button></div>
      <div class="panel-body list">
        ${sources.map((source, index) => `
          <div class="list-row compact">
            <span class="rank ${index < 2 ? "green" : "blue"}">${index + 1}</span>
            <span><strong>${source}</strong><br><small class="muted">${index < 2 ? "Priority watch source" : "Configured intake lane"}</small></span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function communitySignalPanel() {
  return h`
    <section class="panel">
      <div class="panel-header"><h2>Community Signals</h2></div>
      <div class="panel-body check-list">
        <span>Neighborhood group discussion rising around roads and development.</span>
        <span>Seven Oaks / South Ward location tags should be geocoded to Orange Pulse.</span>
        <span>Manual review required before any public response is sent.</span>
      </div>
    </section>
  `;
}

function storyBriefingQueue(context) {
  const stories = (context === "News" ? orangeFirstStories(mediaFilteredStories()) : mediaFilteredStories()).slice(0, 4);
  return h`
    <section class="panel">
      <div class="panel-header"><h2>${context} Briefing Queue</h2><button class="link" data-open-draft="${context} Briefing Queue">View all →</button></div>
      <div class="panel-body list">
        ${stories.map((story) => `
          <button class="list-row ghost" data-story-id="${story.id}">
            <span class="source-logo">${story.logo}</span>
            <span><strong>${story.headline}</strong><br><small class="muted">${story.source} · ${story.topic} · ${story.geo}</small></span>
            <span class="status ${sentimentClass(story.sentiment)}">${story.sentiment}</span>
          </button>
        `).join("") || `<div class="empty">No stories queued yet.</div>`}
      </div>
    </section>
  `;
}

function externalInteractionSlots() {
  return h`
    <section class="panel" style="margin-top:16px">
      <div class="panel-header"><h2>External Interaction Slots</h2></div>
      <div class="panel-body action-grid">
        <button class="action-tile" data-open-draft="Email Follow-up Queue"><strong>✉</strong><span>Email draft queue</span></button>
        <button class="action-tile" data-open-draft="Social Response Review"><strong>↗</strong><span>Social post review</span></button>
        <button class="action-tile" data-open-draft="Press Clipping Import"><strong>▣</strong><span>Press clipping import</span></button>
        <button class="action-tile" data-open-draft="Forum Monitoring Source"><strong>◍</strong><span>Neighborhood forums</span></button>
        <button class="action-tile" data-open-draft="Meeting Transcript Intake"><strong>≋</strong><span>Transcript intake</span></button>
        <button class="action-tile" data-open-draft="Misinformation Watch"><strong>!</strong><span>Misinformation watch</span></button>
      </div>
    </section>
  `;
}

function sentimentClass(sentiment) {
  if (sentiment === "Positive") return "good";
  if (sentiment === "Negative") return "hot";
  return "warn";
}

function mediaPage() {
  const activeTab = state.mediaTab || "overview";
  return h`
    <div class="page-head media-title">
      <div class="headline">
        <div class="sun-card media-icon">◉</div>
        <div>
          <h1>Media Monitor</h1>
          <p class="muted">Real-time coverage, sentiment analysis, and civic signal tracking for South Ward, Orange NJ.</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="secondary">${officeDateLine(false)}</button>
        <button class="secondary">${state.mediaFilters.dateRange}</button>
        <button class="primary" data-open-draft="Media Intelligence Report">Export Report</button>
      </div>
    </div>
    <div class="tabs media-tabs">
      ${[
        ["overview", "Overview"],
        ["mentions", "Mentions"],
        ["news", "News"],
        ["social", "Social Media"],
        ["broadcast", "Broadcast"],
        ["alerts", "Alerts"],
        ["reports", "Reports"],
      ].map(([key, label]) => `<button class="tab ${activeTab === key ? "active" : ""}" data-media-tab="${key}">${label}</button>`).join("")}
    </div>
    <section class="grid media-metrics">
      ${metric(152, "Total Mentions", "↑ 18% vs yesterday", "purple")}
      ${metric(28, "News Articles", "↑ 12% vs yesterday", "blue")}
      ${metric(98, "Social Mentions", "↑ 24% vs yesterday", "green")}
      ${metric("1.2M", "Potential Reach", "↑ 15% vs yesterday", "orange")}
      ${metric("+0.32", "Sentiment Score", "Positive", "green")}
    </section>
    ${mediaTabContent(activeTab)}
  `;
}

function mediaSourceSetupPanel() {
  const totalConfigured = state.mediaConfig
    ? Object.keys(state.mediaConfig).reduce((count, key) => {
        const value = state.mediaConfig[key];
        return count + (Array.isArray(value) ? value.length : 0);
      }, 0)
    : 0;
  const imported = state.sourceConnections.length;
  return h`
    <section class="panel">
      <div class="panel-header">
        <h2>Media Source Configuration</h2>
        <button class="secondary" data-import-media-sources>Import Sources</button>
      </div>
      <div class="panel-body grid" style="grid-template-columns: repeat(4, 1fr)">
        <div class="brief-cell"><small>Configured Groups</small><strong>${totalConfigured}</strong></div>
        <div class="brief-cell"><small>Imported Connections</small><strong>${imported}</strong></div>
        <div class="brief-cell"><small>Intelligence Topics</small><strong>${state.mediaConfig?.intelligence_topics?.length || 0}</strong></div>
        <div class="brief-cell"><small>Mode</small><strong>Staff-review only</strong></div>
      </div>
    </section>
  `;
}

function publicSafetyMetric(value, label, sub, tone, icon) {
  return h`
    <article class="metric safety-metric ${tone}">
      <span class="metric-icon">${icon}</span>
      <div>
        <small>${label}</small>
        <strong>${value}</strong>
        <span class="${String(sub).startsWith("↑") ? "up" : "muted"}">${sub}</span>
      </div>
    </article>
  `;
}

function publicSafetyCategoryTone(category, severity) {
  if (category === "violent" || severity === "high") return "hot";
  if (category === "traffic") return "warn";
  if (category === "quality_of_life") return "purple";
  if (category === "infrastructure") return "blue";
  return "good";
}

function publicSafetyPage() {
  const safety = state.publicSafety || publicSafetyFallback();
  const metrics = safety.metrics || publicSafetyFallback().metrics;
  const incidents = safety.incidents || [];
  const score = safety.score || { value: 0, label: "Awaiting Briefing", delta: "Upload briefing PDF" };
  const breakdown = safety.breakdown || [];
  const intersections = safety.dangerous_intersections || [];
  const total = metrics.total_incidents || 0;
  const pct = (count) => total ? Math.round((count / total) * 100) : 0;
  return h`
    <div class="page-head safety-title">
      <div>
        <h1>Public Safety</h1>
        <p class="muted">Real-time overview of public safety issues and community incidents in South Ward.</p>
      </div>
      <div class="header-actions">
        <button class="secondary">Last 30 Days</button>
        <button class="secondary" data-sync-public-safety>Sync Police Briefing</button>
        <button class="primary" data-open-modal="publicSafety">＋ Report an Issue</button>
      </div>
    </div>

    <section class="grid safety-metrics">
      ${publicSafetyMetric(metrics.total_incidents || 0, "Total Incidents", "Current briefing set", "blue", "◈")}
      ${publicSafetyMetric(metrics.violent_incidents || 0, "Violent Incidents", "Staff review required", "red", "▲")}
      ${publicSafetyMetric(metrics.traffic_incidents || 0, "Traffic Incidents", "DPW / enforcement watch", "orange", "▰")}
      ${publicSafetyMetric(metrics.quality_of_life || 0, "Quality of Life", "Neighborhood conditions", "purple", "●")}
      ${publicSafetyMetric(metrics.resolved || 0, "Resolved", `${total ? pct(metrics.resolved || 0) : 0}% resolution rate`, "green", "✓")}
    </section>

    <section class="grid safety-grid">
      <section class="panel">
        <div class="panel-header"><h2>Incident Feed</h2><button class="link" data-open-modal="publicSafety">Add</button></div>
        <div class="panel-body list">
          ${incidents.slice(0, 8).map((incident) => {
            const tone = publicSafetyCategoryTone(incident.category, incident.severity);
            return h`
              <button class="list-row ghost safety-incident" data-open-draft="${incident.title}" style="text-align:left">
                <span class="rank ${tone}">${incident.category === "traffic" ? "▰" : incident.category === "violent" ? "▲" : incident.category === "quality_of_life" ? "●" : "◆"}</span>
                <span><strong>${incident.title}</strong><br><small class="muted">${incident.location || "South Ward"}<br>${formatShortDate(incident.occurred_at || incident.created_at)}</small></span>
                <span><span class="status ${tone}">${incident.severity || "medium"}</span></span>
              </button>
            `;
          }).join("") || `<div class="empty-state"><strong>No incidents loaded yet.</strong><span class="muted">Place the OPD monthly briefing PDF in data/public_safety, then run sync.</span></div>`}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header"><h2>South Ward Safety Map</h2><button class="secondary">Layers</button></div>
        <div class="safety-map osm-map" data-map-kind="public-safety" aria-label="Interactive OpenStreetMap view of South Ward public safety incidents"></div>
        <div class="layer-strip">
          <span>Show:</span>
          <label><input type="checkbox" checked> Traffic</label>
          <label><input type="checkbox" checked> Violent</label>
          <label><input type="checkbox" checked> Quality of Life</label>
          <label><input type="checkbox" checked> Infrastructure</label>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header"><h2>Ward Safety Score</h2><button class="link" data-open-draft="Safety Score Methodology">How It's Calculated</button></div>
        <div class="panel-body">
          <div class="score-block">
            <div class="score-ring" style="--score-pct:${score.value || 0}%">
              <strong>${score.value || 0}</strong><span>/100</span>
            </div>
            <div><strong class="green score-label">${score.label}</strong><br><small class="muted">${score.delta}</small></div>
          </div>
          <div class="score-list">
            <div><span>Traffic Safety</span><strong class="orange">${Math.max(0, 78 - (metrics.traffic_incidents || 0))}/100</strong></div>
            <div><span>Lighting & Infrastructure</span><strong class="green">${Math.max(0, 82 - (breakdown.find((row) => row.category === "infrastructure")?.count || 0))}/100</strong></div>
            <div><span>Walkability</span><strong class="orange">69/100</strong></div>
            <div><span>Emergency Response</span><strong class="green">81/100</strong></div>
            <div><span>Complaint Resolution</span><strong class="green">${Math.min(100, 60 + pct(metrics.resolved || 0))}/100</strong></div>
          </div>
        </div>
      </section>
    </section>

    <section class="grid safety-bottom">
      <section class="panel">
        <div class="panel-header"><h2>Top Dangerous Intersections</h2><button class="link">View all</button></div>
        <div class="panel-body">
          ${(intersections.length ? intersections : [{ location: "Awaiting OPD briefing upload", count: 0 }]).map((row, index) => h`
            <div class="budget-row"><span>${index + 1}. ${row.location}</span><strong>${row.count}</strong><span></span></div>
          `).join("")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Incidents Over Time</h2><button class="secondary">Daily</button></div>
        <div class="panel-body">
          <div class="sparkline"><span style="height:42%"></span><span style="height:68%"></span><span style="height:38%"></span><span style="height:74%"></span><span style="height:55%"></span><span style="height:86%"></span><span style="height:46%"></span><span style="height:58%"></span></div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Incident Breakdown</h2></div>
        <div class="panel-body split">
          <div class="donut safety-donut" style="--traffic:${pct(metrics.traffic_incidents || 0)}%;--quality:${pct(metrics.quality_of_life || 0)}%;--violent:${pct(metrics.violent_incidents || 0)}%"><strong>${total}<span>Total</span></strong></div>
          <div>
            ${breakdown.map((row) => `<div class="budget-row"><span>${row.label}</span><strong>${pct(row.count)}%</strong><span>(${row.count})</span></div>`).join("") || `<div class="empty">No breakdown yet.</div>`}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>AI Safety Insights</h2></div>
        <div class="panel-body list">
          ${(safety.insights || []).map((insight) => h`
            <button class="list-row ghost" data-open-draft="Public Safety Follow-up">
              <span class="rank blue">i</span>
              <span><strong>${insight}</strong><br><small class="muted">Staff verification required before external action.</small></span>
              <span></span>
            </button>
          `).join("")}
          <button class="link" data-open-draft="Ask WardOS AI Public Safety Review">Ask WardOS AI</button>
        </div>
      </section>
    </section>
  `;
}

function genericPage(title, copy) {
  return h`
    <div class="page-head"><div><h1>${title}</h1><p class="muted">${copy}</p></div><button class="primary" data-open-modal="quick">Manual Add</button></div>
    <section class="grid two-col">
      ${mapPanel(`${title} Map`)}
      ${priorityList()}
    </section>
  `;
}

function settingsPage() {
  return h`
    <div class="page-head"><div><h1>Settings</h1><p class="muted">Local-first configuration and safety posture.</p></div></div>
    <section class="grid two-col">
      <section class="panel"><div class="panel-header"><h2>API Connection</h2></div><div class="panel-body form-grid">
        <div class="field"><label>API Base URL</label><input id="apiBaseInput" value="${API_BASE}"></div>
        <button class="primary" id="saveApiBase">Save API URL</button>
      </div></section>
      <section class="panel"><div class="panel-header"><h2>Safety</h2></div><div class="panel-body check-list">
        <span class="status good">Local-first</span>
        <span class="status good">Secrets stored in .env</span>
        <span class="status good">America/New_York timezone</span>
        <span class="status warn">No auto-sending emails</span>
        <span class="status warn">No auto-publishing</span>
      </div></section>
    </section>
    <section class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <div class="panel-header">
          <h2>Staff & Roles</h2>
          <button class="secondary" data-import-staff-users>Import Staff</button>
        </div>
        <div class="panel-body">
          ${staffUsersList()}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Role Model</h2></div>
        <div class="panel-body check-list">
          ${Object.entries(state.staffRoles).map(([key, label]) => `<span class="status good">${label}: ${key}</span>`).join("") || `<span class="muted">No roles configured yet.</span>`}
          <span class="status warn">Login enforcement comes next</span>
          <span class="status warn">No invites or emails are sent</span>
        </div>
      </section>
    </section>
  `;
}

function staffUsersList() {
  if (!state.staffUsers.length) {
    return h`
      <div class="empty-state">
        <strong>No staff imported yet.</strong>
        <p class="muted">Import the local staff file to activate James Ward and Jamar Young as WardOS users.</p>
      </div>
    `;
  }
  return h`
    <div class="list-stack">
      ${state.staffUsers
        .map((user) => {
          const label = state.staffRoles[user.role] || user.role;
          return `
            <article class="mini-card">
              <div>
                <strong>${user.full_name}</strong>
                <p class="muted">${user.title || label} · ${user.email}</p>
              </div>
              <div class="stack-right">
                <span class="status ${user.role === "admin" ? "good" : "info"}">${label}</span>
                <span class="muted">${user.is_active ? "Active" : "Inactive"}</span>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function filterRows(rows, keys) {
  const q = state.search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => keys.some((key) => String(row[key] || "").toLowerCase().includes(q)));
}

function searchText(value) {
  if (Array.isArray(value)) return value.map(searchText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(searchText).join(" ");
  return String(value || "");
}

function searchEntry({ section, type, title, summary, page, tone = "blue", keywords = [], action = {} }) {
  const text = searchText([section, type, title, summary, keywords, action]);
  return { section, type, title: title || "Untitled", summary: summary || "", page, tone, keywords, action, text: text.toLowerCase() };
}

function buildSearchIndex() {
  const entries = [];
  state.cases.forEach((item) => entries.push(searchEntry({
    section: "Constituents",
    type: item.priority || "Case",
    title: item.topic || "Constituent case",
    summary: `${item.constituent_name || "Unknown"} · ${item.address_line || "No address"} · ${item.status || "open"}`,
    page: "constituents",
    tone: item.priority === "high" ? "red" : "green",
    keywords: [item.notes, item.phone, item.email],
    action: { caseId: item.id, tab: "cases" },
  })));
  (state.constituentSearch || state.constituents).slice(0, 50000).forEach((item) => entries.push(searchEntry({
    section: "Constituents",
    type: item.subgroup || "Resident",
    title: item.full_name,
    summary: `${item.street_no || ""} ${item.street || ""} ${item.apt || ""} · ${item.ward || "Ward pending"} · ${item.voter_status || ""}`,
    page: "constituents",
    tone: String(item.ward || "").toLowerCase() === "south" ? "blue" : "orange",
    keywords: [item.voter_id, item.city, item.zip_code, item.zip, item.street_no, item.apt, item.subgroup],
    action: { tab: "directory", constituentId: item.id, constituentName: item.full_name, constituentAddress: constituentAddress(item) },
  })));
  normalizedLegislationRows().forEach((item) => entries.push(searchEntry({
    section: "Legislation",
    type: item.status || "Tracking",
    title: `${item.bill_number || "Draft"} · ${item.title}`,
    summary: `${item.committee || "Council"} · ${item.nextAction || item.notes || "Review source"}`,
    page: "legislation",
    tone: item.impact === "High" ? "purple" : "blue",
    keywords: [item.topic, item.sponsor, item.source],
    action: { legislationId: item.id, legislationTab: "all" },
  })));
  legislativeInitiativeTemplates.forEach((item) => entries.push(searchEntry({
    section: "Initiatives",
    type: item.status,
    title: item.title,
    summary: `${item.committee} · ${item.nextAction} · ${item.support}% support`,
    page: "legislation",
    tone: "purple",
    keywords: [item.topic, item.type, item.impact],
    action: { legislationId: item.id, legislationTab: "initiatives" },
  })));
  mediaFilteredStories().forEach((item) => entries.push(searchEntry({
    section: "Media",
    type: item.sentiment || "Mention",
    title: item.headline,
    summary: `${item.source} · ${item.topic} · ${item.geo} · reach ${item.reach || item.engagement || "pending"}`,
    page: "media",
    tone: sentimentClass(item.sentiment),
    keywords: [item.summary, item.fullSummary, item.entities, item.quotes],
    action: { storyId: item.id, mediaTab: "mentions" },
  })));
  developmentProjectMapItems().forEach((item) => entries.push(searchEntry({
    section: "Development",
    type: item.project_type || "Project",
    title: item.name,
    summary: `${item.address || "Address pending"} · ${item.board || "Board source"} · ${item.dateLabel}`,
    page: "development",
    tone: String(item.board || "").includes("Planning") ? "blue" : "purple",
    keywords: [item.status, item.geocode_status, item.source_url],
    action: { sourceUrl: item.source_url },
  })));
  (state.meetings || []).forEach((item) => entries.push(searchEntry({
    section: "Meetings",
    type: item.event_type || "Meeting",
    title: item.title,
    summary: `${item.starts_at ? new Date(item.starts_at).toLocaleString() : item.date || "Date pending"} · ${item.location || "Location pending"}`,
    page: "events",
    tone: "orange",
    keywords: [item.status, item.notes, item.source_url],
  })));
  (state.budget || []).forEach((item) => entries.push(searchEntry({
    section: "Budget",
    type: item.status || "Watch",
    title: `${item.department || "Department"} · ${item.line_item || "Budget item"}`,
    summary: `${item.fiscal_year || "FY"} · ${item.concern || "Review"}`,
    page: "budget",
    tone: "green",
    keywords: [item.notes],
  })));
  ((state.publicSafety && state.publicSafety.incidents) || []).forEach((item) => entries.push(searchEntry({
    section: "Public Safety",
    type: item.severity || item.category || "Incident",
    title: item.title,
    summary: `${item.location || "South Ward"} · ${item.category_label || item.category || "Incident"} · ${item.status || "reported"}`,
    page: "publicSafety",
    tone: publicSafetyTone(item.category, item.severity),
    keywords: [item.notes, item.source_file],
  })));
  state.officeActions.forEach((item) => entries.push(searchEntry({
    section: "Actions",
    type: item.status || "Action",
    title: item.title,
    summary: `${item.owner || "Unassigned"} · ${item.priority || "normal"} · ${item.notes || "No notes"}`,
    page: "dashboard",
    tone: item.priority === "high" ? "red" : "blue",
    keywords: [item.action_type, item.source_type],
  })));
  configuredTopics().forEach(([topic, , tone]) => entries.push(searchEntry({
    section: "Topic",
    type: "Saved search",
    title: topic,
    summary: "Filter media, cases, legislation, and development signals by this issue.",
    page: "media",
    tone,
    keywords: [topic],
    action: { mediaTopic: topic, mediaTab: "mentions" },
  })));
  return entries;
}

function scoreSearchEntry(entry, terms) {
  return terms.reduce((score, term) => {
    if (!term) return score;
    const title = entry.title.toLowerCase();
    const section = entry.section.toLowerCase();
    if (title === term) return score + 90;
    if (title.startsWith(term)) score += 35;
    if (title.includes(term)) score += 22;
    if (section.includes(term)) score += 12;
    if (entry.text.includes(term)) score += 8;
    return score;
  }, 0);
}

function globalSearchResults(query = state.search) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return buildSearchIndex()
    .map((entry) => ({ ...entry, score: scoreSearchEntry(entry, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 10);
}

function renderSearchPanel() {
  const panel = document.getElementById("globalSearchPanel");
  if (!panel) return;
  const query = state.search.trim();
  if (!query) {
    panel.classList.remove("open");
    panel.innerHTML = "";
    return;
  }
  const results = globalSearchResults(query);
  const grouped = results.reduce((acc, item) => {
    acc[item.section] = [...(acc[item.section] || []), item];
    return acc;
  }, {});
  panel.classList.add("open");
  panel.innerHTML = h`
    <div class="search-panel-head">
      <strong>Deep Search</strong>
      <small>${results.length ? `${results.length} matches` : "No matches yet"}</small>
    </div>
    ${results.length ? Object.entries(grouped).map(([section, rows]) => `
      <section class="search-group">
        <h3>${section}</h3>
        ${rows.map((row) => `
          <button class="search-result" data-search-result="${row.page}" data-search-action='${JSON.stringify(row.action || {}).replace(/'/g, "&apos;")}'>
            <span class="rank ${row.tone}">${section.slice(0, 1)}</span>
            <span><strong>${row.title}</strong><small>${row.type} · ${row.summary}</small></span>
          </button>
        `).join("")}
      </section>
    `).join("") : `<div class="empty small">Try a resident name, address, ordinance, source, topic, department, or board item.</div>`}
    <div class="search-tips">
      <span>Try: “parking”, “Ward Street”, “tree”, “budget”, “Zoning”, “public safety”</span>
    </div>
  `;
}

function applySearchResult(page, action = {}) {
  if (action.tab) state.tab = action.tab;
  if (action.legislationTab) state.legislationTab = action.legislationTab;
  if (action.legislationId) {
    state.selectedLegislationId = action.legislationId;
    state.legislationDetailOpen = true;
  }
  if (action.mediaTab) state.mediaTab = action.mediaTab;
  if (action.storyId) state.selectedStoryId = action.storyId;
  if (action.mediaTopic) state.mediaFilters.topic = action.mediaTopic;
  state.page = page || state.page;
  setMobileNav(false);
  render();
  if (action.caseId) {
    state.selectedCaseId = action.caseId;
    state.caseDetailTab = "overview";
    loadCaseDetail(action.caseId).then(render);
  }
  if (action.constituentId || action.constituentName) {
    openConstituentFile({
      constituentId: action.constituentId,
      name: action.constituentName,
      address: action.constituentAddress,
    });
  }
}

function eventTimeValue(row) {
  const raw = row?.starts_at || row?.date || row?.created_at || "";
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function formatEventDate(row) {
  const raw = row?.starts_at || row?.date || "";
  if (!raw) return "Date pending";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw).slice(0, 16);
  return date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function isAttendedEvent(row) {
  const status = String(row?.status || "").toLowerCase();
  const type = String(row?.event_type || "").toLowerCase();
  return status.includes("attended") || status.includes("completed") || type.includes("attended");
}

function eventRows(rows) {
  if (!rows.length) return `<div class="empty">No events match this view.</div>`;
  return rows.map((row) => h`
    <article class="list-row">
      <span><strong>${row.title || "Untitled event"}</strong><br><small class="muted">${formatEventDate(row)} · ${row.location || "Location pending"}</small></span>
      <span><small class="muted">Type</small><br>${row.event_type || "event"}</span>
      <span class="status ${isAttendedEvent(row) ? "good" : "info"}">${row.status || "scheduled"}</span>
    </article>
  `).join("");
}

function eventsPage() {
  const now = Date.now();
  const searched = filterRows(state.meetings || [], ["title", "location", "event_type", "status", "notes", "source_url"]);
  const upcoming = searched.filter((row) => eventTimeValue(row) >= now || !eventTimeValue(row)).sort((a, b) => eventTimeValue(a) - eventTimeValue(b));
  const past = searched.filter((row) => eventTimeValue(row) && eventTimeValue(row) < now).sort((a, b) => eventTimeValue(b) - eventTimeValue(a));
  const attended = searched.filter(isAttendedEvent).sort((a, b) => eventTimeValue(b) - eventTimeValue(a));
  return h`
    <div class="page-head">
      <div><h1>Events</h1><p class="muted">Manual entry for past and future office events, city meetings, attended appearances, and preparation notes.</p></div>
      <button class="primary" data-open-modal="event">Add Event</button>
    </div>
    <section class="grid metrics">
      ${metric(upcoming.length, "Upcoming", "Scheduled or tentative", "blue")}
      ${metric(past.length, "Past Events", "Historical activity", "orange")}
      ${metric(attended.length, "Attended", "Included in reports", "green")}
      ${metric(searched.length, "All Events", "City + manual", "purple")}
    </section>
    <section class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <div class="panel-header"><h2>Upcoming Events</h2><button class="secondary" data-open-draft="Upcoming Events Brief">Draft Brief</button></div>
        <div class="panel-body list">${eventRows(upcoming)}</div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Attended & Completed</h2><button class="secondary" data-open-draft="Attended Events Report">Report Draft</button></div>
        <div class="panel-body list">${eventRows(attended.length ? attended : past)}</div>
      </section>
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="panel-header"><h2>All Event Records</h2><span class="muted">Search names, locations, notes, and event types from the top bar.</span></div>
      <div class="panel-body list">${eventRows(searched)}</div>
    </section>
  `;
}

function reportsPage() {
  const attended = (state.meetings || []).filter(isAttendedEvent).sort((a, b) => eventTimeValue(b) - eventTimeValue(a));
  const cases = (state.cases || []).slice(0, 10);
  const stories = mediaFilteredStories().slice(0, 5);
  return h`
    <div class="page-head">
      <div><h1>Reports</h1><p class="muted">Build ward reports, staff summaries, attended-event logs, and briefing packets from persistent WardOS records.</p></div>
      <button class="primary" data-open-draft="Ward Report">Create Report Draft</button>
    </div>
    <section class="grid metrics">
      ${metric(attended.length, "Attended Events", "Ready for reports", "green")}
      ${metric(cases.length, "Recent Cases", "Resident needs", "blue")}
      ${metric(stories.length, "Media Signals", "Current pulse", "purple")}
      ${metric(state.officeActions.length, "Staff Actions", "Drafts and logs", "orange")}
    </section>
    <section class="grid two-col" style="margin-top:16px">
      <section class="panel">
        <div class="panel-header"><h2>Attended Events Log</h2><button class="secondary" data-open-draft="Attended Events Log">Open Draft</button></div>
        <div class="panel-body list">${eventRows(attended)}</div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Report Builders</h2></div>
        <div class="panel-body report-grid">
          ${[
            ["Monthly Ward Report", "Cases, attended events, legislation, budget watch, public safety, and media pulse."],
            ["Constituent Needs Report", "Open resident requests grouped by issue, street, status, and priority."],
            ["Media and Pulse Brief", "Hourly media signals, alerts, topic movement, and recommended responses."],
            ["Council Preparation Packet", "Meetings, legislation, development items, questions, and follow-ups."],
          ].map(([title, copy]) => `
            <article class="report-card">
              <strong>${title}</strong>
              <p>${copy}</p>
              <button class="secondary" data-open-draft="${title}">Open Draft</button>
            </article>
          `).join("")}
        </div>
      </section>
    </section>
    <section class="grid two-col" style="margin-top:16px">
      <section class="panel"><div class="panel-header"><h2>Recent Constituent Needs</h2></div><div class="panel-body list">${caseRows(cases)}</div></section>
      <section class="panel"><div class="panel-header"><h2>Media Items for Briefing</h2></div><div class="panel-body list">${stories.map((story) => `<div class="list-row"><span><strong>${story.headline}</strong><br><small class="muted">${story.source} · ${story.topic}</small></span><span></span><span class="status ${sentimentClass(story.sentiment)}">${story.sentiment}</span></div>`).join("") || `<div class="empty">No media items match.</div>`}</div></section>
    </section>
  `;
}

function renderPage() {
  const routes = {
    home: homePage,
    briefing: briefingPage,
    dashboard: dashboardPage,
    constituents: constituentsPage,
    legislation: legislationPage,
    budget: budgetPage,
    development: developmentPage,
    projects: () => genericPage("Projects & DPW", "Track field work, DPW handoffs, service requests, and project follow-ups."),
    maps: () => genericPage("Maps", "Spatial view for issues, cases, developments, and service patterns."),
    reports: reportsPage,
    progress: progressPage,
    events: eventsPage,
    media: mediaPage,
    publicSafety: publicSafetyPage,
    settings: settingsPage,
  };
  document.getElementById("page").innerHTML = (routes[state.page] || briefingPage)();
  document.getElementById("crumbs").textContent = navItems.find(([key]) => key === state.page)?.[2] || "WardOS";
}

function render() {
  renderNav();
  renderPage();
  renderSearchPanel();
  bindEvents();
  initOpenMaps();
}

function bindEvents() {
  const mobileNavToggle = document.getElementById("mobileNavToggle");
  if (mobileNavToggle) mobileNavToggle.onclick = () => {
    const isOpen = document.querySelector(".sidebar")?.classList.contains("mobile-nav-open");
    setMobileNav(!isOpen);
  };

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.page = button.dataset.page;
      setMobileNav(false);
      render();
    });
  });
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      render();
    });
  });
  document.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.openModal));
  });
  document.querySelectorAll("[data-open-draft]").forEach((button) => {
    button.addEventListener("click", () => openDraft(button.dataset.openDraft));
  });
  document.querySelectorAll("[data-search-result]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.searchAction ? JSON.parse(button.dataset.searchAction) : {};
      applySearchResult(button.dataset.searchResult, action);
    });
  });
  document.querySelectorAll("[data-action]").forEach((input) => {
    input.addEventListener("change", () => {
      state.completedActions = input.checked
        ? [...new Set([...state.completedActions, input.dataset.action])]
        : state.completedActions.filter((action) => action !== input.dataset.action);
      saveActions();
    });
  });
  document.getElementById("markAllRead")?.addEventListener("click", () => {
    state.completedActions = ["Follow up with DPW on tree requests", "Prepare talking points for 622 S. Center St", "Review Public Works budget overage", "Visit Central Ave streetlight issue", "Draft Ward Report - May edition"];
    saveActions();
    render();
  });
  document.getElementById("saveApiBase")?.addEventListener("click", () => {
    const value = document.getElementById("apiBaseInput").value.trim();
    localStorage.setItem("wardosApiBase", value);
    location.reload();
  });
  document.querySelectorAll("[data-media-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      state.mediaFilters[select.dataset.mediaFilter] = select.value;
      const firstMatch = mediaFilteredStories()[0];
      if (firstMatch) state.selectedStoryId = firstMatch.id;
      render();
    });
  });
  document.querySelectorAll("[data-media-topic]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mediaFilters.topic = button.dataset.mediaTopic;
      const firstMatch = mediaFilteredStories()[0];
      if (firstMatch) state.selectedStoryId = firstMatch.id;
      render();
    });
  });
  document.querySelectorAll("[data-media-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mediaTab = button.dataset.mediaTab;
      render();
    });
  });
  document.querySelectorAll("[data-leg-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.legislationTab = button.dataset.legTab;
      render();
    });
  });
  document.querySelectorAll("[data-story-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStoryId = button.dataset.storyId;
      render();
    });
  });
  document.querySelectorAll("[data-legislation-id]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedLegislationId = row.dataset.legislationId;
      state.legislationDetailOpen = true;
      render();
    });
  });
  document.querySelector("[data-close-legislation-detail]")?.addEventListener("click", () => {
    state.legislationDetailOpen = false;
    render();
  });
  document.querySelectorAll("[data-open-source]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const story = (state.mediaStories || []).find((item) => item.id === button.dataset.openSource);
      if (story) {
        postJson("/office-actions", {
          title: `Opened source: ${story.headline}`,
          notes: `External source opened for staff review: ${story.url}`,
          action_type: "source_review",
          status: "logged",
          priority: "normal",
          source_type: "media_mention",
          source_id: story.id,
        }).catch(() => null);
        window.open(story.url, "_blank", "noopener,noreferrer");
      }
    });
  });
  document.querySelector("[data-media-filter-reset]")?.addEventListener("click", () => {
    state.mediaFilters = {
      dateRange: "Last 24 Hours",
      sourceType: "All Sources",
      ward: "All Wards",
      topic: "All Topics",
      sentiment: "All Sentiment",
    };
    state.selectedStoryId = (state.mediaStories[0] || {}).id || "";
    render();
  });
  document.querySelector("[data-import-media-sources]")?.addEventListener("click", async () => {
    await postJson("/media-monitor/import-sources", {}).catch(() => null);
    state.sourceConnections = await getJson("/source-connections", state.sourceConnections);
    render();
  });
  document.querySelector("[data-import-staff-users]")?.addEventListener("click", async () => {
    await postJson("/staff/import-users", {}).catch(() => null);
    state.staffUsers = await getJson("/staff/users", state.staffUsers);
    state.staffRoles = await getJson("/staff/roles", state.staffRoles);
    render();
  });
  document.querySelector("[data-sync-development]")?.addEventListener("click", async () => {
    await postJson("/development-watch/sync", {}).catch(showSaveError);
    state.developmentWatch = await getJson("/development-watch", state.developmentWatch || developmentWatchFallback());
    state.developments = await getJson("/development-projects", state.developments);
    state.dashboardOverview = await getJson("/dashboard/overview", state.dashboardOverview || operationalOverviewFallback());
    render();
  });
  document.querySelector("[data-sync-public-safety]")?.addEventListener("click", async () => {
    await postJson("/public-safety/sync", {}).catch(showSaveError);
    state.publicSafety = await getJson("/public-safety", state.publicSafety || publicSafetyFallback());
    state.dashboardOverview = await getJson("/dashboard/overview", state.dashboardOverview || operationalOverviewFallback());
    render();
  });
  document.querySelectorAll("[data-select-case]").forEach((button) => {
    button.addEventListener("click", () => selectCase(button.dataset.selectCase).catch(showSaveError));
  });
  document.querySelectorAll("[data-case-detail-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.caseDetailTab = button.dataset.caseDetailTab;
      render();
    });
  });
  document.querySelectorAll("[data-case-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      state.caseFilters[select.dataset.caseFilter] = select.value;
      render();
    });
  });
  document.querySelectorAll("[data-case-quick-update]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = state.selectedCaseId;
      if (id == null) return;
      updateCase(id, { [input.dataset.caseQuickUpdate]: input.value }).then(render).catch(showSaveError);
    });
  });
  document.querySelectorAll("[data-regenerate-summary]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.regenerateSummary;
      button.disabled = true;
      button.textContent = "Generating…";
      try {
        await postJson(`/cases/${id}/ai-summary`, {});
        await loadCaseDetail(id);
      } catch (error) {
        showSaveError(error);
      }
      render();
    });
  });
  document.querySelectorAll("[data-convert-work-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.convertWorkOrder;
      try {
        await postJson(`/cases/${id}/work-order`, {});
        state.officeActions = await getJson("/office-actions", state.officeActions);
        await loadCaseDetail(id);
      } catch (error) {
        showSaveError(error);
      }
      render();
    });
  });
  document.querySelectorAll("[data-view-directory]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = "directory";
      state.search = button.dataset.viewDirectory;
      render();
      renderSearchPanel();
    });
  });
  document.querySelectorAll("[data-open-case-for]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const payload = JSON.parse(button.dataset.openCaseFor);
      openCaseModalFor(payload.name, payload.address);
    });
  });
  document.querySelectorAll("[data-open-constituent-file]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const payload = JSON.parse(button.dataset.openConstituentFile);
      openConstituentFile({ constituentId: payload.constituentId, name: payload.name, address: payload.address }).catch(showSaveError);
    });
  });
  document.querySelector("[data-close-constituent-file]")?.addEventListener("click", closeConstituentFile);
  document.querySelectorAll("[data-constituent-file-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.constituentFileTab = button.dataset.constituentFileTab;
      render();
    });
  });
  document.querySelectorAll("[data-case-list-status]").forEach((select) => {
    select.addEventListener("click", (event) => event.stopPropagation());
    select.addEventListener("change", () => {
      const id = select.dataset.caseListStatus;
      updateCase(id, { status: select.value }).then(render).catch(showSaveError);
    });
  });
  document.querySelectorAll("[data-delete-case]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteCase;
      const row = state.cases.find((item) => String(item.id) === String(id));
      const label = row?.case_number || `#${id}`;
      if (!window.confirm(`Delete case ${label}? This removes it from active dashboards but keeps an audit trail.`)) return;
      const typed = window.prompt(`Final confirmation for ${label}: type DELETE to remove this case from active records.`);
      if (String(typed || "").trim().toUpperCase() !== "DELETE") return;
      try {
        await deleteCase(id);
        render();
      } catch (error) {
        showSaveError(error);
      }
    });
  });
  document.querySelectorAll("[data-edit-note]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingNoteId = button.dataset.editNote;
      render();
    });
  });
  document.querySelectorAll("[data-cancel-edit-note]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingNoteId = null;
      render();
    });
  });
  document.querySelectorAll("[data-edit-note-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const noteId = form.dataset.editNoteForm;
      const id = state.selectedCaseId;
      const body = new FormData(form).get("body");
      try {
        await postJson(`/cases/${id}/notes/${noteId}`, { body });
        state.editingNoteId = null;
        await loadCaseDetail(id);
        render();
      } catch (error) {
        showSaveError(error);
      }
    });
  });
  document.getElementById("caseNoteForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = state.selectedCaseId;
    const form = new FormData(event.currentTarget);
    try {
      await postJson(`/cases/${id}/notes`, { body: form.get("body") });
      await loadCaseDetail(id);
      render();
    } catch (error) {
      showSaveError(error);
    }
  });
  document.getElementById("caseCommunicationForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = state.selectedCaseId;
    const payload = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await postJson(`/cases/${id}/communications`, payload);
      await loadCaseDetail(id);
      render();
    } catch (error) {
      showSaveError(error);
    }
  });
  document.getElementById("caseFileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = state.selectedCaseId;
    const form = event.currentTarget;
    const fileInput = form.elements.file;
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    try {
      await postForm(`/cases/${id}/attachments`, formData);
      state.cases = await getJson("/cases", state.cases);
      await loadCaseDetail(id);
      render();
    } catch (error) {
      showSaveError(error);
    }
  });
}

function openModal(type) {
  const titles = {
    quick: ["Quick Add", "Choose an Intake Type"],
    case: ["Manual Add", "New Constituent Case"],
    event: ["Manual Add", "New Event"],
    legislation: ["Manual Add", "New Legislation Item"],
    budget: ["Manual Add", "New Budget Watch Item"],
    publicSafety: ["Manual Add", "New Public Safety Incident"],
    note: ["Manual Add", "New Note"],
  };
  const [eyebrow, title] = titles[type] || titles.quick;
  document.getElementById("modalEyebrow").textContent = eyebrow;
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = modalContent(type);
  document.getElementById("modalBackdrop").classList.add("open");
  document.getElementById("modalBackdrop").setAttribute("aria-hidden", "false");
  bindModalForms(type);
}

function openCaseModalFor(name, address) {
  openModal("case");
  const form = document.getElementById("caseForm");
  if (!form) return;
  if (form.elements.constituent_name) form.elements.constituent_name.value = name || "";
  if (form.elements.address_line) form.elements.address_line.value = address || "";
}

function openDraft(title) {
  document.getElementById("modalEyebrow").textContent = "Draft Only";
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = h`
    <form class="form-grid" id="draftForm">
      <p class="muted">This creates a local staff-review draft. It does not send, post, or publish anything.</p>
      <div class="field"><label>Draft Title</label><input name="title" value="${title}"></div>
      <div class="field"><label>Draft Body</label><textarea name="body">Follow up needed on ${title}. Add verified facts, owner, deadline, and staff approval before any external action.</textarea></div>
      <div class="button-row"><button class="primary" type="submit">Save Draft</button><button class="secondary" type="button" id="cancelModal">Cancel</button></div>
    </form>
  `;
  document.getElementById("modalBackdrop").classList.add("open");
  document.getElementById("modalBackdrop").setAttribute("aria-hidden", "false");
  document.getElementById("draftForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = form.get("title");
    const body = form.get("body");
    postJson("/office-actions", {
      title,
      notes: body,
      action_type: "draft_follow_up",
      status: "draft",
      priority: "normal",
      source_type: "wardos_ui",
    })
      .then(() => getJson("/office-actions", []))
      .then((actions) => {
        state.officeActions = actions;
        state.drafts = actions.filter((action) => ["draft_follow_up", "note"].includes(action.action_type));
      })
      .catch(showSaveError)
      .finally(() => {
        closeModal();
        render();
      });
  });
  document.getElementById("cancelModal").addEventListener("click", closeModal);
}

function modalContent(type) {
  if (type === "quick") {
    return h`
      <div class="action-grid">
        <button class="action-tile" data-open-modal="case"><strong>＋</strong><span>Add Request</span></button>
        <button class="action-tile" data-open-modal="event"><strong>◫</strong><span>Add Event</span></button>
        <button class="action-tile" data-open-modal="legislation"><strong>▧</strong><span>Add Legislation</span></button>
        <button class="action-tile" data-open-modal="budget"><strong>▤</strong><span>Add Budget</span></button>
        <button class="action-tile" data-open-modal="publicSafety"><strong>◈</strong><span>Public Safety</span></button>
        <button class="action-tile" data-open-draft="Resident Follow-up"><strong>✉</strong><span>Draft Follow-up</span></button>
        <button class="action-tile" data-open-draft="Media Response"><strong>◉</strong><span>Media Draft</span></button>
        <button class="action-tile" data-open-draft="Research Task"><strong>✦</strong><span>AI Research</span></button>
      </div>
    `;
  }
  if (type === "case") {
    return h`
      <form class="form-grid" id="caseForm">
        ${constituentDatalists()}
        <div class="field"><label>Constituent Name</label><input name="constituent_name" required placeholder="Resident name" list="constituentNameOptions" autocomplete="off"></div>
        <div class="field"><label>Address Line</label><input name="address_line" placeholder="Optional address" list="constituentAddressOptions" autocomplete="off"></div>
        <div class="field"><label>Phone</label><input name="phone" type="tel" placeholder="Optional phone number"></div>
        <div class="field"><label>Email</label><input name="email" type="email" placeholder="Optional email address"></div>
        <div class="field"><label>Need / Topic</label><input name="topic" required placeholder="Streetlight outage"></div>
        <div class="field"><label>Category</label><select name="category"><option value="">Uncategorized</option>${CASE_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join("")}</select></div>
        <div class="field"><label>Department</label><select name="department"><option value="">Unassigned</option>${CASE_DEPARTMENTS.map((d) => `<option value="${d}">${d}</option>`).join("")}</select></div>
        <div class="field"><label>Assigned To</label><input name="assigned_to" placeholder="Staff member or team"></div>
        <div class="field"><label>Ward</label><select name="ward">${CASE_WARDS.map((w) => `<option value="${w}" ${w === "South Ward" ? "selected" : ""}>${w}</option>`).join("")}</select></div>
        <div class="field"><label>Source</label><select name="source">${CASE_SOURCES.map((s) => `<option value="${s}">${s}</option>`).join("")}</select></div>
        <div class="field"><label>Priority</label><select name="priority">${CASE_PRIORITIES.map((p) => `<option value="${p}" ${p === "normal" ? "selected" : ""}>${p}</option>`).join("")}</select></div>
        <div class="field"><label>Status</label><select name="status">${CASE_STATUSES.map((s) => `<option value="${s}" ${s === "open" ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label>Resolution Goal</label><input name="due_at" type="datetime-local"></div>
        <div class="field"><label>Notes</label><textarea name="notes" placeholder="Location, department, missing details, and next action"></textarea></div>
        <button class="primary" type="submit">Add Constituent Case</button>
      </form>
    `;
  }
  if (type === "legislation") {
    return h`
      <form class="form-grid" id="legislationForm">
        <div class="field"><label>Bill / Ordinance Number</label><input name="bill_number" required placeholder="ORD-25-18"></div>
        <div class="field"><label>Title</label><input name="title" required placeholder="Parking Requirements - Amendment"></div>
        <div class="field"><label>Status</label><input name="status" value="tracking"></div>
        <div class="field"><label>Notes</label><textarea name="notes" placeholder="Hearing date, sponsor, questions, missing source docs"></textarea></div>
        <button class="primary" type="submit">Add Legislation</button>
      </form>
    `;
  }
  if (type === "event") {
    return h`
      <form class="form-grid" id="eventForm">
        <div class="field"><label>Event Title</label><input name="title" required placeholder="Community meeting, council hearing, site visit"></div>
        <div class="field"><label>Date and Time</label><input name="starts_at" type="datetime-local"></div>
        <div class="field"><label>Location</label><input name="location" placeholder="City Hall, South Ward address, virtual link"></div>
        <div class="field"><label>Event Type</label><select name="event_type"><option value="office_event">Office Event</option><option value="meeting">Meeting</option><option value="community_event">Community Event</option><option value="attended_event">Attended Event</option><option value="city_event">City Event</option><option value="outreach">Outreach</option><option value="other">Other</option></select></div>
        <div class="field"><label>Status</label><select name="status"><option>scheduled</option><option>tentative</option><option>attended</option><option>completed</option><option>cancelled</option></select></div>
        <div class="field"><label>Source URL</label><input name="source_url" type="url" placeholder="Optional agenda, flyer, or calendar link"></div>
        <div class="field"><label>Notes</label><textarea name="notes" placeholder="Purpose, attendees, follow-ups, departments, and report-ready summary"></textarea></div>
        <button class="primary" type="submit">Save Event</button>
      </form>
    `;
  }
  if (type === "budget") {
    return h`
      <form class="form-grid" id="budgetForm">
        <div class="field"><label>Department</label><input name="department" required placeholder="Public Works"></div>
        <div class="field"><label>Line Item</label><input name="line_item" required placeholder="Sanitation overtime"></div>
        <div class="field"><label>Fiscal Year</label><input name="fiscal_year" required value="FY2026"></div>
        <div class="field"><label>Status</label><input name="status" value="watching"></div>
        <div class="field"><label>Concern</label><textarea name="concern" placeholder="Variance, question, or savings idea"></textarea></div>
        <button class="primary" type="submit">Add Budget Item</button>
      </form>
    `;
  }
  if (type === "publicSafety") {
    return h`
      <form class="form-grid" id="publicSafetyForm">
        <div class="field"><label>Incident Title</label><input name="title" required placeholder="Traffic collision"></div>
        <div class="field"><label>Category</label><select name="category"><option value="traffic">Traffic</option><option value="violent">Violent</option><option value="quality_of_life">Quality of Life</option><option value="infrastructure">Infrastructure</option><option value="other">Other</option></select></div>
        <div class="field"><label>Location</label><input name="location" placeholder="Street or intersection"></div>
        <div class="field"><label>Severity</label><select name="severity"><option>medium</option><option>high</option><option>low</option></select></div>
        <div class="field"><label>Status</label><select name="status"><option>reported</option><option>under review</option><option>resolved</option><option>closed</option></select></div>
        <div class="field"><label>Occurred At</label><input name="occurred_at" type="datetime-local"></div>
        <div class="field"><label>Notes</label><textarea name="notes" placeholder="Briefing excerpt, source detail, staff follow-up, and verification notes"></textarea></div>
        <button class="primary" type="submit">Add Public Safety Incident</button>
      </form>
    `;
  }
  return h`
    <form class="form-grid" id="noteForm">
      <div class="field"><label>Title</label><input name="title" required></div>
      <div class="field"><label>Note</label><textarea name="body" required></textarea></div>
      <button class="primary" type="submit">Save Note</button>
    </form>
  `;
}

function bindModalForms(type) {
  document.querySelectorAll("#modalBody [data-open-modal]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.openModal));
  });
  document.querySelectorAll("#modalBody [data-open-draft]").forEach((button) => {
    button.addEventListener("click", () => openDraft(button.dataset.openDraft));
  });
  if (type === "case") bindCaseAutofill();
  const handlers = {
    case: async (form) => {
      const payload = Object.fromEntries(new FormData(form));
      if (!payload.due_at) delete payload.due_at;
      const created = await postJson("/cases", payload);
      await refreshOperationalData();
      state.tab = "cases";
      await selectCase(created.id);
    },
    event: async (form) => {
      const payload = Object.fromEntries(new FormData(form));
      if (!payload.starts_at) delete payload.starts_at;
      await postJson("/events", payload);
      await refreshOperationalData();
    },
    legislation: async (form) => {
      const payload = Object.fromEntries(new FormData(form));
      await postJson("/legislation", payload);
      await refreshOperationalData();
    },
    budget: async (form) => {
      const payload = Object.fromEntries(new FormData(form));
      await postJson("/budget-watch", payload);
      await refreshOperationalData();
    },
    publicSafety: async (form) => {
      const payload = Object.fromEntries(new FormData(form));
      if (!payload.occurred_at) delete payload.occurred_at;
      await postJson("/public-safety/incidents", payload);
      state.publicSafety = await getJson("/public-safety", state.publicSafety || publicSafetyFallback());
      state.dashboardOverview = await getJson("/dashboard/overview", state.dashboardOverview || operationalOverviewFallback());
    },
    note: async (form) => {
      const payload = Object.fromEntries(new FormData(form));
      await postJson("/office-actions", {
        title: payload.title,
        notes: payload.body,
        action_type: "note",
        status: "draft",
        priority: "normal",
        source_type: "wardos_ui",
      });
      await refreshOperationalData();
    },
  };
  const form = document.querySelector("#modalBody form");
  if (form && handlers[type]) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await handlers[type](form);
        closeModal();
        render();
      } catch (error) {
        showSaveError(error);
      }
    });
  }
}

function findConstituentByName(name) {
  const value = String(name || "").trim().toLowerCase();
  if (!value) return null;
  return (state.constituentSearch || state.constituents || []).find((row) => String(row.full_name || "").trim().toLowerCase() === value) || null;
}

function findConstituentByAddress(address) {
  const value = String(address || "").trim().toLowerCase();
  if (!value) return null;
  return (state.constituentSearch || state.constituents || []).find((row) => constituentAddress(row).trim().toLowerCase() === value) || null;
}

function bindCaseAutofill() {
  const form = document.getElementById("caseForm");
  if (!form) return;
  const nameInput = form.elements.constituent_name;
  const addressInput = form.elements.address_line;
  if (!nameInput || !addressInput) return;
  nameInput.addEventListener("input", () => {
    const match = findConstituentByName(nameInput.value);
    if (match && !addressInput.value.trim()) addressInput.value = constituentAddress(match);
  });
  addressInput.addEventListener("input", () => {
    const match = findConstituentByAddress(addressInput.value);
    if (match && !nameInput.value.trim()) nameInput.value = match.full_name;
  });
}

function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("open");
  document.getElementById("modalBackdrop").setAttribute("aria-hidden", "true");
}

document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("modalBackdrop").addEventListener("click", (event) => {
  if (event.target.id === "modalBackdrop") closeModal();
});
document.getElementById("globalSearch").addEventListener("input", (event) => {
  state.search = event.target.value;
  scheduleConstituentDeepSearch(state.search);
  renderPage();
  renderSearchPanel();
  bindEvents();
  initOpenMaps();
});
document.getElementById("globalSearch").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    state.search = "";
    event.target.value = "";
    renderPage();
    renderSearchPanel();
    bindEvents();
    initOpenMaps();
  }
  if (event.key === "Enter") {
    const top = globalSearchResults(event.target.value)[0];
    if (top) applySearchResult(top.page, top.action);
  }
});
document.addEventListener("click", (event) => {
  const panel = document.getElementById("globalSearchPanel");
  const search = document.querySelector(".search");
  if (panel && search && !search.contains(event.target)) panel.classList.remove("open");
});

loadData();
