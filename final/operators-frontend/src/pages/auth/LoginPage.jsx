import { useState, useEffect } from 'react'
import { useNavigate }         from 'react-router-dom'
import { useAuthStore }        from '../../stores/authStore'
import api                     from '../../lib/api'

const Icon = ({ name, style }) => (
    <span className="material-symbols-outlined select-none" style={style}>{name}</span>
)

export default function LoginPage()
{
    const { login, user }          = useAuthStore()
    const navigate                 = useNavigate()
    const [username, setUsername]  = useState('')
    const [password, setPassword]  = useState('')
    const [showPass, setShowPass]  = useState(false)
    const [loading,  setLoading]   = useState(false)
    const [error,    setError]     = useState('')

    useEffect(() =>
    {
        if (user)
        {
            if (user.must_change_password)  navigate('/change-password', { replace: true })
            else if (user.role === 'ADMIN') navigate('/admin',           { replace: true })
            else if (user.role === 'DN')    navigate('/dn/dashboard',    { replace: true })
            else if (user.role === 'CRC')   navigate('/crc/dashboard',   { replace: true })
            else if (user.role === 'BCC')   navigate('/bcc/dashboard',   { replace: true })
        }
    }, [user, navigate])

    const handleSubmit = async (e) =>
    {
        e.preventDefault()
        setError('')
        if (!username || !password) { setError('Identifiant et mot de passe requis.'); return }
        setLoading(true)
        try
        {
            const { data: tokenData } = await api.post('/api/v1/auth/login', {
                username: username.toLowerCase(), password
            })
            const { data: userData } = await api.get('/api/v1/auth/me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
            })
            const userObj = {
                id:                    userData.id
                ,username:             userData.username
                ,role:                 userData.role
                ,displayName:          userData.full_name
                ,zone:                 userData.zone ?? (userData.role === 'DN' ? 'National' : null)
                ,bcc_id:               userData.bcc_id  ?? null
                ,bcc_name:             userData.bcc_name ?? null
                ,bcc_zone:             userData.bcc_zone ?? null
                ,must_change_password: tokenData.must_change_password ?? false
            }
            login(userObj, tokenData.access_token, tokenData.refresh_token)
            if (userObj.must_change_password) { navigate('/change-password'); return }
            if (userObj.role === 'DN')    navigate('/dn/dashboard')
            if (userObj.role === 'CRC')   navigate('/crc/dashboard')
            if (userObj.role === 'BCC')   navigate('/bcc/dashboard')
            if (userObj.role === 'ADMIN') navigate('/admin')
        }
        catch (err)
        {
            setError(err?.response?.data?.detail ?? 'Identifiant ou mot de passe incorrect.')
            setLoading(false)
        }
    }

    /* ─── inline styles as constants to keep JSX clean ─── */
    const S = {
        page: {
            minHeight: '100vh'
            ,display: 'flex'
            ,flexDirection: 'column'
            ,background: '#0a1628'
            ,fontFamily: "'IBM Plex Sans', sans-serif"
            ,overflow: 'hidden'
            ,position: 'relative'
        }
        ,grid: {
            position: 'absolute', inset: 0, pointerEvents: 'none'
            ,backgroundImage:
                'linear-gradient(rgba(30,111,217,0.04) 1px, transparent 1px),' +
                'linear-gradient(90deg, rgba(30,111,217,0.04) 1px, transparent 1px)'
            ,backgroundSize: '40px 40px'
        }
        ,mapWrap: {
            position: 'absolute'
            ,top: 0, left: 0, right: 0, bottom: 0
            ,overflow: 'hidden'
            ,display: 'flex'
            ,justifyContent: 'center'
            ,alignItems: 'center'
            ,pointerEvents: 'none'
        }
        ,mapSvg: {
            width: '420px'
            ,height: 'auto'
            ,marginTop: '30px'   /* shift down so the map centers behind the login card */
            ,opacity: 0.07
            ,fill: '#c8d8f0'
        }
        ,main: {
            position: 'relative', zIndex: 10
            ,flex: 1
            ,display: 'flex'
            ,alignItems: 'center'
            ,justifyContent: 'center'
            ,padding: '2rem 1rem'
        }
        ,card: {
            position: 'relative'
            ,width: '100%'
            ,maxWidth: '340px'
            ,background: 'rgba(13,24,41,0.97)'
            ,border: '1px solid #1e3352'
            ,borderRadius: '2px'
            ,padding: '2rem 2rem 1.75rem'
            ,boxShadow: '0 8px 40px rgba(0,0,0,0.6)'
        }
        ,corner: (pos) =>
        {
            const s = { position: 'absolute', width: 16, height: 16 }
            if (pos === 'tl') return { ...s, top: 0, left: 0,    borderTop:    '2px solid #1e6fd9', borderLeft:   '2px solid #1e6fd9' }
            if (pos === 'tr') return { ...s, top: 0, right: 0,   borderTop:    '2px solid #1e6fd9', borderRight:  '2px solid #1e6fd9' }
            if (pos === 'bl') return { ...s, bottom: 0, left: 0, borderBottom: '2px solid #1e6fd9', borderLeft:   '2px solid #1e6fd9' }
            return                  { ...s, bottom: 0, right: 0, borderBottom: '2px solid #1e6fd9', borderRight:  '2px solid #1e6fd9' }
        }
        ,logoRow: {
            display: 'flex', alignItems: 'center', justifyContent: 'center'
            ,gap: '10px', marginBottom: '14px'
        }
        ,logoBadge: {
            width: 40, height: 40
            ,background: '#1e6fd9'
            ,borderRadius: '6px'
            ,display: 'flex', alignItems: 'center', justifyContent: 'center'
            ,flexShrink: 0
            ,animation: 'ring-pulse 2.5s ease-out infinite'
        }
        ,stegText: {
            fontFamily: "'IBM Plex Sans', sans-serif"
            ,fontSize: '18px', fontWeight: 700
            ,color: '#d3e4fe', letterSpacing: '0.18em'
        }
        ,badge: {
            fontFamily: "'JetBrains Mono', monospace"
            ,fontSize: '8px', color: '#6b8aad'
            ,border: '1px solid #1e3352'
            ,padding: '2px 5px', borderRadius: '2px'
            ,letterSpacing: '0.06em', whiteSpace: 'nowrap'
        }
        ,heading: {
            textAlign: 'center', marginBottom: '4px'
            ,fontFamily: "'IBM Plex Sans', sans-serif"
            ,fontSize: '15px', fontWeight: 600, color: '#d3e4fe'
        }
        ,subtitle: {
            textAlign: 'center', marginBottom: '20px'
            ,fontFamily: "'IBM Plex Sans', sans-serif"
            ,fontSize: '11px', color: '#6b8aad'
        }
        ,fieldWrap: { display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }
        ,label: {
            fontFamily: "'JetBrains Mono', monospace"
            ,fontSize: '9px', color: '#8fa8c8'
            ,textTransform: 'uppercase', letterSpacing: '0.12em'
        }
        ,inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' }
        ,input: {
            width: '100%'
            ,background: '#0d1a2e'
            ,border: '1px solid #1e3352'
            ,borderRadius: '2px'
            ,padding: '8px 12px 8px 34px'
            ,fontSize: '12px', color: '#d3e4fe'
            ,fontFamily: "'JetBrains Mono', monospace"
            ,outline: 'none'
            ,transition: 'border-color .2s, box-shadow .2s'
            ,boxSizing: 'border-box'
        }
        ,inputIcon: {
            position: 'absolute', left: '10px'
            ,fontSize: '14px', color: '#6b8aad'
            ,pointerEvents: 'none', userSelect: 'none'
        }
        ,eyeBtn: {
            position: 'absolute', right: '8px'
            ,background: 'none', border: 'none'
            ,cursor: 'pointer', padding: 0
            ,display: 'flex', alignItems: 'center'
            ,color: '#6b8aad'
        }
        ,errorBox: {
            display: 'flex', alignItems: 'center', gap: '6px'
            ,padding: '7px 10px', marginBottom: '10px'
            ,background: 'rgba(147,0,10,0.25)'
            ,border: '1px solid #93000a'
            ,borderRadius: '2px'
            ,fontFamily: "'JetBrains Mono', monospace"
            ,fontSize: '10px', color: '#ffb4ab'
        }
        ,submitBtn: (loading) => ({
            width: '100%', padding: '10px'
            ,background: '#1e6fd9'
            ,border: 'none', borderRadius: '2px'
            ,color: 'white'
            ,fontFamily: "'IBM Plex Sans', sans-serif"
            ,fontWeight: 600, fontSize: '12px'
            ,letterSpacing: '0.2em', textTransform: 'uppercase'
            ,cursor: loading ? 'not-allowed' : 'pointer'
            ,opacity: loading ? 0.7 : 1
            ,display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            ,transition: 'background .2s, transform .1s'
            ,marginTop: '4px'
        })
        ,footer: {
            position: 'relative', zIndex: 10
            ,display: 'flex', flexDirection: 'column'
            ,alignItems: 'center', justifyContent: 'center'
            ,padding: '10px 0 12px'
            ,borderTop: '1px solid #1a2d45'
            ,background: 'rgba(6,14,26,0.9)'
            ,flexShrink: 0
        }
        ,footerLine1: {
            fontFamily: "'JetBrains Mono', monospace"
            ,fontSize: '9px', color: '#3d5a7a', letterSpacing: '0.06em'
        }
        ,footerLine2: {
            fontFamily: "'JetBrains Mono', monospace"
            ,fontSize: '8px', color: '#2a3f5a', letterSpacing: '0.12em', marginTop: '2px'
        }
    }

    const focusInput  = (e) => { e.target.style.borderColor = '#1e6fd9'; e.target.style.boxShadow = '0 0 0 2px rgba(30,111,217,0.18)' }
    const blurInput   = (e) => { e.target.style.borderColor = '#1e3352'; e.target.style.boxShadow = 'none' }

    return (
        <div style={S.page}>
            {/* Grid */}
            <div style={S.grid} />

            {/* Tunisia map — only the northern cap peeks above, like in the target */}
            <div style={S.mapWrap}>
                <svg
                    viewBox="0 0 200 370"
                    xmlns="http://www.w3.org/2000/svg"
                    style={S.mapSvg}
                >
                    <path d="M113.53 37.54L113.93 37.54L114.50 37.41L117.18 35.12L117.31 34.90L117.31 34.63L117.23 34.46L117.05 34.24L116.83 34.15L116.57 34.06L114.15 33.58L117.14 32.74L122.11 32.13L122.81 32.17L128.53 34.19L129.28 34.50L131.44 35.47L131.66 36.04L129.72 36.75L127.83 40.62L127.74 41.06L127.83 41.67L128.05 42.16L129.02 44.05L129.15 44.23L129.50 44.58L135.00 48.54L135.44 48.76L135.57 48.93L135.57 49.20L135.40 49.37L133.24 51.84L132.32 50.30L129.46 50.96L128.89 51.70L128.75 52.28L129.33 53.07L131.09 53.07L134.08 54.70L134.69 55.09L134.91 55.22L135.44 55.40L136.54 55.71L137.16 55.84L138.26 55.84L139.53 55.53L140.50 55.14L141.65 54.56L143.19 53.73L143.58 53.42L143.71 53.24L144.42 51.66L145.12 50.12L145.43 49.77L146.70 49.02L147.76 49.11L149.17 49.07L149.83 49.02L150.49 48.93L151.37 48.80L152.07 48.49L156.12 46.03L156.65 45.59L158.54 43.83L159.60 42.29L159.60 42.03L159.68 41.76L159.86 41.63L165.62 39.78L166.02 39.78L166.28 39.87L166.42 40.05L167.34 41.41L168.84 47.88L166.11 51.79L165.76 52.10L163.51 54.21L162.94 54.92L159.82 59.14L158.41 61.60L157.35 63.45L157.00 64.11L156.52 65.52L156.12 66.40L155.86 66.80L155.55 67.15L155.33 67.28L154.80 67.46L152.95 67.72L150.00 68.56L145.52 70.14L144.42 70.76L143.67 71.33L142.92 72.21L142.35 73.00L142.22 73.22L142.04 73.66L141.47 74.98L141.07 76.17L140.90 76.65L140.46 79.34L140.37 80.22L140.37 82.24L140.41 82.50L140.50 82.99L141.12 85.14L143.23 88.88L146.75 93.42L147.19 93.99L147.85 94.65L150.53 96.94L152.91 97.68L156.16 99.66L156.25 99.88L156.43 100.32L156.56 100.50L156.74 100.68L157.18 100.90L158.32 101.51L159.07 101.78L160.26 102.04L161.27 102.13L163.16 102.44L164.04 102.61L164.79 102.92L165.23 103.18L165.58 103.49L165.67 103.71L165.67 104.02L164.96 106.88L165.67 108.68L165.23 114.23L165.18 114.54L165.18 115.11L165.36 116.43L165.62 117.09L166.33 117.97L166.81 118.50L168.09 119.55L168.79 120.08L169.80 120.74L170.02 121.27L167.74 123.95L167.43 124.30L167.21 124.39L166.94 124.48L166.68 124.52L166.42 124.66L165.93 125.10L165.36 125.84L165.14 126.28L165.01 126.81L164.96 127.56L165.05 128.48L165.05 129.10L164.88 129.58L160.34 136.54L156.56 140.71L152.64 145.95L152.38 146.35L151.63 146.92L151.41 147.05L150.27 147.27L149.34 147.40L148.55 147.62L148.29 147.71L148.11 147.89L147.80 148.19L145.87 151.41L145.78 151.63L145.60 151.80L145.43 151.93L144.95 152.15L142.31 152.59L142.09 152.68L139.62 153.61L139.18 153.87L138.79 154.13L137.86 155.19L137.60 155.59L136.85 156.47L135.13 157.74L127.43 161.22L126.95 161.44L126.42 161.57L126.11 161.66L125.50 161.70L125.23 161.79L124.97 162.14L121.98 166.06L121.27 167.25L120.88 168.13L120.70 168.17L120.61 168.30L120.97 170.81L121.19 172.13L121.71 174.07L121.98 175.03L122.20 175.43L123.39 177.72L123.87 178.51L124.57 179.43L127.65 183.17L132.05 186.69L134.17 188.28L134.96 188.85L136.01 189.47L137.51 190.04L140.46 191.01L141.16 191.53L141.47 191.62L141.78 191.53L143.67 191.09L147.01 190.13L148.11 189.55L148.77 189.20L149.30 188.76L149.52 188.63L149.78 188.54L150.93 188.32L151.54 188.41L151.76 188.50L151.94 188.67L152.16 189.07L152.25 189.60L152.25 189.91L151.90 192.99L151.54 193.95L151.37 194.39L151.19 194.53L150.31 195.01L149.96 195.32L149.74 195.76L149.78 196.02L150.66 197.91L150.88 198.09L152.91 198.84L153.22 198.88L153.52 198.84L154.05 198.66L160.12 196.29L160.48 195.98L160.83 195.67L161.09 195.27L161.31 194.88L161.36 194.61L161.31 194.04L161.22 193.87L161.09 193.65L160.92 193.51L160.26 193.12L160.08 192.99L159.95 192.77L159.95 192.50L160.12 192.33L161.44 191.93L163.25 191.62L163.51 191.62L163.82 191.67L165.49 192.11L166.50 192.50L167.12 192.90L167.82 193.51L168.26 194.04L168.48 194.48L168.97 195.27L169.19 195.67L169.36 196.42L169.41 196.95L169.36 197.83L169.32 198.13L168.97 199.01L168.84 199.76L168.79 200.73L169.54 206.67L169.63 207.20L169.98 207.77L171.74 210.19L171.87 210.37L172.09 210.50L172.36 210.59L179.44 211.60L180.41 211.64L182.87 211.69L183.36 211.51L183.53 211.38L183.53 211.11L183.40 210.94L183.75 210.76L185.56 211.38L187.49 212.13L187.45 213.18L187.32 214.11L187.18 214.85L187.01 215.43L186.61 216.31L186.52 216.39L186.17 217.36L186.00 218.11L185.64 222.16L185.34 225.63L184.90 234.70L184.85 235.31L185.07 236.02L185.25 236.50L186.08 237.29L186.96 238.00L187.23 238.13L187.98 238.70L188.68 239.27L189.12 239.89L189.21 240.06L189.74 241.12L190.00 241.82L190.00 242.04L190.00 242.66L189.91 243.19L189.30 244.20L188.81 244.64L188.37 244.95L187.05 245.65L185.60 246.49L182.61 248.12L178.69 249.61L172.36 252.12L170.68 252.82L165.62 254.85L159.20 257.53L158.98 257.80L158.67 258.46L158.19 259.60L156.91 261.84L156.43 262.33L155.90 262.77L151.94 265.14L151.46 265.28L151.10 265.28L147.58 269.54L147.36 269.98L143.71 274.16L142.57 275.04L142.00 275.40L141.12 275.88L140.90 275.97L140.19 275.97L139.58 275.92L138.96 275.79L138.39 275.66L137.73 275.57L137.07 275.48L136.06 275.48L135.40 275.57L134.39 275.88L134.17 275.97L133.81 276.28L132.98 277.11L126.47 285.21L126.25 285.60L126.20 286.13L125.76 289.08L127.83 293.79L129.94 298.63L130.16 299.24L131.97 304.17L132.01 304.39L133.15 311.43L133.15 311.74L132.54 313.37L130.16 318.60L129.77 319.48L129.59 319.70L124.05 325.77L119.56 331.36L115.86 335.72L115.55 336.07L115.16 336.33L114.63 336.64L114.10 336.77L113.75 336.77L112.91 336.60L108.69 337.74L104.38 339.41L99.98 341.35L99.85 340.73L99.27 338.31L96.94 329.21L95.53 323.75L93.25 314.69L91.05 306.20L89.51 300.12L85.72 285.60L84.31 280.19L81.01 267.48L80.00 263.65L78.95 259.64L78.77 259.25L76.70 257.97L70.37 254.06L62.62 249.30L56.99 245.87L50.61 242.00L47.80 240.28L47.71 240.20L47.44 238.39L46.56 232.41L46.39 231.18L46.08 228.76L45.82 226.95L44.41 225.06L39.30 218.42L36.31 214.63L35.83 214.77L35.52 214.85L34.51 214.94L34.16 214.90L33.36 214.68L33.06 214.59L22.50 210.67L22.01 210.45L21.66 210.19L21.48 210.01L21.04 209.57L20.56 208.74L20.30 207.02L20.21 205.61L20.21 203.24L20.25 202.09L20.25 201.21L18.10 197.30L12.95 189.99L12.82 189.77L11.01 183.97L10.00 180.62L10.00 179.48L10.04 178.91L10.26 178.16L10.48 177.76L10.75 177.06L11.14 175.91L11.19 175.03L11.01 172.48L11.14 172.00L11.54 171.16L11.72 170.94L15.63 167.33L16.16 166.85L16.56 166.63L17.26 166.32L18.36 165.97L19.24 165.79L20.52 165.71L21.40 165.49L22.14 165.27L22.58 165.00L22.85 164.61L22.98 164.43L24.39 161.09L24.61 160.43L24.56 159.55L24.56 159.02L24.70 158.53L25.31 157.52L25.80 157.04L26.59 156.47L33.94 153.25L35.43 152.68L37.06 152.20L37.54 152.02L37.76 151.93L43.44 147.31L43.57 146.87L43.53 146.65L43.35 146.48L43.09 146.35L42.56 145.91L42.25 145.55L42.25 145.29L42.43 144.85L43.00 144.10L43.13 143.93L44.01 143.18L44.50 142.96L44.94 142.69L45.07 142.52L45.11 142.30L44.54 138.96L44.36 138.16L44.94 133.15L46.61 127.30L46.70 127.03L46.83 126.86L47.27 126.33L50.00 123.20L47.53 119.02L47.14 118.76L46.52 118.10L46.26 117.70L45.90 116.74L45.68 115.46L45.60 114.93L45.60 114.36L45.73 113.83L45.95 112.86L46.21 112.12L46.52 111.50L47.71 105.96L47.53 104.20L47.58 103.71L47.49 102.88L47.40 102.08L47.31 101.86L47.14 101.38L47.05 101.20L46.61 100.63L45.64 99.88L45.33 99.58L44.72 98.92L44.54 98.70L44.41 98.26L44.19 97.51L43.92 95.97L43.88 95.48L43.84 93.99L43.97 91.48L44.19 90.73L44.67 89.32L45.16 87.65L45.77 83.38L46.39 79.03L46.39 78.24L46.92 75.02L47.14 74.63L48.72 71.94L48.81 71.15L48.94 69.44L48.90 68.86L48.81 68.07L48.72 67.81L48.63 67.59L48.46 67.46L45.86 66.53L45.24 66.40L44.89 66.40L44.54 66.49L43.53 66.49L42.82 66.44L41.81 66.36L40.98 66.14L40.58 65.87L40.40 65.70L40.36 65.43L40.36 65.12L40.45 64.60L40.54 64.38L40.89 63.72L41.15 63.36L41.81 62.97L42.52 62.70L43.40 62.48L47.62 61.12L47.84 61.03L51.62 58.96L52.02 58.74L52.42 58.39L52.55 58.22L53.25 56.10L53.30 55.84L53.30 54.92L60.42 51.09L60.16 48.85L59.72 46.25L61.70 45.68L65.75 45.33L66.05 45.37L66.67 45.24L68.47 44.67L69.00 44.45L70.10 43.87L70.98 43.35L71.77 42.82L72.65 42.29L73.75 41.37L74.55 40.57L75.16 39.87L75.73 38.77L78.24 36.97L79.25 36.57L79.91 36.53L83.30 35.38L90.78 33.62L100.99 30.41L105.08 28.96L105.35 28.87L105.92 28.78L108.65 28.65L109.04 28.69L113.97 29.13L114.23 29.22L114.41 29.35L114.67 31.16L114.59 31.38L114.23 31.99L113.93 32.39L113.53 32.65L113.31 32.79L112.08 33.27L111.77 33.31L110.85 33.45L110.63 33.58L110.49 33.75L110.36 33.97L110.32 34.24L110.36 34.46L110.85 35.78L111.90 37.01L112.96 37.41L113.53 37.54Z" />
                </svg>
            </div>

            {/* ── Card ── */}
            <div style={S.main}>
                <div style={S.card}>
                    {/* Corner brackets */}
                    <div style={S.corner('tl')} />
                    <div style={S.corner('tr')} />
                    <div style={S.corner('bl')} />
                    <div style={S.corner('br')} />

                    {/* Logo row: badge + STEG + pill */}
                    <div style={S.logoRow}>
                        <div style={S.logoBadge}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M13 2L4.5 13.5H11L10 22L20.5 9.5H14L13 2Z" fill="none" stroke="white" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                            </svg>
                        </div>
                        <span style={S.stegText}>STEG</span>
                        <span style={S.badge}>DÉLESTAGE NATIONAL</span>
                    </div>

                    {/* Title */}
                    <p style={S.heading}>Connexion Opérateur</p>
                    <p style={S.subtitle}>Accès réservé au personnel de contrôle STEG</p>

                    {/* Form */}
                    <form onSubmit={handleSubmit}>
                        {/* Identifiant */}
                        <div style={S.fieldWrap}>
                            <label style={S.label}>Identifiant / Matricule</label>
                            <div style={S.inputWrap}>
                                <Icon name="person" style={S.inputIcon} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Ex: OP-8842"
                                    autoComplete="username"
                                    style={S.input}
                                    onFocus={focusInput}
                                    onBlur={blurInput}
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div style={S.fieldWrap}>
                            <label style={S.label}>Mot de Passe</label>
                            <div style={S.inputWrap}>
                                <Icon name="lock" style={S.inputIcon} />
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••••••"
                                    autoComplete="current-password"
                                    style={{ ...S.input, paddingRight: '34px' }}
                                    onFocus={focusInput}
                                    onBlur={blurInput}
                                />
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => setShowPass(v => !v)}
                                    style={S.eyeBtn}
                                >
                                    <Icon
                                        name={showPass ? 'visibility' : 'visibility_off'}
                                        style={{ fontSize: '14px', color: '#6b8aad' }}
                                    />
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div style={S.errorBox}>
                                <Icon name="error" style={{ fontSize: '13px', color: '#ffb4ab' }} />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            style={S.submitBtn(loading)}
                            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#1a5fba' }}
                            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#1e6fd9' }}
                            onMouseDown={(e)  => { if (!loading) e.currentTarget.style.transform  = 'scale(0.98)' }}
                            onMouseUp={(e)    => { e.currentTarget.style.transform = 'scale(1)' }}
                        >
                            {loading
                                ? <>
                                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 4.418A8 8 0 014 12z" />
                                    </svg>
                                    Authentification...
                                  </>
                                : "S'authentifier"
                            }
                        </button>
                    </form>
                </div>
            </div>

            {/* Footer */}
            <div style={S.footer}>
                <p style={S.footerLine1}>Plateforme Nationale de Gestion du Délestage — Usage interne STEG</p>
                <p style={S.footerLine2}>v5.4.1-build-88 &nbsp;//&nbsp; SECURE_TRANSMISSION AES-256</p>
            </div>

            <style>{`
                @keyframes ring-pulse {
                    0%   { box-shadow: 0 0 0 0   rgba(30,111,217,0.5); }
                    70%  { box-shadow: 0 0 0 10px rgba(30,111,217,0); }
                    100% { box-shadow: 0 0 0 0   rgba(30,111,217,0); }
                }
            `}</style>
        </div>
    )
}
