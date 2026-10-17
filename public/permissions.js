const DEMO_USER_IDS = [
  "auth0|6acf0f80347c3a318a08e379",
  "auth0|6acf0fae620fbdf352e40234",
  "auth0|6acf11141830a1fdcf3c92a6",
];

const getCurrentSessionUserId = () => {
  const storageKey = "auth_service_current_user_id";

  try {
    const sessionValue = sessionStorage.getItem(storageKey);
    if (sessionValue && sessionValue.trim()) {
      return sessionValue.trim();
    }
  } catch {
    // ignore and fall through to localStorage
  }

  try {
    const localValue = localStorage.getItem(storageKey);
    if (localValue && localValue.trim()) {
      return localValue.trim();
    }
  } catch {
    // ignore
  }

  return "";
};

const normalizeUserKey = (value) => String(value ?? "").trim().toLowerCase();

const getPreferredUsers = (userIds = []) => {
  const currentUserId = getCurrentSessionUserId();
  const unique = new Set();
  const ordered = [];

  const append = (userId) => {
    if (typeof userId !== "string") {
      return;
    }

    const trimmed = userId.trim();
    if (!trimmed) {
      return;
    }

    const key = normalizeUserKey(trimmed);
    if (unique.has(key)) {
      return;
    }

    unique.add(key);
    ordered.push(trimmed);
  };

  append(currentUserId);
  DEMO_USER_IDS.forEach(append);
  (Array.isArray(userIds) ? userIds : []).forEach(append);

  return ordered;
};

const state = {
  users: [],
  selectedUserId: "",
  permissions: [],
  busy: false,
};

const dom = {
  banner: document.getElementById("permissions-banner"),
  status: document.getElementById("permissions-status"),
  identityNote: document.getElementById("permissions-identity-note"),
  usersList: document.getElementById("users-list"),
  usersEmpty: document.getElementById("users-empty"),
  selectedUser: document.getElementById("selected-user"),
  form: document.getElementById("add-permission-form"),
  newAction: document.getElementById("new-action"),
  newResource: document.getElementById("new-resource"),
  newEffect: document.getElementById("new-effect"),
  addButton: document.getElementById("add-permission-button"),
  rows: document.getElementById("permissions-rows"),
};

const setBanner = (message, tone = "error") => {
  if (!dom.banner) return;

  if (!message) {
    dom.banner.className = "banner hidden";
    dom.banner.textContent = "";
    return;
  }

  dom.banner.className = `banner banner-${tone}`;
  dom.banner.textContent = message;
};

const setBusy = (busy, message = "Idle") => {
  state.busy = busy;
  if (dom.status) {
    dom.status.textContent = message;
    dom.status.className = `status-indicator ${busy ? "status-busy" : ""}`.trim();
  }

  if (dom.addButton) {
    dom.addButton.disabled = busy || !state.selectedUserId;
  }
};

const syncIdentityGuidance = (userId) => {
  if (!dom.identityNote) {
    return;
  }

  if (!userId) {
    dom.identityNote.textContent = "Select a user to view the stored permission rows. Authorization checks always use the exact Auth0 subject value from the JWT.";
    return;
  }

  dom.identityNote.textContent = `Selected user_id: ${userId}. Authorization checks use that exact value from the validated JWT subject, so this permission set only applies when the logged-in user matches it.`;
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message || "Request failed";
    throw new Error(message);
  }

  return payload;
};

const renderUsers = () => {
  if (!dom.usersList || !dom.usersEmpty) return;

  if (state.users.length === 0) {
    dom.usersList.innerHTML = "";
    dom.usersEmpty.classList.remove("hidden");
    return;
  }

  dom.usersEmpty.classList.add("hidden");
  dom.usersList.innerHTML = state.users
    .map((userId) => {
      const activeClass = userId === state.selectedUserId ? "active" : "";
      return `<button class="permissions-user-btn ${activeClass}" type="button" data-user-id="${userId}">${userId}</button>`;
    })
    .join("");

  dom.usersList.querySelectorAll(".permissions-user-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const userId = button.getAttribute("data-user-id") || "";
      if (!userId || userId === state.selectedUserId) {
        return;
      }

      selectUser(userId);
    });
  });
};

const renderPermissions = () => {
  if (!dom.rows) return;

  if (!state.selectedUserId) {
    dom.rows.innerHTML = `
      <tr class="history-empty-row">
        <td colspan="5" class="empty-cell">Select a user to view permissions.</td>
      </tr>
    `;
    return;
  }

  if (state.permissions.length === 0) {
    dom.rows.innerHTML = `
      <tr class="history-empty-row">
        <td colspan="5" class="empty-cell">No permissions found for this user.</td>
      </tr>
    `;
    return;
  }

  dom.rows.innerHTML = state.permissions
    .map((permission) => {
      const id = Number(permission.id);
      const action = String(permission.action || "read").toLowerCase();
      const resource = String(permission.resource || "");
      const effect = String(permission.effect || "allow").toLowerCase();

      return `
        <tr data-permission-id="${id}">
          <td class="mono">${id}</td>
          <td>
            <select class="form-select permission-action" aria-label="Action for permission ${id}">
              <option value="read" ${action === "read" ? "selected" : ""}>read</option>
              <option value="write" ${action === "write" ? "selected" : ""}>write</option>
              <option value="delete" ${action === "delete" ? "selected" : ""}>delete</option>
            </select>
          </td>
          <td>
            <input class="form-input mono permission-resource" type="text" value="${resource.replace(/"/g, "&quot;")}" aria-label="Resource for permission ${id}" />
          </td>
          <td>
            <select class="form-select permission-effect" aria-label="Effect for permission ${id}">
              <option value="allow" ${effect === "allow" ? "selected" : ""}>ALLOW</option>
              <option value="deny" ${effect === "deny" ? "selected" : ""}>DENY</option>
            </select>
          </td>
          <td>
            <div class="permissions-row-actions">
              <button type="button" class="button secondary permission-save">Save</button>
              <button type="button" class="button secondary permission-remove">Remove</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  dom.rows.querySelectorAll(".permission-save").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      if (!row) return;

      const permissionId = Number(row.getAttribute("data-permission-id"));
      const action = row.querySelector(".permission-action")?.value;
      const resource = row.querySelector(".permission-resource")?.value?.trim();
      const effect = row.querySelector(".permission-effect")?.value;

      if (!Number.isFinite(permissionId) || !action || !resource || !effect) {
        setBanner("Please provide action, resource, and effect.");
        return;
      }

      try {
        setBusy(true, "Saving permission...");
        await fetchJson(`/permissions/${permissionId}`, {
          method: "PATCH",
          body: JSON.stringify({ action, resource, effect }),
        });
        setBanner("Permission updated.", "success");
        await loadPermissions(state.selectedUserId);
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Failed to update permission");
      } finally {
        setBusy(false, "Idle");
      }
    });
  });

  dom.rows.querySelectorAll(".permission-remove").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      if (!row) return;

      const permissionId = Number(row.getAttribute("data-permission-id"));
      if (!Number.isFinite(permissionId)) return;

      try {
        setBusy(true, "Removing permission...");
        await fetchJson(`/permissions/${permissionId}`, {
          method: "DELETE",
        });
        setBanner("Permission removed.", "success");
        await Promise.all([loadUsers(), loadPermissions(state.selectedUserId)]);
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Failed to remove permission");
      } finally {
        setBusy(false, "Idle");
      }
    });
  });
};

const loadUsers = async () => {
  const payload = await fetchJson("/permissions/users");
  const rawUsers = Array.isArray(payload?.users) ? payload.users : [];
  const currentUserId = getCurrentSessionUserId();
  state.users = getPreferredUsers(rawUsers);
  renderUsers();

  if (!state.selectedUserId && state.users.length > 0) {
    state.selectedUserId = currentUserId || state.users[0];
  }

  if (state.selectedUserId && !state.users.includes(state.selectedUserId)) {
    state.selectedUserId = currentUserId || state.users[0] || "";
  }

  if (state.selectedUserId) {
    syncIdentityGuidance(state.selectedUserId);
  }
};

const loadPermissions = async (userId) => {
  if (!userId) {
    state.permissions = [];
    renderPermissions();
    return;
  }

  const payload = await fetchJson(`/permissions/users/${encodeURIComponent(userId)}`);
  state.permissions = Array.isArray(payload?.permissions) ? payload.permissions : [];
  renderPermissions();
};

const selectUser = async (userId) => {
  state.selectedUserId = userId;
  if (dom.selectedUser) {
    dom.selectedUser.textContent = userId;
  }
  syncIdentityGuidance(userId);
  renderUsers();

  try {
    setBusy(true, "Loading permissions...");
    await loadPermissions(userId);
  } catch (error) {
    setBanner(error instanceof Error ? error.message : "Failed to load permissions");
  } finally {
    setBusy(false, "Idle");
  }
};

const handleCreatePermission = async (event) => {
  event.preventDefault();

  if (!state.selectedUserId) {
    setBanner("Select a user before adding permissions.");
    return;
  }

  const action = dom.newAction?.value;
  const resource = dom.newResource?.value?.trim();
  const effect = dom.newEffect?.value;

  if (!action || !resource || !effect) {
    setBanner("Please provide action, resource, and effect.");
    return;
  }

  try {
    setBusy(true, "Creating permission...");
    await fetchJson(`/permissions/users/${encodeURIComponent(state.selectedUserId)}`, {
      method: "POST",
      body: JSON.stringify({ action, resource, effect }),
    });

    if (dom.newResource) {
      dom.newResource.value = "";
    }

    setBanner("Permission added.", "success");
    await Promise.all([loadUsers(), loadPermissions(state.selectedUserId)]);
  } catch (error) {
    setBanner(error instanceof Error ? error.message : "Failed to create permission");
  } finally {
    setBusy(false, "Idle");
  }
};

const init = async () => {
  try {
    setBusy(true, "Loading users...");
    await loadUsers();

    if (state.selectedUserId) {
      if (dom.selectedUser) {
        dom.selectedUser.textContent = state.selectedUserId;
      }
      syncIdentityGuidance(state.selectedUserId);
      await loadPermissions(state.selectedUserId);
    } else {
      syncIdentityGuidance("");
      renderPermissions();
    }

    setBanner("");
  } catch (error) {
    setBanner(error instanceof Error ? error.message : "Failed to load permission management");
  } finally {
    setBusy(false, "Idle");
  }
};

if (dom.form) {
  dom.form.addEventListener("submit", handleCreatePermission);
}

init();
