// PlayCanvas 游戏上传页：拖拽/选择 zip → 自动解析 game.json → 入库。
import { useState, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileArchive, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import { games, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import type { RawGame } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function GameUploadPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ game: RawGame; zipUrl: string } | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => games.uploadGame(file),
    onSuccess: (data) => {
      setResult({ game: data.game, zipUrl: data.zipUrl });
      queryClient.invalidateQueries({ queryKey: ['admin-games'] });
    },
  });

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.zip')) {
      toast.error('请上传 .zip 文件');
      return;
    }
    setResult(null);
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/games' })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">上传 PlayCanvas 游戏</h1>
        </div>
      )}

      <Card
        className={`border-2 border-dashed transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              <p className="text-sm">正在上传并解析…</p>
            </>
          ) : result ? (
            <>
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-medium">{result.game.name['zh-Hans']} 上传成功</p>
              <p className="text-xs text-muted-foreground">
                {result.zipUrl} · {(result.game.filesize / 1024).toFixed(1)} KB · sha256: {result.game.sha256.slice(0, 12)}…
              </p>
              <div className="flex gap-2 pt-2">
                <Button size="sm" onClick={() => navigate({ to: '/games' })}>返回列表</Button>
                <Button size="sm" variant="outline" onClick={() => setResult(null)}>继续上传</Button>
              </div>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">拖拽 zip 文件到此处</p>
                <p className="text-xs text-muted-foreground mt-1">
                  zip 须含 game.json（engine: playcanvas）+ index.js
                </p>
              </div>
              <label>
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <Button asChild size="sm" variant="outline">
                  <span><FileArchive className="h-4 w-4" /> 选择文件</span>
                </Button>
              </label>
            </>
          )}
        </CardContent>
      </Card>

      {uploadMutation.isError && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            上传失败：{uploadMutation.error instanceof ApiError ? uploadMutation.error.message : String(uploadMutation.error)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
