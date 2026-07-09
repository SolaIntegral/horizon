import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { getAuthErrorMessage } from '../lib/authErrors'

export default function LoginScreen() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setError('パスワードをリセットするには、まずメールアドレスを入力してください。')
      return
    }
    setError(null)
    try {
      await sendPasswordResetEmail(auth, email)
      setResetSent(true)
    } catch (err) {
      setError(getAuthErrorMessage(err))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm neumorphic-raised rounded-xl bg-surface p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary tracking-tight">Horizon</h1>
          <p className="text-sm text-on-surface-variant mt-1">ログインしてください</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
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
              className="w-full p-3 text-sm neumorphic-sunken border-none rounded-lg focus:ring-2 focus:ring-primary/20 bg-surface"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-secondary">{error}</p>}
          {resetSent && (
            <p className="text-sm text-primary">パスワード再設定用のメールを送信しました。受信箱をご確認ください。</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-squish neumorphic-raised w-full bg-primary text-white font-bold py-3 rounded-full disabled:opacity-50"
          >
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <button onClick={handleResetPassword} className="text-primary font-semibold hover:underline">
            パスワードをお忘れですか？
          </button>
          <Link to="/signup" className="text-primary font-semibold hover:underline">
            新規登録
          </Link>
        </div>
      </div>
    </div>
  )
}
