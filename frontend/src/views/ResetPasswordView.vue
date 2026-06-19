<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api } from "../api";

const emit = defineEmits<{ done: [] }>();
const token = ref("");
const form = ref({ password: "", confirm: "" });
const loading = ref(false);
const error = ref("");
const success = ref(false);

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  token.value = params.get("token") ?? "";
  if (!token.value) error.value = "Token manquant dans l'URL.";
});

async function doReset() {
  error.value = "";
  if (form.value.password !== form.value.confirm) { error.value = "Les mots de passe ne correspondent pas"; return; }
  if (form.value.password.length < 8) { error.value = "Mot de passe : 8 caractères minimum"; return; }
  loading.value = true;
  try { await api.resetPassword(token.value, form.value.password); success.value = true; }
  catch (e) { error.value = (e as Error).message; }
  finally { loading.value = false; }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-logo">
        <span class="auth-logo-icon">📡</span>
        <span class="auth-logo-text">PureRSS</span>
      </div>
      <h2 class="auth-title">Nouveau mot de passe</h2>
      <div v-if="success" class="auth-success">
        Mot de passe mis à jour !
        <button class="auth-link-inline" @click="emit('done')">Se connecter →</button>
      </div>
      <form v-else class="auth-form" @submit.prevent="doReset">
        <div class="form-group">
          <label>Nouveau mot de passe</label>
          <input v-model="form.password" type="password" placeholder="8 caractères minimum" required minlength="8" />
        </div>
        <div class="form-group">
          <label>Confirmer</label>
          <input v-model="form.confirm" type="password" placeholder="••••••••" required />
        </div>
        <div v-if="error" class="auth-error">{{ error }}</div>
        <button type="submit" class="auth-submit" :disabled="loading || !token">{{ loading ? "Mise à jour…" : "Changer le mot de passe" }}</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-page { min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:16px; }
.auth-card { width:100%;max-width:420px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:32px; }
.auth-logo { display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:16px; }
.auth-logo-icon { font-size:28px; }
.auth-logo-text { font-size:22px;font-weight:800;color:var(--accent); }
.auth-title { text-align:center;font-size:16px;font-weight:700;margin-bottom:24px;color:var(--text); }
.auth-form { display:flex;flex-direction:column;gap:16px; }
.form-group { display:flex;flex-direction:column;gap:6px; }
.form-group label { font-size:12px;font-weight:600;color:var(--text-muted); }
.form-group input { background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:9px 12px;font-size:13px;outline:none;transition:border .15s; }
.form-group input:focus { border-color:var(--accent); }
.auth-error { background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.3);color:var(--red);padding:8px 12px;border-radius:6px;font-size:13px; }
.auth-success { background:rgba(86,211,100,.12);border:1px solid rgba(86,211,100,.3);color:var(--green);padding:12px;border-radius:6px;font-size:13px;display:flex;flex-direction:column;gap:8px; }
.auth-submit { background:var(--accent);color:#0d1117;border:none;border-radius:6px;padding:10px;font-weight:700;font-size:14px;cursor:pointer;transition:background .15s; }
.auth-submit:hover:not(:disabled) { background:var(--accent-hover); }
.auth-submit:disabled { opacity:.6;cursor:not-allowed; }
.auth-link-inline { background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px;font-weight:600;padding:0;text-align:left; }
</style>
