<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api, type FeedConfig, type FeedItem } from "./api.ts";

// ─── État ─────────────────────────────────────────────────────────────────────
const feeds        = ref<FeedConfig[]>([]);
const selectedFeed = ref<FeedConfig | null>(null);
const feedItems    = ref<FeedItem[]>([]);
const loading      = ref(false);
const refreshingId = ref<string | null>(null);
const notification = ref<{ msg: string; type: "success" | "error" } | null>(null);
const showModal    = ref(false);

const form = ref({
  name: "",
  source_url: "",
  feed_type: "generic",
  selector_title: "h2 a",
  selector_link: "h2 a",
  selector_description: "",
  selector_date: "",
  refresh_interval: 30,
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    await loadFeeds();
  } catch (e) {
    notify(`Connexion au serveur impossible: ${(e as Error).message}`, "error");
  }
});

// ─── Actions ──────────────────────────────────────────────────────────────────
async function loadFeeds() {
  feeds.value = await api.getFeeds();
}

async function selectFeed(feed: FeedConfig) {
  selectedFeed.value = feed;
  try {
    feedItems.value = await api.getItems(feed.id);
  } catch (e) {
    notify(`Erreur chargement items: ${(e as Error).message}`, "error");
  }
}

async function refreshFeed(feedId: string) {
  refreshingId.value = feedId;
  try {
    const result = await api.refreshFeed(feedId);
    notify(`Rafraîchi: ${result.inserted} nouveau(x) item(s)`, "success");
    await loadFeeds();
    if (selectedFeed.value?.id === feedId) {
      feedItems.value = await api.getItems(feedId);
      selectedFeed.value = feeds.value.find(f => f.id === feedId) ?? selectedFeed.value;
    }
  } catch (e) {
    notify(`Erreur: ${(e as Error).message}`, "error");
  } finally {
    refreshingId.value = null;
  }
}

async function deleteFeed(feedId: string) {
  if (!confirm("Supprimer ce flux et tous ses items?")) return;
  try {
    await api.deleteFeed(feedId);
    if (selectedFeed.value?.id === feedId) {
      selectedFeed.value = null;
      feedItems.value = [];
    }
    await loadFeeds();
    notify("Flux supprimé", "success");
  } catch (e) {
    notify(`Erreur: ${(e as Error).message}`, "error");
  }
}

async function toggleFeed(feed: FeedConfig) {
  try {
    await api.toggleFeed(feed.id);
    await loadFeeds();
  } catch (e) {
    notify(`Erreur: ${(e as Error).message}`, "error");
  }
}

async function copyRssUrl(feedId: string) {
  const url = api.rssUrl(feedId);
  await navigator.clipboard.writeText(url);
  notify("URL RSS copiée: " + url, "success");
}

async function addFeed() {
  if (!form.value.name || !form.value.source_url) return;
  loading.value = true;
  try {
    await api.addFeed({
      name: form.value.name,
      source_url: form.value.source_url,
      feed_type: form.value.feed_type,
      selector_title: form.value.selector_title || null,
      selector_link: form.value.selector_link || null,
      selector_description: form.value.selector_description || null,
      selector_date: form.value.selector_date || null,
      refresh_interval: form.value.refresh_interval,
    });
    await loadFeeds();
    notify(`Flux "${form.value.name}" ajouté`, "success");
    resetForm();
    showModal.value = false;
  } catch (e) {
    notify(`Erreur: ${(e as Error).message}`, "error");
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.value = {
    name: "", source_url: "", feed_type: "generic",
    selector_title: "h2 a", selector_link: "h2 a",
    selector_description: "", selector_date: "", refresh_interval: 30,
  };
}

function notify(msg: string, type: "success" | "error") {
  notification.value = { msg, type };
  setTimeout(() => { notification.value = null; }, 4500);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); }
  catch { return d; }
}

const typeLabel = (t: string) => ({ generic: "Web", youtube: "YouTube", social: "Social" }[t] ?? t);
const typeColor = (t: string) => ({ generic: "badge-blue", youtube: "badge-red", social: "badge-pink" }[t] ?? "badge-gray");
</script>

<template>
  <div class="app">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo-area">
          <span class="logo-icon">📡</span>
          <span class="logo-text">PureRSS</span>
        </div>
      </div>

      <button class="btn-add" @click="showModal = true">+ Nouveau flux</button>

      <div class="feeds-list">
        <div
          v-for="feed in feeds" :key="feed.id"
          class="feed-item"
          :class="{ active: selectedFeed?.id === feed.id, disabled: !feed.enabled }"
          @click="selectFeed(feed)"
        >
          <div class="feed-item-top">
            <span :class="['badge', typeColor(feed.feed_type)]">{{ typeLabel(feed.feed_type) }}</span>
            <div class="feed-actions">
              <button class="icon-btn" :class="{ spinning: refreshingId === feed.id }" @click.stop="refreshFeed(feed.id)" title="Rafraîchir">↻</button>
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

        <div v-if="feeds.length === 0" class="empty-state">
          <p>Aucun flux.</p>
          <p>Cliquez sur <strong>+ Nouveau flux</strong> pour commencer.</p>
        </div>
      </div>
    </aside>

    <!-- Contenu -->
    <main class="content">
      <div v-if="selectedFeed" class="content-header">
        <div class="content-title">
          <span :class="['badge', typeColor(selectedFeed.feed_type)]">{{ typeLabel(selectedFeed.feed_type) }}</span>
          <h2>{{ selectedFeed.name }}</h2>
        </div>
        <div class="content-actions">
          <button class="btn-secondary" @click="copyRssUrl(selectedFeed.id)">Copier URL RSS</button>
          <button class="btn-primary" :class="{ spinning: refreshingId === selectedFeed.id }" @click="refreshFeed(selectedFeed.id)">
            ↻ Rafraîchir
          </button>
        </div>
      </div>

      <div v-if="selectedFeed" class="feed-url-bar">
        <span class="url-label">RSS URL:</span>
        <code>{{ api.rssUrl(selectedFeed.id) }}</code>
        <span class="url-hint">— Abonnez-vous dans votre lecteur RSS</span>
      </div>

      <div v-if="selectedFeed" class="items-list">
        <div v-if="feedItems.length === 0" class="empty-items">
          <p>Aucun item. Cliquez sur <strong>↻ Rafraîchir</strong> pour récupérer le contenu.</p>
        </div>
        <article v-for="item in feedItems" :key="item.id" class="item-card">
          <div class="item-header">
            <h3 class="item-title">
              <a :href="item.link" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
            </h3>
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

      <div v-if="!selectedFeed" class="welcome">
        <div class="welcome-icon">📡</div>
        <h2>PureRSS</h2>
        <p>Générateur de flux RSS depuis n'importe quelle source web</p>
        <div class="welcome-tips">
          <div class="tip"><span class="tip-icon">🌐</span><div><strong>Web générique</strong><br>Blogs, sites d'actualité avec sélecteurs CSS</div></div>
          <div class="tip"><span class="tip-icon">▶️</span><div><strong>YouTube</strong><br>Flux RSS natif depuis une URL de chaîne</div></div>
          <div class="tip"><span class="tip-icon">📱</span><div><strong>Social</strong><br>Instagram, Facebook (comptes publics)</div></div>
        </div>
        <button class="btn-primary btn-lg" @click="showModal = true">+ Créer votre premier flux</button>
      </div>
    </main>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal">
          <div class="modal-header">
            <h3>Nouveau flux RSS</h3>
            <button class="icon-btn" @click="showModal = false">✕</button>
          </div>
          <form @submit.prevent="addFeed" class="modal-form">
            <div class="form-row">
              <label>Nom du flux *</label>
              <input v-model="form.name" placeholder="Mon blog tech" required />
            </div>
            <div class="form-row">
              <label>URL source *</label>
              <input v-model="form.source_url" placeholder="https://..." type="url" required />
            </div>
            <div class="form-row">
              <label>Type de source</label>
              <select v-model="form.feed_type">
                <option value="generic">Web générique (CSS selectors)</option>
                <option value="youtube">YouTube</option>
                <option value="social">Réseau social (Instagram/FB)</option>
              </select>
            </div>
            <template v-if="form.feed_type === 'generic'">
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
            <div class="modal-actions">
              <button type="button" class="btn-secondary" @click="showModal = false">Annuler</button>
              <button type="submit" class="btn-primary" :disabled="loading">
                {{ loading ? "Ajout en cours…" : "Ajouter le flux" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Notification -->
    <Teleport to="body">
      <div v-if="notification" :class="['notification', notification.type]">
        {{ notification.msg }}
      </div>
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
  --red: #f85149; --green: #56d364; --pink: #db61a2;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  background: var(--bg);
  color: var(--text);
}

#app { height: 100%; }

.app { display: flex; height: 100vh; overflow: hidden; }

/* ── Sidebar ── */
.sidebar { width: 280px; min-width: 220px; background: var(--bg2); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--border); }
.logo-area { display: flex; align-items: center; gap: 8px; }
.logo-icon { font-size: 20px; }
.logo-text { font-size: 16px; font-weight: 700; color: var(--accent); }
.btn-add { margin: 12px; padding: 8px 12px; background: var(--accent); color: #0d1117; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; transition: background .2s; }
.btn-add:hover { background: var(--accent-hover); }
.feeds-list { flex: 1; overflow-y: auto; padding: 4px 8px; }
.feed-item { padding: 10px; border-radius: 8px; cursor: pointer; margin-bottom: 4px; border: 1px solid transparent; transition: all .15s; }
.feed-item:hover { background: var(--bg3); border-color: var(--border); }
.feed-item.active { background: var(--bg3); border-color: var(--accent); }
.feed-item.disabled { opacity: .5; }
.feed-item-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.feed-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
.feed-item:hover .feed-actions, .feed-item.active .feed-actions { opacity: 1; }
.icon-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 13px; padding: 2px 4px; border-radius: 4px; transition: all .15s; line-height: 1; }
.icon-btn:hover { color: var(--text); background: var(--border); }
.icon-btn.danger:hover { color: var(--red); }
.feed-name { font-size: 13px; font-weight: 500; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.feed-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); }

/* ── Badges ── */
.badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
.badge-blue  { background: rgba(88,166,255,.15); color: #58a6ff; }
.badge-red   { background: rgba(248,81,73,.15); color: #f85149; }
.badge-pink  { background: rgba(219,97,162,.15); color: #db61a2; }
.badge-gray  { background: rgba(139,148,158,.15); color: #8b949e; }

/* ── Content ── */
.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
.content-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--bg2); }
.content-title { display: flex; align-items: center; gap: 10px; }
.content-title h2 { font-size: 16px; font-weight: 600; }
.content-actions { display: flex; gap: 8px; }
.feed-url-bar { padding: 8px 20px; background: rgba(88,166,255,.05); border-bottom: 1px solid var(--border); font-size: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.url-label { color: var(--text-muted); }
.feed-url-bar code { color: var(--accent); background: var(--bg2); padding: 2px 8px; border-radius: 4px; font-size: 12px; word-break: break-all; }
.url-hint { color: var(--text-muted); }
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

/* ── Welcome ── */
.welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 40px; text-align: center; }
.welcome-icon { font-size: 56px; }
.welcome h2 { font-size: 24px; }
.welcome > p { color: var(--text-muted); }
.welcome-tips { display: flex; gap: 16px; margin: 8px 0; flex-wrap: wrap; justify-content: center; }
.tip { display: flex; align-items: flex-start; gap: 10px; background: var(--bg2); border: 1px solid var(--border); padding: 14px; border-radius: 10px; max-width: 180px; text-align: left; }
.tip-icon { font-size: 20px; }
.tip strong { font-size: 13px; }
.tip div { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
.btn-lg { padding: 12px 24px; font-size: 15px; margin-top: 8px; }

/* ── Buttons ── */
.btn-primary { background: var(--accent); color: #0d1117; border: none; border-radius: 6px; padding: 7px 14px; cursor: pointer; font-weight: 600; font-size: 13px; transition: background .2s; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-secondary { background: var(--bg3); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 7px 14px; cursor: pointer; font-size: 13px; transition: all .2s; }
.btn-secondary:hover { border-color: var(--accent); color: var(--accent); }

/* ── Modal ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; width: 500px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-header h3 { font-size: 16px; }
.modal-form { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.form-row { display: flex; flex-direction: column; gap: 5px; }
.form-row label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.optional { font-weight: 400; }
.form-row input, .form-row select { background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; color: var(--text); font-size: 13px; outline: none; transition: border-color .15s; width: 100%; }
.form-row input:focus, .form-row select:focus { border-color: var(--accent); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }

/* ── Notification ── */
.notification { position: fixed; bottom: 20px; right: 20px; padding: 12px 16px; border-radius: 8px; font-size: 13px; max-width: 420px; z-index: 200; animation: slideIn .2s ease; word-break: break-word; }
.notification.success { background: rgba(86,211,100,.15); border: 1px solid var(--green); color: var(--green); }
.notification.error   { background: rgba(248,81,73,.15); border: 1px solid var(--red); color: var(--red); }
@keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* ── Spinner ── */
.spinning { animation: spin .8s linear infinite; display: inline-block; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ── Empty states ── */
.empty-state, .empty-items { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; line-height: 1.7; }
</style>
