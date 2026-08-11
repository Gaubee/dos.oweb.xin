// 登录页：居中卡片，密码输入 + 登录按钮。
// 已登录访问 /login 自动跳 /；登录成功后回 redirect 或 /。
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

export function LoginPage() {
  const { authed, login } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 已登录则跳转游戏管理
  useEffect(() => {
    if (authed) {
      void navigate({ to: '/games' });
    }
  }, [authed, navigate]);

  if (authed) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">已登录，正在跳转…</div>;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(password);
      await navigate({ to: '/games' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? '密码错误' : err.message);
      } else {
        setError('登录失败，请重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>DOS 游戏管理后台</CardTitle>
          <CardDescription>请输入管理员密码登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              登录
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
