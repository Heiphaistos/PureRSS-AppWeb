<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { api, setApiKey, type FeedConfig, type FeedItem } from "./api.ts";

// ── Type metadata ──────────────────────────────────────────────────────────
interface TypeMeta { label: string; color: string; group: string; }
const FEED_TYPE_META: Record<string, TypeMeta> = {
  youtube:   { label: "YouTube",       color: "badge-red",     group: "YouTube" },
  rss:       { label: "RSS/Atom",      color: "badge-green",   group: "RSS & Podcast" },
  podcast:   { label: "Podcast",       color: "badge-teal",    group: "RSS & Podcast" },
  reddit:    { label: "Reddit",        color: "badge-orange",  group: "RSS & Podcast" },
  instagram: { label: "Instagram",     color: "badge-pink",    group: "Réseaux sociaux" },
  facebook:  { label: "Facebook",      color: "badge-indigo",  group: "Réseaux sociaux" },
  tiktok:    { label: "TikTok",        color: "badge-gray",    group: "Réseaux sociaux" },
  twitter:   { label: "Twitter/X",     color: "badge-gray",    group: "Réseaux sociaux" },
  social:    { label: "Social",        color: "badge-pink",    group: "Réseaux sociaux" },
  generic:   { label: "Site web",      color: "badge-blue",    group: "Sites web" },
  twitch:    { label: "Twitch",        color: "badge-purple",  group: "Sites web" },
};
const GROUP_ORDER = ["YouTube", "RSS & Podcast", "Réseaux sociaux", "Sites web"];
const GROUP_ICONS: Record<string, string> = {
  "YouTube": "▶",
  "RSS & Podcast": "📡",
  "Réseaux sociaux": "📱",
  "Sites web": "🌐",
};
const GENERIC_TYPES = new Set(["generic", "twitch"]);

// rssdi type mapping (PureRSS feed_type → rssdi sourceType)
const RSSDI_TYPE: Record<string, string> = {
  youtube: "youtube", instagram: "instagram",
  facebook: "facebook", tiktok: "tiktok",
};

const typeLabel = (t: string) => FEED_TYPE_META[t]?.label ?? t;
const typeColor = (t: string) => FEED_TYPE_META[t]?.color ?? "badge-gray";

function rssdiLink(feed: FeedConfig): string {
  const type = RSSDI_TYPE[feed.feed_type] ?? "rss";
  const rssUrl = api.rssUrl(feed.id);
  return `https://rssdi.heiphaistos.org/?rss=${encodeURIComponent(rssUrl)}&name=${encodeURIComponent(feed.name)}&type=${type}`;
}

// ── State ──────────────────────────────────────────────────────────────────
const feeds        = ref<FeedConfig[]>([]);
const selectedFeed = ref<FeedConfig | null>(null);
const feedItems    = ref<FeedItem[]>([]);
const loading      = ref(false);
const refreshingId = ref<string | null>(null);
const notification = ref<{ msg: string; type: "success" | "error" } | null>(null);
const showModal    = ref(false);
const showSettings = ref(false);
const editingFeedId    = ref<string | null>(null);
const apiKeyInput      = ref("");
const apiKeyConfigured = ref(false);
const discordEnabled   = ref(false);
const collapsedGroups  = ref<string[]>([]);

const editingWebhook = ref(false);
const webhookInput   = ref("");
const testingWebhook = ref(false);

const emptyForm = () => ({
  name: "", source_url: "", feed_type: "generic",
  selector_title: "h2 a", selector_link: "h2 a",
  selector_description: "", selector_date: "",
  refresh_interval: 30, discord_webhook: "",
});
const form = ref(emptyForm());

// ── Computed ───────────────────────────────────────────────────────────────
const feedGroups = computed(() => {
  const grouped: Record<string, FeedConfig[]> = {};
  for (const feed of feeds.value) {
    const g = FEED_TYPE_META[feed.feed_type]?.group ?? "Autres";
    (grouped[g] ??= []).push(feed);
  }
  return GROUP_ORDER
    .filter(g => g in grouped)
    .map(g => ({ name: g, icon: GROUP_ICONS[g] ?? "📂", feeds: grouped[g] }));
});

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  const k = localStorage.getItem("purerss-api-key") ?? "";
  apiKeyInput.value = k;
  apiKeyConfigured.value = !!k;
  discordEnabled.value = localStorage.getItem("purerss-discord-enabled") === "true";
  try { await loadFeeds(); }
  catch (e) { notify(`Connexion impossible: ${(e as Error).message}`, "error"); }
});

// ── Actions ────────────────────────────────────────────────────────────────
async function loadFeeds() { feeds.value = await api.getFeeds(); }

function toggleGroup(groupName: string) {
  const idx = collapsedGroups.value.indexOf(groupName);
  if (idx >= 0) collapsedGroups.value.splice(idx, 1);
  else collapsedGroups.value.push(groupName);
}

async function selectFeed(feed: FeedConfig) {
  selectedFeed.value = feed;
  editingWebhook.value = false;
  try { feedItems.value = await api.getItems(feed.id); }
  catch (e) { notify(`Erreur: ${(e as Error).message}`, "error"); }
}

async function refreshFeed(feedId: string) {
  if (!apiKeyConfigured.value) { showSettings.value = true; notify("Configurez votre clé API (⚙)", "error"); return; }
  refreshingId.value = feedId;
  try {
    const r = await api.refreshFeed(feedId);
    notify(`↻ ${r.inserted} nouveau(x) sur ${r.total}`, "success");
    await loadFeeds();
    if (selectedFeed.value?.id === feedId) {
      feedItems.value = await api.getItems(feedId);
      selectedFeed.value = feeds.value.find(f => f.id === feedId) ?? selectedFeed.value;
    }
  } catch (e) { notify(`Erreur: ${(e as Error).message}`, "error"); }
  finally { refreshingId.value = null; }
}

async function deleteFeed(feedId: string) {
  if (!confirm("Supprimer ce flux et tous ses items?")) return;
  try {
    await api.deleteFeed(feedId);
    if (selectedFeed.value?.id === feedId) { selectedFeed.value = null; feedItems.value = []; }
    await loadFeeds();
    notify("Flux supprimé", "success");
  } catch (e) { notify(`Erreur: ${(e as Error).message}`, "error"); }
}

async function toggleFeed(feed: FeedConfig) {
  try { await api.toggleFeed(feed.id); await loadFeeds(); }
  catch (e) { notify(`Erreur: ${(e as Error).message}`, "error"); }
}

function openCreate() { editingFeedId.value = null; form.value = emptyForm(); showModal.value = true; }

function openEdit(feed: FeedConfig) {
  editingFeedId.value = feed.id;
  form.value = {
    name: feed.name, source_url: feed.source_url, feed_type: feed.feed_type,
    selector_title: feed.selector_title ?? "h2 a",
    selector_link: feed.selector_link ?? "h2 a",
    selector_description: feed.selector_description ?? "",
    selector_date: feed.selector_date ?? "",
    refresh_interval: feed.refresh_interval,
    discord_webhook: feed.discord_webhook ?? "",
  };
  showModal.value = true;
}

async function submitFeed() {
  if (!form.value.name || !form.value.source_url) return;
  loading.value = true;
  const payload = {
    name: form.value.name, source_url: form.value.source_url, feed_type: form.value.feed_type,
    selector_title: form.value.selector_title || null, selector_link: form.value.selector_link || null,
    selector_description: form.value.selector_description || null, selector_date: form.value.selector_date || null,
    refresh_interval: form.value.refresh_interval,
    discord_webhook: form.value.discord_webhook.trim() || null,
  };
  try {
    if (editingFeedId.value) {
      await api.updateFeed(editingFeedId.value, payload);
      await loadFeeds();
      if (selectedFeed.value?.id === editingFeedId.value)
        selectedFeed.value = feeds.value.find(f => f.id === editingFeedId.value) ?? null;
      notify(`Flux "${form.value.name}" modifié ✓`, "success");
    } else {
      await api.addFeed(payload);
      await loadFeeds();
      notify(`Flux "${form.value.name}" ajouté ✓`, "success");
    }
    showModal.value = false;
    editingFeedId.value = null;
    form.value = emptyForm();
  } catch (e) { notify(`Erreur: ${(e as Error).message}`, "error"); }
  finally { loading.value = false; }
}

async function copyRssUrl(feedId: string) {
  await navigator.clipboard.writeText(api.rssUrl(feedId));
  notify("URL RSS copiée ✓", "success");
}

function startEditWebhook() {
  webhookInput.value = selectedFeed.value?.discord_webhook ?? "";
  editingWebhook.value = true;
}

async function saveWebhook() {
  if (!selectedFeed.value) return;
  const val = webhookInput.value.trim() || null;
  try {
    await api.updateWebhook(selectedFeed.value.id, val);
    await loadFeeds();
    selectedFeed.value = feeds.value.find(f => f.id === selectedFeed.value!.id) ?? selectedFeed.value;
    editingWebhook.value = false;
    notify(val ? "Webhook Discord enregistré ✓" : "Webhook supprimé", "success");
  } catch (e) { notify(`Erreur: ${(e as Error).message}`, "error"); }
}

async function runTestWebhook() {
  if (!selectedFeed.value) return;
  testingWebhook.value = true;
  try { await api.testWebhook(selectedFeed.value.id); notify("Message test envoyé ✓", "success"); }
  catch (e) { notify(`Erreur webhook: ${(e as Error).message}`, "error"); }
  finally { testingWebhook.value = false; }
}

function maskWebhook(url: string): string {
  const m = url.match(/^(https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/)[^/]+/);
  return m ? m[1] + "●●●●●●●●" : url.slice(0, 45) + "…";
}

function saveSettings() {
  const k = apiKeyInput.value.trim();
  setApiKey(k);
  apiKeyConfigured.value = !!k;
  localStorage.setItem("purerss-discord-enabled", discordEnabled.value ? "true" : "false");
  showSettings.value = false;
  notify("Paramètres enregistrés ✓", "success");
}

function notify(msg: string, type: "success" | "error") {
  notification.value = { msg, type };
  setTimeout(() => { notification.value = null; }, 5000);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); }
  catch { return d; }
}
</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-area"><span class="logo-icon">📡</span><span class="logo-text">PureRSS</span></div>
        <div class="sidebar-header-actions">
          <span v-if="!apiKeyConfigured" class="key-warning" title="Clé API non configurée">⚠</span>
          <button class="icon-btn" @click="showSettings = true" title="Paramètres">⚙</button>
        </div>
      </div>

      <button class="btn-add" @click="openCreate">+ Nouveau flux</button>

      <div class="feeds-list">
        <template v-if="feeds.length > 0">
          <div v-for="group in feedGroups" :key="group.name" class="feed-group">
            <div class="group-header" @click="toggleGroup(group.name)">
              <span class="group-chevron">{{ collapsedGroups.includes(group.name) ? '▶' : '▼' }}</span>
              <span class="group-icon-type">{{ group.icon }}</span>
              <span class="group-name">{{ group.name }}</span>
              <span class="group-count">{{ group.feeds.length }}</span>
            </div>
            <template v-if="!collapsedGroups.includes(group.name)">
              <div
                v-for="feed in group.feeds" :key="feed.id"
                class="feed-item"
                :class="{ active: selectedFeed?.id === feed.id, disabled: !feed.enabled }"
                @click="selectFeed(feed)"
              >
                <div class="feed-item-top">
                  <div class="feed-badges">
                    <span :class="['badge', typeColor(feed.feed_type)]">{{ typeLabel(feed.feed_type) }}</span>
                    <span v-if="feed.discord_webhook && discordEnabled" class="badge badge-discord" title="Webhook Discord actif">Discord</span>
                  </div>
                  <div class="feed-actions">
                    <button class="icon-btn" :class="{ spinning: refreshingId === feed.id }" @click.stop="refreshFeed(feed.id)" title="Rafraîchir">↻</button>
                    <button class="icon-btn" @click.stop="openEdit(feed)" title="Modifier">✎</button>
                    <button class="icon-btn" @click.stop="copyRssUrl(feed.id)" title="Copier URL RSS">🔗</button>
                    <button class="icon-btn" @click.stop="toggleFeed(feed)" :title="feed.enabled ? 'Désactiver' : 'Activer'">{{ feed.enabled ? '●' : '○' }}</button>
                    <button class="icon-btn danger" @click.stop="deleteFeed(feed.id)" title="Supprimer">✕</button>
                  </div>
                </div>
                <div class="feed-name">{{ feed.name }}</div>
                <div class="feed-meta">
                  <span>{{ feed.item_count }} items</span>
                  <span>{{ feed.last_fetched ? formatDate(feed.last_fetched) : 'Jamais' }}</span>
                </div>
              </div>
            </template>
          </div>
        </template>
        <div v-else class="empty-state">
          <p>Aucun flux.</p><p>Cliquez sur <strong>+ Nouveau flux</strong> pour commencer.</p>
        </div>
      </div>
    </aside>

    <main class="content">
      <template v-if="selectedFeed">
        <div class="content-header">
          <div class="content-title">
            <span :class="['badge', typeColor(selectedFeed.feed_type)]">{{ typeLabel(selectedFeed.feed_type) }}</span>
            <h2>{{ selectedFeed.name }}</h2>
          </div>
          <div class="content-actions">
            <button class="btn-secondary" @click="openEdit(selectedFeed)">✎ Modifier</button>
            <button class="btn-secondary" @click="copyRssUrl(selectedFeed.id)">Copier URL RSS</button>
            <a :href="rssdiLink(selectedFeed)" target="_blank" rel="noopener" class="btn-secondary btn-rssdi" title="Ouvrir dans rssdi avec l'URL pré-remplie">→ rssdi</a>
            <button class="btn-primary" :class="{ spinning: refreshingId === selectedFeed.id }" @click="refreshFeed(selectedFeed.id)">↻ Rafraîchir</button>
          </div>
        </div>

        <div class="feed-url-bar">
          <span class="url-label">RSS URL:</span>
          <code>{{ api.rssUrl(selectedFeed.id) }}</code>
          <span class="url-hint">— Abonnez-vous dans votre lecteur RSS</span>
        </div>

        <div v-if="discordEnabled" class="webhook-panel">
          <div class="webhook-row">
            <span class="webhook-icon">🔔</span>
            <span class="webhook-label">Discord Webhook</span>
            <template v-if="!editingWebhook">
              <template v-if="selectedFeed.discord_webhook">
                <code class="webhook-url">{{ maskWebhook(selectedFeed.discord_webhook) }}</code>
                <button class="btn-xs btn-outline" @click="runTestWebhook" :disabled="testingWebhook">{{ testingWebhook ? "Envoi…" : "Tester" }}</button>
                <button class="btn-xs" @click="startEditWebhook">Modifier</button>
              </template>
              <template v-else>
                <span class="webhook-none">Non configuré</span>
                <button class="btn-xs btn-discord" @click="startEditWebhook">+ Configurer</button>
              </template>
            </template>
            <template v-else>
              <input v-model="webhookInput" class="webhook-input" placeholder="https://discord.com/api/webhooks/ID/TOKEN" @keyup.enter="saveWebhook" @keyup.esc="editingWebhook = false" autofocus />
              <button class="btn-xs btn-primary" @click="saveWebhook">OK</button>
              <button class="btn-xs" @click="editingWebhook = false">✕</button>
            </template>
          </div>
          <p v-if="editingWebhook" class="webhook-hint">Discord : Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l'URL</p>
        </div>

        <div class="items-list">
          <div v-if="feedItems.length === 0" class="empty-items">
            <p>Aucun item. Cliquez sur <strong>↻ Rafraîchir</strong> pour récupérer le contenu.</p>
          </div>
          <article v-for="item in feedItems" :key="item.id" class="item-card">
            <div class="item-header">
              <h3 class="item-title"><a :href="item.link" target="_blank" rel="noopener noreferrer">{{ item.title }}</a></h3>
              <span class="item-date">{{ formatDate(item.pub_date || item.fetched_at) }}</span>
            </div>
            <p v-if="item.description" class="item-desc">
              {{ item.description.substring(0, 200) }}{{ item.description.length > 200 ? '…' : '' }}
            </p>
            <div class="item-footer">
              <span v-if="item.author" class="item-author">{{ item.author }}</span>
              <a :href="item.link" target="_blank" rel="noopener noreferrer" class="item-link">Lire →</a>
            </div>
          </article>
        </div>
      </template>

      <div v-else class="welcome">
        <div class="welcome-icon">📡</div>
        <h2>PureRSS</h2>
        <p>Générateur de flux RSS depuis n'importe quelle source web</p>
        <div v-if="!apiKeyConfigured" class="api-key-banner">
          <span>⚠ Clé API non configurée</span>
          <button class="btn-secondary btn-sm" @click="showSettings = true">Configurer →</button>
        </div>
        <div class="welcome-tips">
          <div class="tip"><span class="tip-icon">🌐</span><div><strong>Sites web</strong><br>Blogs, actualités avec sélecteurs CSS</div></div>
          <div class="tip"><span class="tip-icon">▶️</span><div><strong>YouTube / Twitch</strong><br>Flux RSS natif depuis une chaîne</div></div>
          <div class="tip"><span class="tip-icon">📡</span><div><strong>RSS / Podcast</strong><br>RSS, Atom, Reddit, Podcast</div></div>
          <div class="tip"><span class="tip-icon">📱</span><div><strong>Réseaux sociaux</strong><br>Instagram, Facebook, TikTok…</div></div>
        </div>
        <button class="btn-primary btn-lg" @click="openCreate">+ Créer votre premier flux</button>
      </div>
    </main>

    <!-- Modal Créer / Modifier -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false; editingFeedId = null">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ editingFeedId ? '✎ Modifier le flux' : 'Nouveau flux RSS' }}</h3>
            <button class="icon-btn" @click="showModal = false; editingFeedId = null">✕</button>
          </div>
          <form @submit.prevent="submitFeed" class="modal-form">
            <div class="form-row">
              <label>Nom du flux *</label>
              <input v-model="form.name" placeholder="Mon blog tech" required />
            </div>
            <div class="form-row">
              <label>URL source *</label>
              <input v-model="form.source_url" placeholder="https://..." type="url" required />
            </div>
            <div class="form-row">
              <label>Type / Plateforme</label>
              <select v-model="form.feed_type">
                <optgroup label="▶ Vidéo">
                  <option value="youtube">YouTube</option>
                  <option value="twitch">Twitch</option>
                </optgroup>
                <optgroup label="📡 RSS & Podcast">
                  <option value="rss">RSS / Atom</option>
                  <option value="podcast">Podcast</option>
                  <option value="reddit">Reddit</option>
                </optgroup>
                <optgroup label="📱 Réseaux sociaux">
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="tiktok">TikTok</option>
                  <option value="twitter">Twitter / X</option>
                  <option value="social">Social (autre)</option>
                </optgroup>
                <optgroup label="🌐 Sites web">
                  <option value="generic">Site web générique (CSS selectors)</option>
                </optgroup>
              </select>
            </div>
            <template v-if="GENERIC_TYPES.has(form.feed_type)">
              <div class="form-row">
                <label>Sélecteur CSS — Titre</label>
                <input v-model="form.selector_title" placeholder="h2 a, .article-title" />
              </div>
              <div class="form-row">
                <label>Sélecteur CSS — Lien</label>
                <input v-model="form.selector_link" placeholder="h2 a, a.read-more" />
              </div>
              <div class="form-row">
                <label>Sélecteur CSS — Description <span class="optional">(optionnel)</span></label>
                <input v-model="form.selector_description" placeholder=".article-excerpt" />
              </div>
              <div class="form-row">
                <label>Sélecteur CSS — Date <span class="optional">(optionnel)</span></label>
                <input v-model="form.selector_date" placeholder="time, .pub-date" />
              </div>
            </template>
            <div class="form-row">
              <label>Intervalle de rafraîchissement (minutes)</label>
              <input v-model.number="form.refresh_interval" type="number" min="5" max="1440" />
            </div>
            <div v-if="discordEnabled" class="form-row">
              <label>Webhook Discord <span class="optional">(optionnel)</span></label>
              <input v-model="form.discord_webhook" placeholder="https://discord.com/api/webhooks/…" />
              <small class="form-hint">Les nouveaux items seront envoyés en embed dans votre salon Discord.</small>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn-secondary" @click="showModal = false; editingFeedId = null">Annuler</button>
              <button type="submit" class="btn-primary" :disabled="loading">
                {{ loading ? (editingFeedId ? 'Modification…' : 'Ajout…') : (editingFeedId ? 'Enregistrer' : 'Ajouter le flux') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Modal Paramètres -->
    <Teleport to="body">
      <div v-if="showSettings" class="modal-overlay" @click.self="showSettings = false">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3>⚙ Paramètres</h3>
            <button class="icon-btn" @click="showSettings = false">✕</button>
          </div>
          <div class="modal-form">
            <div class="form-row">
              <label>Clé API
                <span :class="apiKeyConfigured ? 'key-ok' : 'key-missing-label'">
                  {{ apiKeyConfigured ? '(configurée ✓)' : '(non configurée)' }}
                </span>
              </label>
              <input v-model="apiKeyInput" type="password" placeholder="Entrez la clé API du serveur…" autocomplete="off" />
              <small class="form-hint">Requise pour toutes les modifications. Stockée dans votre navigateur.</small>
            </div>
            <div class="form-row">
              <label class="toggle-row">
                <input type="checkbox" v-model="discordEnabled" class="toggle-check" />
                <span class="toggle-text">Activer les webhooks Discord</span>
              </label>
              <small class="form-hint">Affiche le panneau webhook sur chaque flux. Désactivez si vous utilisez rssdi pour la diffusion Discord.</small>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn-secondary" @click="showSettings = false">Annuler</button>
              <button type="button" class="btn-primary" @click="saveSettings">Enregistrer</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="notification" :class="['notification', notification.type]">{{ notification.msg }}</div>
    </Teleport>
  </div>
</template>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }

:root {
  --bg: #0d1117; --bg2: #161b22; --bg3: #21262d; --border: #30363d;
  --text: #e6edf3; --text-muted: #8b949e;
  --accent: #58a6ff; --accent-hover: #79b8ff;
  --red: #f85149; --green: #56d364; --pink: #db61a2; --yellow: #f0b429;
  --orange: #f0883e; --teal: #39d353; --indigo: #6e76f0; --purple: #9146ff;
  --discord: #5865f2;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px; background: var(--bg); color: var(--text);
}
#app { height: 100%; }
.app { display: flex; height: 100vh; overflow: hidden; }

.sidebar { width: 280px; min-width: 220px; background: var(--bg2); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--border); }
.logo-area { display: flex; align-items: center; gap: 8px; }
.logo-icon { font-size: 20px; }
.logo-text { font-size: 16px; font-weight: 700; color: var(--accent); }
.sidebar-header-actions { display: flex; align-items: center; gap: 4px; }
.key-warning { color: var(--yellow); font-size: 15px; cursor: help; }
.btn-add { margin: 12px; padding: 8px 12px; background: var(--accent); color: #0d1117; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; transition: background .2s; }
.btn-add:hover { background: var(--accent-hover); }
.feeds-list { flex: 1; overflow-y: auto; padding: 4px 4px; }

.feed-group { margin-bottom: 2px; }
.group-header { display: flex; align-items: center; gap: 6px; padding: 5px 8px; cursor: pointer; border-radius: 6px; color: var(--text-muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; user-select: none; transition: all .15s; }
.group-header:hover { color: var(--text); background: var(--bg3); }
.group-chevron { font-size: 8px; width: 10px; flex-shrink: 0; }
.group-icon-type { font-size: 12px; }
.group-name { flex: 1; }
.group-count { background: var(--bg3); border-radius: 10px; padding: 1px 6px; font-size: 10px; color: var(--text-muted); }

.feed-item { padding: 8px 8px 8px 22px; border-radius: 8px; cursor: pointer; margin-bottom: 2px; border: 1px solid transparent; transition: all .15s; }
.feed-item:hover { background: var(--bg3); border-color: var(--border); }
.feed-item.active { background: var(--bg3); border-color: var(--accent); }
.feed-item.disabled { opacity: .5; }
.feed-item-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.feed-badges { display: flex; gap: 4px; flex-wrap: wrap; }
.feed-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
.feed-item:hover .feed-actions, .feed-item.active .feed-actions { opacity: 1; }
.icon-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 13px; padding: 2px 4px; border-radius: 4px; transition: all .15s; line-height: 1; }
.icon-btn:hover { color: var(--text); background: var(--border); }
.icon-btn.danger:hover { color: var(--red); }
.feed-name { font-size: 13px; font-weight: 500; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.feed-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); }

.badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
.badge-blue    { background: rgba(88,166,255,.15);  color: #58a6ff; }
.badge-red     { background: rgba(248,81,73,.15);   color: #f85149; }
.badge-pink    { background: rgba(219,97,162,.15);  color: #db61a2; }
.badge-green   { background: rgba(86,211,100,.15);  color: #56d364; }
.badge-gray    { background: rgba(139,148,158,.15); color: #8b949e; }
.badge-orange  { background: rgba(240,136,62,.15);  color: #f0883e; }
.badge-teal    { background: rgba(57,211,83,.15);   color: #39d353; }
.badge-indigo  { background: rgba(110,118,240,.15); color: #6e76f0; }
.badge-purple  { background: rgba(145,70,255,.15);  color: #9146ff; }
.badge-discord { background: rgba(88,101,242,.2);   color: #7289da; }

.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
.content-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--bg2); flex-wrap: wrap; gap: 8px; }
.content-title { display: flex; align-items: center; gap: 10px; }
.content-title h2 { font-size: 16px; font-weight: 600; }
.content-actions { display: flex; gap: 8px; align-items: center; }
.feed-url-bar { padding: 8px 20px; background: rgba(88,166,255,.05); border-bottom: 1px solid var(--border); font-size: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.url-label { color: var(--text-muted); }
.feed-url-bar code { color: var(--accent); background: var(--bg2); padding: 2px 8px; border-radius: 4px; font-size: 12px; word-break: break-all; }
.url-hint { color: var(--text-muted); }

.webhook-panel { padding: 8px 20px; background: rgba(88,101,242,.04); border-bottom: 1px solid var(--border); }
.webhook-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.webhook-icon { font-size: 14px; }
.webhook-label { font-size: 12px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
.webhook-url { color: var(--discord); background: var(--bg2); padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.webhook-none { font-size: 12px; color: var(--text-muted); }
.webhook-input { flex: 1; min-width: 240px; background: var(--bg3); border: 1px solid var(--discord); border-radius: 5px; padding: 4px 8px; color: var(--text); font-size: 12px; outline: none; }
.webhook-hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.btn-xs { padding: 3px 10px; font-size: 11px; border-radius: 5px; cursor: pointer; border: 1px solid var(--border); background: var(--bg3); color: var(--text); transition: all .15s; white-space: nowrap; }
.btn-xs:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.btn-xs:disabled { opacity: .5; cursor: not-allowed; }
.btn-xs.btn-outline { border-color: var(--discord); color: var(--discord); background: transparent; }
.btn-xs.btn-outline:hover { background: rgba(88,101,242,.1); }
.btn-xs.btn-discord { border-color: var(--discord); color: var(--discord); background: rgba(88,101,242,.08); }
.btn-xs.btn-discord:hover { background: rgba(88,101,242,.18); }
.btn-xs.btn-primary { background: var(--accent); color: #0d1117; border-color: var(--accent); }
.btn-xs.btn-primary:hover { background: var(--accent-hover); }

.items-list { flex: 1; overflow-y: auto; padding: 12px 20px; display: flex; flex-direction: column; gap: 8px; }
.item-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; transition: border-color .15s; }
.item-card:hover { border-color: var(--accent); }
.item-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
.item-title { font-size: 14px; font-weight: 500; flex: 1; line-height: 1.4; }
.item-title a { color: var(--accent); text-decoration: none; }
.item-title a:hover { color: var(--accent-hover); text-decoration: underline; }
.item-date { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.item-desc { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 8px; }
.item-footer { display: flex; justify-content: space-between; align-items: center; }
.item-author { font-size: 12px; color: var(--text-muted); }
.item-link { font-size: 12px; color: var(--accent); text-decoration: none; }
.item-link:hover { text-decoration: underline; }

.welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 40px; text-align: center; }
.welcome-icon { font-size: 56px; }
.welcome h2 { font-size: 24px; }
.welcome > p { color: var(--text-muted); }
.api-key-banner { display: flex; align-items: center; gap: 12px; background: rgba(240,180,41,.08); border: 1px solid rgba(240,180,41,.3); padding: 10px 16px; border-radius: 8px; color: var(--yellow); font-size: 13px; flex-wrap: wrap; justify-content: center; }
.welcome-tips { display: flex; gap: 16px; margin: 8px 0; flex-wrap: wrap; justify-content: center; }
.tip { display: flex; align-items: flex-start; gap: 10px; background: var(--bg2); border: 1px solid var(--border); padding: 14px; border-radius: 10px; max-width: 180px; text-align: left; }
.tip-icon { font-size: 20px; }
.tip strong { font-size: 13px; }
.tip div { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
.btn-lg { padding: 12px 24px; font-size: 15px; margin-top: 8px; }
.btn-sm { padding: 4px 10px; font-size: 12px; }

.btn-primary { background: var(--accent); color: #0d1117; border: none; border-radius: 6px; padding: 7px 14px; cursor: pointer; font-weight: 600; font-size: 13px; transition: background .2s; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-secondary { background: var(--bg3); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 7px 14px; cursor: pointer; font-size: 13px; transition: all .2s; text-decoration: none; display: inline-flex; align-items: center; }
.btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
.btn-rssdi:hover { border-color: var(--discord) !important; color: var(--discord) !important; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; width: 500px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
.modal-sm { width: 400px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-header h3 { font-size: 16px; }
.modal-form { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.form-row { display: flex; flex-direction: column; gap: 5px; }
.form-row label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.optional { font-weight: 400; }
.key-ok { color: var(--green); font-size: 11px; font-weight: 400; }
.key-missing-label { color: var(--red); font-size: 11px; font-weight: 400; }
.form-hint { font-size: 11px; color: var(--text-muted); margin-top: 2px; line-height: 1.4; }
.form-row input, .form-row select { background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; color: var(--text); font-size: 13px; outline: none; transition: border-color .15s; width: 100%; }
.form-row input:focus, .form-row select:focus { border-color: var(--accent); }
.form-row select optgroup { font-weight: 600; color: var(--text-muted); background: var(--bg3); }
.form-row select option { background: var(--bg3); color: var(--text); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }

.toggle-row { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px !important; color: var(--text) !important; font-weight: 400 !important; }
.toggle-check { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
.toggle-text { font-size: 13px; color: var(--text); }

.notification { position: fixed; bottom: 20px; right: 20px; padding: 12px 16px; border-radius: 8px; font-size: 13px; max-width: 420px; z-index: 200; animation: slideIn .2s ease; word-break: break-word; }
.notification.success { background: rgba(86,211,100,.15); border: 1px solid var(--green); color: var(--green); }
.notification.error   { background: rgba(248,81,73,.15); border: 1px solid var(--red); color: var(--red); }
@keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.spinning { animation: spin .8s linear infinite; display: inline-block; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.empty-state, .empty-items { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; line-height: 1.7; }
</style>
