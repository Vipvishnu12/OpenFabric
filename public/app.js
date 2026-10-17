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
  responseDecisionBadge: document.getElementById("response-decision-badge"),
  responseMeta: document.getElementById("response-meta"),
  metaStatus: document.getElementById("meta-status"),
  metaReason: document.getElementById("meta-reason"),
  metaPermissions: document.getElementById("meta-permissions"),
  metaPermissionsRow: document.getElementById("meta-permissions-row"),
};

const setBanner = (message, tone = "error", target = "login") => {
  const bannerTarget = target === "dashboard" ? dom.dashboardBanner : dom.banner;

  if (!bannerTarget) return;

  if (!message) {
    bannerTarget.className = "banner hidden";
    bannerTarget.textContent = "";
    return;
  }

  bannerTarget.className = `banner banner-${tone}`;
  bannerTarget.textContent = message;
};

const setBusy = (isBusy) => {
  state.busy = isBusy;
  if (dom.authorizeButton) dom.authorizeButton.disabled = isBusy;
  if (dom.loginButton) dom.loginButton.disabled = isBusy;
  if (dom.loginPrimaryButton) dom.loginPrimaryButton.disabled = isBusy;
  if (dom.logoutButton) dom.logoutButton.disabled = isBusy;
  if (dom.authorizeButton) {
    dom.authorizeButton.textContent = isBusy ? "Checking..." : "Check authorization";
  }
};

const setRequestStatus = (message, statusClass = "") => {
  if (dom.requestStatus) {
    dom.requestStatus.textContent = message;
    dom.requestStatus.className = `status-indicator ${statusClass}`.trim();
  }
};

const renderUser = () => {
  const isAuthenticated = Boolean(state.user);

  dom.loginScreen.classList.toggle("hidden", isAuthenticated);
  dom.dashboardShell.classList.toggle("hidden", !isAuthenticated);

  if (dom.authState) {
    dom.authState.textContent = isAuthenticated ? "Authenticated" : "Signed out";
    dom.authState.className = `badge ${isAuthenticated ? "badge-success" : "badge-neutral"}`;
  }

  const audience = state.config?.auth0Audience ?? "-";
  if (dom.authAudience) {
    dom.authAudience.textContent = audience;
    dom.authAudience.title = audience !== "-" ? audience : "";
  }

  if (dom.loginButton) dom.loginButton.classList.toggle("hidden", isAuthenticated);
  if (dom.logoutButton) dom.logoutButton.classList.toggle("hidden", !isAuthenticated);

  const name = state.user?.name || state.user?.nickname || "-";
  const email = state.user?.email || "-";
  const sub = state.user?.sub || "-";

  if (dom.userName) dom.userName.textContent = name;
  if (dom.userEmail) dom.userEmail.textContent = email;
  if (dom.userSub) {
    dom.userSub.textContent = sub;
    dom.userSub.title = sub !== "-" ? sub : "";
  }

  if (dom.authorizeButton) {
    dom.authorizeButton.disabled = !isAuthenticated || state.busy;
  }
};

const renderResources = () => {
  if (!dom.resourceList) return;

  dom.resourceList.innerHTML = resourcePresets
    .map(
      (resource) => `
        <button class="preset-btn resource-chip" type="button" data-method="${resource.method}" data-path="${resource.path}" title="${resource.note}">
          <span class="preset-method method-${resource.method.toLowerCase()}">${resource.method}</span>
          <span class="preset-path mono">${resource.path}</span>
          <span class="preset-label">${resource.label}</span>
        </button>
      `,
    )
    .join("");

  dom.resourceList.querySelectorAll(".preset-btn, .resource-chip").forEach((button) => {
    button.addEventListener("click", () => {
      dom.methodSelect.value = button.dataset.method || "GET";
      dom.pathInput.value = button.dataset.path || "/transactions";
      dom.pathInput.focus();
    });
  });
};

const formatJson = (value) => JSON.stringify(value, null, 2);

const renderHistory = () => {
  if (!dom.historyList) return;

  if (state.history.length === 0) {
    dom.historyList.innerHTML = `
      <tr class="history-empty-row">
        <td colspan="5" class="empty-cell">No authorization checks performed yet.</td>
      </tr>
    `;
    return;
  }

  dom.historyList.innerHTML = state.history
    .map((item) => {
      const decisionClass =
        item.decision === "ALLOW"
          ? "decision-allow"
          : item.decision === "DENY"
            ? "decision-deny"
            : "decision-error";

      return `
        <tr class="history-row">
          <td class="history-cell-time">${item.timestamp}</td>
          <td class="history-cell-method">
            <span class="method-badge method-${item.method.toLowerCase()}">${item.method}</span>
          </td>
          <td class="history-cell-path mono" title="${item.path}">${item.path}</td>
          <td class="history-cell-decision">
            <span class="decision-badge ${decisionClass}">${item.decision}</span>
          </td>
          <td class="history-cell-details">${item.message}</td>
        </tr>
      `;
    })
    .join("");
};

const pushHistory = (entry) => {
  state.history.unshift(entry);
  state.history = state.history.slice(0, 8);
  renderHistory();
};

const showResult = (payload, meta = {}) => {
  if (dom.responseBody) {
    dom.responseBody.classList.remove("empty");
    dom.responseBody.textContent = formatJson(payload);
  }

  if (!dom.responseDecisionBadge || !dom.responseMeta) return;

  if (payload.decision) {
    dom.responseDecisionBadge.classList.remove("hidden");
    dom.responseDecisionBadge.textContent = payload.decision;
    const isAllow = payload.decision === "ALLOW";
    dom.responseDecisionBadge.className = `decision-badge ${isAllow ? "decision-allow" : "decision-deny"}`;

    dom.responseMeta.classList.remove("hidden");
    if (dom.metaStatus) {
      dom.metaStatus.textContent = meta.status ? `${meta.status} ${meta.statusText || ""}`.trim() : "200 OK";
    }
    if (dom.metaReason) {
      dom.metaReason.textContent = payload.reason || "Evaluated by policy engine";
    }

    if (dom.metaPermissions && dom.metaPermissionsRow) {
      if (Array.isArray(payload.matched_permissions) && payload.matched_permissions.length > 0) {
        dom.metaPermissionsRow.classList.remove("hidden");
        dom.metaPermissions.textContent = payload.matched_permissions
          .map((p) => `${p.action}: ${p.resource} (${p.effect})`)
          .join(", ");
      } else {
        dom.metaPermissionsRow.classList.remove("hidden");
        dom.metaPermissions.textContent = "None";
      }
    }
  } else if (payload.error) {
    dom.responseDecisionBadge.classList.remove("hidden");
    dom.responseDecisionBadge.textContent = "ERROR";
    dom.responseDecisionBadge.className = "decision-badge decision-error";

    dom.responseMeta.classList.remove("hidden");
    if (dom.metaStatus) {
      dom.metaStatus.textContent = meta.status ? `${meta.status} ${meta.statusText || ""}`.trim() : "Request Failed";
    }
    if (dom.metaReason) {
      dom.metaReason.textContent = payload.error.message || "An unexpected error occurred";
    }
    if (dom.metaPermissionsRow) {
      dom.metaPermissionsRow.classList.add("hidden");
    }
  }
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

const persistCurrentUser = (user) => {
  const storageKey = "auth_service_current_user_id";

  if (!user?.sub) {
    sessionStorage.removeItem(storageKey);
    localStorage.removeItem(storageKey);
    return;
  }

  sessionStorage.setItem(storageKey, user.sub);
  localStorage.setItem(storageKey, user.sub);
};

const refreshSession = async () => {
  ensureAuthClient();

  const isAuthenticated = await state.auth0.isAuthenticated();

  if (isAuthenticated) {
    state.user = await state.auth0.getUser();
    persistCurrentUser(state.user);
    setBanner(`Signed in as ${state.user.name || state.user.email || state.user.sub}`, "success", "dashboard");
  } else {
    state.user = null;
    persistCurrentUser(null);
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
    sessionStorage.removeItem("auth_service_current_user_id");
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
    showError("Log in before checking authorization", "dashboard");
    return;
  }

  clearBanner("dashboard");
  setBusy(true);
  setRequestStatus("Loading token...", "status-busy");

  const method = dom.methodSelect.value;
  const path = dom.pathInput.value.trim();

  try {
    const accessToken = await state.auth0.getTokenSilently({
      authorizationParams: {
        audience: state.config.auth0Audience,
        scope: "openid profile email read:transactions",
      },
    });

    setRequestStatus("Checking backend...", "status-busy");

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

    showResult(payload, { status: response.status, statusText: response.statusText });
    pushHistory({
      timestamp: new Date().toLocaleTimeString(),
      method,
      path,
      decision,
      message: response.ok ? payload.reason || "Request completed" : payload.error?.message || "Request failed",
    });

    if (!response.ok) {
      showError(payload.error?.message || "Authorization request failed", "dashboard");
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Authorization request failed", "dashboard");
    showResult(
      { error: { message: error instanceof Error ? error.message : "Authorization request failed" } },
      { status: 0, statusText: "Network Error" },
    );
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
    renderHistory();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("preview")) {
      state.config = {
        apiBaseUrl: window.location.origin,
        auth0Audience: "https://auth-service-api",
        auth0ClientId: "preview-client-id",
        auth0Domain: "preview.auth0.com",
      };
      state.user = {
        name: "Alex Rivera",
        email: "alex.rivera@example.com",
        sub: "auth0|64f9b8c2d1e4a50012345678",
      };
      renderUser();
      showResult(
        {
          decision: "ALLOW",
          user_id: "auth0|64f9b8c2d1e4a50012345678",
          reason: "User has read permission for transactions",
          matched_permissions: [{ action: "read", resource: "transactions", effect: "allow" }],
        },
        { status: 200, statusText: "OK" },
      );
      pushHistory({
        timestamp: "14:50:33",
        method: "DELETE",
        path: "/transactions/txn-456",
        decision: "DENY",
        message: "User is denied delete permission for transactions",
      });
      pushHistory({
        timestamp: "14:52:10",
        method: "GET",
        path: "/transactions",
        decision: "ALLOW",
        message: "User has read permission for transactions",
      });
      setRequestStatus("Idle");
      return;
    }

    if (dom.loginButton) dom.loginButton.disabled = true;
    if (dom.loginPrimaryButton) dom.loginPrimaryButton.disabled = true;

    setRequestStatus("Loading config...", "status-busy");
    state.config = await fetchConfig();

    if (dom.authAudience) {
      dom.authAudience.textContent = state.config.auth0Audience || "-";
      dom.authAudience.title = state.config.auth0Audience || "";
    }

    state.auth0 = await createAuthClient();

    if (dom.loginButton) dom.loginButton.disabled = false;
    if (dom.loginPrimaryButton) dom.loginPrimaryButton.disabled = false;

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

if (dom.loginButton) dom.loginButton.addEventListener("click", login);
if (dom.loginPrimaryButton) dom.loginPrimaryButton.addEventListener("click", login);
if (dom.logoutButton) dom.logoutButton.addEventListener("click", logout);
if (dom.authorizeForm) dom.authorizeForm.addEventListener("submit", submitAuthorization);

init();