const messages: Record<string, string> = {
  'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
  'auth/user-disabled': 'このアカウントは無効化されています。',
  'auth/user-not-found': 'メールアドレスまたはパスワードが正しくありません。',
  'auth/wrong-password': 'メールアドレスまたはパスワードが正しくありません。',
  'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません。',
  'auth/email-already-in-use': 'このメールアドレスは既に登録されています。',
  'auth/weak-password': 'パスワードは6文字以上で設定してください。',
  'auth/too-many-requests': '試行回数が多すぎます。しばらくしてから再度お試しください。',
}

export function getAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code && messages[code]) return messages[code]
  return '予期しないエラーが発生しました。もう一度お試しください。'
}
