<script setup lang="ts">
import { ref } from "vue";
import { useAuth } from "../composables/useAuth";
import { api } from "../api";

const emit = defineEmits<{ authenticated: [] }>();
const { login, register } = useAuth();

type Tab = "login" | "register" | "forgot";
const tab = ref<Tab>("login");
const loading = ref(false);
const error = ref("");
const success = ref("");

const loginForm = ref({ email: "", password: "" });
const registerForm = ref({ email: "", username: "", password: "", confirm: "" });
const forgotForm = ref({ email: "" });

async function doLogin() {
  error.value = ""; loading.value = true;
  try { await login(loginForm.value.email, loginForm.value.password); emit("authenticated"); }
  catch (e) { error.value = (e as Error).message; }
  finally { loading.value = false; }
}

async function doRegister() {
  error.value = "";
  if (registerForm.value.password !== registerForm.value.confirm) { error.value = "Les mots de passe ne correspondent pas"; return; }
  if (registerForm.value.password.length < 8) { error.value = "Mot de passe : 8 caractères minimum"; return; }
  loading.value = true;
  try { await register(registerForm.value.email, registerForm.value.username, registerForm.value.password); emit("authenticated"); }
  catch (e) { error.value = (e as Error).message; }
  finally { loading.value = false; }
}

async function doForgot() {
  error.value = ""; success.value = ""; loading.value = true;
  try {
    await api.forgotPassword(forgotForm.value.email);
    success.value = "Si cet email existe, un lien de réinitialisation vous a été envoyé.";
  }
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

      <div class="auth-tabs">
        <button :class="['auth-tab', { active: tab === 'login' }]" @click="tab = 'login'; error = ''; success = ''">Connexion</button>
        <button :class="['auth-tab', { active: tab === 'register' }]" @click="tab = 'register'; error = ''; success = ''">Créer un compte</button>
        <button :class="['auth-tab', { active: tab === 'forgot' }]" @click="tab = 'forgot'; error = ''; success = ''">Mot de passe oublié</button>
      </div>

      <!-- Login -->
      <form v-if="tab === 'login'" class="auth-form" @submit.prevent="doLogin">
        <div class="form-group">
          <label>Email</label>
          <input v-model="loginForm.email" type="email" placeholder="you@example.com" required autocomplete="email" />
        </div>
        <div class="form-group">
          <label>Mot de passe</label>
          <input v-model="loginForm.password" type="password" placeholder="••••••••" required autocomplete="current-password" />
        </div>
        <div v-if="error" class="auth-error">{{ error }}</div>
        <button type="submit" class="auth-submit" :disabled="loading">{{ loading ? "Connexion…" : "Se connecter" }}</button>
      </form>

      <!-- Register -->
      <form v-else-if="tab === 'register'" class="auth-form" @submit.prevent="doRegister">
        <div class="form-group">
          <label>Email <span class="required">*</span></label>
          <input v-model="registerForm.email" type="email" placeholder="you@example.com" required autocomplete="email" />
        </div>
        <div class="form-group">
          <label>Nom d'utilisateur <span class="required">*</span></label>
          <input v-model="registerForm.username" type="text" placeholder="monpseudo" required minlength="3" maxlength="30" pattern="[a-zA-Z0-9_\-]+" />
          <small class="hint">3-30 caractères, lettres, chiffres, _ ou -</small>
        </div>
        <div class="form-group">
          <label>Mot de passe <span class="required">*</span></label>
          <input v-model="registerForm.password" type="password" placeholder="8 caractères minimum" required minlength="8" autocomplete="new-password" />
        </div>
        <div class="form-group">
          <label>Confirmer le mot de passe</label>
          <input v-model="registerForm.confirm" type="password" placeholder="••••••••" required autocomplete="new-password" />
        </div>
        <div v-if="error" class="auth-error">{{ error }}</div>
        <button type="submit" class="auth-submit" :disabled="loading">{{ loading ? "Création…" : "Créer mon compte" }}</button>
      </form>

      <!-- Forgot -->
      <form v-else class="auth-form" @submit.prevent="doForgot">
        <p class="auth-desc">Entrez votre email pour recevoir un lien de réinitialisation.</p>
        <div class="form-group">
          <label>Email</label>
          <input v-model="forgotForm.email" type="email" placeholder="you@example.com" required />
        </div>
        <div v-if="error" class="auth-error">{{ error }}</div>
        <div v-if="success" class="auth-success">{{ success }}</div>
        <button type="submit" class="auth-submit" :disabled="loading">{{ loading ? "Envoi…" : "Envoyer le lien" }}</button>
        <button type="button" class="auth-link" @click="tab = 'login'; error = ''; success = ''">← Retour à la connexion</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-page { min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:16px; }
.auth-card { width:100%;max-width:420px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:32px; }
.auth-logo { display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:28px; }
.auth-logo-icon { font-size:28px; }
.auth-logo-text { font-size:22px;font-weight:800;color:var(--accent); }
.auth-tabs { display:flex;border-bottom:1px solid var(--border);margin-bottom:24px; }
.auth-tab { flex:1;background:none;border:none;color:var(--text-muted);cursor:pointer;padding:10px;font-size:13px;font-weight:500;border-bottom:2px solid transparent;transition:all .15s; }
.auth-tab.active { color:var(--accent);border-bottom-color:var(--accent); }
.auth-form { display:flex;flex-direction:column;gap:16px; }
.auth-desc { color:var(--text-muted);font-size:13px; }
.form-group { display:flex;flex-direction:column;gap:6px; }
.form-group label { font-size:12px;font-weight:600;color:var(--text-muted); }
.form-group input { background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:9px 12px;font-size:13px;outline:none;transition:border .15s; }
.form-group input:focus { border-color:var(--accent); }
.hint { font-size:11px;color:var(--text-muted); }
.required { color:var(--red); }
.auth-error { background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.3);color:var(--red);padding:8px 12px;border-radius:6px;font-size:13px; }
.auth-success { background:rgba(86,211,100,.12);border:1px solid rgba(86,211,100,.3);color:var(--green);padding:8px 12px;border-radius:6px;font-size:13px; }
.auth-submit { background:var(--accent);color:#0d1117;border:none;border-radius:6px;padding:10px;font-weight:700;font-size:14px;cursor:pointer;transition:background .15s; }
.auth-submit:hover:not(:disabled) { background:var(--accent-hover); }
.auth-submit:disabled { opacity:.6;cursor:not-allowed; }
.auth-link { background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:12px;text-align:center;padding:4px;transition:color .15s; }
.auth-link:hover { color:var(--accent); }
</style>
