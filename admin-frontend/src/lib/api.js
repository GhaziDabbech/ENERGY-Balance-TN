import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const api = axios.create
(
    {
        baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000'
        ,timeout: 10_000
    }
)

api.interceptors.request.use
(
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

api.interceptors.response.use
(
    (res) => res
    ,(err) =>
    {
        if (err.response?.status === 401)
        {
            useAuthStore.getState().logout()
            window.location.href = '/login'
        }
        return Promise.reject(err)
    }
)

export default api
