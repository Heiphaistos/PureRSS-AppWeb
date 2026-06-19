<script setup lang="ts">
import { ref, computed } from "vue";
import { useAuth } from "../composables/useAuth";
import { useTheme } from "../composables/useTheme";
import { api } from "../api";

const emit = defineEmits<{ close: []; logout: [] }>();
const { user, logout } = useAuth();
const { themes, currentThemeId, setTheme } = useTheme();

type Section = "compte" | "securite" | "apparence" | "notifications" | "donnees" | "a-propos";
const section = ref<Section>("compte");

const sections: { id: Section; label: string; icon: string }[] = [
  { id: "compte",        label: "Compte",        icon: "👤" },
  { id: "securite",      label: "Sécurité",      icon: "🔒" },
  { id: "apparence",     label: "Apparence",     icon: "🎨" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "donnees",       label: "Données",       icon: "📦" },
  { id: "a-propos",      label: "À propos",      icon: "ℹ️" },
];

// ── Compte ──────────────────────────────────────────
const emailForm    = ref({ email: user.value?.email ?? "", password: "" });
const pwdForm      = ref({ current: "", next: "", confirm: "" });
const emailMsg     = ref<{ text: string; ok: boolean } | null>(null);
const pwdMsg       = ref<{ text: string; ok: boolean } | null>(null);
const emailLoading = ref(false);
const pwdLoading   = ref(false);
const userInitial  = computed(() => (user.value?.username ?? "?")[0].toUpperCase());

async function changeEmail() {
  emailMsg.value = null; emailLoading.value = true;
  try {
    await api.changeEmail(emailForm.value.email, emailForm.value.password);
    emailMsg.value = { text: "Email mis à jour.", ok: true };
    emailForm.value.password = "";
  } catch (e) { emailMsg.value = { text: (e as Error).message, ok: false }; }
  finally { emailLoading.value = false; }
}

async function changePassword() {
  pwdMsg.value = null;
  if (pwdForm.value.next !== pwdForm.value.confirm) {
    pwdMsg.value = { text: "Les mots de passe ne correspondent pas.", ok: false }; return;
  }
  pwdLoading.value = true;
  try {
    await api.changePassword(pwdForm.value.current, pwdForm.value.next);
    pwdMsg.value = { text: "Mot de passe mis à jour.", ok: true };
    pwdForm.value = { current: "", next: "", confirm: "" };
  } catch (e) { pwdMsg.value = { text: (e as Error).message, ok: false }; }
  finally { pwdLoading.value = false; }
}

// ── Notifications ────────────────────────────────────
const discordEnabled = ref(localStorage.getItem("purerss-discord-enabled") === "true");
const notifMsg = ref<{ text: string; ok: boolean } | null>(null);

function saveNotifications() {
  localStorage.setItem("purerss-discord-enabled", String(discordEnabled.value));
  notifMsg.value = { text: "Préférences enregistrées.", ok: true };
  setTimeout(() => { notifMsg.value = null; }, 2000);
}

// ── Données ──────────────────────────────────────────
const dataMsg    = ref<{ text: string; ok: boolean } | null>(null);
const importFile = ref<HTMLInputElement | null>(null);

async function exportFeeds() {
  try {
    const feeds = await api.getFeeds();
    const json = JSON.stringify({ version: "1.2.0", exported_at: new Date().toISOString(), feeds }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `purerss-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    dataMsg.value = { text: "Export réussi.", ok: true };
  } catch (e) { dataMsg.value = { text: (e as Error).message, ok: false }; }
}

async function importFeeds(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  dataMsg.value = null;
  try {
    const text = await file.text();
    const data = JSON.parse(text) as { feeds: object[] };
    if (!Array.isArray(data.feeds)) throw new Error("Format invalide");
    let imported = 0;
    for (const feed of data.feeds) {
      try { await api.addFeed(feed); imported++; } catch { /* skip existing */ }
    }
    dataMsg.value = { text: `${imported} flux importés.`, ok: true };
  } catch (e) { dataMsg.value = { text: (e as Error).message, ok: false }; }
}

// ── Logout ────────────────────────────────────────────
function doLogout() { logout(); emit("logout"); }
</script>

<template>
  <div class="settings-overlay" @click.self="emit('close')">
    <div class="settings-panel">
      <div class="settings-header">
        <h2 class="settings-title">⚙️ Paramètres</h2>
        <button class="icon-btn" @click="emit('close')">✕</button>
      </div>

      <div class="settings-body">
        <nav class="settings-nav">
          <button
            v-for="s in sections" :key="s.id"
            :class="['nav-item', { active: section === s.id }]"
            @click="section = s.id"
          >
            <span class="nav-icon">{{ s.icon }}</span>
            <span class="nav-label">{{ s.label }}</span>
          </button>
        </nav>

        <div class="settings-content">

          <!-- ── Compte ── -->
          <template v-if="section === 'compte'">
            <div class="settings-section">
              <div class="avatar-row">
                <div class="avatar">{{ userInitial }}</div>
                <div>
                  <div class="user-name">{{ user?.username }}</div>
                  <div class="user-role">{{ user?.role === 'admin' ? '👑 Administrateur' : '👤 Utilisateur' }}</div>
                  <div class="user-since">Membre depuis {{ user?.created_at?.slice(0, 10) }}</div>
                </div>
              </div>
            </div>

            <div class="settings-section">
              <h3 class="section-title">Changer l'email</h3>
              <form class="stacked-form" @submit.prevent="changeEmail">
                <div class="form-group">
                  <label>Nouvel email</label>
                  <input v-model="emailForm.email" type="email" required />
                </div>
                <div class="form-group">
                  <label>Mot de passe actuel (confirmation)</label>
                  <input v-model="emailForm.password" type="password" placeholder="••••••••" required />
                </div>
                <div v-if="emailMsg" :class="['msg-banner', emailMsg.ok ? 'msg-ok' : 'msg-err']">{{ emailMsg.text }}</div>
                <button type="submit" class="btn-primary" :disabled="emailLoading">
                  {{ emailLoading ? "Mise à jour…" : "Mettre à jour l'email" }}
                </button>
              </form>
            </div>

            <div class="settings-section">
              <h3 class="section-title">Changer le mot de passe</h3>
              <form class="stacked-form" @submit.prevent="changePassword">
                <div class="form-group">
                  <label>Mot de passe actuel</label>
                  <input v-model="pwdForm.current" type="password" placeholder="••••••••" required />
                </div>
                <div class="form-group">
                  <label>Nouveau mot de passe</label>
                  <input v-model="pwdForm.next" type="password" placeholder="8 caractères minimum" required minlength="8" />
                </div>
                <div class="form-group">
                  <label>Confirmer</label>
                  <input v-model="pwdForm.confirm" type="password" placeholder="••••••••" required />
                </div>
                <div v-if="pwdMsg" :class="['msg-banner', pwdMsg.ok ? 'msg-ok' : 'msg-err']">{{ pwdMsg.text }}</div>
                <button type="submit" class="btn-primary" :disabled="pwdLoading">
                  {{ pwdLoading ? "Mise à jour…" : "Changer le mot de passe" }}
                </button>
              </form>
            </div>
          </template>

          <!-- ── Sécurité ── -->
          <template v-else-if="section === 'securite'">
            <div class="settings-section">
              <h3 class="section-title">Session active</h3>
              <div class="info-card">
                <div class="info-row"><span class="info-label">Connecté en tant que</span><span class="info-val">{{ user?.email }}</span></div>
                <div class="info-row"><span class="info-label">Rôle</span><span class="info-val">{{ user?.role }}</span></div>
                <div class="info-row"><span class="info-label">Dernière connexion</span><span class="info-val">{{ user?.last_login?.slice(0, 19).replace('T', ' ') ?? '—' }}</span></div>
                <div class="info-row"><span class="info-label">Membre depuis</span><span class="info-val">{{ user?.created_at?.slice(0, 10) }}</span></div>
              </div>
            </div>
            <div class="settings-section">
              <h3 class="section-title">Déconnexion</h3>
              <p class="section-desc">Votre token JWT local sera supprimé.</p>
              <button class="btn-danger" @click="doLogout">Se déconnecter</button>
            </div>
          </template>

          <!-- ── Apparence ── -->
          <template v-else-if="section === 'apparence'">
            <div class="settings-section">
              <h3 class="section-title">Thème de l'application</h3>
              <p class="section-desc">{{ themes.length }} thèmes disponibles. Sélection persistée dans votre navigateur.</p>
              <div class="theme-grid">
                <button
                  v-for="theme in themes" :key="theme.id"
                  :class="['theme-card', { active: currentThemeId === theme.id }]"
                  :style="{
                    '--card-bg': theme.vars['--bg2'],
                    '--card-accent': theme.vars['--accent'],
                    '--card-text': theme.vars['--text'],
                    '--card-border': theme.vars['--border'],
                    '--card-bg3': theme.vars['--bg3'],
                  }"
                  @click="setTheme(theme.id)"
                >
                  <div class="theme-preview">
                    <div class="tp-sidebar" :style="{ background: theme.vars['--bg2'] }"></div>
                    <div class="tp-main" :style="{ background: theme.vars['--bg'] }">
                      <div class="tp-bar" :style="{ background: theme.vars['--accent'] }"></div>
                      <div class="tp-line" :style="{ background: theme.vars['--bg3'] }"></div>
                      <div class="tp-line short" :style="{ background: theme.vars['--bg3'] }"></div>
                    </div>
                  </div>
                  <div class="theme-label" :style="{ background: theme.vars['--bg2'], color: theme.vars['--text'] }">
                    <span>{{ theme.emoji }}</span>
                    <span class="theme-name">{{ theme.name }}</span>
                    <span v-if="currentThemeId === theme.id" :style="{ color: theme.vars['--accent'] }">✓</span>
                  </div>
                </button>
              </div>
            </div>
          </template>

          <!-- ── Notifications ── -->
          <template v-else-if="section === 'notifications'">
            <div class="settings-section">
              <h3 class="section-title">Webhooks Discord</h3>
              <p class="section-desc">Active le panneau webhook sur chaque flux. Désactivez si vous utilisez rssdi pour la diffusion Discord.</p>
              <label class="toggle-row">
                <input type="checkbox" v-model="discordEnabled" class="toggle-check" />
                <span class="toggle-slider"></span>
                <span class="toggle-label">Activer les webhooks Discord</span>
              </label>
              <div v-if="notifMsg" :class="['msg-banner', notifMsg.ok ? 'msg-ok' : 'msg-err']">{{ notifMsg.text }}</div>
              <button class="btn-primary" @click="saveNotifications">Enregistrer</button>
            </div>
          </template>

          <!-- ── Données ── -->
          <template v-else-if="section === 'donnees'">
            <div class="settings-section">
              <h3 class="section-title">Export des flux</h3>
              <p class="section-desc">Téléchargez un fichier JSON contenant tous vos flux RSS configurés.</p>
              <button class="btn-primary" @click="exportFeeds">📥 Exporter tous les flux</button>
            </div>
            <div class="settings-section">
              <h3 class="section-title">Import de flux</h3>
              <p class="section-desc">Importez des flux depuis un fichier JSON exporté précédemment. Les flux existants sont ignorés.</p>
              <input ref="importFile" type="file" accept=".json" class="file-input" @change="importFeeds" />
              <button class="btn-secondary" @click="(importFile as HTMLInputElement)?.click()">📤 Importer un fichier JSON</button>
            </div>
            <div v-if="dataMsg" :class="['msg-banner', dataMsg.ok ? 'msg-ok' : 'msg-err']">{{ dataMsg.text }}</div>
          </template>

          <!-- ── À propos ── -->
          <template v-else-if="section === 'a-propos'">
            <div class="settings-section about-section">
              <div class="about-logo">
                <span style="font-size:52px">📡</span>
                <h2 class="about-name">PureRSS</h2>
                <p class="about-version">Version 1.2.0</p>
              </div>
              <div class="info-card" style="margin-top:24px">
                <div class="info-row"><span class="info-label">Backend</span><span class="info-val">Hono.js + better-sqlite3</span></div>
                <div class="info-row"><span class="info-label">Frontend</span><span class="info-val">Vue 3 + Vite</span></div>
                <div class="info-row"><span class="info-label">Auth</span><span class="info-val">JWT (jose) + bcryptjs</span></div>
                <div class="info-row"><span class="info-label">Hébergement</span><span class="info-val">Docker + nginx (VPS)</span></div>
                <div class="info-row"><span class="info-label">Thèmes</span><span class="info-val">8 thèmes disponibles</span></div>
              </div>
              <p class="section-desc" style="margin-top:16px">PureRSS est un agrégateur RSS self-hosted. Toutes vos données restent sur votre VPS.</p>
            </div>
          </template>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;
  display:flex;align-items:center;justify-content:center;padding:16px;
}
.settings-panel {
  width:100%;max-width:860px;height:min(90vh,640px);
  background:var(--bg2);border:1px solid var(--border);border-radius:14px;
  display:flex;flex-direction:column;overflow:hidden;
}
.settings-header {
  display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0;
}
.settings-title { font-size:16px;font-weight:700; }
.icon-btn { background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;padding:4px 8px;border-radius:4px; }
.icon-btn:hover { color:var(--text);background:var(--border); }
.settings-body { display:flex;flex:1;overflow:hidden; }
.settings-nav {
  width:180px;background:var(--bg);border-right:1px solid var(--border);
  padding:8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto;flex-shrink:0;
}
.nav-item {
  display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;
  background:none;border:none;color:var(--text-muted);cursor:pointer;
  text-align:left;font-size:13px;font-weight:500;transition:all .15s;width:100%;
}
.nav-item:hover { background:var(--bg3);color:var(--text); }
.nav-item.active { background:var(--bg3);color:var(--accent); }
.nav-icon { font-size:15px;width:20px;text-align:center; }
.settings-content { flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:0; }
.settings-section { padding-bottom:24px;margin-bottom:24px;border-bottom:1px solid var(--border); }
.settings-section:last-child { border-bottom:none;margin-bottom:0; }
.section-title { font-size:14px;font-weight:700;margin-bottom:8px; }
.section-desc { font-size:12px;color:var(--text-muted);margin-bottom:12px;line-height:1.5; }
.stacked-form { display:flex;flex-direction:column;gap:12px; }
.form-group { display:flex;flex-direction:column;gap:5px; }
.form-group label { font-size:11px;font-weight:600;color:var(--text-muted); }
.form-group input { background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:8px 10px;font-size:13px;outline:none; }
.form-group input:focus { border-color:var(--accent); }
/* Avatar */
.avatar-row { display:flex;align-items:center;gap:16px; }
.avatar { width:52px;height:52px;border-radius:50%;background:var(--accent);color:#0d1117;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;flex-shrink:0; }
.user-name { font-size:15px;font-weight:700; }
.user-role,.user-since { font-size:12px;color:var(--text-muted);margin-top:2px; }
/* Info card */
.info-card { background:var(--bg3);border:1px solid var(--border);border-radius:8px;overflow:hidden; }
.info-row { display:flex;justify-content:space-between;padding:9px 14px;border-bottom:1px solid var(--border); }
.info-row:last-child { border-bottom:none; }
.info-label { font-size:12px;color:var(--text-muted); }
.info-val { font-size:12px;font-weight:600; }
/* Theme grid */
.theme-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px; }
.theme-card {
  background:var(--card-bg,var(--bg3));border:2px solid var(--card-border,var(--border));
  border-radius:10px;overflow:hidden;cursor:pointer;transition:all .2s;padding:0;text-align:left;
}
.theme-card:hover { border-color:var(--card-accent,var(--accent));transform:translateY(-2px); }
.theme-card.active { border-color:var(--card-accent,var(--accent));box-shadow:0 0 0 2px color-mix(in srgb,var(--card-accent,var(--accent)) 30%,transparent); }
.theme-preview { height:64px;display:flex;overflow:hidden; }
.tp-sidebar { width:32%; }
.tp-main { flex:1;padding:6px;display:flex;flex-direction:column;gap:4px; }
.tp-bar { height:6px;border-radius:3px;width:60%; }
.tp-line { height:5px;border-radius:2px; }
.tp-line.short { width:70%; }
.theme-label { display:flex;align-items:center;gap:5px;padding:7px 10px;font-size:11px;font-weight:600; }
.theme-name { flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
/* Toggle */
.toggle-row { display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:12px;user-select:none; }
.toggle-check { display:none; }
.toggle-slider { width:36px;height:20px;background:var(--bg3);border-radius:10px;position:relative;transition:background .2s;border:1px solid var(--border);flex-shrink:0; }
.toggle-slider::after { content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;background:var(--text-muted);border-radius:50%;transition:all .2s; }
.toggle-check:checked + .toggle-slider { background:var(--accent); }
.toggle-check:checked + .toggle-slider::after { transform:translateX(16px);background:#fff; }
.toggle-label { font-size:13px; }
/* Msg banners */
.msg-banner { padding:8px 12px;border-radius:6px;font-size:13px;margin-bottom:8px; }
.msg-ok { background:rgba(86,211,100,.12);border:1px solid rgba(86,211,100,.3);color:var(--green); }
.msg-err { background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.3);color:var(--red); }
/* Buttons */
.btn-primary { background:var(--accent);color:#0d1117;border:none;border-radius:6px;padding:8px 16px;font-weight:700;font-size:13px;cursor:pointer;transition:background .15s;width:fit-content; }
.btn-primary:hover:not(:disabled) { background:var(--accent-hover); }
.btn-primary:disabled { opacity:.6;cursor:not-allowed; }
.btn-secondary { background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;transition:all .15s;width:fit-content; }
.btn-secondary:hover { border-color:var(--accent);color:var(--accent); }
.btn-danger { background:rgba(248,81,73,.12);color:var(--red);border:1px solid rgba(248,81,73,.3);border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:fit-content; }
.btn-danger:hover { background:rgba(248,81,73,.22); }
.file-input { display:none; }
/* About */
.about-section { text-align:left; }
.about-logo { text-align:center;padding:16px 0; }
.about-name { color:var(--accent);font-size:24px;margin:8px 0 4px; }
.about-version { color:var(--text-muted);font-size:13px; }
</style>
