import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getAuthErrorMessage } from '../lib/authErrors'

export default function SignupScreen() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(credential.user, { displayName: displayName.trim() })
      navigate('/')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm neumorphic-raised rounded-xl bg-surface p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary tracking-tight">Horizon</h1>
          <p className="text-sm text-on-surface-variant mt-1">アカウントを作成</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-xs font-bold text-outline uppercase tracking-widest">表示名</label>
            <input
              type="text"
              required
              className="w-full p-3 text-sm neumorphic-sunken border-none rounded-lg focus:ring-2 focus:ring-primary/20 bg-surface"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-outline uppercase tracking-widest">メールアドレス</label>
            <input
              type="email"
              required
              className="w-full p-3 text-sm neumorphic-sunken border-none rounded-lg focus:ring-2 focus:ring-primary/20 bg-surface"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-outline uppercase tracking-widest">パスワード</label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full p-3 text-sm neumorphic-sunken border-none rounded-lg focus:ring-2 focus:ring-primary/20 bg-surface"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-outline">6文字以上で設定してください</p>
          </div>

          {error && <p className="text-sm text-secondary">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-squish neumorphic-raised w-full bg-primary text-white font-bold py-3 rounded-full disabled:opacity-50"
          >
            {loading ? '登録中…' : '登録する'}
          </button>
        </form>

        <div className="text-center text-sm">
          <span className="text-on-surface-variant">すでにアカウントをお持ちの方は </span>
          <Link to="/login" className="text-primary font-semibold hover:underline">
            ログイン
          </Link>
        </div>
      </div>
    </div>
  )
}
