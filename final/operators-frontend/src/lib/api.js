import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const api = axios.create(
    {
        baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000'
        ,timeout: 10_000
    }
)

// ── Request interceptor — attach current access token ─────────────────────
api.interceptors.request.use(
    (config) =>
    {
        const token = useAuthStore.getState().token
        if (token)
        {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    }
)

// ── Refresh-queue state ───────────────────────────────────────────────────
// Only one refresh call is ever in-flight at a time.
// Any 401s that arrive while a refresh is pending are queued and replayed
// (or rejected) once the single refresh resolves.

let isRefreshing = false
let failedQueue  = []   // [{ resolve, reject }]

function processQueue(error, newToken = null)
{
    failedQueue.forEach(({ resolve, reject }) =>
    {
        if (error) reject(error)
        else       resolve(newToken)
    })
    failedQueue = []
}

// ── Response interceptor — silent refresh on 401 ──────────────────────────
api.interceptors.response.use(
    (res) => res
    ,(err) =>
    {
        const originalRequest = err.config

        // Only intercept 401s that haven't already been retried
        // and only when the user has an active session (token in store).
        const { token, refreshToken, setToken, markSessionExpired, logout } =
            useAuthStore.getState()

        const is401      = err.response?.status === 401
        const hasSession = !!token || !!refreshToken   // at least one credential exists
        const alreadyRetried = originalRequest._retry

        // Not a 401, or no session at all (e.g. login page wrong password) → pass through
        if (!is401 || !hasSession || alreadyRetried)
        {
            return Promise.reject(err)
        }

        // If a refresh is already in-flight, queue this request
        if (isRefreshing)
        {
            return new Promise((resolve, reject) =>
            {
                failedQueue.push({ resolve, reject })
            })
            .then((newToken) =>
            {
                originalRequest.headers.Authorization = `Bearer ${newToken}`
                return api(originalRequest)
            })
            .catch((queueErr) => Promise.reject(queueErr))
        }

        // Mark this request so it doesn't loop if the retry also 401s
        originalRequest._retry = true
        isRefreshing            = true

        return new Promise((resolve, reject) =>
        {
            axios
                .post(
                    `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/v1/auth/refresh`
                    ,{ refresh_token: refreshToken }
                )
                .then(({ data }) =>
                {
                    const newAccessToken  = data.access_token
                    const newRefreshToken = data.refresh_token

                    // Persist the new tokens without touching other store state
                    useAuthStore.setState({
                        token:        newAccessToken
                        ,refreshToken: newRefreshToken
                    })

                    // Update the default header for future requests
                    api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`

                    // Replay all queued requests with the new token
                    processQueue(null, newAccessToken)

                    // Retry the original request
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
                    resolve(api(originalRequest))
                })
                .catch((refreshErr) =>
                {
                    // Refresh token is also expired or invalid — session is truly over
                    processQueue(refreshErr, null)

                    // Show the "session expirée" banner, then log out
                    markSessionExpired()
                    setTimeout(() =>
                    {
                        logout()
                        window.location.href = '/login'
                    }, 3000)   // 3 s — gives the toast time to display

                    reject(refreshErr)
                })
                .finally(() =>
                {
                    isRefreshing = false
                })
        })
    }
)

export default api
