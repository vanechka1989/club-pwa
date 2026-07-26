<script setup lang="ts">
import type { AdminActionActor, AdminActionLog, AdminPermission, AdminStatsUser, AdminUser } from "@club/shared";
import { Check, Trash2 } from "lucide-vue-next";
import TaskScreen from "@/features/app/TaskScreen.vue";

type AdminAccessPatch = {
  roleLabel?: string | null;
  isActive?: boolean;
  permissions?: AdminPermission[];
};

type AdminTask = "access" | "transfer";

const props = defineProps<{
  ownerTelegramId: string;
  currentUserTelegramId: string | undefined;
  isOwner: boolean;
  admins: readonly AdminUser[];
  adminSearchQuery: string;
  resolvedAdminSearchTelegramId: string;
  adminSearchCandidates: readonly AdminStatsUser[];
  showTransferOwnerModal: boolean;
  transferOwnerTelegramId: string;
  selectedAdminAccess: Readonly<AdminUser> | null;
  adminPermissionOptions: ReadonlyArray<{ value: AdminPermission; label: string }>;
  saving: boolean;
  adminActionLogs: readonly AdminActionLog[];
  visibleAdminActionActors: readonly AdminActionActor[];
  adminActionActorFilter: string;
  adminActionLogExpanded: boolean;
  formatDateTime: (value: string | null) => string;
}>();

const emit = defineEmits<{
  "update:admin-search-query": [value: string];
  add: [telegramId: string];
  "open-transfer": [];
  "request-transfer-confirmation": [telegramId: string];
  "update:transfer-owner-telegram-id": [value: string];
  "open-access": [admin: AdminUser];
  "update-access": [admin: AdminUser, patch: AdminAccessPatch];
  remove: [telegramId: string];
  back: [task: AdminTask];
  "update:admin-action-log-expanded": [value: boolean];
  "update:admin-action-actor-filter": [value: string];
}>();

function adminTitle(admin: AdminUser) {
  return admin.firstName || (admin.username ? `@${admin.username}` : `ID ${admin.telegramId}`);
}

function adminRoleTitle(admin: AdminUser) {
  return admin.roleLabel || "Админ";
}

function getAdminCandidateTitle(user: AdminStatsUser) {
  return `${user.firstName || user.username || `ID ${user.telegramId}`}${user.username ? ` · @${user.username}` : ""}`;
}

function adminActionActorTitle(actor: AdminActionActor | null) {
  if (!actor) {
    return "Администратор не найден";
  }

  return actor.firstName || (actor.username ? `@${actor.username}` : `ID ${actor.telegramId}`);
}

function adminActionTargetTitle(log: AdminActionLog) {
  if (log.target) {
    return adminActionActorTitle(log.target);
  }

  return log.targetTelegramId ? `ID ${log.targetTelegramId}` : "";
}

function adminActionAccessDetails(log: AdminActionLog) {
  if (log.action !== "client.access.updated") {
    return "";
  }

  const status = typeof log.metadata.status === "string" ? log.metadata.status : "";
  const expiresAt = typeof log.metadata.expiresAt === "string" ? log.metadata.expiresAt : "";
  const durationDays = typeof log.metadata.durationDays === "number" ? log.metadata.durationDays : null;
  if (status === "active" && expiresAt) {
    return `Доступ к клубу до ${props.formatDateTime(expiresAt)}${durationDays ? ` · ${durationDays} дн.` : ""}`;
  }

  if (status === "inactive" || status === "expired") {
    return "Доступ к клубу закрыт";
  }

  return "";
}

function adminActionMetaText(log: AdminActionLog) {
  const target = adminActionTargetTitle(log);
  const accessDetails = adminActionAccessDetails(log);
  if (accessDetails) {
    return [target ? `Клиент: ${target}` : "", accessDetails].filter(Boolean).join(" · ");
  }

  return target ? `Клиент: ${target}` : "";
}

function updateAdminRoleLabel(admin: AdminUser, event: Event) {
  const roleLabel = event.target instanceof HTMLInputElement ? event.target.value : "";
  emit("update-access", admin, { roleLabel });
}

function toggleAdminPermission(admin: AdminUser, permission: AdminPermission) {
  const permissions = admin.permissions.includes(permission)
    ? admin.permissions.filter((entry) => entry !== permission)
    : [...admin.permissions, permission];
  emit("update-access", admin, { permissions });
}
</script>

<template>
  <section class="admin-panel ui-page-section admin-permissions-panel">
    <div class="admin-panel-head ui-page-header">
      <div>
        <h3>Администраторы</h3>
        <p>Доступ, роль вручную и права по всем разделам.</p>
      </div>
    </div>

    <section class="admin-permissions-owner">
      <article class="admin-permissions-owner-card ui-card">
        <div>
          <span>Владелец клуба</span>
          <strong>{{ ownerTelegramId || currentUserTelegramId }}</strong>
          <small>Полный доступ без ограничений.</small>
        </div>
        <Check class="h-5 w-5" aria-hidden="true" />
      </article>

      <button v-if="isOwner" class="secondary-button ui-button" type="button" :disabled="saving || !admins.length" @click="emit('open-transfer')">
        Передать владение
      </button>
    </section>

    <section v-if="isOwner" class="admin-crm-block ui-card admin-add-admin-block">
      <div>
        <h4>Добавить администратора</h4>
        <p>Введите email или найдите клиента по имени, username либо ID.</p>
      </div>

      <form class="admin-search-row" @submit.prevent="emit('add', resolvedAdminSearchTelegramId)">
        <input
          :value="adminSearchQuery"
          class="text-input"
          placeholder="email, имя или username"
          @input="emit('update:admin-search-query', ($event.target as HTMLInputElement).value.trim())"
        />
        <button class="primary-button ui-button admin-add-button" type="submit" :disabled="saving || !resolvedAdminSearchTelegramId">Добавить</button>
      </form>

      <div v-if="adminSearchCandidates.length" class="admin-candidate-list">
        <button
          v-for="user in adminSearchCandidates"
          :key="user.id"
          class="admin-candidate-button ui-button"
          type="button"
          :disabled="saving"
          @click="emit('add', user.telegramId)"
        >
          <span>{{ getAdminCandidateTitle(user) }}</span>
          <small>ID {{ user.telegramId }}</small>
        </button>
      </div>
    </section>

    <TaskScreen v-if="showTransferOwnerModal" class="admin-task-screen admin-transfer-owner-task-screen" title="Передать клуб" subtitle="Новый владелец получит полный доступ." portal @back="emit('back', 'transfer')">
      <section class="admin-transfer-owner-card ui-card">
        <form class="admin-form admin-transfer-owner-form" @submit.prevent="emit('request-transfer-confirmation', transferOwnerTelegramId)">
          <select
            :value="transferOwnerTelegramId"
            class="text-input"
            @change="emit('update:transfer-owner-telegram-id', ($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>Выберите администратора</option>
            <option v-for="admin in admins" :key="admin.id" :value="admin.telegramId">
              {{ adminTitle(admin) }} · ID {{ admin.telegramId }}
            </option>
          </select>
          <p class="admin-warning-line">
            Подтвердите действие только если точно хотите сменить владельца клуба.
          </p>
          <button class="primary-button ui-button" type="submit" :disabled="saving || !transferOwnerTelegramId">
            Подтвердить передачу
          </button>
        </form>
      </section>
    </TaskScreen>

    <p v-if="!isOwner" class="admin-empty">Добавлять и удалять админов может только владелец.</p>

    <div class="admin-permission-list">
      <button
        v-for="admin in admins"
        :key="admin.id"
        class="admin-permission-row-button ui-button"
        :class="{ 'admin-permission-row-disabled': !admin.isActive }"
        type="button"
        @click="emit('open-access', admin)"
      >
        <span class="admin-permission-identity">
          <img v-if="admin.photoUrl" :src="admin.photoUrl" :alt="adminTitle(admin)" loading="lazy" decoding="async" />
          <span v-else>{{ adminTitle(admin).slice(0, 1).toUpperCase() }}</span>
          <div>
            <strong>{{ adminTitle(admin) }}</strong>
            <small>
              {{ adminRoleTitle(admin) }}
              <template v-if="admin.username"> · @{{ admin.username }}</template>
            </small>
          </div>
        </span>
        <span class="admin-permission-row-status" :class="admin.isActive ? 'admin-permission-row-status-active' : 'admin-permission-row-status-disabled'">
          {{ admin.isActive ? "Активен" : "Выключен" }}
        </span>
      </button>
      <p v-if="!admins.length" class="admin-empty">Администраторов пока нет.</p>
    </div>

    <section class="admin-crm-block ui-card admin-action-log-panel">
      <header class="admin-action-log-head">
        <div>
          <h4>Журнал действий</h4>
          <p>{{ adminActionLogs.length ? `${adminActionLogs.length} последних действий` : "Действий пока нет" }}</p>
        </div>
        <button
          class="secondary-button ui-button admin-action-log-toggle"
          type="button"
          @click="emit('update:admin-action-log-expanded', !adminActionLogExpanded)"
        >
          {{ adminActionLogExpanded ? "Свернуть журнал" : "Показать журнал" }}
        </button>
      </header>

      <div v-if="adminActionLogExpanded" class="admin-action-log-body">
        <select
          :value="adminActionActorFilter"
          class="text-input admin-action-log-filter"
          @change="emit('update:admin-action-actor-filter', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Все администраторы</option>
          <option v-for="admin in visibleAdminActionActors" :key="admin.telegramId" :value="admin.telegramId">
            {{ adminActionActorTitle(admin) }}
          </option>
        </select>

        <div class="admin-action-log-list">
          <article v-for="log in adminActionLogs" :key="log.id" class="admin-action-log-item">
            <div>
              <strong>{{ log.summary }}</strong>
              <span>{{ adminActionActorTitle(log.actor) }} · {{ formatDateTime(log.createdAt) }}</span>
              <small v-if="adminActionMetaText(log)">{{ adminActionMetaText(log) }}</small>
            </div>
          </article>
          <p v-if="!adminActionLogs.length" class="admin-empty">Действий пока нет.</p>
        </div>
      </div>
    </section>

    <TaskScreen v-if="selectedAdminAccess" class="admin-task-screen" :title="adminTitle(selectedAdminAccess)" subtitle="Права и доступ администратора" portal @back="emit('back', 'access')">
      <section class="admin-permission-surface ui-card" :class="{ 'admin-permission-card-disabled': !selectedAdminAccess.isActive }">
        <div class="admin-permission-content">
          <div class="admin-permission-head">
            <div>
              <strong>{{ adminRoleTitle(selectedAdminAccess) }}</strong>
              <small>
                ID {{ selectedAdminAccess.telegramId }}
                <template v-if="selectedAdminAccess.username"> · @{{ selectedAdminAccess.username }}</template>
              </small>
            </div>

            <label class="admin-switch-row">
              <input
                :checked="selectedAdminAccess.isActive"
                type="checkbox"
                :disabled="saving || !isOwner"
                @change="emit('update-access', selectedAdminAccess, { isActive: !selectedAdminAccess.isActive })"
              />
              <span>Доступ администратора</span>
            </label>
          </div>

          <div class="admin-permission-meta">
            <label class="admin-field">
              <span>Роль вручную</span>
              <input
                class="text-input"
                :value="selectedAdminAccess.roleLabel ?? ''"
                placeholder="Например: Старший модератор"
                :disabled="saving || !isOwner"
                @change="updateAdminRoleLabel(selectedAdminAccess, $event)"
              />
            </label>

            <div class="admin-permission-summary">
              <span>{{ selectedAdminAccess.permissions.length }} / {{ adminPermissionOptions.length }}</span>
              <small>включено прав</small>
            </div>
          </div>

          <div class="admin-permission-grid ui-responsive-grid">
            <label v-for="permission in adminPermissionOptions" :key="permission.value" class="admin-permission-toggle">
              <span>{{ permission.label }}</span>
              <input
                :checked="selectedAdminAccess.permissions.includes(permission.value)"
                type="checkbox"
                :disabled="saving || !isOwner"
                @change="toggleAdminPermission(selectedAdminAccess, permission.value)"
              />
            </label>
          </div>

          <footer class="admin-permission-actions">
            <small>
              Добавлен {{ new Date(selectedAdminAccess.createdAt).toLocaleDateString("ru-RU") }}
            </small>
            <button v-if="isOwner" class="icon-button ui-icon-button" type="button" :disabled="saving" @click="emit('remove', selectedAdminAccess.telegramId)">
              <Trash2 class="h-4 w-4" aria-hidden="true" />
            </button>
          </footer>
        </div>
      </section>
    </TaskScreen>
  </section>
</template>
