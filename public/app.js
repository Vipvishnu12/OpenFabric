const state = {
  auth0: null,
  config: null,
  user: null,
  history: [],
  busy: false,
};

const resourcePresets = [
  { method: "GET", path: "/transactions", label: "Transactions", note: "Collection read" },
  { method: "DELETE", path: "/transactions/txn-456", label: "Transaction item", note: "Single record" },
  { method: "GET", path: "/wallets/wallet-789/transactions", label: "Wallet transactions", note: "Nested collection" },
  { method: "POST", path: "/wallets/wallet-456/transactions/txn-999", label: "Nested write", note: "Wildcard path" },
  { method: "GET", path: "/accounts/acc-123/settings", label: "Account settings", note: "Specific resource" },
  { method: "GET", path: "/unmatched/resource", label: "Unmatched path", note: "Default deny" },
];

const dom = {
  loginScreen: document.getElementById("login-screen"),
  dashboardShell: document.getElementById("dashboard-shell"),
  banner: document.getElementById("banner"),
  dashboardBanner: document.getElementById("dashboard-banner"),
  historyList: document.getElementById("history-list"),
  loginButton: document.getElementById("login-button"),
  loginPrimaryButton: document.getElementById("login-primary-button"),
  logoutButton: document.getElementById("logout-button"),
  authState: document.getElementById("auth-state"),
  authAudience: document.getElementById("auth-audience"),
  userName: document.getElementById("user-name"),
  userEmail: document.getElementById("user-email"),
  userSub: document.getElementById("user-sub"),
  authorizeButton: document.getElementById("authorize-button"),
  authorizeForm: document.getElementById("authorize-form"),
  methodSelect: document.getElementById("method-select"),
  pathInput: document.getElementById("path-input"),
  requestStatus: document.getElementById("request-status"),
  responseBody: document.getElementById("response-body"),
  resourceList: document.getElementById("resource-list"),
};

const setBanner = (message, tone = "error", target = "login") => {
  const bannerTarget = target === "dashboard" ? dom.dashboardBanner : dom.banner;

  if (!message) {
    bannerTarget.className = "banner hidden";
    bannerTarget.textContent = "";
    return;
  }

  bannerTarget.className = `banner ${tone}`;
  bannerTarget.textContent = message;
};

const setBusy = (isBusy) => {
  state.busy = isBusy;
  dom.authorizeButton.disabled = isBusy;
  dom.loginButton.disabled = isBusy;
  dom.loginPrimaryButton.disabled = isBusy;
  dom.logoutButton.disabled = isBusy;
  dom.authorizeButton.textContent = isBusy ? "Checking..." : "Check authorization";
};

const setRequestStatus = (message) => {
  dom.requestStatus.textContent = message;
};

const renderUser = () => {
  const isAuthenticated = Boolean(state.user);

  dom.loginScreen.classList.toggle("hidden", isAuthenticated);
  dom.dashboardShell.classList.toggle("hidden", !isAuthenticated);
  dom.authState.textContent = isAuthenticated ? "Authenticated" : "Signed out";
  dom.authAudience.textContent = state.config?.auth0Audience ?? "-";
  dom.loginButton.classList.toggle("hidden", isAuthenticated);
  dom.logoutButton.classList.toggle("hidden", !isAuthenticated);

  dom.userName.textContent = state.user?.name || state.user?.nickname || "-";
  dom.userEmail.textContent = state.user?.email || "-";
  dom.userSub.textContent = state.user?.sub || "-";

  dom.authorizeButton.disabled = !isAuthenticated || state.busy;
};

const renderResources = () => {
  dom.resourceList.innerHTML = resourcePresets
    .map(
      (resource) => `
        <button class="resource-chip" type="button" data-method="${resource.method}" data-path="${resource.path}">
          ${resource.label}
          <small>${resource.note}</small>
        </button>
      `,
    )
    .join("");

  dom.resourceList.querySelectorAll(".resource-chip").forEach((button) => {
    button.addEventListener("click", () => {
      dom.methodSelect.value = button.dataset.method || "GET";
      dom.pathInput.value = button.dataset.path || "/transactions";
    });
  });
};

const formatJson = (value) => JSON.stringify(value, null, 2);

const pushHistory = (entry) => {
  state.history.unshift(entry);
  state.history = state.history.slice(0, 8);

  dom.historyList.innerHTML = state.history
    .map(
      (item) => `
        <li>
          <div class="history-line">
            <strong>${item.method} ${item.path}</strong>
            <span class="pill muted">${item.decision}</span>
          </div>
          <div class="history-meta">${item.timestamp} · ${item.message}</div>
        </li>
      `,
    )
    .join("");
};

const showResult = (payload) => {
  dom.responseBody.textContent = formatJson(payload);
};

const showError = (message, target = "login") => {
  setBanner(message, "error", target);
};

const clearBanner = (target = "login") => setBanner("", "error", target);

const getApiBaseUrl = () => state.config?.apiBaseUrl || window.location.origin;

const ensureAuthClient = () => {
  if (!state.auth0) {
    throw new Error("Authentication client is not ready. Check your Auth0 configuration and refresh the page.");
  }
};

const fetchConfig = async () => {
  const response = await fetch("/config");

  if (!response.ok) {
    throw new Error("Failed to load frontend configuration");
  }

  return response.json();
};

const createAuthClient = async () => {
  const auth0Api = window.auth0;

  if (!auth0Api || typeof auth0Api.createAuth0Client !== "function") {
    throw new Error("Auth0 SDK failed to load. Please refresh the page and try again.");
  }

  if (!state.config?.auth0ClientId || !state.config?.auth0Audience || !state.config?.auth0Domain) {
    throw new Error("Auth0 is not configured yet. Set AUTH0_CLIENT_ID, AUTH0_AUDIENCE, and AUTH0_ISSUER_URL in the environment and restart the app.");
  }

  return auth0Api.createAuth0Client({
    domain: state.config.auth0Domain,
    clientId: state.config.auth0ClientId,
    cacheLocation: "memory",
    useRefreshTokens: true,
    useRefreshTokensFallback: true,
    authorizationParams: {
      audience: state.config.auth0Audience,
      redirect_uri: window.location.origin,
      scope: "openid profile email read:transactions",
    },
  });
};

const handleRedirect = async () => {
  const query = new URLSearchParams(window.location.search);

  if (!query.has("code") || !query.has("state")) {
    return;
  }

  await state.auth0.handleRedirectCallback();
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
};

const refreshSession = async () => {
  ensureAuthClient();

  const isAuthenticated = await state.auth0.isAuthenticated();

  if (isAuthenticated) {
    state.user = await state.auth0.getUser();
    setBanner(`Signed in as ${state.user.name || state.user.email || state.user.sub}`, "success");
  } else {
    state.user = null;
  }

  renderUser();
};

const login = async () => {
  try {
    ensureAuthClient();
    clearBanner("login");
    clearBanner("dashboard");
    setBusy(true);

    await state.auth0.loginWithRedirect({
      authorizationParams: {
        audience: state.config.auth0Audience,
        redirect_uri: window.location.origin,
        scope: "openid profile email read:transactions",
      },
    });
  } catch (error) {
    setBusy(false);
    showError(error instanceof Error ? error.message : "Login failed", "login");
  }
};

const logout = () => {
  try {
    ensureAuthClient();
    clearBanner("login");
    clearBanner("dashboard");
    state.auth0.logout({
      logoutParams: {
        returnTo: window.location.origin,
      },
    });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Logout failed", "login");
  }
};

const submitAuthorization = async (event) => {
  event.preventDefault();

  if (!state.user) {
    showError("Log in before checking authorization");
    return;
  }

  clearBanner();
  setBusy(true);
  setRequestStatus("Loading token...");

  const method = dom.methodSelect.value;
  const path = dom.pathInput.value.trim();

  try {
    const accessToken = await state.auth0.getTokenSilently({
      authorizationParams: {
        audience: state.config.auth0Audience,
        scope: "openid profile email read:transactions",
      },
    });

    setRequestStatus("Checking backend...");

    const response = await fetch(new URL("/authorize", getApiBaseUrl()), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: accessToken,
        method,
        path,
      }),
    });

    const payload = await response.json();
    const decision = payload.decision || payload.error?.message || "UNKNOWN";

    showResult(payload);
    pushHistory({
      timestamp: new Date().toLocaleTimeString(),
      method,
      path,
      decision,
      message: response.ok ? "Request completed" : payload.error?.message || "Request failed",
    });

    if (!response.ok) {
      showError(payload.error?.message || "Authorization request failed", "dashboard");
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Authorization request failed", "dashboard");
    showResult({ error: { message: error instanceof Error ? error.message : "Authorization request failed" } });
    pushHistory({
      timestamp: new Date().toLocaleTimeString(),
      method,
      path,
      decision: "ERROR",
      message: error instanceof Error ? error.message : "Authorization request failed",
    });
  } finally {
    setRequestStatus("Idle");
    setBusy(false);
  }
};

const init = async () => {
  try {
    renderResources();
    dom.loginButton.disabled = true;
    dom.loginPrimaryButton.disabled = true;
    setRequestStatus("Loading config...");
    state.config = await fetchConfig();
    dom.authAudience.textContent = state.config.auth0Audience;
    state.auth0 = await createAuthClient();

    dom.loginButton.disabled = false;
    dom.loginPrimaryButton.disabled = false;

    await handleRedirect();
    await refreshSession();
    setRequestStatus("Idle");
    clearBanner("dashboard");
    clearBanner("login");
  } catch (error) {
    setRequestStatus("Idle");
    showError(error instanceof Error ? error.message : "Unable to start dashboard", "login");
  }
};

dom.loginButton.addEventListener("click", login);
dom.loginPrimaryButton.addEventListener("click", login);
dom.logoutButton.addEventListener("click", logout);
dom.authorizeForm.addEventListener("submit", submitAuthorization);

init();