import { ref, readonly } from "vue";
import { api, setToken, clearToken, isAuthenticated, type UserProfile } from "../api";

const user = ref<UserProfile | null>(null);
const authLoading = ref(true);

export function useAuth() {
  async function init() {
    if (!isAuthenticated()) { authLoading.value = false; return; }
    try {
      user.value = await api.me();
    } catch {
      clearToken();
    } finally {
      authLoading.value = false;
    }
  }

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    setToken(res.token);
    user.value = res.user;
  }

  async function register(email: string, username: string, password: string) {
    const res = await api.register(email, username, password);
    setToken(res.token);
    user.value = res.user;
  }

  function logout() {
    clearToken();
    user.value = null;
  }

  return { user: readonly(user), authLoading: readonly(authLoading), init, login, register, logout };
}
